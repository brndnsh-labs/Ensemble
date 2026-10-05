/**
 * The count-in (#1422): one bar of clicks before a fresh Play, at the chart's own tempo and
 * meter, that shifts the band's own downbeat back by exactly that bar rather than overlapping
 * it. Pinned here: `countInPlan`'s pure math, and `BandHost.start()`'s use of it — scheduled
 * only when asked, never re-triggered by a loop wrap, and absent entirely when off.
 *
 * The synth voices are mocked out: this suite is about scheduling and timing, not sound, and a
 * fake `AudioContext` has none of the nodes the real voices need.
 *
 * Also the counted chart (#1475): N choruses played once, then the host stops by itself;
 * releasing a practice loop (#1484, #1489); and a settings change near a barline (#1499).
 */
import {
    type BandEvent,
    compileTimeline,
    DEFAULT_SETTINGS,
    type PassMemory,
    type PassWindow,
    performPass,
    STYLE_IDS,
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

    it('a loop released on the last section ends with the lead on the resolved tonic too (#1482)', () => {
        // The lap's phrase was planned as a loop, against the written ii–V; released, the lap
        // ends from its next barline, and the lead must hear the tonic the band resolves to.
        const audio = fakeAudioContext(10);
        const state = fakeState(audio);
        const host = new BandHost({ state: () => state, silence: () => {} });
        const score = {
            ...song([
                {
                    id: 'a',
                    label: 'A',
                    repeat: 1,
                    measures: [
                        bar('a1', [chord('C', 4)]),
                        bar('a2', [chord('Am7', 4)]),
                        bar('a3', [chord('Fmaj7', 4)]),
                        bar('a4', [chord('Dm7', 2), chord('G7', 2)]),
                    ],
                },
            ]),
            choruses: 1,
        };
        host.setScore(score);
        const timeline = compileTimeline(score);
        const band = {
            ...DEFAULT_SETTINGS,
            seed: 'ensemble',
            lanes: { drums: true, bass: true, comp: true, lead: true },
        };
        host.start(band, BPM, 0, { from: 0, to: timeline.ticks });
        // Into the second lap's first bar, then release.
        run(host, audio, 10.1, 10.1 + 4.25 * BAR_S);
        host.setLoop(null);
        const internals = host as unknown as {
            segments: { pass: number; ends: boolean; events: BandEvent[] }[];
        };
        const lap = internals.segments.find((s) => s.pass === 1)!;
        expect(lap.ends).toBe(true);
        const inLast = (lane: string) =>
            lap.events.flatMap((e) =>
                e.lane === lane && e.bar === 3 && !(e.lane !== 'drums' && e.muted)
                    ? [e.lane === 'drums' ? -1 : e.midi % 12]
                    : [],
            );
        const tonic = [0, 4, 7]; // rock ends on the triad
        expect(inLast('bass')).toEqual([0]);
        expect(inLast('comp').every((pc) => tonic.includes(pc))).toBe(true);
        // Planned as a loop, the lead sang A and F over this bar against the written Dm7 G7;
        // replanned for the ending, whatever it plays there is a tone of the tonic.
        expect(inLast('lead').every((pc) => tonic.includes(pc))).toBe(true);
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
 * A looping song's laps (#1492): the host carries each lap's memory into the next across the
 * wrap. The comp remembers where the lead's last note ends as a song tick, which the wrap
 * moves into the new lap's ticks, so trading with the soloist, lap k of the loop comps as
 * chorus k of the same chart counted does — the top of the lap included.
 */
describe('BandHost looping laps', () => {
    const BPM = 120;
    /** 4/4 at 120: two seconds a bar. */
    const BAR_S = 2;
    const blues = song([
        {
            id: 'a',
            label: 'A',
            repeat: 1,
            measures: [
                'C7',
                'F7',
                'C7',
                'C7',
                'F7',
                'F7',
                'C7',
                'A7',
                'Dm7',
                'G7',
                ['C7', 'A7'],
                ['Dm7', 'G7'],
            ].map((symbols, i) =>
                bar(
                    `b${i}`,
                    typeof symbols === 'string'
                        ? [chord(symbols, 4)]
                        : symbols.map((s) => chord(s, 2)),
                ),
            ),
        },
    ]);

    it('comps lap k of a traded loop as chorus k of the chart counted, from the top of the lap', () => {
        const length = 12;
        const counted = compileTimeline({ ...blues, choruses: 5 });
        /** Ticks to a millionth: swing's arithmetic far into a long timeline rounds differently. */
        const fine = (n: number) => Math.round(n * 1e6) / 1e6;
        /**
         * The comp's notes in the chorus or lap from bar `from`, moved to start at tick 0 — all
         * but a chord ringing past its end, which only the counted pass voices under the next
         * chorus's lead.
         */
        const comp = (events: BandEvent[], timeline: Timeline, from: number) => {
            const start = timeline.bars[from].start;
            const last = timeline.bars[from + length - 1];
            const end = last.start + last.meter.barTicks;
            return events
                .filter(
                    (e) =>
                        e.lane === 'comp' &&
                        e.bar >= from &&
                        e.bar < from + length &&
                        e.tick + e.dur <= end + 1e-6,
                )
                .map((e) =>
                    e.lane === 'comp'
                        ? [e.bar - from, fine(e.tick - start), fine(e.dur), e.midi, e.velocity]
                        : [],
                );
        };
        const failures: string[] = [];
        for (const style of ['jazz', 'blues', 'neosoul'] as const) {
            for (const seed of ['a', 'b']) {
                const settings = {
                    ...DEFAULT_SETTINGS,
                    style,
                    seed,
                    lanes: { drums: true, bass: true, comp: true, lead: true },
                    trade: { with: 'lead', bars: 4, choruses: null } as const,
                };
                const audio = fakeAudioContext(10);
                const state = fakeState(audio);
                const host = new BandHost({ state: () => state, silence: () => {} });
                host.setScore(blues);
                const segments = watchSegments(host) as () => (Queued & { pass: number })[];
                host.start(settings, BPM, 0, null);
                run(host, audio, 10.1, 10.1 + 2.5 * length * BAR_S);
                host.stop();
                const once = performPass(counted, settings, { pass: 0, looping: false });
                const laps = segments();
                expect(laps.map((s) => s.pass).slice(0, 3)).toEqual([0, 1, 2]);
                const looped = compileTimeline(blues);
                for (const lap of laps.slice(0, 3)) {
                    const heard = comp(lap.events, looped, 0);
                    // The lap was performed, its last bar too.
                    expect(heard.some((note) => note[0] === length - 1)).toBe(true);
                    if (
                        JSON.stringify(heard) !==
                        JSON.stringify(comp(once.events, counted, lap.pass * length))
                    ) {
                        failures.push(`${style}/${seed} lap ${lap.pass}`);
                    }
                }
            }
        }
        expect(failures).toEqual([]);
    });
});

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

/** Every note handed to the (mocked) voices: its lane and pitch (or drum), and its time. */
function voiceCalls(): { note: string; time: number }[] {
    const calls = [
        ...vi
            .mocked(playDrumSound)
            .mock.calls.map(([, piece, time]) => ({ note: `drums ${piece}`, time })),
        ...vi
            .mocked(playBassNote)
            .mock.calls.map(([, freq, time]) => ({ note: `bass ${freq}`, time })),
        ...vi.mocked(playNote).mock.calls.map(([, freq, time]) => ({ note: `comp ${freq}`, time })),
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

/** The whole band, every lane playing. */
const wholeBand = {
    ...DEFAULT_SETTINGS,
    lanes: { drums: true, bass: true, comp: true, lead: true },
};

/**
 * `score` at 120 bpm (two seconds a bar), looped from the top to `loopTo` (or the song, with
 * null), the whole band, the timer firing every 25 ms from 10.1 s. `tick(t)` pumps at audio
 * time `t`.
 */
function rig(score: SemanticScore, loopTo: number | null, onEnd?: () => void) {
    for (const voice of [playDrumSound, playBassNote, playNote, playSoloNote]) {
        vi.mocked(voice).mockClear();
    }
    const audio = fakeAudioContext(10);
    const state = fakeState(audio);
    const host = new BandHost({ state: () => state, silence: () => {}, onEnd });
    host.setScore(score);
    host.start(wholeBand, 120, 0, loopTo === null ? null : { from: 0, to: loopTo });
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

/**
 * A settings change takes the new music from a barline, and leaves what comes before it alone:
 * every note before that barline sounds once, as it would have without the change, however the
 * change falls against the timer and the segments' barlines (#1499). A pass or lap queued
 * ahead and rebuilt for the change is still the one that would have followed (#1500).
 */
describe('BandHost a settings change near a barline', () => {
    /** 4/4 at 120: two seconds a bar. */
    const BAR_S = 2;
    const changed = { ...wholeBand, intensity: 0.9 };

    it('a change a timer tick after a pump still sends every note before its barline', () => {
        // The timer last fired 24 ms before the change, so it sent the notes up to 126 ms
        // ahead; the change looks 150 ms ahead. The notes in between have not gone to the
        // voices yet, and must still go: a change in each timer tick of the song's first two
        // bars.
        const { pumpTo } = rig(aThenB, null);
        pumpTo(10.1, 10.1 + 3 * BAR_S);
        const unchanged = voiceCalls();
        const missing: string[] = [];
        let inBetween = 0;
        for (let i = 0; i < (2 * BAR_S) / 0.025; i++) {
            const at = 10.1 + i * 0.025 + 0.024;
            const { audio, host, pumpTo } = rig(aThenB, null);
            pumpTo(10.1, at);
            audio.currentTime = at;
            host.update(changed);
            const barline = 10.1 + Math.ceil((at + 0.15 - 10.1) / BAR_S) * BAR_S;
            pumpTo(at + 0.001, barline);
            // The band pushes a downbeat a few ms ahead of its barline: leave those out.
            const before = (call: { time: number }) => call.time < barline - 0.05;
            const heard = new Set(
                voiceCalls()
                    .filter(before)
                    .map((call) => JSON.stringify(call)),
            );
            for (const call of unchanged.filter(before)) {
                if (!heard.has(JSON.stringify(call))) {
                    missing.push(`${call.note} at ${call.time} (change at ${at})`);
                }
            }
            inBetween += unchanged.filter(
                (call) => call.time > at - 0.024 + 0.15 && call.time <= at + 0.15,
            ).length;
            host.stop();
        }
        // The window the last pump had not reached held notes, and none of them was lost.
        expect(inBetween).toBeGreaterThan(0);
        expect(missing).toEqual([]);
    });

    it('a bar whose pushed downbeat is already sent plays on as it was; the change follows it', () => {
        // The band pushes a downbeat a few ms ahead of its barline, so a pump 150 ms before the
        // barline (or 152 ms, a millisecond before the change) has sent it, while the change
        // still sees the barline beyond its own lookahead. On the next lap's barline, too: that
        // lap is under way, and is not dropped and rebuilt under its own downbeat.
        const timeline = compileTimeline(aThenB);
        const loopTo = timeline.bars[2].start;
        const lapEnd = 10.1 + 4 * BAR_S;
        const { pumpTo } = rig(aThenB, loopTo);
        pumpTo(10.1, lapEnd + 2 * BAR_S);
        const unchanged = voiceCalls();
        const inBar = (calls: { note: string; time: number }[], from: number) =>
            calls.filter((call) => call.time >= from - 0.05 && call.time < from + BAR_S - 0.05);
        for (const barline of [10.1 + BAR_S, lapEnd]) {
            for (const [pumpAt, changeAt] of [
                [barline - 0.15, barline - 0.15],
                [barline - 0.152, barline - 0.151],
            ]) {
                const { audio, host, tick, pumpTo } = rig(aThenB, loopTo);
                pumpTo(10.1, pumpAt);
                tick(pumpAt);
                const onBarline = (call: { time: number }) => Math.abs(call.time - barline) < 0.03;
                expect(voiceCalls().some(onBarline)).toBe(true);
                audio.currentTime = changeAt;
                host.update(changed);
                pumpTo(pumpAt + 0.025, barline + 2 * BAR_S);
                const calls = voiceCalls();
                expect(doubled(calls)).toEqual([]);
                // The bass plays one note at a time: one note on the barline, not two.
                expect(
                    calls.filter((call) => call.note.startsWith('bass') && onBarline(call)),
                ).toHaveLength(1);
                expect(inBar(calls, barline)).toEqual(inBar(unchanged, barline));
                expect(inBar(calls, barline + BAR_S)).not.toEqual(
                    inBar(unchanged, barline + BAR_S),
                );
                host.stop();
            }
        }
    });

    it('a pass queued ahead and rebuilt keeps its number', () => {
        // The next lap or pass is queued two seconds before the one playing ends; a change or a
        // loop release a second before the end drops it and builds it again. Its pass number
        // is its time through, which picks its variation: the passes heard still count 0, 1,
        // 2, 3.
        const loopA = compileTimeline(aThenB).bars[2].start;
        const counted = { ...song([{ ...twoBars.sections[0] }]), choruses: 1 };
        const cases: {
            score: SemanticScore;
            loopTo: number | null;
            segmentS: number;
            release: boolean;
            change: boolean;
            ends: boolean;
        }[] = [
            {
                score: aThenB,
                loopTo: loopA,
                segmentS: 2 * BAR_S,
                release: false,
                change: true,
                ends: false,
            },
            {
                score: aThenB,
                loopTo: null,
                segmentS: 4 * BAR_S,
                release: false,
                change: true,
                ends: false,
            },
            // Released in its second lap, the loop carries on into B's two bars, then the song:
            // with a change, and without one.
            {
                score: aThenB,
                loopTo: loopA,
                segmentS: 2 * BAR_S,
                release: true,
                change: true,
                ends: false,
            },
            {
                score: aThenB,
                loopTo: loopA,
                segmentS: 2 * BAR_S,
                release: true,
                change: false,
                ends: false,
            },
            // A loop on a counted chart's last section, released in its last bar: the section
            // plays once more in place of the next lap, and ends.
            {
                score: counted,
                loopTo: compileTimeline(counted).ticks,
                segmentS: 2 * BAR_S,
                release: true,
                change: false,
                ends: true,
            },
        ];
        for (const { score, loopTo, segmentS, release, change, ends } of cases) {
            const { audio, host, pumpTo, release: releaseAt } = rig(score, loopTo);
            const segments = watchSegments(host) as () => (Queued & {
                pass: number;
                cursor: number;
            })[];
            const end = 10.1 + 2 * segmentS;
            pumpTo(10.1, end - 1);
            if (release) {
                releaseAt(end - 1);
            }
            if (change) {
                audio.currentTime = end - 1;
                host.update(changed);
            }
            pumpTo(end - 1, end + 4 * BAR_S + 0.5);
            const heard = segments().filter((segment) => segment.cursor > 0);
            expect(heard.map((segment) => segment.pass)).toEqual(heard.map((_, i) => i));
            if (ends) {
                expect(host.playing).toBe(false);
                expect(heard).toHaveLength(3);
            } else {
                expect(heard.length).toBeGreaterThanOrEqual(4);
            }
            host.stop();
        }
    });
});

/**
 * A practice loop released into a bar with another chord (#1507). The lap's last bar may push
 * the loop's top chord across the wrap, tied into the next lap's first eighth; released, the
 * song carries on under a different chord, and that bar's downbeat must be struck, not treated
 * as tied in to a chord it does not play.
 */
describe('BandHost releasing a loop into another chord', () => {
    const BPM = 120;
    /** 4/4 at 120: two seconds a bar. */
    const BAR_S = 2;
    /** A loop on A (`C | Am | Dm | G7`, its G7 pushing the C at its top), released into B's F. */
    const chart = song(
        [
            ['A', ['C', 'Am', 'Dm', 'G7']],
            ['B', ['F', 'F', 'G7', 'C']],
        ].map(([label, symbols]) => ({
            id: label as string,
            label: label as string,
            repeat: 1,
            measures: (symbols as string[]).map((s, i) => bar(`${label}${i}`, [chord(s, 4)])),
        })),
    );

    it('the comp strikes the downbeat of the bar after the loop, in every style whose lap pushed into the wrap', () => {
        const timeline = compileTimeline(chart);
        const after = timeline.bars[4];
        const problems: string[] = [];
        const pushedBy = new Set<string>();
        let struck = 0;
        for (const style of STYLE_IDS) {
            // The organ never pushes across a loop's wrap (#1488): a struck keyboard and a guitar.
            for (const comp of ['piano', 'guitar'] as const) {
                for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
                    const audio = fakeAudioContext(10);
                    const state = fakeState(audio);
                    const host = new BandHost({ state: () => state, silence: () => {} });
                    host.setScore(chart);
                    const segments = watchSegments(host);
                    host.start({ ...DEFAULT_SETTINGS, style, comp, seed }, BPM, 0, {
                        from: 0,
                        to: after.start,
                    });
                    // Laps are four bars (eight seconds) from 10.1 s: release in the second.
                    run(host, audio, 10.1, 10.1 + 6 * BAR_S);
                    host.setLoop(null);
                    run(host, audio, 10.1 + 6 * BAR_S, 10.1 + 10 * BAR_S);
                    host.stop();
                    const queued = segments();
                    const into = queued.findIndex((s) => s.window.from === after.index);
                    expect(into, `${style}/${comp}/${seed}: the song carries on`).toBeGreaterThan(
                        0,
                    );
                    // The lap's last bar rang a chord over the wrap: a push toward the loop's top.
                    const pushed = queued[into - 1].events.some(
                        (e) =>
                            e.lane === 'comp' &&
                            !e.muted &&
                            e.bar === after.index - 1 &&
                            e.tick + e.dur > after.start,
                    );
                    if (!pushed) {
                        continue;
                    }
                    pushedBy.add(style);
                    // What the bar plays arrived at with nothing tied into it: the same pass,
                    // from the same memory, less the push that was aimed at the loop's top.
                    const song = queued[into] as Queued & {
                        pass: number;
                        until: number;
                        looping: boolean;
                        window: PassWindow;
                        memoryBefore: PassMemory;
                    };
                    const memory = song.memoryBefore;
                    const unpushed = performPass(
                        timeline,
                        { ...DEFAULT_SETTINGS, style, comp, seed },
                        {
                            pass: song.pass,
                            looping: song.looping,
                            window: song.window,
                            until: song.until,
                            memory: {
                                ...memory,
                                comp: { ...(memory.comp as object), pushed: null },
                            },
                        },
                    );
                    const where = `${style}/${comp}/${seed}`;
                    const firstBar = (events: BandEvent[]) =>
                        JSON.stringify(
                            events.filter((e) => e.lane === 'comp' && e.bar === after.index),
                        );
                    if (firstBar(song.events) !== firstBar(unpushed.events)) {
                        problems.push(`${where}: the bar plays as if the C were tied into it`);
                    }
                    // So where the figure strikes the downbeat, F is struck there, with its A —
                    // the chord the bar plays, not the C the push was aimed at.
                    const downbeat = (events: BandEvent[]) =>
                        events.some(
                            (e) =>
                                e.lane === 'comp' &&
                                !e.muted &&
                                e.tick === after.start &&
                                e.midi % 12 === 9,
                        );
                    if (downbeat(unpushed.events)) {
                        struck++;
                        if (!downbeat(song.events)) {
                            problems.push(`${where}: no F on the downbeat`);
                        }
                    }
                }
            }
        }
        // Not vacuous: most of the styles push across the wrap in some take, and in plenty of
        // those the bar's own figure strikes its downbeat.
        expect(pushedBy.size).toBeGreaterThanOrEqual(5);
        expect(struck).toBeGreaterThanOrEqual(10);
        expect(problems).toEqual([]);
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
