/**
 * The live host for the band engine. It turns `performPass` output into
 * sound through today's voices and sample packs, on the audio clock:
 *
 *   - Playback is a queue of *segments*. Each is one window of bars in performance order: a
 *     pass of the song, the rest of the song after "play from here", or one lap of a
 *     practice loop. Each segment knows the audio time its first bar starts, so a tempo
 *     change only re-anchors the clock; nothing is regenerated.
 *   - A chart that counts its choruses (`SemanticScore.choruses`, #1475) does not loop: its
 *     timeline already holds every chorus, and the band plays it once, with its ending, a
 *     chorus per segment, then stops (`HostOptions.onEnd`). A practice loop still loops.
 *   - A change to the band (style, intensity, lanes, swing…) regenerates from the next
 *     barline, resuming from the engine's memory snapshot at that bar.
 *   - A 25 ms timer schedules everything that starts within the next 150 ms.
 *
 * It never writes engine state; the runtime owns every dispatch.
 */
import {
    type BandEvent,
    type BandSettings,
    compileTimeline,
    type PassMemory,
    type PassWindow,
    PPQ,
    performPass,
    secondsAt,
    type Timeline,
} from '@band/index';
import { muteGain } from '@engine/engine/mute-contract';
import { playBassNote } from '@engine/engine/synth-bass';
import { playNote } from '@engine/engine/synth-chords';
import { playDrumSound } from '@engine/engine/synth-drums';
import { playSoloNote } from '@engine/engine/synth-soloist';
import type { SemanticScore } from '@engine/songbook/score-types';
import type { EnsembleState } from '@engine/types';

const LOOKAHEAD_S = 0.15;
const TIMER_MS = 25;
/** Generate the next segment this long before the current one ends. */
const PREPARE_S = 2;

// Today's drum voices, by the band's piece names.
const DRUM_NAMES: Record<string, string> = {
    kick: 'Kick',
    snare: 'Snare',
    ghost: 'Snare',
    rim: 'Sidestick',
    hat: 'HiHat',
    hatOpen: 'Open',
    hatPedal: 'HiHatPedal',
    ride: 'Ride',
    rideBell: 'RideBell',
    crash: 'Crash',
    tomHigh: 'High Tom',
    tomMid: 'Mid Tom',
    tomLow: 'Low Tom',
    shaker: 'Shaker',
};

/** A palm-muted bass note's mute amount in the voice's own terms (`mute-contract.ts`). */
const BASS_MUTE = 0.85;
/** A palm-muted chug's audible length (seconds): damped at the bridge, it rings ~80–130 ms. */
const PALM_MIN_S = 0.08;
const PALM_MAX_S = 0.13;

/** What one segment plays: `performPass`'s options, less the memory it resumes from. */
interface SegmentPlan {
    pass: number;
    window: PassWindow;
    /** One past the last bar played: the window's end, or the end of a counted chorus. */
    until: number;
    /** Whether the performance goes round again after the window (a loop, an uncounted song). */
    looping: boolean;
}

interface Segment extends SegmentPlan {
    /** Nothing follows: the band stops when this segment ends (a counted chart's last chorus). */
    ends: boolean;
    /**
     * A released practice loop's lap: what it leads into instead of another lap. The bar the
     * song carries on from, or `'again'` for a counted chart's last section, which plays once
     * more as written and ends. Kept on the lap, not the host, so the segment that follows it
     * is the same however often it is rebuilt: a settings change (`update()`) drops a queued
     * follow-on and builds it again (#1484).
     */
    released?: number | 'again';
    /** Song-tick range the window covers. */
    from: number;
    to: number;
    /** Audio time of song tick `from`. */
    start: number;
    events: BandEvent[];
    /** Index of the next event to schedule. */
    cursor: number;
    /** Keys chord sizes by tick, for the voice's per-note gain. */
    chordSizes: Map<number, number>;
    /** Lead notes slurred from the one before. */
    legato: Set<BandEvent>;
    /** Engine memory before each bar, and after the last one. */
    memoryBefore: PassMemory | undefined;
    snapshots: PassMemory[];
    memoryAfter: PassMemory;
    /** The last pulse tick the metronome clicked in this segment. */
    clicked: number;
}

export interface HostOptions {
    state: () => EnsembleState;
    /** Cut every sounding note (a restart must not ring over itself). */
    silence: () => void;
    /**
     * A counted chart's performance has played its last bar (#1475). The host has already
     * stopped by itself, at that barline; the runtime brings the transport to stopped.
     */
    onEnd?: () => void;
}

export interface Loop {
    from: number;
    to: number;
}

/** One bar of count-in clicks: pure and audio-free, so it's unit-testable on its own. */
export interface CountInPlan {
    /** Seconds from the count-in's own start to each click — same length as the bar's pulses. */
    times: number[];
    /** Same accent scheme `BandHost`'s per-segment metronome uses: 1000 Hz on the downbeat,
     * 800/600 by role otherwise. */
    freqs: number[];
    /** The bar's own length in seconds at `bpm` — how long the count-in runs, and so exactly
     * how much the first real bar is pushed back from the moment Play was pressed. */
    seconds: number;
}

/**
 * One bar of clicks in the timeline's bar `fromBar`, at `bpm` — the chart's own meter and
 * tempo, not a fixed 4/4. Goes through `secondsAt` like every other time computation here, so
 * a fermata or tempo change elsewhere in the song can't skew a bar that has none of its own.
 */
export function countInPlan(timeline: Timeline, bpm: number, fromBar: number): CountInPlan {
    const bar = timeline.bars[fromBar];
    const barStart = secondsAt(timeline, bar.start, bpm);
    const times = bar.meter.pulses.map(
        (offset) => secondsAt(timeline, bar.start + offset, bpm) - barStart,
    );
    const freqs = bar.meter.pulses.map((_offset, i) =>
        i === 0 ? 1000 : bar.meter.roles[i] === 'strong' ? 800 : 600,
    );
    const seconds = secondsAt(timeline, bar.start + bar.meter.barTicks, bpm) - barStart;
    return { times, freqs, seconds };
}

function hz(midi: number): number {
    return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * The level one `BandEvent` is played at: the scalar its voice receives and, for a
 * palm-muted bass note, the gain the voice's mute leaves behind (`muteGain`, the shared mute
 * contract). `playBandEvent` plays every event at exactly this level; the render bridge's
 * dispatch tap (`render-bridge.ts`) reports it, so `mix:verify` measures the level the voice
 * was actually asked for.
 */
export function bandEventLevel(event: BandEvent): { level: number; levelScale?: number } {
    if (event.lane === 'drums') {
        // The drum voices take roughly 0–1.2 (an accent sits a little over 1).
        return { level: (event.velocity / 127) * 1.2 };
    }
    if (event.lane === 'bass') {
        const level = (event.velocity / 127) * 1.1;
        return event.muted ? { level, levelScale: muteGain(BASS_MUTE) } : { level };
    }
    if (event.lane === 'lead') {
        return { level: (event.velocity / 127) * 1.1 };
    }
    return { level: (event.velocity / 127) * (event.palm ? 0.7 : 0.8) };
}

/**
 * Turns one `BandEvent` into sound through today's voices and sample packs — the single
 * place both the live host (`BandHost.sound` below) and the offline render
 * (`renderBandPasses` in `prototypes/v2/lib/band-export.ts`, behind the WAV/stem export and
 * the listening-gate tools) call, so an exported mix matches what was heard live.
 * `durationSeconds` and `chordSize` are the two things a caller can't derive from the event
 * alone: a drum hit has no written length, and a comp note's per-voice gain depends on how
 * many other comp notes share its tick (both callers compute these from their own tick→time
 * map, which is the one thing that legitimately differs between live segments and an offline
 * pass).
 */
export function playBandEvent(
    state: EnsembleState,
    event: BandEvent,
    time: number,
    durationSeconds: number,
    chordSize: number,
    legato = false,
): void {
    const { level } = bandEventLevel(event);
    if (event.lane === 'drums') {
        playDrumSound(state, DRUM_NAMES[event.piece], time, level);
        return;
    }
    if (event.lane === 'bass') {
        playBassNote(
            state,
            hz(event.midi),
            time,
            durationSeconds,
            level,
            event.muted ? BASS_MUTE : 0,
        );
        return;
    }
    if (event.lane === 'lead') {
        // The soloist's voice or pack (sax, trumpet, guitars) on the soloist bus. A bend or
        // scoop starts below the written pitch and glides up into it; the per-note seed keys
        // the voice's timbral humanising to the note's place in the song.
        playSoloNote(
            state,
            hz(event.midi),
            time,
            durationSeconds,
            level,
            -(event.bendIn ?? 0),
            'scalar',
            legato,
            event.vibrato === true,
            event.tick,
        );
        return;
    }
    // A guitar scratch: the strings deadened under the hand — a click with a trace of
    // pitch, so it is cut to a few tens of milliseconds whatever its written length. A palm
    // mute keeps its pitch: the damped string still rings for a tenth of a second or so,
    // whatever its written length, a touch quieter than an open strike.
    const length = event.muted
        ? Math.min(durationSeconds, 0.03)
        : event.palm
          ? Math.min(Math.max(durationSeconds, PALM_MIN_S), PALM_MAX_S)
          : durationSeconds;
    playNote(state, hz(event.midi), time, length, {
        muted: event.muted,
        vol: level,
        numVoices: chordSize,
    });
}

/**
 * The lead notes that follow the one before without a gap — slurred, not re-tongued or
 * re-picked. A bent or scooped note is always attacked: the bend is its articulation.
 */
export function legatoLeads(events: BandEvent[]): Set<BandEvent> {
    const out = new Set<BandEvent>();
    let previousEnd = Number.NEGATIVE_INFINITY;
    for (const e of events) {
        if (e.lane !== 'lead') {
            continue;
        }
        if (!e.bendIn && Math.abs(e.tick - previousEnd) < 10) {
            out.add(e);
        }
        previousEnd = e.tick + e.dur;
    }
    return out;
}

function chordSizes(events: BandEvent[]): Map<number, number> {
    const sizes = new Map<number, number>();
    for (const e of events) {
        if (e.lane === 'comp') {
            sizes.set(e.tick, (sizes.get(e.tick) ?? 0) + 1);
        }
    }
    return sizes;
}

export class BandHost {
    private readonly options: HostOptions;
    private timeline: Timeline | null = null;
    private scoreKey = '';
    /** The chart counts its choruses: the band plays them once and stops, never looping. */
    private counted = false;
    private settings: BandSettings | null = null;
    private bpm = 120;
    private segments: Segment[] = [];
    private loop: Loop | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private nextPass = 0;
    /** The barline where the last settings change is first heard, while it is still to come. */
    private change: { segment: Segment; tick: number } | null = null;
    /** The one-bar count-in scheduled by `start()`, while it is still sounding. */
    private countIn: {
        start: number;
        end: number;
        times: number[];
        /** Its clicks, scheduled up to a bar ahead: a Stop mid-count silences the rest. */
        clicks: OscillatorNode[];
    } | null = null;

    constructor(options: HostOptions) {
        this.options = options;
    }

    get playing(): boolean {
        return this.timer !== null;
    }

    private get audio(): AudioContext | null {
        return (this.options.state().playback.audio as AudioContext | null) ?? null;
    }

    /** Compile a chart. Only a change of content (not of object identity) restarts the band. */
    setScore(score: SemanticScore): void {
        const key = JSON.stringify(score);
        if (key === this.scoreKey) {
            return;
        }
        this.scoreKey = key;
        this.timeline = compileTimeline(score);
        this.counted = score.choruses !== undefined;
        if (this.playing && this.settings) {
            // The form changed under the band: restart the song cleanly.
            this.start(this.settings, this.bpm, 0, this.loop);
        }
    }

    /**
     * `countIn` is one bar of clicks before the first segment, requested only by a fresh Play
     * from stopped (`runtime.ts`'s `startBand`) and gated there on the `playback.countIn`
     * preference — every other caller (a loop wrap's own `append`, `update`'s barline swap,
     * `setScore`'s restart, a mid-song resume) passes nothing and gets the default `false`, so
     * the chart's first bar starts on the beat it always did.
     */
    start(
        settings: BandSettings,
        bpm: number,
        fromTick = 0,
        loop: Loop | null = null,
        countIn = false,
    ): void {
        const audio = this.audio;
        if (!this.timeline || !audio) {
            throw new Error('The band has no chart or no audio yet.');
        }
        const restarting = this.playing;
        this.halt();
        if (restarting) {
            this.options.silence();
        }
        this.settings = settings;
        this.bpm = bpm;
        this.loop = loop;
        this.nextPass = 0;
        const fromBar = Math.min(this.barAt(fromTick), this.timeline.bars.length - 1);
        const first = loop ? this.lapPlan(loop) : this.songPlan(fromBar, fromBar);
        let segmentStart = audio.currentTime + 0.1;
        if (countIn) {
            const plan = countInPlan(this.timeline, bpm, first.window.from);
            const countInStart = segmentStart;
            segmentStart = countInStart + plan.seconds;
            const state = this.options.state();
            const clicks = plan.times.map((offset, i) =>
                this.click(audio, state, countInStart + offset, plan.freqs[i]),
            );
            this.countIn = { start: countInStart, end: segmentStart, times: plan.times, clicks };
        }
        this.append(first, segmentStart, undefined);
        this.timer = setInterval(() => this.pump(), TIMER_MS);
        this.pump();
    }

    stop(): void {
        this.halt();
    }

    /** New band settings: regenerate, and take the new music from the next barline. */
    update(settings: BandSettings): void {
        if (JSON.stringify(settings) === JSON.stringify(this.settings)) {
            return;
        }
        this.settings = settings;
        const audio = this.audio;
        const timeline = this.timeline;
        if (!this.playing || !audio || !timeline) {
            return;
        }
        const horizon = audio.currentTime + LOOKAHEAD_S;
        const current = this.current(horizon);
        if (!current) {
            return;
        }
        const index = this.segments.indexOf(current);
        // Everything after the current segment is regenerated lazily with the new settings.
        this.segments.length = index + 1;
        const cutoff = this.regenerate(current, settings, horizon);
        this.change = { segment: current, tick: cutoff ?? current.to };
    }

    /**
     * Regenerate `current` from the first barline after `horizon` (what is already scheduled
     * stays), with `settings` and the segment's own `looping`. Returns that barline's tick, or
     * null when the segment has no barline left to change at.
     */
    private regenerate(current: Segment, settings: BandSettings, horizon: number): number | null {
        const timeline = this.timeline!;
        const cutoffBar = this.barAt(this.tickAt(current, horizon), true);
        if (cutoffBar >= current.until) {
            return null;
        }
        // Resume from the engine's own memory at that barline, so the new bars follow on
        // from the bars actually played (voicing, bass register, a pushed chord). `origin`
        // carries the bar this pass truly began on (defaulting to the window it already had,
        // for the first resume of a pass), so the new tail's own first bar is still treated as
        // a continuation — it still crashes into a section arrival or a phrase fill's answer —
        // not the fresh start a bare `from` would read as (`planBars`'s `PassWindow.origin`).
        const tail = performPass(timeline, settings, {
            pass: current.pass,
            looping: current.looping,
            memory: current.snapshots[cutoffBar],
            window: {
                ...current.window,
                from: cutoffBar,
                origin: current.window.origin ?? current.window.from,
            },
            until: current.until,
        });
        const cutoff = timeline.bars[cutoffBar].start;
        current.events = current.events.filter((e) => e.tick < cutoff).concat(tail.events);
        current.cursor = current.events.findIndex(
            (e) => this.timeOf(current, e.tick) + e.offsetMs / 1000 > horizon,
        );
        if (current.cursor < 0) {
            current.cursor = current.events.length;
        }
        current.chordSizes = chordSizes(current.events);
        current.legato = legatoLeads(current.events);
        for (let bar = cutoffBar; bar < current.until; bar++) {
            current.snapshots[bar] = tail.snapshots[bar];
        }
        current.memoryAfter = tail.memory;
        return cutoff;
    }

    /** Re-anchor the clock at the current position; the music keeps its place in the bar. */
    setTempo(bpm: number): void {
        const audio = this.audio;
        if (bpm === this.bpm || !audio || !this.timeline || !this.playing) {
            this.bpm = bpm;
            return;
        }
        const now = audio.currentTime;
        // Drop finished segments first: at a new tempo their (recomputed) ends would move.
        this.segments = this.segments.filter((s) => this.endTime(s) > now);
        const current = this.segments.find((s) => s.start <= now) ?? this.segments[0];
        if (!current) {
            this.bpm = bpm;
            return;
        }
        const tick = now > current.start ? this.tickAt(current, now) : current.from;
        const lead = now > current.start ? 0 : current.start - now;
        this.bpm = bpm;
        current.start = now + lead - (this.secondsTo(tick) - this.secondsTo(current.from));
        for (let i = 1; i < this.segments.length; i++) {
            this.segments[i].start = this.endTime(this.segments[i - 1]);
        }
    }

    setLoop(loop: Loop | null): void {
        if (JSON.stringify(loop) === JSON.stringify(this.loop)) {
            return;
        }
        const audio = this.audio;
        this.loop = loop;
        if (!this.playing || !this.settings || !audio) {
            return;
        }
        if (loop) {
            this.start(this.settings, this.bpm, loop.from, loop);
            return;
        }
        // Leaving a loop: finish the lap under way, then carry on through the song. A lap the
        // voices have already been sent anything from is under way, even before its barline:
        // dropping it would leave that downbeat to sound a second time under the song's next
        // bar (#1489).
        const horizon = audio.currentTime + LOOKAHEAD_S;
        const current = this.underWay(audio.currentTime);
        if (current) {
            this.segments.length = this.segments.indexOf(current) + 1;
            if (current.until < this.timeline!.bars.length) {
                current.released = current.until;
            } else if (this.counted) {
                // A counted chart's last section has nothing after it to carry on into: the
                // performance ends with it. The lap under way was played as a loop (a fill
                // back to its top); from its next barline it plays the ending instead, as the
                // last bars of any counted performance do. With no barline left in it, the
                // section plays once more, as written, and ends.
                current.looping = false;
                if (this.regenerate(current, this.settings, horizon) !== null) {
                    current.ends = true;
                } else {
                    current.looping = true;
                    current.released = 'again';
                }
            }
        }
    }

    /** Has the band reached the barline where its last settings change is heard? */
    changeHeard(): boolean {
        const audio = this.audio;
        const change = this.change;
        // Kept as a song tick, not a time, so a tempo change re-anchors it with its segment;
        // a segment that is gone (played through, or a restart) has nothing left to wait for.
        if (!audio || !change || !this.segments.includes(change.segment)) {
            return true;
        }
        return audio.currentTime >= this.timeOf(change.segment, change.tick);
    }

    /** The song tick sounding now, or null while stopped. */
    songTick(): number | null {
        const audio = this.audio;
        if (!audio || !this.playing) {
            return null;
        }
        const now = audio.currentTime;
        const segment = this.segments.find((s) => s.start <= now && now < this.endTime(s));
        return segment ? this.tickAt(segment, now) : null;
    }

    /**
     * Is `tick` in the last FELT pulse of its performed bar — a dotted quarter in 6/8, the
     * band's own `Meter.pulses` skeleton, not a raw eighth — OR within `leadMs` of real time
     * before the barline, whichever starts earlier (#1458's Following look-ahead, patch review
     * P3-1). At a fast tempo the last pulse alone can be shorter than a `behavior: 'smooth'`
     * scroll needs to finish before the barline (240 bpm's last quarter is 250ms, well under a
     * ~600ms scroll on a tall chart); at a normal or slow tempo the last pulse already covers
     * `leadMs` on its own, so this changes nothing there — the two thresholds converge to the
     * same tick the moment a beat is at least `leadMs` long.
     *
     * A method here rather than on `BandChart` (`bars`/`barAt`, `lib/band-chart.ts`) because
     * this reads `this.timeline` directly, which exists for a measure-less (v1) chart too —
     * `runtime.ts`'s `scoreForBand` converts one before it ever reaches the host, so the SAME
     * timeline plays either schema — while `BandChart` itself is built only for schemaVersion 2
     * (P2-2: the old `!bandView` gate wrongly denied v1 charts this cue and the jump-ahead both).
     */
    inLastPulse(tick: number, leadMs = 600): boolean {
        const bars = this.timeline?.bars;
        if (!bars?.length) {
            return false;
        }
        let lo = 0;
        let hi = bars.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const bar = bars[mid];
            const end = bar.start + bar.meter.barTicks;
            if (tick < bar.start) {
                hi = mid - 1;
            } else if (tick >= end) {
                lo = mid + 1;
            } else {
                const lastPulseStart = bar.start + bar.meter.pulses[bar.meter.pulses.length - 1];
                const leadTicks = ((leadMs / 1000) * PPQ * this.bpm) / 60;
                return tick >= Math.min(lastPulseStart, end - leadTicks);
            }
        }
        return false;
    }

    /**
     * The count-in beat sounding now (0-based: "1" is beat 0), or null when no count-in is
     * running — either stopped, past it into the song, or `start()` was never asked for one.
     * The chart shouldn't advance while this is non-null: `songTick()` already returns null for
     * the same window, since the first segment's `start` is the moment the count-in ends.
     */
    countingInBeat(): number | null {
        const audio = this.audio;
        const countIn = this.countIn;
        if (!audio || !countIn) {
            return null;
        }
        const now = audio.currentTime;
        if (now < countIn.start || now >= countIn.end) {
            return null;
        }
        let beat = 0;
        for (let i = 0; i < countIn.times.length; i++) {
            if (countIn.start + countIn.times[i] <= now) {
                beat = i;
            }
        }
        return beat;
    }

    /**
     * The whole song, once through with an ending, for export. A counted chart's every chorus
     * (its timeline holds them all), generated a chorus at a time exactly as it plays live, so
     * the export is the performance that was heard.
     */
    render(settings: BandSettings): { events: BandEvent[]; timeline: Timeline } {
        const timeline = this.timeline;
        if (!timeline) {
            throw new Error('No chart loaded.');
        }
        if (!this.counted) {
            const { events } = performPass(timeline, settings, { pass: 0, looping: false });
            return { events, timeline };
        }
        const events: BandEvent[] = [];
        let memory: PassMemory | undefined;
        for (let plan = this.songPlan(0, 0); ; plan = this.songPlan(plan.until, 0)) {
            const result = performPass(timeline, settings, { ...plan, memory });
            events.push(...result.events);
            memory = result.memory;
            if (plan.until >= timeline.bars.length) {
                break;
            }
        }
        return { events, timeline };
    }

    // ------------------------------------------------------------ internals

    private halt(): void {
        this.change = null;
        // A Stop inside the count-in: its later clicks are already scheduled, so cancel them.
        for (const osc of this.countIn?.clicks ?? []) {
            try {
                osc.stop();
            } catch {
                // Already ended, or never started in a stubbed context: nothing left to silence.
            }
        }
        this.countIn = null;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.segments = [];
    }

    private barAt(tick: number, after = false): number {
        const bars = this.timeline!.bars;
        const index = bars.findIndex((b) =>
            after ? b.start >= tick : b.start + b.meter.barTicks > tick,
        );
        return index < 0 ? bars.length : index;
    }

    /**
     * The song from `fromBar`. Uncounted, the rest of this pass, after which it goes round
     * again. Counted (#1475), the rest of `fromBar`'s chorus of a performance that began at
     * `origin` and ends after the last chorus: a performance of up to 64 choruses is
     * generated a chorus at a time, two seconds ahead like any segment, never all at once on
     * Play (and a settings change regenerates the rest of one chorus, not of the song).
     * Every chorus is pass 0: its chorus number is its time through (`PassOptions.pass`).
     */
    private songPlan(fromBar: number, origin: number): SegmentPlan {
        const bars = this.timeline!.bars;
        const from = Math.min(fromBar, bars.length - 1);
        if (!this.counted) {
            return {
                pass: this.nextPass++,
                window: { from, to: bars.length, wrapTo: 0 },
                until: bars.length,
                looping: true,
            };
        }
        let until = from + 1;
        while (until < bars.length && bars[until].visit.chorus === bars[from].visit.chorus) {
            until++;
        }
        return {
            pass: 0,
            window: { from, to: bars.length, wrapTo: 0, origin },
            until,
            looping: false,
        };
    }

    /** One lap of a practice loop: it loops, counted chart or not. */
    private lapPlan(loop: Loop): SegmentPlan {
        const from = this.barAt(loop.from);
        const to = Math.max(from + 1, this.barAt(loop.to, true));
        return {
            pass: this.nextPass++,
            window: { from, to, wrapTo: from },
            until: to,
            looping: true,
        };
    }

    /** What plays after `last`: the loop's next lap, or the song's next pass or chorus. */
    private followOn(last: Segment): SegmentPlan {
        if (this.loop) {
            return this.lapPlan(this.loop);
        }
        if (last.released === 'again') {
            return {
                pass: this.nextPass++,
                window: last.window,
                until: last.until,
                looping: false,
            };
        }
        const resume = last.released ?? null;
        if (!this.counted) {
            return this.songPlan(resume ?? 0, resume ?? 0);
        }
        // Out of a practice loop, the performance carries on from the bar after it as if it
        // had played from the top (origin 0): the bar the loop leads into is an arrival.
        return resume !== null
            ? this.songPlan(resume, 0)
            : this.songPlan(last.until, last.window.origin ?? last.window.from);
    }

    private append(plan: SegmentPlan, start: number, memory: PassMemory | undefined): void {
        const timeline = this.timeline!;
        const result = performPass(timeline, this.settings!, { ...plan, memory });
        const from = timeline.bars[plan.window.from].start;
        const last = timeline.bars[plan.until - 1];
        this.segments.push({
            ...plan,
            ends: !plan.looping && plan.until >= timeline.bars.length,
            from,
            to: last.start + last.meter.barTicks,
            start,
            events: result.events,
            cursor: 0,
            chordSizes: chordSizes(result.events),
            legato: legatoLeads(result.events),
            memoryBefore: memory,
            snapshots: result.snapshots,
            memoryAfter: result.memory,
            clicked: -1,
        });
    }

    private secondsTo(tick: number): number {
        return secondsAt(this.timeline!, tick, this.bpm);
    }

    private endTime(segment: Segment): number {
        return segment.start + this.secondsTo(segment.to) - this.secondsTo(segment.from);
    }

    private timeOf(segment: Segment, tick: number): number {
        return segment.start + this.secondsTo(tick) - this.secondsTo(segment.from);
    }

    /** The segment playing at `time` (or the first one still to come). */
    private current(time: number): Segment | undefined {
        return this.segments.find((s) => this.endTime(s) > time);
    }

    /**
     * The segment under way at `now`: the last one that has started, or that the voices have
     * been sent anything from (`pump` has moved its cursor or clicked a pulse in it), whichever
     * is later. Before the first one starts (a count-in) it is the first. Judged by what was
     * actually sent, not by a horizon: the last pump ran up to a timer tick earlier, a pushed
     * note sounds before its barline, and after a stalled timer the queue can end before `now`
     * plus the lookahead, or before `now` itself.
     */
    private underWay(now: number): Segment | undefined {
        let found = this.segments[0];
        for (const segment of this.segments) {
            if (segment.start <= now || segment.cursor > 0 || segment.clicked >= 0) {
                found = segment;
            }
        }
        return found;
    }

    /** Inverse of `timeOf` (bisection: fermata stretches make it piecewise). */
    private tickAt(segment: Segment, time: number): number {
        let lo = segment.from;
        let hi = segment.to;
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (this.timeOf(segment, mid) < time) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    private pump(): void {
        const audio = this.audio;
        if (!audio) {
            return;
        }
        const now = audio.currentTime;
        const horizon = now + LOOKAHEAD_S;
        const last = this.segments[this.segments.length - 1];
        if (last?.ends && now >= this.endTime(last)) {
            // The performance is over: its last bar has ended, and every note in it was
            // scheduled before that barline. Stop here, so the transport reads stopped when
            // the band falls silent — not a lookahead early, nor a lap late.
            this.halt();
            this.options.onEnd?.();
            return;
        }
        // Keep a segment queued ahead of the playhead.
        if (last && !last.ends && this.endTime(last) < now + PREPARE_S) {
            this.append(this.followOn(last), this.endTime(last), last.memoryAfter);
        }
        // Drop segments that finished.
        while (this.segments.length > 1 && this.endTime(this.segments[0]) < now - 1) {
            this.segments.shift();
        }
        const state = this.options.state();
        for (const segment of this.segments) {
            while (segment.cursor < segment.events.length) {
                const event = segment.events[segment.cursor];
                const time = this.timeOf(segment, event.tick) + event.offsetMs / 1000;
                if (time > horizon) {
                    break;
                }
                segment.cursor++;
                if (time < now - 0.02) {
                    continue; // missed (tab was asleep): skip rather than pile up
                }
                this.sound(state, segment, event, Math.max(time, now));
            }
            this.metronome(state, segment, now, horizon);
        }
    }

    private sound(state: EnsembleState, segment: Segment, event: BandEvent, time: number): void {
        const durationSeconds =
            event.lane === 'drums'
                ? 0
                : this.timeOf(segment, event.tick + event.dur) - this.timeOf(segment, event.tick);
        playBandEvent(
            state,
            event,
            time,
            durationSeconds,
            segment.chordSizes.get(event.tick) ?? 1,
            segment.legato.has(event),
        );
    }

    /** The click: a beep on each pulse, accented on the downbeat. Same voice as the old engine. */
    private metronome(state: EnsembleState, segment: Segment, now: number, horizon: number): void {
        const audio = this.audio;
        const timeline = this.timeline;
        if (!state.playback.metronome || !audio || !timeline) {
            return;
        }
        for (let b = segment.window.from; b < segment.until; b++) {
            const bar = timeline.bars[b];
            bar.meter.pulses.forEach((offset, i) => {
                const tick = bar.start + offset;
                const time = this.timeOf(segment, tick);
                // De-duplicate by position, not time: a tempo change moves the times.
                if (tick <= segment.clicked || time > horizon || time < now) {
                    return;
                }
                segment.clicked = tick;
                const freq = i === 0 ? 1000 : bar.meter.roles[i] === 'strong' ? 800 : 600;
                this.click(audio, state, time, freq);
            });
        }
    }

    /** One metronome beep — the count-in (`start()`) and the per-segment click above share it,
     * so a count-in bar sounds exactly like the click track it leads into. */
    private click(
        audio: AudioContext,
        state: EnsembleState,
        time: number,
        freq: number,
    ): OscillatorNode {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.connect(gain);
        const graph = state.playback.audioGraph as { master?: { gain: AudioNode } } | null;
        gain.connect(graph?.master?.gain ?? audio.destination);
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        osc.start(time);
        osc.stop(time + 0.05);
        osc.onended = () => {
            gain.disconnect();
            osc.disconnect();
        };
        return osc;
    }
}
