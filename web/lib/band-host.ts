/**
 * The live host for the band engine. It turns `performPass` output into
 * sound through today's voices and sample packs, on the audio clock:
 *
 *   - Playback is a queue of *segments*. Each is one window of bars in performance order: up
 *     to `PASS_CHUNK_BARS` of a pass of the song, or of the rest of it after "play from here",
 *     the next resuming the same pass from the memory the last left. Each segment knows the
 *     audio time its first bar starts, so a tempo change only re-anchors the clock; nothing is
 *     regenerated.
 *   - A chart that counts its choruses (`SemanticScore.choruses`, #1475) does not loop: its
 *     timeline already holds every chorus, and the band plays it once, with its ending, a
 *     chorus per segment, then stops (`HostOptions.onEnd`).
 *   - A change to the band (style, intensity, lanes, swing…) regenerates from the next
 *     barline, resuming from the engine's memory snapshot at that bar.
 *   - `carryOn` hands the band another chart to go on in from a barline (a section loop
 *     cleared, #1989). Each segment keeps the timeline it was played from, and what it carries
 *     on into is data on the segment itself (`Segment.carry`), never a flag spent once.
 *   - A 25 ms timer schedules everything that starts within the next 150 ms.
 *
 * It never writes engine state; the runtime owns every dispatch.
 */
import {
    type BandEvent,
    type BandSettings,
    barAtTick,
    compileTimeline,
    type DrumPiece,
    type LeadRole,
    leadRoleAt,
    type PassMemory,
    type PassWindow,
    PPQ,
    performPass,
    STYLES,
    secondsAt,
    type Timeline,
} from '@band/index';
import { muteGain } from '@core/engine/mute-contract';
import { playBassNote } from '@core/engine/synth-bass';
import { playNote } from '@core/engine/synth-chords';
import { playDrumSound } from '@core/engine/synth-drums';
import { playSoloNote } from '@core/engine/synth-soloist';
import type { SemanticScore } from '@core/songbook/score-types';
import type { EnsembleState } from '@core/types';

const LOOKAHEAD_S = 0.15;
const TIMER_MS = 25;
/** Generate the next segment this long before the current one ends. */
const PREPARE_S = 2;
/**
 * The most bars one segment of an uncounted pass holds (#1665): each is generated on the main
 * thread, and a few milliseconds of it at a time keeps Play from freezing a long chart's page.
 */
const PASS_CHUNK_BARS = 32;

/** Lets the page run its own timers and input before the next piece of a long export (#1802). */
function givePageATurn(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

// Today's drum voices, by the band's piece names.
export const DRUM_NAMES: Record<DrumPiece, string> = {
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

/**
 * Another chart the band goes on in (`BandHost.carryOn`): its timeline, whether it counts its
 * choruses, and where in it the band goes on from the old chart's bar `bar` (a barline; the old
 * chart's bar count is the top of its next pass), or null where it cannot go on.
 */
interface Carry {
    timeline: Timeline;
    counted: boolean;
    entry: (bar: number) => number | null;
}

/** What one segment plays: `performPass`'s options, less the memory it resumes from. */
interface SegmentPlan {
    /** The chart's timeline this segment plays: every tick in it is in this timeline. */
    timeline: Timeline;
    /** That chart counts its choruses (#1475). */
    counted: boolean;
    /**
     * The chart the band goes on in after this segment, when it is not this one's own next bar
     * (`carryOn`). Kept on the segment, so a follow-on dropped and built again (`update()`)
     * still goes where the first one did (#1484).
     */
    carry?: Carry;
    pass: number;
    window: PassWindow;
    /** One past the last bar played: the window's end, or the end of a counted chorus. */
    until: number;
    /** Whether the performance goes round again after the window (an uncounted song). */
    looping: boolean;
}

interface Segment extends SegmentPlan {
    /** Nothing follows: the band stops when this segment ends (a counted chart's last chorus). */
    ends: boolean;
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
 * How many of the pitched lanes (bass, comp, lead) the section playing at `tick` has: the
 * lanes switched on, less any the section's own `instruments` mutes (`SectionVisit.lanes`).
 * It is the band's rule for a section's lanes (`planBars` in `band/arrange/plan.ts`: lane power
 * AND the visit not muting it; a bar's own layouts, a trade or a drum break, are not counted),
 * read from the same timeline the band performed, so the cymbal
 * trim (`getCymbalMixScale`) follows the section that is playing and never re-derives it from
 * the arranger's step maps. A tick outside every bar (none is expected) falls back to the
 * switched-on lanes, the rule for a hit with no section (`enabledLayerCount`).
 */
export function soundingLayers(state: EnsembleState, timeline: Timeline, tick: number): number {
    // Runs for every drum hit, so no objects are built here.
    const lanes = barAtTick(timeline, tick)?.visit.lanes;
    return (
        (state.bass?.enabled && lanes?.bass !== false ? 1 : 0) +
        (state.chords?.enabled && lanes?.comp !== false ? 1 : 0) +
        (state.soloist?.enabled && lanes?.lead !== false ? 1 : 0)
    );
}

/**
 * Turns one `BandEvent` into sound through today's voices and sample packs — the single
 * place both the live host (`BandHost.sound` below) and the offline render
 * (`renderBandPasses` in `web/lib/band-export.ts`, behind the WAV/stem export and
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
    timeline: Timeline,
    legato = false,
): void {
    const { level } = bandEventLevel(event);
    if (event.lane === 'drums') {
        playDrumSound(
            state,
            DRUM_NAMES[event.piece],
            time,
            level,
            soundingLayers(state, timeline, event.tick),
        );
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
    private timer: ReturnType<typeof setInterval> | null = null;
    /**
     * The timeline of the segment `songTick()` last read the clock in: what the stand is shown
     * is in it, so the bar questions asked of that same tick (`placeAt`, `inLastPulse`,
     * `roleAt`…) read the same chart even while a carried-on chart is queued (#1506's one-read
     * rule). Null while stopped.
     */
    private heard: Timeline | null = null;
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

    /**
     * Compile a chart. Only a change of content (not of object identity) restarts the band.
     * `compiled` is this score's timeline when the caller already holds it (the runtime compiles
     * a chart as it opens it), so a chart is not compiled again to be played (#1665).
     */
    setScore(score: SemanticScore, compiled?: Timeline): void {
        const key = JSON.stringify(score);
        if (key === this.scoreKey) {
            return;
        }
        this.scoreKey = key;
        this.timeline = compiled ?? compileTimeline(score);
        this.counted = score.choruses !== undefined;
        if (this.playing && this.settings) {
            // The form changed under the band: restart the song cleanly.
            this.start(this.settings, this.bpm, 0);
        }
    }

    /**
     * Go on in another chart from a barline, without stopping (#1989: a section loop cleared
     * mid-play carries on into the full form). Stopped, this is `setScore`.
     *
     * The barline is the first one the band can still change at, as `update()` finds it: after
     * the lookahead and after every note already sent to the voices. From there the band plays
     * `score` from `entry(bar)` — the caller's mapping of the old chart's barline to the new
     * chart's bar — searching on to later barlines while `entry` answers null. The bars before
     * it play on as they were generated, so `entry` must name a bar that plays the same written
     * bar the old chart would have (a push or a fill in them aims at its chord). The engine's
     * memory goes with the band across the seam (`performPass` rebases it to the new ticks).
     *
     * Nothing waits here: the queue is cut at that barline and the segment before it carries
     * the new chart as data (`SegmentPlan.carry`), so a settings change, a tempo change or a
     * follow-on built again finds it there.
     */
    carryOn(
        score: SemanticScore,
        compiled: Timeline | undefined,
        entry: (bar: number) => number | null,
    ): void {
        const key = JSON.stringify(score);
        const timeline = compiled ?? compileTimeline(score);
        const carry: Carry = { timeline, counted: score.choruses !== undefined, entry };
        const audio = this.audio;
        if (!this.playing || !audio || !this.settings) {
            this.setScore(score, timeline);
            return;
        }
        this.scoreKey = key;
        this.timeline = timeline;
        this.counted = carry.counted;
        const now = audio.currentTime;
        const horizon = now + LOOKAHEAD_S;
        const atHorizon = this.current(horizon) ?? this.segments[this.segments.length - 1];
        const sent = this.underWay(now) ?? atHorizon;
        const current =
            this.segments.indexOf(sent) > this.segments.indexOf(atHorizon) ? sent : atHorizon;
        if (!current) {
            this.start(this.settings, this.bpm, 0);
            return;
        }
        // Everything after the current segment is built again, from its carry (`followOn`).
        this.segments.length = this.segments.indexOf(current) + 1;
        // A bar after the segment's first, so the cut never leaves it empty: a segment nothing
        // has been sent from yet still plays its first bar in the chart it was built from.
        const at = Math.max(this.changeBar(current, horizon), current.window.from + 1);
        for (let bar = at; bar < current.until; bar++) {
            if (entry(bar) !== null) {
                this.cut(current, bar);
                break;
            }
        }
        current.carry = carry;
        current.ends = false;
    }

    /**
     * `countIn` is one bar of clicks before the first segment, requested only by a fresh Play
     * from stopped (`runtime.ts`'s `startBand`) and gated there on the `playback.countIn`
     * preference — every other caller (a wrap's own `append`, `update`'s barline swap,
     * `setScore`'s restart, a mid-song resume) passes nothing and gets the default `false`, so
     * the chart's first bar starts on the beat it always did.
     */
    start(settings: BandSettings, bpm: number, fromTick = 0, countIn = false): void {
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
        const fromBar = Math.min(this.barAt(fromTick), this.timeline.bars.length - 1);
        const first = this.songPlan(fromBar, fromBar);
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
        const now = audio.currentTime;
        const horizon = now + LOOKAHEAD_S;
        const atHorizon = this.current(horizon);
        if (!atHorizon) {
            return;
        }
        // The segment at the horizon, or a later one the voices have already been sent anything
        // from (`underWay`): a note pushed ahead of the next segment's barline is sent while
        // that barline is still beyond the horizon. Dropping that segment would leave the note
        // to sound again under the one rebuilt in its place (#1499).
        const sent = this.underWay(now)!;
        const current =
            this.segments.indexOf(sent) > this.segments.indexOf(atHorizon) ? sent : atHorizon;
        // Everything after the current segment is regenerated lazily with the new settings.
        this.segments.length = this.segments.indexOf(current) + 1;
        const cutoff = this.regenerate(current, settings, horizon);
        this.change = { segment: current, tick: cutoff ?? current.to };
    }

    /**
     * Regenerate `current` from the first barline after `horizon` and after every note already
     * sent to the voices, with `settings` and the segment's own `looping`. What comes before
     * that barline stays, sent or still to be sent. Returns the barline's tick, or null when
     * the segment has no barline left to change at.
     */
    private regenerate(current: Segment, settings: BandSettings, horizon: number): number | null {
        const { timeline } = current;
        const cutoffBar = this.changeBar(current, horizon);
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
        // Every note sent is before the cutoff, so the cursor stays where the last pump left
        // it. Moved on to the horizon, it would skip the kept notes between the last pump's
        // horizon and this one, up to a timer tick of them never sent (#1499).
        current.events = current.events.filter((e) => e.tick < cutoff).concat(tail.events);
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
        if (this.finishIfOver(now)) {
            // The last barline has passed and the pump has not run since. Dropping that
            // segment below would leave an empty queue no pump could ever end.
            this.bpm = bpm;
            return;
        }
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
        current.start =
            now + lead - (this.secondsIn(current, tick) - this.secondsIn(current, current.from));
        for (let i = 1; i < this.segments.length; i++) {
            this.segments[i].start = this.endTime(this.segments[i - 1]);
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
        if (!segment) {
            return null;
        }
        this.heard = segment.timeline;
        return this.tickAt(segment, now);
    }

    /**
     * The timeline the stand is reading: the one `songTick()` last found sounding, else the
     * chart the band was handed. A caller picks the chart view drawn from the same timeline.
     */
    heardTimeline(): Timeline | null {
        return this.heard ?? this.timeline;
    }

    /**
     * Which time through the song the bar sounding at `tick` is in, and that bar's index: the
     * playing segment's pass plus the bar's chorus, the number the plan keys the head, the solos
     * and the trade on (`planBars`' `passAt`). Null while stopped, or `tick` is outside the
     * segment sounding now. Pass the tick `songTick()` just read, so one paint asks one clock.
     */
    placeAt(tick: number): { bar: number; pass: number } | null {
        const audio = this.audio;
        if (!audio || !this.playing) {
            return null;
        }
        const now = audio.currentTime;
        const segment = this.segments.find((s) => s.start <= now && now < this.endTime(s));
        if (!segment || tick < segment.from || tick >= segment.to) {
            return null;
        }
        const bar = barAtTick(segment.timeline, tick);
        return bar && { bar: bar.index, pass: segment.pass + bar.visit.chorus };
    }

    /**
     * What the band's trade is now (partner, turn length, lanes, and which lane is the
     * musician's own hole, #1992), to tell when a turn plan changed.
     */
    tradeKey(): string {
        const s = this.settings;
        return s
            ? JSON.stringify([s.trade ?? null, s.lanes.lead, s.lanes.drums, s.you ?? null])
            : '';
    }

    /** Which chorus of a counted performance performed bar `index` is in (0 when uncounted). */
    chorusOf(index: number): number {
        return this.heardTimeline()?.bars[index]?.visit.chorus ?? 0;
    }

    /** The lead's job at performed bar `index` of the band's `pass`: the plan's own answer. */
    roleAt(index: number, pass: number): LeadRole | null {
        const { settings } = this;
        const timeline = this.heardTimeline();
        return timeline && settings
            ? leadRoleAt(
                  timeline,
                  settings,
                  Boolean(STYLES[settings.style].drums.solos),
                  index,
                  pass,
              )
            : null;
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
     * this reads the timeline the band is playing (`heardTimeline`).
     */
    inLastPulse(tick: number, leadMs = 600): boolean {
        const bar = this.barContaining(tick);
        if (!bar) {
            return false;
        }
        const end = bar.start + bar.meter.barTicks;
        const lastPulseStart = bar.start + bar.meter.pulses[bar.meter.pulses.length - 1];
        const leadTicks = ((leadMs / 1000) * PPQ * this.bpm) / 60;
        return tick >= Math.min(lastPulseStart, end - leadTicks);
    }

    /**
     * Is `tick` within one FELT pulse of `end`, a song tick ahead of it — the last beat before a
     * chord gives way (Neck mode's strong preview, #1590)? `inLastPulse` asks the same of the
     * barline; this asks it of any tick, because a chord can change inside a bar and the hand
     * has to move there too.
     *
     * The beat is the same one `inLastPulse` counts in, the meter's own `pulses` skeleton: the
     * pulse `end` closes (a quarter in 4/4, a dotted quarter in 6/8, the group in a grouped
     * 7/8), measured back from `end`. At a barline that is exactly `inLastPulse`'s last pulse;
     * for an `end` off the pulse grid (a chord that gives way on the "and" of 2) it is still a
     * full beat's notice rather than the half beat left of that pulse.
     *
     * No lower bound: the caller asks about the span `tick` is already in, so a span no longer
     * than that one beat (four chords in a 4/4 bar) answers true from its first tick. The
     * alternative is a change that is never previewed at all, and those are the fast changes a
     * learner most needs to see coming.
     *
     * `leadMs` is `inLastPulse`'s floor for the same reason in other clothes: a beat at a fast
     * tempo is too short to read. There it buys the chart's scroll time to finish; here it buys
     * the eye time to find the ghost dots, so above 100 bpm the notice is 600ms, not one beat.
     */
    inLastPulseBefore(tick: number, end: number, leadMs = 600): boolean {
        if (tick >= end) {
            return false;
        }
        // The bar `end` closes a span of: a barline belongs to the bar it ends, not the next one.
        const bar = this.barContaining(end - 1);
        if (!bar) {
            return false;
        }
        const { pulses, pulseTicks } = bar.meter;
        const offset = end - 1 - bar.start;
        let pulse = pulses.length - 1;
        while (pulse > 0 && pulses[pulse] > offset) {
            pulse -= 1;
        }
        const leadTicks = ((leadMs / 1000) * PPQ * this.bpm) / 60;
        return tick >= end - Math.max(pulseTicks[pulse], leadTicks);
    }

    /** The performed bar `tick` falls in, or null past either end of the timeline. */
    private barContaining(tick: number): Timeline['bars'][number] | null {
        const timeline = this.heardTimeline();
        return timeline ? barAtTick(timeline, tick) : null;
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
     * the export is the performance that was heard. An uncounted chart's one pass is generated
     * `PASS_CHUNK_BARS` at a time, resuming its memory as live Play does, so its events are the
     * pass performed whole. Between pieces the page gets a turn (#1802), so a long chart's
     * export never freezes it; the events are the same either way.
     */
    async render(settings: BandSettings): Promise<{ events: BandEvent[]; timeline: Timeline }> {
        const timeline = this.timeline;
        if (!timeline) {
            throw new Error('No chart loaded.');
        }
        const events: BandEvent[] = [];
        let memory: PassMemory | undefined;
        // Unlike live Play the pass does not loop, so its last piece keeps the held ending.
        for (let plan = this.exportPlan(0); ; plan = this.exportPlan(plan.until)) {
            const result = performPass(timeline, settings, { ...plan, memory });
            events.push(...result.events);
            memory = result.memory;
            if (plan.until >= timeline.bars.length) {
                break;
            }
            await givePageATurn();
        }
        return { events, timeline };
    }

    // ------------------------------------------------------------ internals

    private halt(): void {
        this.change = null;
        this.heard = null;
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

    private barAt(tick: number, after = false, timeline = this.timeline!): number {
        const { bars } = timeline;
        const index = bars.findIndex((b) =>
            after ? b.start >= tick : b.start + b.meter.barTicks > tick,
        );
        return index < 0 ? bars.length : index;
    }

    /**
     * The song from `fromBar`. Uncounted, the rest of pass `pass` (the first, unless it follows
     * another), after which it goes round again. Counted (#1475), the rest of `fromBar`'s
     * chorus of a performance that began at `origin` and ends after the last chorus: a
     * performance of up to 64 choruses is generated a chorus at a time, two seconds ahead like
     * any segment, never all at once on Play (and a settings change regenerates the rest of
     * one chorus, not of the song). Every chorus is pass 0, whatever `pass` says: its chorus
     * number is its time through (`PassOptions.pass`).
     */
    private songPlan(
        fromBar: number,
        origin: number,
        pass = 0,
        timeline = this.timeline!,
        counted = this.counted,
    ): SegmentPlan {
        const { bars } = timeline;
        const from = Math.min(fromBar, bars.length - 1);
        if (!counted) {
            // At most `PASS_CHUNK_BARS` at a time, resuming the same pass (#1665): a long
            // chart's whole pass at once blocked the page for seconds on Play.
            return {
                timeline,
                counted,
                pass,
                window: { from, to: bars.length, origin: Math.min(origin, from) },
                until: Math.min(from + PASS_CHUNK_BARS, bars.length),
                looping: true,
            };
        }
        let until = from + 1;
        while (until < bars.length && bars[until].visit.chorus === bars[from].visit.chorus) {
            until++;
        }
        return {
            timeline,
            counted,
            pass: 0,
            window: { from, to: bars.length, origin },
            until,
            looping: false,
        };
    }

    /** The export's piece from `fromBar`: a counted chart's chorus, or an uncounted chunk of pass 0. */
    private exportPlan(fromBar: number): SegmentPlan {
        return { ...this.songPlan(fromBar, 0), looping: false };
    }

    /**
     * What plays after `last`: the song's next pass or chorus. An uncounted pass is the one
     * after `last`'s, so a follow-on that `update()` drops and builds again is the same pass,
     * not the one after it (#1500).
     */
    private followOn(last: Segment): SegmentPlan {
        const { carry, timeline, counted } = last;
        // Carrying on in another chart (`carryOn`) from this barline: the start of a pass there,
        // the band's first time through it, but no fresh start — origin 0 makes its first bar a
        // continuation, so it still crashes into a section top and answers the fill before it.
        const into = carry?.entry(last.until) ?? null;
        if (carry && into !== null) {
            return this.songPlan(into, 0, 0, carry.timeline, carry.counted);
        }
        const origin = last.window.origin ?? last.window.from;
        // The rest of this pass, a chunk at a time, then the next pass from the top.
        const plan = counted
            ? this.songPlan(last.until, origin, 0, timeline, counted)
            : last.until < timeline.bars.length
              ? this.songPlan(last.until, origin, last.pass, timeline, counted)
              : this.songPlan(0, 0, last.pass + 1, timeline, counted);
        // Not at this barline: the next segment carries the other chart on to the next one.
        return carry ? { ...plan, carry } : plan;
    }

    /**
     * The first barline in `current` the band can still change at: the first after `horizon`,
     * and after every note already sent to the voices (#1499).
     */
    private changeBar(current: Segment, horizon: number): number {
        const { timeline } = current;
        let bar = this.barAt(this.tickAt(current, horizon), true, timeline);
        if (current.cursor > 0) {
            // A note pushed ahead of a barline is sent while the barline is still beyond the
            // horizon. Its bar plays on as it was: regenerated, its own twin of that note would
            // sound again. Events are in tick order, so the last one sent is the latest.
            bar = Math.max(
                bar,
                this.barAt(current.events[current.cursor - 1].tick, false, timeline) + 1,
            );
        }
        return bar;
    }

    /**
     * End `segment` at bar `bar`'s barline (a bar after its first): the bars before it play on
     * exactly as generated, and what follows is built from the memory before that bar.
     */
    private cut(segment: Segment, bar: number): void {
        const tick = segment.timeline.bars[bar].start;
        // Every note sent is before the barline (`changeBar`), so the cursor stays valid.
        segment.events = segment.events.filter((e) => e.tick < tick);
        segment.chordSizes = chordSizes(segment.events);
        segment.legato = legatoLeads(segment.events);
        segment.until = bar;
        segment.to = tick;
        segment.memoryAfter = segment.snapshots[bar];
        // A settings change waiting for a barline past the cut is heard at the cut at the latest.
        if (this.change?.segment === segment && this.change.tick > tick) {
            this.change.tick = tick;
        }
    }

    private append(plan: SegmentPlan, start: number, memory: PassMemory | undefined): void {
        const { timeline } = plan;
        const result = performPass(timeline, this.settings!, { ...plan, memory });
        const from = timeline.bars[plan.window.from].start;
        const last = timeline.bars[plan.until - 1];
        this.segments.push({
            ...plan,
            ends: !plan.carry && !plan.looping && plan.until >= timeline.bars.length,
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

    /** Seconds to song tick `tick` of the chart `segment` plays. */
    private secondsIn(segment: Segment, tick: number): number {
        return secondsAt(segment.timeline, tick, this.bpm);
    }

    private endTime(segment: Segment): number {
        return this.timeOf(segment, segment.to);
    }

    private timeOf(segment: Segment, tick: number): number {
        return (
            segment.start + this.secondsIn(segment, tick) - this.secondsIn(segment, segment.from)
        );
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

    /**
     * Ends the performance if its last bar has ended: every note in it was scheduled before
     * that barline. Stopping here means the transport reads stopped when the band falls
     * silent — not a lookahead early, nor a lap late.
     */
    private finishIfOver(now: number): boolean {
        const last = this.segments[this.segments.length - 1];
        if (!last?.ends || now < this.endTime(last)) {
            return false;
        }
        this.halt();
        this.options.onEnd?.();
        return true;
    }

    private pump(): void {
        const audio = this.audio;
        if (!audio) {
            return;
        }
        const now = audio.currentTime;
        const horizon = now + LOOKAHEAD_S;
        if (this.finishIfOver(now)) {
            return;
        }
        const last = this.segments[this.segments.length - 1];
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
            segment.timeline,
            segment.legato.has(event),
        );
    }

    /** The click: a beep on each pulse, accented on the downbeat. Same voice as the old engine. */
    private metronome(state: EnsembleState, segment: Segment, now: number, horizon: number): void {
        const audio = this.audio;
        const { timeline } = segment;
        if (!state.playback.metronome || !audio) {
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
