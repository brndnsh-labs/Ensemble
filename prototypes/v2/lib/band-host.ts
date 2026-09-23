/**
 * The live host for the band engine (`?engine=next`). It turns `performPass` output into
 * sound through today's voices and sample packs, on the audio clock:
 *
 *   - Playback is a queue of *segments*. Each is one window of bars in performance order: a
 *     pass of the song, the rest of the song after "play from here", or one lap of a
 *     practice loop. Each segment knows the audio time its first bar starts, so a tempo
 *     change only re-anchors the clock; nothing is regenerated.
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
    performPass,
    secondsAt,
    type Timeline,
} from '@band/index';
import { playBassNote } from '@engine/engine/synth-bass';
import { playNote } from '@engine/engine/synth-chords';
import { playDrumSound } from '@engine/engine/synth-drums';
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

interface Segment {
    pass: number;
    window: PassWindow;
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
}

export interface Loop {
    from: number;
    to: number;
}

function hz(midi: number): number {
    return 440 * 2 ** ((midi - 69) / 12);
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
    private settings: BandSettings | null = null;
    private bpm = 120;
    private segments: Segment[] = [];
    private loop: Loop | null = null;
    /** Where the segment after the current one starts, when that isn't the default. */
    private resumeBar: number | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private nextPass = 0;

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
        if (this.playing && this.settings) {
            // The form changed under the band: restart the song cleanly.
            this.start(this.settings, this.bpm, 0, this.loop);
        }
    }

    start(settings: BandSettings, bpm: number, fromTick = 0, loop: Loop | null = null): void {
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
        this.resumeBar = null;
        const window = loop ? this.loopWindow(loop) : this.songWindow(this.barAt(fromTick));
        this.append(window, audio.currentTime + 0.1, undefined);
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
        const cutoffBar = this.barAt(this.tickAt(current, horizon), true);
        if (cutoffBar >= current.window.to) {
            return;
        }
        // Resume from the engine's own memory at that barline, so the new bars follow on
        // from the bars actually played (voicing, bass register, a pushed chord).
        const tail = performPass(timeline, settings, {
            pass: current.pass,
            looping: true,
            memory: current.snapshots[cutoffBar],
            window: { ...current.window, from: cutoffBar },
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
        for (let bar = cutoffBar; bar < current.window.to; bar++) {
            current.snapshots[bar] = tail.snapshots[bar];
        }
        current.memoryAfter = tail.memory;
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
        // Leaving a loop: finish the lap that is playing, then carry on through the song.
        const current = this.current(audio.currentTime);
        if (current) {
            this.segments.length = this.segments.indexOf(current) + 1;
            this.resumeBar =
                current.window.to < this.timeline!.bars.length ? current.window.to : null;
        }
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

    /** The whole song, once through with an ending, for export. */
    render(settings: BandSettings): { events: BandEvent[]; timeline: Timeline } {
        if (!this.timeline) {
            throw new Error('No chart loaded.');
        }
        const { events } = performPass(this.timeline, settings, { pass: 0, looping: false });
        return { events, timeline: this.timeline };
    }

    // ------------------------------------------------------------ internals

    private halt(): void {
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

    private songWindow(fromBar: number): PassWindow {
        return {
            from: Math.min(fromBar, this.timeline!.bars.length - 1),
            to: this.timeline!.bars.length,
            wrapTo: 0,
        };
    }

    private loopWindow(loop: Loop): PassWindow {
        const from = this.barAt(loop.from);
        const to = Math.max(from + 1, this.barAt(loop.to, true));
        return { from, to, wrapTo: from };
    }

    private append(window: PassWindow, start: number, memory: PassMemory | undefined): void {
        const timeline = this.timeline!;
        const pass = this.nextPass++;
        const result = performPass(timeline, this.settings!, {
            pass,
            looping: true,
            memory,
            window,
        });
        const from = timeline.bars[window.from].start;
        const last = timeline.bars[window.to - 1];
        this.segments.push({
            pass,
            window,
            from,
            to: last.start + last.meter.barTicks,
            start,
            events: result.events,
            cursor: 0,
            chordSizes: chordSizes(result.events),
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
        // Keep a segment queued ahead of the playhead.
        const last = this.segments[this.segments.length - 1];
        if (last && this.endTime(last) < now + PREPARE_S) {
            const window = this.loop
                ? this.loopWindow(this.loop)
                : this.songWindow(this.resumeBar ?? 0);
            this.resumeBar = null;
            this.append(window, this.endTime(last), last.memoryAfter);
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
        if (event.lane === 'drums') {
            // The drum voices take roughly 0–1.2 (an accent sits a little over 1).
            playDrumSound(state, DRUM_NAMES[event.piece], time, (event.velocity / 127) * 1.2);
            return;
        }
        const seconds =
            this.timeOf(segment, event.tick + event.dur) - this.timeOf(segment, event.tick);
        if (event.lane === 'bass') {
            playBassNote(
                state,
                hz(event.midi),
                time,
                seconds,
                (event.velocity / 127) * 1.1,
                event.muted ? BASS_MUTE : 0,
            );
            return;
        }
        // A guitar scratch: the strings deadened under the hand — a click with a trace of
        // pitch, so it is cut to a few tens of milliseconds whatever its written length.
        playNote(state, hz(event.midi), time, event.muted ? Math.min(seconds, 0.03) : seconds, {
            muted: event.muted,
            vol: (event.velocity / 127) * 0.8,
            instrument: (state.chords as { instrument?: string }).instrument || 'Piano',
            numVoices: segment.chordSizes.get(event.tick) ?? 1,
        });
    }

    /** The click: a beep on each pulse, accented on the downbeat. Same voice as the old engine. */
    private metronome(state: EnsembleState, segment: Segment, now: number, horizon: number): void {
        const audio = this.audio;
        const timeline = this.timeline;
        if (!state.playback.metronome || !audio || !timeline) {
            return;
        }
        for (let b = segment.window.from; b < segment.window.to; b++) {
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
            });
        }
    }
}
