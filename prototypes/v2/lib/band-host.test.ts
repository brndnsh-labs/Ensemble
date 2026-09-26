/**
 * The count-in (#1417): one bar of clicks before a fresh Play, at the chart's own tempo and
 * meter, that shifts the band's own downbeat back by exactly that bar rather than overlapping
 * it. Pinned here: `countInPlan`'s pure math, and `BandHost.start()`'s use of it — scheduled
 * only when asked, never re-triggered by a loop wrap, and absent entirely when off.
 *
 * The synth voices are mocked out: this suite is about scheduling and timing, not sound, and a
 * fake `AudioContext` has none of the nodes the real voices need.
 */
import { compileTimeline, DEFAULT_SETTINGS, secondsAt, type Timeline } from '@band/index';
import type { ScoreEvent, ScoreMeasure, SemanticScore } from '@engine/songbook/score-types';
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
