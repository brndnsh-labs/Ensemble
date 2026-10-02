/**
 * The count-in (#1422): one bar of clicks before a fresh Play, at the chart's own tempo and
 * meter, that shifts the band's own downbeat back by exactly that bar rather than overlapping
 * it. Pinned here: `countInPlan`'s pure math, and `BandHost.start()`'s use of it — scheduled
 * only when asked, never re-triggered by a loop wrap, and absent entirely when off.
 *
 * The synth voices are mocked out: this suite is about scheduling and timing, not sound, and a
 * fake `AudioContext` has none of the nodes the real voices need.
 *
 * Also the counted chart (#1475): N choruses played once, then the host stops by itself; and
 * releasing a practice loop (#1484, #1489).
 */
import {
    type BandEvent,
    compileTimeline,
    DEFAULT_SETTINGS,
    type PassMemory,
    performPass,
    secondsAt,
    type Timeline,
    toMidi,
} from '@band/index';
import { playBassNote } from '@engine/engine/synth-bass';
import { playNote } from '@engine/engine/synth-chords';
import { playDrumSound } from '@engine/engine/synth-drums';
import { playSoloNote } from '@engine/engine/synth-soloist';
import type {
    ScoreDirection,
    ScoreEvent,
    ScoreMeasure,
    SemanticScore,
} from '@engine/songbook/score-types';
import type { EnsembleState } from '@engine/types';
import { describe, expect, it, vi } from 'vitest';
import { BandHost, countInPlan } from './band-host';

vi.mock('@engine/engine/synth-drums', () => ({ playDrumSound: vi.fn() }));
vi.mock('@engine/engine/synth-bass', () => ({ playBassNote: vi.fn() }));
vi.mock('@engine/engine/synth-chords', () => ({ playNote: vi.fn() }));
vi.mock('@engine/engine/synth-soloist', () => ({ playSoloNote: vi.fn() }));

const chord = (symbol: string, n: number, d = 1): ScoreEvent => ({
    kind: 'chord',
    symbol,
    duration: [n, d],
});
const bar = (id: string, events: ScoreEvent[]): ScoreMeasure => ({
    id,
    content: { kind: 'events', events },
});
const song = (sections: SemanticScore['sections']): SemanticScore => ({
    notation: 'name',
    key: 'C',
    isMinor: false,
    meter: '4/4',
    grouping: null,
    sections,
});

/** Two bars of C, 4/4 — enough for a loop to actually wrap. */
const twoBars = song([
    {
        id: 'a',
        label: 'A',
        repeat: 1,
        measures: [bar('m1', [chord('C', 4)]), bar('m2', [chord('C', 4)])],
    },
]);

/** A minimal stand-in for the live `AudioContext` — only what `BandHost` itself calls
 * (`createOscillator`/`createGain` for its own click, `currentTime`/`destination`). The
 * synth voices are mocked above, so nothing here needs to satisfy their much larger surface. */
function fakeAudioContext(startTime: number) {
    return {
        currentTime: startTime,
        destination: {},
        createOscillator: vi.fn(() => ({
            connect: vi.fn(),
            frequency: { setValueAtTime: vi.fn() },
            start: vi.fn(),
            stop: vi.fn(),
            onended: null,
        })),
        createGain: vi.fn(() => ({
            connect: vi.fn(),
            disconnect: vi.fn(),
            gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        })),
    };
}

function fakeState(audio: ReturnType<typeof fakeAudioContext>, metronome = false): EnsembleState {
    return {
        playback: { audio, audioGraph: null, metronome },
        chords: { instrument: 'Piano' },
    } as unknown as EnsembleState;
}

/** Drums only: isolates `createOscillator` calls to the count-in's own clicks (the per-segment
 * metronome is off, and the mocked comp/bass/lead voices never touch the audio context). */
const drumsOnly = {
    ...DEFAULT_SETTINGS,
    lanes: { drums: true, bass: false, comp: false, lead: false },
};

/** Drive the host's internal 25ms scheduler directly, deterministically, without waiting on
 * real timers — `pump` is private, but TypeScript's `private` erases at runtime. */
function pump(host: BandHost): void {
    (host as unknown as { pump(): void }).pump();
}

type Queued = { window: { from: number }; events: BandEvent[] };

/** Pump the host every 50 ms of audio time from `from` up to (not including) `to`. */
function run(
    host: BandHost,
    audio: ReturnType<typeof fakeAudioContext>,
    from: number,
    to: number,
): void {
    for (let t = from; t < to - 1e-9; t += 0.05) {
        audio.currentTime = t;
        pump(host);
    }
}

/** Every segment the host queues, in order (read off its private queue after each pump). */
function watchSegments(host: BandHost): () => Queued[] {
    const seen: Queued[] = [];
    const internals = host as unknown as { segments: Queued[]; pump(): void };
    const original = internals.pump.bind(host);
    internals.pump = () => {
        original();
        for (const segment of internals.segments) {
            if (!seen.includes(segment)) {
                seen.push(segment);
            }
        }
    };
    return () => seen;
}

describe('countInPlan', () => {
    const timeline: Timeline = compileTimeline(twoBars);

    it("is exactly one bar long, in the chart's own meter and tempo", () => {
        const plan = countInPlan(timeline, 120, 0);
        // 4/4 at 120bpm: four quarter notes at 0.5s each.
        expect(plan.seconds).toBeCloseTo(2, 10);
        expect(plan.times).toHaveLength(timeline.bars[0].meter.pulses.length);
        expect(plan.times[0]).toBe(0);
    });

    it("halves at double tempo — it tracks the chart's own bpm, not a fixed duration", () => {
        const plan = countInPlan(timeline, 240, 0);
        expect(plan.seconds).toBeCloseTo(1, 10);
    });

    it('accents the downbeat exactly like the per-segment metronome does', () => {
        const plan = countInPlan(timeline, 120, 0);
        expect(plan.freqs[0]).toBe(1000);
        expect(plan.freqs.slice(1).every((f) => f === 800 || f === 600)).toBe(true);
    });
});

describe('BandHost count-in scheduling', () => {
    it('schedules one bar of clicks and pushes the first bar back by exactly that bar', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const host = new BandHost({ state: () => state, silence: () => {} });
        host.setScore(twoBars);
        const bpm = 120;
        host.start(drumsOnly, bpm, 0, null, true);

        const timeline = compileTimeline(twoBars);
        const plan = countInPlan(timeline, bpm, 0);
        // One bar of clicks — nothing else has touched the oscillator yet.
        expect(audio.createOscillator).toHaveBeenCalledTimes(plan.times.length);

        const segmentStart = 10 + 0.1 + plan.seconds;
        // A hair before the bar ends: still the count-in, chart hasn't started.
        audio.currentTime = segmentStart - 0.01;
        expect(host.songTick()).toBeNull();
        expect(host.countingInBeat()).not.toBeNull();
        // Exactly on the boundary: the count-in is over and tick 0 sounds — pushed
        // back by the bar, not overlapping it.
        audio.currentTime = segmentStart;
        expect(host.songTick()).toBeCloseTo(0, 6);
        expect(host.countingInBeat()).toBeNull();

        host.stop();
    });

    it('silences the rest of the count-in when Stop lands inside it', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const host = new BandHost({ state: () => state, silence: () => {} });
        host.setScore(twoBars);
        host.start(drumsOnly, 120, 0, null, true);
        const clicks = audio.createOscillator.mock.results.map((r) => r.value);
        expect(clicks.length).toBeGreaterThan(0);
        // Each click schedules its own natural stop once, when it is created.
        for (const osc of clicks) {
            expect(osc.stop).toHaveBeenCalledTimes(1);
        }
        audio.currentTime = 10.6;
        host.stop();
        // Stop cancels every scheduled click: a second, immediate stop on each.
        for (const osc of clicks) {
            expect(osc.stop).toHaveBeenCalledTimes(2);
            expect(osc.stop).toHaveBeenLastCalledWith();
        }
        expect(host.countingInBeat()).toBeNull();
    });

    it('does not re-trigger on a loop wrap', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const host = new BandHost({ state: () => state, silence: () => {} });
        host.setScore(twoBars);
        const bpm = 120;
        const timeline = compileTimeline(twoBars);
        const barTicks = timeline.bars[0].meter.barTicks;
        const plan = countInPlan(timeline, bpm, 0);
        // A one-bar loop, so the fast-forward below crosses several wraps.
        host.start(drumsOnly, bpm, 0, { from: 0, to: barTicks }, true);
        expect(audio.createOscillator).toHaveBeenCalledTimes(plan.times.length);

        const segmentStart = 10 + 0.1 + plan.seconds;
        const lapSeconds = secondsAt(timeline, barTicks, bpm);
        for (let lap = 0; lap < 6; lap++) {
            audio.currentTime = segmentStart + lap * lapSeconds + lapSeconds / 2;
            pump(host);
        }
        // Six laps later, still exactly the one count-in bar's worth of clicks.
        expect(audio.createOscillator).toHaveBeenCalledTimes(plan.times.length);

        host.stop();
    });

    it('with countIn off, the first bar starts immediately — no offset, no clicks', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const host = new BandHost({ state: () => state, silence: () => {} });
        host.setScore(twoBars);
        host.start(drumsOnly, 120, 0, null, false);

        expect(audio.createOscillator).not.toHaveBeenCalled();
        audio.currentTime = 10 + 0.1 + 0.0001;
        expect(host.songTick()).not.toBeNull();
        expect(host.countingInBeat()).toBeNull();

        host.stop();
    });

    it('a restart while playing (setScore, transpose, a genre resume) gets no count-in by default', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const host = new BandHost({ state: () => state, silence: () => {} });
        host.setScore(twoBars);
        // `start()`'s own default: callers that don't ask for a count-in (every restart path
        // except a fresh Play) simply omit the argument.
        host.start(drumsOnly, 120, 0, null);

        expect(audio.createOscillator).not.toHaveBeenCalled();
        audio.currentTime = 10 + 0.1 + 0.0001;
        expect(host.songTick()).not.toBeNull();

        host.stop();
    });
});

/**
 * A chart that counts its choruses (#1475): the band plays them once, with the last-chorus
 * coda on the final one, and stops at the end of its final bar; export renders that same
 * performance. Without a count, the same chart loops forever and never reaches the coda.
 */
describe('BandHost counted choruses', () => {
    const lastChorus: ScoreDirection = {
        kind: 'last-chorus',
        destination: { kind: 'coda', via: 'to-coda', target: 'coda' },
    };
    /** a1 a2, "To Coda, last chorus" at a2's end, then a one-bar coda straight after. */
    const codaSong = (choruses?: number): SemanticScore => {
        const chart = song([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: [
                    bar('a1', [chord('C', 4)]),
                    {
                        ...bar('a2', [chord('G7', 4)]),
                        end: [{ kind: 'coda', label: 'to-coda' }, lastChorus],
                    },
                ],
            },
            {
                id: 'coda',
                label: 'Coda',
                repeat: 1,
                measures: [
                    { ...bar('c1', [chord('C', 4)]), start: [{ kind: 'coda', label: 'coda' }] },
                ],
            },
        ]);
        return choruses === undefined ? chart : { ...chart, choruses };
    };
    const BPM = 120;
    /** 4/4 at 120: two seconds a bar. */
    const BAR_S = 2;

    it('ends on the tonic where the last chorus ends on a turnaround (#1482)', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const host = new BandHost({ state: () => state, silence: () => {} });
        host.setScore({
            ...song([
                {
                    id: 'a',
                    label: 'A',
                    repeat: 1,
                    measures: [
                        bar('a1', [chord('C', 4)]),
                        bar('a2', [chord('Dm7', 2), chord('G7', 2)]),
                    ],
                },
            ]),
            choruses: 2,
        });
        const band = {
            ...DEFAULT_SETTINGS,
            style: 'jazz' as const,
            lanes: { drums: true, bass: true, comp: true, lead: true },
        };
        const { events, timeline } = host.render(band);
        const bassIn = (index: number) =>
            events.flatMap((e) => (e.lane === 'bass' && e.bar === index ? [e.midi % 12] : []));
        // The first chorus's ii–V leads round to the top; the last one's resolves to C.
        expect(bassIn(1).some((pc) => pc === 2 || pc === 7)).toBe(true);
        expect(bassIn(timeline.bars.length - 1)).toEqual([0]);
    });

    it('plays every chorus, the coda only in the last, and stops at the end of its final bar', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const onEnd = vi.fn();
        const host = new BandHost({ state: () => state, silence: () => {}, onEnd });
        const score = codaSong(2);
        host.setScore(score);
        const segments = watchSegments(host);
        host.start(drumsOnly, BPM, 0, null);
        const start = 10.1;
        const timeline = compileTimeline(score);
        // a1 a2 | a1 a2 c1: the coda is the last chorus's alone.
        expect(timeline.bars.map((b) => [b.visit.label, b.visit.chorus])).toEqual([
            ['A', 0],
            ['A', 0],
            ['A', 1],
            ['A', 1],
            ['Coda', 1],
        ]);
        const end = start + secondsAt(timeline, timeline.ticks, BPM);
        expect(end).toBeCloseTo(start + 5 * BAR_S, 9);

        run(host, audio, start, end);
        // A hair before the last barline the band is still playing the coda.
        expect(onEnd).not.toHaveBeenCalled();
        expect(host.playing).toBe(true);
        expect(host.songTick()).toBeGreaterThan(timeline.bars[4].start);

        audio.currentTime = end;
        pump(host);
        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(host.playing).toBe(false);
        expect(host.songTick()).toBeNull();

        // One segment per chorus; every bar was performed, the coda bar included.
        expect(segments().map((s) => s.window.from)).toEqual([0, 2]);
        const bars = new Set(segments().flatMap((s) => s.events.map((e) => e.bar)));
        expect([...bars].sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it('without a count loops the same chart forever and never takes the coda', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const onEnd = vi.fn();
        const host = new BandHost({ state: () => state, silence: () => {}, onEnd });
        host.setScore(codaSong());
        expect(compileTimeline(codaSong()).bars.map((b) => b.visit.label)).toEqual(['A', 'A']);
        const segments = watchSegments(host);
        host.start(drumsOnly, BPM, 0, null);
        run(host, audio, 10.1, 10.1 + 4 * 2 * BAR_S);
        expect(onEnd).not.toHaveBeenCalled();
        expect(host.playing).toBe(true);
        expect(segments().length).toBeGreaterThanOrEqual(4);
        host.stop();
    });

    it('a practice loop on a counted chart ignores the count and keeps looping', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const onEnd = vi.fn();
        const host = new BandHost({ state: () => state, silence: () => {}, onEnd });
        const score = codaSong(2);
        host.setScore(score);
        const barTicks = compileTimeline(score).bars[0].meter.barTicks;
        host.start(drumsOnly, BPM, 0, { from: 0, to: barTicks });
        run(host, audio, 10.1, 10.1 + 8 * BAR_S);
        expect(onEnd).not.toHaveBeenCalled();
        expect(host.playing).toBe(true);
        host.stop();
    });

    it('leaving a practice loop carries the counted performance on to its end', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const onEnd = vi.fn();
        const host = new BandHost({ state: () => state, silence: () => {}, onEnd });
        const score = codaSong(2);
        host.setScore(score);
        const segments = watchSegments(host);
        const barTicks = compileTimeline(score).bars[0].meter.barTicks;
        host.start(drumsOnly, BPM, 0, { from: 0, to: barTicks });
        run(host, audio, 10.1, 10.1 + 2.5 * BAR_S);
        host.setLoop(null);
        // The lap under way (the third) ends 3 bars in; then the rest of chorus 1 (a2), then
        // chorus 2 (a1 a2 c1): 7 bars in all. (The fourth lap, queued two seconds ahead, was
        // dropped when the loop was released.)
        const end = 10.1 + 7 * BAR_S;
        run(host, audio, 10.1 + 2.5 * BAR_S, end);
        expect(onEnd).not.toHaveBeenCalled();
        expect(
            segments()
                .slice(-2)
                .map((s) => s.window.from),
        ).toEqual([1, 2]);
        audio.currentTime = end;
        pump(host);
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('released in the last bar of the last section, it plays once more with the ending, then stops', () => {
        // No barline is left in the lap to change at: the section plays once more as written,
        // ending, rather than stopping dead on a fill back to its top.
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const onEnd = vi.fn();
        const host = new BandHost({ state: () => state, silence: () => {}, onEnd });
        const score = { ...song([{ ...twoBars.sections[0] }]), choruses: 1 };
        host.setScore(score);
        const timeline = compileTimeline(score);
        const segments = watchSegments(host);
        host.start(drumsOnly, BPM, 0, { from: 0, to: timeline.ticks });
        // Into the second lap's last bar (laps are two bars, from 10.1 s), then release.
        run(host, audio, 10.1, 10.1 + 3.25 * BAR_S);
        host.setLoop(null);
        const end = 10.1 + 6 * BAR_S;
        run(host, audio, 10.1 + 3.25 * BAR_S, end);
        expect(onEnd).not.toHaveBeenCalled();
        const last = segments().at(-1) as unknown as { looping: boolean; ends: boolean };
        expect(last.looping).toBe(false);
        expect(last.ends).toBe(true);
        audio.currentTime = end;
        pump(host);
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('released on the last section, the lap under way plays the ending, then stops', () => {
        // One chorus of a1 a2: a loop on A is a loop on the chart's last section.
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const onEnd = vi.fn();
        const host = new BandHost({ state: () => state, silence: () => {}, onEnd });
        const score = { ...song([{ ...twoBars.sections[0] }]), choruses: 1 };
        host.setScore(score);
        const timeline = compileTimeline(score);
        const loop = { from: 0, to: timeline.ticks };
        host.start(drumsOnly, BPM, 0, loop);
        // Into the second lap's first bar, then release: its second bar can still change.
        run(host, audio, 10.1, 10.1 + 2.25 * BAR_S);
        const internals = host as unknown as {
            segments: {
                pass: number;
                looping: boolean;
                ends: boolean;
                events: BandEvent[];
                snapshots: PassMemory[];
            }[];
        };
        const lap = internals.segments.find((s) => s.pass === 1)!;
        host.setLoop(null);
        expect(lap.looping).toBe(false);
        expect(lap.ends).toBe(true);
        // Its last bar is now what a performance's last bar plays: the ending, not the fill
        // back to the top that a lap plays.
        const ending = performPass(timeline, drumsOnly, {
            pass: 1,
            looping: false,
            memory: lap.snapshots[1],
            window: { from: 1, to: 2, wrapTo: 0, origin: 0 },
        });
        const looped = performPass(timeline, drumsOnly, {
            pass: 1,
            looping: true,
            memory: lap.snapshots[1],
            window: { from: 1, to: 2, wrapTo: 0, origin: 0 },
        });
        const lastBar = JSON.stringify(lap.events.filter((e) => e.bar === 1));
        expect(lastBar).toBe(JSON.stringify(ending.events));
        expect(lastBar).not.toBe(JSON.stringify(looped.events));
        run(host, audio, 10.1 + 2.25 * BAR_S, 10.1 + 4 * BAR_S);
        expect(onEnd).not.toHaveBeenCalled();
        audio.currentTime = 10.1 + 4 * BAR_S;
        pump(host);
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('exports exactly the performance it plays: three choruses and the coda', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const host = new BandHost({ state: () => state, silence: () => {} });
        const score = codaSong(3);
        host.setScore(score);
        const segments = watchSegments(host);
        // The whole band, on the organ: a held chord is what a chorus seam could cut short.
        const band = {
            ...DEFAULT_SETTINGS,
            comp: 'organ' as const,
            lanes: { drums: true, bass: true, comp: true, lead: true },
        };
        host.start(band, BPM, 0, null);
        run(host, audio, 10.1, 10.1 + 7 * BAR_S + 0.1);
        expect(host.playing).toBe(false);

        const { events, timeline } = host.render(band);
        expect(timeline.bars).toHaveLength(7); // a1 a2 three times, then c1
        // The export is the performance as one whole pass — the band's own one-shot, made
        // independently of the host's chorus-at-a-time generation — and it is what played.
        const whole = performPass(compileTimeline(score), band, { pass: 0, looping: false });
        expect(JSON.stringify(events)).toBe(JSON.stringify(whole.events));
        expect(new Set(events.map((e) => e.lane))).toEqual(
            new Set(['drums', 'bass', 'comp', 'lead']),
        );
        expect(JSON.stringify(events)).toBe(
            JSON.stringify(segments().flatMap((segment) => segment.events)),
        );
        const onsets = noteOnTicks(toMidi(events, timeline, { bpm: BPM }));
        const coda = timeline.bars[6];
        // The file runs three choruses and the coda: notes in the coda's bar, none past it.
        expect(onsets.some((tick) => tick >= coda.start)).toBe(true);
        expect(Math.max(...onsets)).toBeLessThan(timeline.ticks);
        expect(timeline.ticks).toBe(7 * coda.meter.barTicks);
    });
});

/**
 * Releasing a practice loop: the lap under way finishes, then the song carries on from the bar
 * after the loop. A settings change after the release regenerates what is still to come, and
 * must regenerate it from the same place (#1484). The lap under way is the one at the
 * scheduler's horizon, so a release inside the lookahead never sounds a downbeat twice (#1489).
 */
describe('BandHost releasing a practice loop', () => {
    const BPM = 120;
    /** 4/4 at 120: two seconds a bar. */
    const BAR_S = 2;
    /** A (two bars) then B (two bars): a loop on A has a song to carry on into. */
    const aThenB = song([
        {
            id: 'a',
            label: 'A',
            repeat: 1,
            measures: [bar('a1', [chord('C', 4)]), bar('a2', [chord('F', 4)])],
        },
        {
            id: 'b',
            label: 'B',
            repeat: 1,
            measures: [bar('b1', [chord('G7', 4)]), bar('b2', [chord('C', 4)])],
        },
    ]);

    it('a settings change in the last two seconds of the lap still carries on after the loop', () => {
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const host = new BandHost({ state: () => state, silence: () => {} });
        host.setScore(aThenB);
        const timeline = compileTimeline(aThenB);
        const loopA = { from: 0, to: timeline.bars[2].start };
        host.start(drumsOnly, BPM, 0, loopA);
        // Laps of A are two bars (four seconds) from 10.1 s: release a second into the second.
        const lapEnd = 10.1 + 4 * BAR_S;
        run(host, audio, 10.1, lapEnd - 3);
        host.setLoop(null);
        // The bar after the loop is queued two seconds ahead of the lap's end; then the band
        // changes, inside that window.
        run(host, audio, lapEnd - 3, lapEnd - 1);
        host.update({ ...drumsOnly, intensity: 0.9 });
        run(host, audio, lapEnd - 1, lapEnd + BAR_S / 2);
        // Half a bar after the lap, the band is in B's first bar, not back at the top.
        const tick = host.songTick();
        expect(tick).not.toBeNull();
        expect(tick!).toBeGreaterThanOrEqual(timeline.bars[2].start);
        expect(tick!).toBeLessThan(timeline.bars[3].start);
        host.stop();
    });

    it('on a counted chart, a settings change after a last-bar release still plays the section once more', () => {
        // The counted twin: released in the last bar of the last section, the section plays
        // once more and ends. A settings change after that must not cut the extra time short.
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const onEnd = vi.fn();
        const host = new BandHost({ state: () => state, silence: () => {}, onEnd });
        const score = { ...song([{ ...twoBars.sections[0] }]), choruses: 1 };
        host.setScore(score);
        const timeline = compileTimeline(score);
        host.start(drumsOnly, BPM, 0, { from: 0, to: timeline.ticks });
        // Into the second lap's last bar (laps are two bars, from 10.1 s), then release.
        run(host, audio, 10.1, 10.1 + 3.25 * BAR_S);
        host.setLoop(null);
        run(host, audio, 10.1 + 3.25 * BAR_S, 10.1 + 3.5 * BAR_S);
        host.update({ ...drumsOnly, intensity: 0.9 });
        const end = 10.1 + 6 * BAR_S;
        run(host, audio, 10.1 + 3.5 * BAR_S, end);
        expect(onEnd).not.toHaveBeenCalled();
        audio.currentTime = end;
        pump(host);
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    /** Every note handed to the (mocked) voices: its lane and pitch (or drum), and its time. */
    function voiceCalls(): { note: string; time: number }[] {
        const calls = [
            ...vi
                .mocked(playDrumSound)
                .mock.calls.map(([, piece, time]) => ({ note: `drums ${piece}`, time })),
            ...vi
                .mocked(playBassNote)
                .mock.calls.map(([, freq, time]) => ({ note: `bass ${freq}`, time })),
            ...vi
                .mocked(playNote)
                .mock.calls.map(([, freq, time]) => ({ note: `comp ${freq}`, time })),
            ...vi
                .mocked(playSoloNote)
                .mock.calls.map(([, freq, time]) => ({ note: `lead ${freq}`, time })),
        ];
        return calls.sort((x, y) => x.time - y.time);
    }

    /**
     * The same drum or pitch struck twice within 20 ms: one note handed to the voices twice.
     * The band humanises each bar's timing on its own, so a doubled downbeat is not two calls
     * at exactly the same time but a few milliseconds apart.
     */
    function doubled(calls: { note: string; time: number }[]): string[] {
        return calls.flatMap((call, i) =>
            calls
                .slice(i + 1)
                .filter((later) => later.note === call.note && later.time - call.time < 0.02)
                .map((later) => `${call.note} at ${call.time} and ${later.time}`),
        );
    }

    /**
     * Loop A with the whole band, pumping every 25 ms as the host's own timer does; release the
     * loop `early` seconds before the second lap ends, then play on `after` seconds past it.
     */
    function releaseBefore(early: number, after: number) {
        const band = {
            ...DEFAULT_SETTINGS,
            lanes: { drums: true, bass: true, comp: true, lead: true },
        };
        for (const voice of [playDrumSound, playBassNote, playNote, playSoloNote]) {
            vi.mocked(voice).mockClear();
        }
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const host = new BandHost({ state: () => state, silence: () => {} });
        host.setScore(aThenB);
        const timeline = compileTimeline(aThenB);
        host.start(band, BPM, 0, { from: 0, to: timeline.bars[2].start });
        const lapEnd = 10.1 + 4 * BAR_S;
        const pumpTo = (from: number, to: number) => {
            for (let i = 0; from + i * 0.025 < to - 1e-9; i++) {
                audio.currentTime = from + i * 0.025;
                pump(host);
            }
        };
        pumpTo(10.1, lapEnd - early);
        const before = voiceCalls();
        audio.currentTime = lapEnd - early;
        host.setLoop(null);
        pumpTo(lapEnd - early, lapEnd + after);
        return { host, timeline, lapEnd, before, calls: voiceCalls() };
    }

    it('released just inside the lookahead, no note is handed to the voices twice (#1489)', () => {
        // The scheduler hands the voices everything that starts within the next 150 ms, so
        // 100 ms before the lap's end the next lap's downbeat has already gone to them.
        const { host, timeline, lapEnd, before, calls } = releaseBefore(0.1, 2 * BAR_S + BAR_S / 2);
        const onBarline = (call: { time: number }) => Math.abs(call.time - lapEnd) < 0.03;
        expect(before.some(onBarline)).toBe(true);
        expect(doubled(calls)).toEqual([]);
        // The bass plays one note at a time: one note on the lap's barline, not two.
        expect(
            calls.filter((call) => call.note.startsWith('bass') && onBarline(call)),
        ).toHaveLength(1);
        // The lap whose downbeat was sounding plays out, and then the song carries on past
        // the loop: B's first bar, half a bar after that lap.
        const tick = host.songTick();
        expect(tick).not.toBeNull();
        expect(tick!).toBeGreaterThanOrEqual(timeline.bars[2].start);
        expect(tick!).toBeLessThan(timeline.bars[3].start);
        host.stop();
    });

    it('released a second before the lap ends, the bar after the loop takes the barline', () => {
        // Outside the lookahead nothing of the next lap has been scheduled, so the lap under
        // way is the last and the song's next bar takes the barline. Nothing is doubled here
        // either: the band itself never strikes one note twice within 20 ms.
        const { host, timeline, lapEnd, before, calls } = releaseBefore(1, BAR_S / 2);
        expect(before.some((call) => call.time > lapEnd - 0.05)).toBe(false);
        expect(doubled(calls)).toEqual([]);
        const tick = host.songTick();
        expect(tick).not.toBeNull();
        expect(tick!).toBeGreaterThanOrEqual(timeline.bars[2].start);
        expect(tick!).toBeLessThan(timeline.bars[3].start);
        host.stop();
    });

    it("on a counted chart's last section, released just inside the lookahead, the lap under way ends it", () => {
        // The next lap's downbeat is already with the voices: that lap is the one under way,
        // so it plays the ending and the performance stops after it, nothing struck twice.
        for (const voice of [playDrumSound, playBassNote, playNote, playSoloNote]) {
            vi.mocked(voice).mockClear();
        }
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const onEnd = vi.fn();
        const host = new BandHost({ state: () => state, silence: () => {}, onEnd });
        const score = { ...song([{ ...twoBars.sections[0] }]), choruses: 1 };
        host.setScore(score);
        const timeline = compileTimeline(score);
        host.start(
            { ...DEFAULT_SETTINGS, lanes: { drums: true, bass: true, comp: true, lead: true } },
            BPM,
            0,
            { from: 0, to: timeline.ticks },
        );
        const lapEnd = 10.1 + 4 * BAR_S;
        const pumpTo = (from: number, to: number) => {
            for (let i = 0; from + i * 0.025 < to - 1e-9; i++) {
                audio.currentTime = from + i * 0.025;
                pump(host);
            }
        };
        pumpTo(10.1, lapEnd - 0.1);
        audio.currentTime = lapEnd - 0.1;
        host.setLoop(null);
        pumpTo(lapEnd - 0.1, lapEnd + 2 * BAR_S);
        expect(doubled(voiceCalls())).toEqual([]);
        expect(onEnd).not.toHaveBeenCalled();
        audio.currentTime = lapEnd + 2 * BAR_S;
        pump(host);
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    /**
     * A loop from the top of `score` to `loopTo`, the whole band, the timer firing every 25 ms
     * from 10.1 s. `tick(t)` pumps at audio time `t`.
     */
    function rig(score: SemanticScore, loopTo: number, onEnd?: () => void) {
        for (const voice of [playDrumSound, playBassNote, playNote, playSoloNote]) {
            vi.mocked(voice).mockClear();
        }
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const host = new BandHost({ state: () => state, silence: () => {}, onEnd });
        host.setScore(score);
        host.start(
            { ...DEFAULT_SETTINGS, lanes: { drums: true, bass: true, comp: true, lead: true } },
            BPM,
            0,
            { from: 0, to: loopTo },
        );
        const tick = (t: number) => {
            audio.currentTime = t;
            pump(host);
        };
        const pumpTo = (from: number, to: number) => {
            for (let i = 0; from + i * 0.025 < to - 1e-9; i++) {
                tick(from + i * 0.025);
            }
        };
        const release = (t: number) => {
            audio.currentTime = t;
            host.setLoop(null);
        };
        return { audio, host, tick, pumpTo, release };
    }

    it('after a stalled timer, a release near the end of the queue still carries on after the loop', () => {
        // The timer stalled (a busy main thread, a background tab) two seconds before the
        // release, so nothing past the lap under way was queued: the queue ends 120 ms after
        // the release, inside the lookahead.
        const timeline = compileTimeline(aThenB);
        const { host, pumpTo, release } = rig(aThenB, timeline.bars[2].start);
        const lapEnd = 10.1 + 4 * BAR_S;
        const at = lapEnd - 0.12;
        pumpTo(10.1, at - 2);
        release(at);
        pumpTo(at, lapEnd + BAR_S / 2);
        const tick = host.songTick();
        expect(tick).not.toBeNull();
        expect(tick!).toBeGreaterThanOrEqual(timeline.bars[2].start);
        expect(tick!).toBeLessThan(timeline.bars[3].start);
        expect(doubled(voiceCalls())).toEqual([]);
        host.stop();
    });

    it('after a stalled timer, a counted last section released in its last bar plays once more, then ends', () => {
        const score = { ...song([{ ...twoBars.sections[0] }]), choruses: 1 };
        const onEnd = vi.fn();
        const { audio, pumpTo, release, tick } = rig(score, compileTimeline(score).ticks, () =>
            onEnd(audio.currentTime),
        );
        const lapEnd = 10.1 + 4 * BAR_S;
        const at = lapEnd - 0.12;
        pumpTo(10.1, at - 2);
        release(at);
        // The section once more, as written: two bars after the lap under way, and no sooner.
        pumpTo(at, lapEnd + 2 * BAR_S);
        expect(onEnd).not.toHaveBeenCalled();
        tick(lapEnd + 2 * BAR_S);
        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(onEnd).toHaveBeenCalledWith(lapEnd + 2 * BAR_S);
        expect(doubled(voiceCalls())).toEqual([]);
    });

    it('after a stalled timer, a lap that has started is under way though nothing of it was sent', () => {
        // The next lap was queued two seconds ahead, then the timer stalled past its barline:
        // the playhead is in that lap, so the release finishes it, as for any lap playing.
        const timeline = compileTimeline(aThenB);
        const { host, tick, pumpTo, release } = rig(aThenB, timeline.bars[2].start);
        const lapEnd = 10.1 + 4 * BAR_S;
        pumpTo(10.1, lapEnd - 1.9);
        release(lapEnd + 0.4);
        tick(lapEnd + 0.4);
        // Still the lap (A's first bar), then B once it ends.
        expect(host.songTick()!).toBeLessThan(timeline.bars[1].start);
        pumpTo(lapEnd + 0.425, lapEnd + 2 * BAR_S + BAR_S / 2);
        const at = host.songTick();
        expect(at).not.toBeNull();
        expect(at!).toBeGreaterThanOrEqual(timeline.bars[2].start);
        expect(at!).toBeLessThan(timeline.bars[3].start);
        host.stop();
    });

    it('after the timer stalled past the end of the queue, a release still carries on after the loop', () => {
        // Stalled before the next lap was queued, and released after the queued lap's end:
        // nothing is playing at the release, and the lap that was is the one it leads on from.
        const timeline = compileTimeline(aThenB);
        const { host, pumpTo, release } = rig(aThenB, timeline.bars[2].start);
        const lapEnd = 10.1 + 4 * BAR_S;
        pumpTo(10.1, lapEnd - 2.2);
        release(lapEnd + 0.2);
        pumpTo(lapEnd + 0.2, lapEnd + BAR_S / 2);
        const at = host.songTick();
        expect(at).not.toBeNull();
        expect(at!).toBeGreaterThanOrEqual(timeline.bars[2].start);
        expect(at!).toBeLessThan(timeline.bars[3].start);
        host.stop();
    });

    it('a note pushed ahead of the next lap, already sent, makes that lap the one under way', () => {
        // The band pushes the next lap's kick a few ms ahead of the barline. A pump 152 ms
        // before the lap ends has sent it; a release a millisecond later still sees the lap's
        // end beyond its own lookahead, but that kick is already with the voices.
        const timeline = compileTimeline(aThenB);
        const { host, tick, pumpTo, release } = rig(aThenB, timeline.bars[2].start);
        const lapEnd = 10.1 + 4 * BAR_S;
        pumpTo(10.1, 17.9);
        tick(lapEnd - 0.152);
        expect(voiceCalls().some((call) => call.time > lapEnd - 0.01 && call.time < lapEnd)).toBe(
            true,
        );
        release(lapEnd - 0.151);
        pumpTo(lapEnd - 0.13, lapEnd + 2 * BAR_S + BAR_S / 2);
        expect(doubled(voiceCalls())).toEqual([]);
        // That lap plays out, then the song carries on into B.
        const at = host.songTick();
        expect(at).not.toBeNull();
        expect(at!).toBeGreaterThanOrEqual(timeline.bars[2].start);
        expect(at!).toBeLessThan(timeline.bars[3].start);
        host.stop();
    });
});

/** Every note-on's absolute tick in a type-1 file (the band's writer: no running status). */
function noteOnTicks(bytes: Uint8Array): number[] {
    const out: number[] = [];
    let at = 14;
    while (at < bytes.length) {
        const length =
            (bytes[at + 4] << 24) | (bytes[at + 5] << 16) | (bytes[at + 6] << 8) | bytes[at + 7];
        const end = at + 8 + length;
        let i = at + 8;
        let tick = 0;
        const readLength = () => {
            let value = 0;
            let b: number;
            do {
                b = bytes[i++];
                value = (value << 7) | (b & 0x7f);
            } while (b & 0x80);
            return value;
        };
        while (i < end) {
            tick += readLength();
            const status = bytes[i++];
            if (status === 0xff) {
                i++;
                const skip = readLength();
                i += skip;
            } else if ((status & 0xf0) === 0xc0) {
                i++;
            } else {
                if ((status & 0xf0) === 0x90 && bytes[i + 1] > 0) {
                    out.push(tick);
                }
                i += 2;
            }
        }
        at = end;
    }
    return out;
}
