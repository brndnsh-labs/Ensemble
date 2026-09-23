/**
 * The live host for the band engine (`?engine=next`). It turns `performPass` output into
 * sound through today's voices and sample packs, on the audio clock:
 *
 *   - Playback is a queue of *segments*: one pass of the song (or one lap of a practice
 *     loop) each, with the audio time it starts at. Events are in song ticks, so a tempo
 *     change only re-anchors the clock; nothing is regenerated.
 *   - A change to the band (style, intensity, lanes, swing…) regenerates the current pass
 *     and takes the new events from the next barline on.
 *   - A 25 ms timer schedules everything that starts within the next 150 ms.
 *
 * It never writes engine state; the runtime owns every dispatch.
 */
import {
    type BandEvent,
    type BandSettings,
    compileTimeline,
    type PassMemory,
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
    /** Song-tick window this segment plays. */
    from: number;
    to: number;
    /** Audio time of song tick `from`. */
    start: number;
    events: BandEvent[];
    /** Index of the next event to schedule. */
    cursor: number;
    /** Keys chord sizes by tick, for the voice's per-note gain. */
    chordSizes: Map<number, number>;
}

interface PassCache {
    events: BandEvent[];
    memoryBefore: PassMemory | undefined;
    memoryAfter: PassMemory;
}

export interface HostOptions {
    state: () => EnsembleState;
}

function hz(midi: number): number {
    return 440 * 2 ** ((midi - 69) / 12);
}

export class BandHost {
    private timeline: Timeline | null = null;
    private score: SemanticScore | null = null;
    private settings: BandSettings | null = null;
    private bpm = 120;
    private segments: Segment[] = [];
    private passes = new Map<number, PassCache>();
    private loop: { from: number; to: number } | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private nextPass = 0;
    private metronomeUntil = 0;

    private readonly options: HostOptions;

    constructor(options: HostOptions) {
        this.options = options;
    }

    get playing(): boolean {
        return this.timer !== null;
    }

    private get audio(): AudioContext | null {
        return (this.options.state().playback.audio as AudioContext | null) ?? null;
    }

    /** Compile a chart. Cheap; call whenever the score changes. */
    setScore(score: SemanticScore): void {
        if (score === this.score) {
            return;
        }
        this.score = score;
        this.timeline = compileTimeline(score);
        this.passes.clear();
        if (this.playing) {
            // The form changed under the band: restart the song cleanly.
            const settings = this.settings!;
            this.stop();
            this.start(settings, this.bpm, 0, this.loop);
        }
    }

    start(
        settings: BandSettings,
        bpm: number,
        fromTick = 0,
        loop: { from: number; to: number } | null = null,
    ): void {
        const audio = this.audio;
        if (!this.timeline || !audio) {
            throw new Error('The band has no chart or no audio yet.');
        }
        this.stop();
        this.settings = settings;
        this.bpm = bpm;
        this.loop = loop;
        this.passes.clear();
        this.segments = [];
        this.nextPass = 0;
        this.metronomeUntil = 0;
        const from = loop ? loop.from : fromTick;
        this.append(from, audio.currentTime + 0.1);
        this.timer = setInterval(() => this.pump(), TIMER_MS);
        this.pump();
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.segments = [];
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
        const keepMemory = new Map([...this.passes].map(([p, c]) => [p, c.memoryBefore]));
        this.passes.clear();
        const horizon = audio.currentTime + LOOKAHEAD_S;
        for (const segment of this.segments) {
            const cutoff = this.nextBarline(segment, horizon);
            if (cutoff === null) {
                continue;
            }
            const fresh = this.generate(segment.pass, keepMemory.get(segment.pass));
            const kept = segment.events
                .slice(0, segment.cursor)
                .concat(segment.events.slice(segment.cursor).filter((e) => e.tick < cutoff));
            const added = fresh.filter(
                (e) => e.tick >= cutoff && e.tick >= segment.from && e.tick < segment.to,
            );
            segment.events = kept.concat(added).sort((a, b) => a.tick - b.tick);
            segment.cursor = Math.min(segment.cursor, segment.events.length);
            segment.chordSizes = chordSizes(segment.events);
        }
    }

    /** Re-anchor the clock at the current position; the music keeps its place in the bar. */
    setTempo(bpm: number): void {
        const audio = this.audio;
        const timeline = this.timeline;
        if (bpm === this.bpm || !audio || !timeline || !this.playing) {
            this.bpm = bpm;
            return;
        }
        const now = audio.currentTime;
        const current = this.segments.find((s) => this.endTime(s) > now) ?? this.segments[0];
        if (!current) {
            this.bpm = bpm;
            return;
        }
        const tick = this.tickAt(current, now);
        this.bpm = bpm;
        current.start =
            now - (secondsAt(timeline, tick, bpm) - secondsAt(timeline, current.from, bpm));
        const index = this.segments.indexOf(current);
        for (let i = index + 1; i < this.segments.length; i++) {
            this.segments[i].start = this.endTime(this.segments[i - 1]);
        }
    }

    setLoop(loop: { from: number; to: number } | null): void {
        if (JSON.stringify(loop) === JSON.stringify(this.loop)) {
            return;
        }
        this.loop = loop;
        if (this.playing && this.settings) {
            this.start(this.settings, this.bpm, loop ? loop.from : 0, loop);
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

    /** One pass of the whole song, for export. */
    renderPasses(
        settings: BandSettings,
        passes: number,
    ): { events: BandEvent[]; timeline: Timeline } {
        if (!this.timeline) {
            throw new Error('No chart loaded.');
        }
        const all: BandEvent[] = [];
        let memory: PassMemory | undefined;
        for (let pass = 0; pass < passes; pass++) {
            const result = performPass(this.timeline, settings, {
                pass,
                looping: pass < passes - 1,
                memory,
            });
            memory = result.memory;
            const offset = pass * this.timeline.ticks;
            all.push(...result.events.map((e) => ({ ...e, tick: e.tick + offset })));
        }
        return { events: all, timeline: this.timeline };
    }

    // ------------------------------------------------------------ internals

    private generate(pass: number, memory?: PassMemory): BandEvent[] {
        const cached = this.passes.get(pass);
        if (cached) {
            return cached.events;
        }
        const before = memory ?? this.passes.get(pass - 1)?.memoryAfter;
        const result = performPass(this.timeline!, this.settings!, {
            pass,
            looping: true,
            memory: before,
        });
        this.passes.set(pass, {
            events: result.events,
            memoryBefore: before,
            memoryAfter: result.memory,
        });
        // Keep the cache small: only the passes around the playhead matter.
        for (const key of this.passes.keys()) {
            if (key < pass - 2) {
                this.passes.delete(key);
            }
        }
        return result.events;
    }

    private append(from: number, start: number): void {
        const timeline = this.timeline!;
        const pass = this.nextPass++;
        const to = this.loop ? this.loop.to : timeline.ticks;
        const events = this.generate(pass).filter((e) => e.tick >= from && e.tick < to);
        this.segments.push({
            pass,
            from,
            to,
            start,
            events,
            cursor: 0,
            chordSizes: chordSizes(events),
        });
    }

    private endTime(segment: Segment): number {
        const timeline = this.timeline!;
        return (
            segment.start +
            secondsAt(timeline, segment.to, this.bpm) -
            secondsAt(timeline, segment.from, this.bpm)
        );
    }

    private timeOf(segment: Segment, tick: number): number {
        const timeline = this.timeline!;
        return (
            segment.start +
            secondsAt(timeline, tick, this.bpm) -
            secondsAt(timeline, segment.from, this.bpm)
        );
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

    /** The first barline at or after `time` within a segment, or null if it is past it. */
    private nextBarline(segment: Segment, time: number): number | null {
        const timeline = this.timeline!;
        if (this.endTime(segment) <= time) {
            return null;
        }
        const tick = time <= segment.start ? segment.from : this.tickAt(segment, time);
        const bar = timeline.bars.find((b) => b.start >= tick && b.start >= segment.from);
        return bar ? bar.start : segment.to;
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
            this.append(this.loop ? this.loop.from : 0, this.endTime(last));
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
        }
        this.metronome(state, now, horizon);
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
        playNote(state, hz(event.midi), time, seconds, {
            vol: (event.velocity / 127) * 0.8,
            instrument: (state.chords as { instrument?: string }).instrument || 'Piano',
            numVoices: segment.chordSizes.get(event.tick) ?? 1,
        });
    }

    /** The click: a beep on each pulse, accented on the downbeat. Same voice as the old engine. */
    private metronome(state: EnsembleState, now: number, horizon: number): void {
        const audio = this.audio;
        const timeline = this.timeline;
        if (!state.playback.metronome || !audio || !timeline) {
            return;
        }
        for (const segment of this.segments) {
            for (const bar of timeline.bars) {
                if (bar.start < segment.from || bar.start >= segment.to) {
                    continue;
                }
                bar.meter.pulses.forEach((offset, i) => {
                    const time = this.timeOf(segment, bar.start + offset);
                    if (time <= this.metronomeUntil || time > horizon || time < now) {
                        return;
                    }
                    this.metronomeUntil = time;
                    const freq = i === 0 ? 1000 : bar.meter.roles[i] === 'strong' ? 800 : 600;
                    const osc = audio.createOscillator();
                    const gain = audio.createGain();
                    osc.connect(gain);
                    const graph = state.playback.audioGraph as {
                        master?: { gain: AudioNode };
                    } | null;
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
}

function chordSizes(events: BandEvent[]): Map<number, number> {
    const sizes = new Map<number, number>();
    for (const e of events) {
        if (e.lane === 'keys') {
            sizes.set(e.tick, (sizes.get(e.tick) ?? 0) + 1);
        }
    }
    return sizes;
}
