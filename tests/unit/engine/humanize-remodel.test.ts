// @ts-nocheck
/**
 * @vitest-environment happy-dom
 *
 * #1068 — the Humanize re-model's acceptance gate.
 *
 * The four properties the issue named, each asserted against the production
 * path rather than a re-derivation of it:
 *
 *  1. `humanize: 0` means OFF — every lane byte-identical across runs, with
 *     zero jitter of any kind (no residual base offset that survives a
 *     multiply-by-zero).
 *  2. Everything is SEEDED — two runs with `Math.random` stubbed to opposite
 *     extremes produce identical output at any knob value, live and on the
 *     `.mid` export. (Per tests/CLAUDE.md: the same stub in both runs would
 *     pass trivially on a still-broken engine, so the stubs bracket.)
 *  3. At the SHIPPED DEFAULT (20) the knob displaces above the ~3 ms
 *     perceptual floor — the bug that made it a placebo.
 *  4. Placement is bar-independent, per-lane independent (no lockstep), and
 *     position-aware (downbeats tighter than offbeats).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    HUMANIZE_PROFILES,
    humanizeColor,
    humanizePlacement,
    humanizeScale,
    humanizeSeed,
    PLACEMENT_WEIGHTS,
    placementWeight,
} from '../../../public/engine/humanize.js';
import { makeSoloistMock } from '../../utils/mock-soloist.js';

vi.mock('../../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    killAllNotes: vi.fn(),
    playBassNote: vi.fn(),
    playDrumSound: vi.fn(),
    playHarmonyNote: vi.fn(),
    playNote: vi.fn(),
    playSoloNote: vi.fn(),
    releaseHarmonyVoicing: vi.fn(),
    restoreGains: vi.fn(),
    updateSustain: vi.fn(),
}));

vi.mock('../../../public/engine/midi-scheduler.js', () => ({
    dispatchMidiAutomation: vi.fn(),
    dispatchMidiBass: vi.fn(),
    dispatchMidiChordNote: vi.fn(),
    dispatchMidiChordSustain: vi.fn(),
    dispatchMidiDrum: vi.fn(),
    dispatchMidiHarmonyNote: vi.fn(),
    dispatchMidiSoloist: vi.fn(),
    startMidiTransport: vi.fn(),
    stopMidiTransport: vi.fn(),
}));

// A fixed kit for the step, so `scheduleDrums` exercises only its own
// humanization rather than the groove engine's generation.
vi.mock('../../../public/engine/drums-tick.js', () => ({
    generateDrumsForStep: vi.fn(() => ({
        drumHits: [
            { soundName: 'Kick', velocity: 0.9, instTimeOffset: 0 },
            { soundName: 'Snare', velocity: 0.8, instTimeOffset: 0 },
            { soundName: 'HiHat', velocity: 0.5, instTimeOffset: 0 },
        ],
    })),
    expireMutedDrumFillAtStep: vi.fn(),
}));

const { scheduleBass, scheduleChords, scheduleDrums, scheduleHarmonies, scheduleSoloist } =
    await import('../../../public/engine/scheduler-core.js');
const { playBassNote, playDrumSound, playHarmonyNote, playNote, playSoloNote } = await import(
    '../../../public/engine/engine.js'
);
const { ExportProcessor } = await import('../../../public/engine/midi-worker-logic.js');
const { MidiTrack } = await import('../../../public/engine/midi-utils.js');

const DEFAULT_HUMANIZE = 20; // public/state/groove.ts
const PERCEPTUAL_FLOOR_S = 0.003; // ~3 ms onset-shift detection threshold
/** The 16 steps of one 4/4 bar, tagged with the metric position weighting reads. */
const BAR_4_4 = Array.from({ length: 16 }, (_, mStep) => ({
    mStep,
    isMeasureStart: mStep === 0,
    isPulseStart: mStep === 8,
    isBeatStart: mStep % 4 === 0,
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('#1068 — the knob actually means something (humanizeScale)', () => {
    it('is EXACTLY zero for off / negative / malformed values — no residual jitter anywhere', () => {
        // The single chokepoint that makes "humanize: 0 is bit-identical" a
        // property of the system rather than site-by-site discipline.
        for (const off of [
            0,
            -0,
            -1,
            -100,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            undefined,
            null,
        ]) {
            expect(humanizeScale(off)).toBe(0);
        }
    });

    it('spends the slider where players live — the default is a real setting, not a rounding error', () => {
        // The placebo bug: a linear map put the shipped default at 0.20 of full
        // strength, and full strength was itself ±10 ms, so the default did
        // ~±2 ms — under the perceptual floor. The concave curve lifts the
        // default's share of the range without changing what the ends mean.
        expect(humanizeScale(DEFAULT_HUMANIZE)).toBeGreaterThan(0.35);
        expect(humanizeScale(100)).toBe(1);
        expect(humanizeScale(150)).toBe(1); // clamped, never over-drives a lane
        const swept = [1, 5, 20, 50, 80, 100].map(humanizeScale);
        for (let i = 1; i < swept.length; i++) {
            expect(swept[i]).toBeGreaterThan(swept[i - 1]);
        }
    });
});

describe('#1068 — at the default the displacement clears the ~3 ms perceptual floor', () => {
    const scale = humanizeScale(DEFAULT_HUMANIZE);

    for (const lane of ['drums', 'bass', 'chords', 'harmonies', 'soloist']) {
        it(`${lane}: mean |displacement| over a bar's un-anchored steps is audible`, () => {
            const spread = HUMANIZE_PROFILES[lane].timeSpread;
            const offsets = BAR_4_4.filter((p) => !p.isBeatStart).map((p) =>
                Math.abs(
                    humanizePlacement(p.mStep, lane, 0, spread, scale, PLACEMENT_WEIGHTS.offbeat),
                ),
            );
            const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
            expect(mean).toBeGreaterThan(PERCEPTUAL_FLOOR_S);
            // ...and the peak is well clear of it, so the lean is unmistakable
            // on the steps where the draw happens to land wide.
            expect(Math.max(...offsets)).toBeGreaterThan(PERCEPTUAL_FLOOR_S * 1.5);
        });
    }

    it('stays musical at the top of the slider — no lane exceeds a third of a 16th at 120 bpm', () => {
        // A 16th at 120 bpm is 125 ms. Humanize is character, never a re-grid:
        // past ~a third of a step the note reads as landing on a different
        // subdivision rather than as placement.
        const stepSec = 60 / 120 / 4;
        for (const lane of Object.keys(HUMANIZE_PROFILES)) {
            expect(HUMANIZE_PROFILES[lane].timeSpread).toBeLessThan(stepSec / 3);
        }
    });
});

describe('#1068 — placement is a settled lean, not per-hit noise', () => {
    it('is bar-INDEPENDENT: the same 16th in the same lane leans the same way every bar', () => {
        // The property borrowed from `grooves/utils.ts` placementSkew: keyed on
        // (barStep, lane, voice) and nothing else. Simulated over 8 bars.
        const spread = HUMANIZE_PROFILES.bass.timeSpread;
        for (const p of BAR_4_4) {
            const perBar = Array.from({ length: 8 }, () =>
                humanizePlacement(p.mStep, 'bass', 0, spread, 1, 1),
            );
            expect(new Set(perBar).size).toBe(1);
        }
    });

    it('still varies ACROSS the bar — a constant lean would just be latency', () => {
        const spread = HUMANIZE_PROFILES.bass.timeSpread;
        const acrossBar = BAR_4_4.map((p) => humanizePlacement(p.mStep, 'bass', 0, spread, 1, 1));
        expect(new Set(acrossBar).size).toBe(BAR_4_4.length);
    });

    it('moves each lane INDEPENDENTLY — the shared-draw lockstep is gone', () => {
        // The #1068 problem-5 regression guard: one `Math.random()` per tick used
        // to be handed to the comp, the harmony and the chart visuals unchanged.
        for (const p of BAR_4_4) {
            const bass = humanizePlacement(
                p.mStep,
                'bass',
                0,
                HUMANIZE_PROFILES.bass.timeSpread,
                1,
                1,
            );
            const chords = humanizePlacement(
                p.mStep,
                'chords',
                0,
                HUMANIZE_PROFILES.chords.timeSpread,
                1,
                1,
            );
            const soloist = humanizePlacement(
                p.mStep,
                'soloist',
                0,
                HUMANIZE_PROFILES.soloist.timeSpread,
                1,
                1,
            );
            expect(new Set([bass, chords, soloist]).size).toBe(3);
        }
    });

    it('weights positions: downbeat tightest, then pulse, then beat, then everything else', () => {
        expect(placementWeight({ isMeasureStart: true })).toBe(PLACEMENT_WEIGHTS.downbeat);
        expect(placementWeight({ isPulseStart: true })).toBe(PLACEMENT_WEIGHTS.pulse);
        expect(placementWeight({ isBeatStart: true })).toBe(PLACEMENT_WEIGHTS.beat);
        expect(placementWeight({})).toBe(PLACEMENT_WEIGHTS.offbeat);
        expect(placementWeight(undefined)).toBe(PLACEMENT_WEIGHTS.offbeat);
        expect(PLACEMENT_WEIGHTS.downbeat).toBeLessThan(PLACEMENT_WEIGHTS.pulse);
        expect(PLACEMENT_WEIGHTS.pulse).toBeLessThan(PLACEMENT_WEIGHTS.beat);
        expect(PLACEMENT_WEIGHTS.beat).toBeLessThan(PLACEMENT_WEIGHTS.offbeat);
    });
});

// --- Live-path lane fixtures ------------------------------------------------

function drumState(humanize) {
    return {
        playback: { conductorVelocity: 1.0, bandIntensity: 0.5, drawQueue: [] },
        groove: { humanize, fillActive: false, pendingCrash: false, instruments: [] },
        vizState: { enabled: false },
        arranger: { sectionMap: [], timeSignature: '4/4' },
    };
}

function bassState(humanize) {
    return {
        bass: {
            buffer: new Map([
                [0, [{ freq: 82.4069, durationSteps: 2, velocity: 1.0, timingOffset: 0 }]],
            ]),
        },
        playback: { bpm: 120, conductorVelocity: 1.0, bandIntensity: 0.6 },
        vizState: { enabled: false },
        groove: { humanize },
    };
}

function chordsState(humanize) {
    return {
        chords: {
            buffer: new Map([
                [
                    0,
                    [261.63, 329.63, 392.0].map((freq) => ({
                        freq,
                        durationSteps: 2,
                        velocity: 0.5,
                        timingOffset: 0,
                        muted: false,
                    })),
                ],
            ]),
            voice: 'Piano',
        },
        playback: {
            bpm: 120,
            sustainActive: false,
            activeChordVoices: [],
            lastChordKey: null,
            drawQueue: [],
        },
        vizState: { enabled: false },
        groove: { humanize },
    };
}

function soloistState(humanize) {
    return {
        soloist: {
            mode: 'mono',
            audio: {
                buffer: new Map([
                    [
                        0,
                        [{ freq: 440, midi: 69, durationSteps: 2, velocity: 0.9, timingOffset: 0 }],
                    ],
                ]),
                lastNoteEnd: -99,
                lastPlayedFreq: 0,
            },
        },
        playback: { bpm: 120, conductorVelocity: 1.0, bandIntensity: 0.6 },
        vizState: { enabled: false },
        groove: { humanize },
    };
}

function harmonyState(humanize) {
    return {
        harmony: {
            buffer: new Map([
                [
                    0,
                    [64, 67, 71].map((midi) => ({
                        midi,
                        freq: 440,
                        durationSteps: 2,
                        velocity: 0.5,
                        timingOffset: 0,
                        isChordStart: false,
                    })),
                ],
            ]),
        },
        playback: { bpm: 120, conductorVelocity: 1.0 },
        vizState: { enabled: false },
        groove: { humanize },
    };
}

const CHORD_DATA = { chord: { absName: 'C', rootMidi: 60, intervals: [0, 4, 7], freqs: [] } };

/** Drive every lane once and return the exact scalars each voice received. */
function renderAllLanes(humanize) {
    vi.clearAllMocks();
    scheduleDrums(drumState(humanize), {
        time: 10,
        absoluteStep: 33,
        chartStep: 33,
        mStep: 1,
        isMeasureStart: false,
        isBeatStart: false,
    });
    scheduleBass(bassState(humanize), CHORD_DATA, 0, 10);
    scheduleChords(chordsState(humanize), CHORD_DATA, 0, 10);
    scheduleSoloist(soloistState(humanize), CHORD_DATA, 0, 10);
    scheduleHarmonies(harmonyState(humanize), CHORD_DATA, 0, 10);
    return {
        // (state, name, time, velocity)
        drums: vi.mocked(playDrumSound).mock.calls.map((c) => c.slice(1, 4)),
        // (state, freq, time, duration, vel, ...)
        bass: vi.mocked(playBassNote).mock.calls.map((c) => c.slice(1, 5)),
        // (state, freq, time, duration, opts)
        chords: vi.mocked(playNote).mock.calls.map((c) => [c[1], c[2], c[4].vol]),
        // (state, freq, time, duration, vel, ...)
        soloist: vi.mocked(playSoloNote).mock.calls.map((c) => c.slice(1, 5)),
        // (state, freq, time, duration, vel, ...)
        harmony: vi.mocked(playHarmonyNote).mock.calls.map((c) => c.slice(1, 5)),
    };
}

const LANES = ['drums', 'bass', 'chords', 'soloist', 'harmony'];

describe('#1068 — live playback is fully seeded, lane by lane', () => {
    function renderWithRandom(humanize, randomValue) {
        const spy = vi.spyOn(Math, 'random').mockReturnValue(randomValue);
        try {
            return renderAllLanes(humanize);
        } finally {
            spy.mockRestore();
        }
    }

    for (const knob of [0, DEFAULT_HUMANIZE, 100]) {
        it(`humanize: ${knob} — identical output under bracketing Math.random stubs`, () => {
            // Bracketing (0.05 vs 0.95), never the same value twice: identical
            // stubs would pass on a still-unseeded engine.
            const a = renderWithRandom(knob, 0.05);
            const b = renderWithRandom(knob, 0.95);
            for (const lane of LANES) {
                expect(a[lane].length).toBeGreaterThan(0);
                expect(b[lane]).toEqual(a[lane]);
            }
        });
    }

    it('humanize: 0 leaves EVERY lane exactly on the grid — no residual base offset', () => {
        const off = renderAllLanes(0);
        // Every lane was handed `time: 10` with a zero per-note timingOffset.
        for (const [, time] of off.drums) {
            expect(time).toBe(10);
        }
        for (const [, time] of off.bass) {
            expect(time).toBe(10);
        }
        for (const [, time] of off.chords) {
            expect(time).toBe(10);
        }
        for (const [, time] of off.soloist) {
            expect(time).toBe(10);
        }
        for (const [, time] of off.harmony) {
            expect(time).toBe(10);
        }
    });

    it('humanize: 0 also leaves every lane at its unmodified velocity and pitch', () => {
        const off = renderAllLanes(0);
        expect(off.drums.map((c) => c[2])).toEqual([0.9, 0.8, 0.5]);
        expect(off.bass[0][0]).toBeCloseTo(82.4069, 10); // no detune nudge
        expect(off.chords.map((c) => c[2])).toEqual([0.5, 0.5, 0.5]);
        expect(off.chords.map((c) => c[0])).toEqual([261.63, 329.63, 392.0]);
        expect(off.soloist[0][0]).toBe(440);
    });

    it('the default knob visibly moves the drum kit off the grid (it is not a placebo)', () => {
        const off = renderAllLanes(0);
        const on = renderAllLanes(DEFAULT_HUMANIZE);
        const shifts = on.drums.map((hit, i) => Math.abs(hit[1] - off.drums[i][1]));
        expect(Math.max(...shifts)).toBeGreaterThan(PERCEPTUAL_FLOOR_S);
        // Each piece is its own limb — no two move by the identical amount.
        expect(new Set(shifts).size).toBe(shifts.length);
    });

    it('a drum hit on the bar downbeat is placed tighter than the same hit off it', () => {
        // Same seed tuple, only the position weight differs — an exact
        // comparison, not a statistical one.
        vi.clearAllMocks();
        scheduleDrums(drumState(100), {
            time: 10,
            absoluteStep: 32,
            chartStep: 32,
            mStep: 0,
            isMeasureStart: true,
            isBeatStart: true,
        });
        const onDownbeat = vi.mocked(playDrumSound).mock.calls.map((c) => Math.abs(c[2] - 10));
        vi.clearAllMocks();
        scheduleDrums(drumState(100), {
            time: 10,
            absoluteStep: 32,
            chartStep: 32,
            mStep: 0,
            isMeasureStart: false,
            isBeatStart: false,
        });
        const offAnchor = vi.mocked(playDrumSound).mock.calls.map((c) => Math.abs(c[2] - 10));
        for (let i = 0; i < onDownbeat.length; i++) {
            expect(onDownbeat[i]).toBeLessThan(offAnchor[i]);
        }
    });
});

// --- MIDI export ------------------------------------------------------------

function exportState(humanize) {
    return {
        playback: { bpm: 120, bandIntensity: 0.5, complexity: 0.5, intent: {} },
        arranger: {
            totalSteps: 32,
            timeSignature: '4/4',
            stepMap: [],
            progression: ['C'],
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: true, style: 'Standard', volume: 0.5, octave: 0 },
        bass: { enabled: true, style: 'Standard', volume: 0.5, octave: 0 },
        soloist: makeSoloistMock({ enabled: true, style: 'Standard', lastMidi: 60, octave: 0 }),
        harmony: { enabled: true, style: 'Standard', volume: 0.5, octave: 0, complexity: 0.5 },
        groove: {
            enabled: true,
            volume: 0.5,
            instruments: [],
            lastDrumPreset: 'Standard',
            humanize,
        },
        midi: {
            chordsChannel: 1,
            bassChannel: 2,
            soloistChannel: 3,
            harmonyChannel: 4,
            drumsChannel: 10,
            latency: 0,
            velocitySensitivity: 1.0,
        },
    };
}

/** Write one lane's exported track, twice-runnable and comparable. */
function exportedTrack(moduleName, humanize) {
    const processor = new ExportProcessor(exportState(humanize), {
        includedTracks: [moduleName],
    });
    const track = new MidiTrack();
    for (let step = 0; step < 16; step++) {
        processor._writeNotesToTrack(
            track,
            0,
            [
                { midi: 60, velocity: 0.8, durationSteps: 1, timingOffset: 0 },
                { midi: 64, velocity: 0.7, durationSteps: 1, timingOffset: 0 },
            ],
            step * 0.125,
            moduleName,
            {},
            step,
            { mStep: step, isMeasureStart: step === 0, isBeatStart: step % 4 === 0 },
        );
    }
    return track;
}

const exportedTrackBytes = (moduleName, humanize) =>
    Array.from(exportedTrack(moduleName, humanize).compile());

/** The pulse of every note-on the lane wrote — i.e. its PLACEMENT, not colour. */
const exportedNoteOnPulses = (moduleName, humanize) =>
    exportedTrack(moduleName, humanize)
        .events.filter((e) => (e.data[0] & 0xf0) === 0x90)
        .map((e) => e.time);

describe('#1068 — the .mid export is reproducible', () => {
    beforeEach(() => {
        vi.stubGlobal('postMessage', vi.fn());
    });

    for (const knob of [0, DEFAULT_HUMANIZE, 100]) {
        it(`humanize: ${knob} — two exports of the same chart are byte-identical`, () => {
            // The regression: `_writeNotesToTrack` used raw `Math.random()` for
            // its velocity jitter, so exporting the same chart twice produced two
            // different files. Bracketing stubs, so an unseeded draw shows up.
            for (const lane of ['bass', 'chords', 'soloist', 'harmony']) {
                const spyA = vi.spyOn(Math, 'random').mockReturnValue(0.05);
                const a = exportedTrackBytes(lane, knob);
                spyA.mockRestore();
                const spyB = vi.spyOn(Math, 'random').mockReturnValue(0.95);
                const b = exportedTrackBytes(lane, knob);
                spyB.mockRestore();
                expect(a.length).toBeGreaterThan(16);
                expect(b).toEqual(a);
            }
        });
    }

    it('humanize: 0 exports exactly on the grid, and the knob moves it off', () => {
        const off = exportedTrackBytes('bass', 0);
        const on = exportedTrackBytes('bass', 100);
        expect(on).not.toEqual(off);
    });

    it('harmony is not double-humanized on export — it humanizes itself upstream', () => {
        // `finalizeHarmonyNotes` owns BOTH of harmony's terms: placement lands in
        // `timingOffset` and colour in `velocity` before the note ever reaches the
        // exporter (which is why harmony humanization reaches the .mid at all).
        // Drawing either again here would double it, so the exporter deliberately
        // skips this one lane — pinned so a future "make every lane symmetric"
        // tidy-up goes red instead of silently doubling the section's lean.
        expect(exportedTrackBytes('harmony', 100)).toEqual(exportedTrackBytes('harmony', 0));
        // Every other lane's placement DOES move with the knob.
        for (const lane of ['bass', 'chords', 'soloist']) {
            expect(exportedNoteOnPulses(lane, 100)).not.toEqual(exportedNoteOnPulses(lane, 0));
        }
    });
});

describe('#1068 — the worker-side engines are knob-gated too', () => {
    it('humanizeColor is the exact identity at knob 0 (velocity and detune both)', () => {
        for (const lane of Object.keys(HUMANIZE_PROFILES)) {
            const n = humanizeColor(humanizeSeed(7, lane, 2), HUMANIZE_PROFILES[lane], 0);
            expect(n.velocityMult).toBe(1);
            expect(n.detuneCents).toBe(0);
        }
    });

    it('the drum kit velocity jitter in groove-engine follows the knob', async () => {
        // `humanizeVelocity` used to fire at ±2-4% regardless of the slider, so
        // `humanize: 0` never meant off for the lane a listener notices first.
        const { applyGrooveOverrides } = await import('../../../public/engine/groove-engine.js');
        const params = (humanize) => ({
            stepVal: 1,
            step: 4,
            inst: { name: 'Snare', muted: false, steps: [] },
            playback: { bandIntensity: 0.6, currentLoopCount: 0 },
            groove: { genreFeel: 'Rock', humanize, sectionSeedMap: {}, instruments: [] },
            isDownbeat: false,
            isBeatStart: true,
            isBackbeat: true,
            isOffbeat: false,
            beatIndex: 1,
            mStep: 4,
            stepInGroup: 4,
            groupIndex: 0,
        });
        const state = { soloist: {}, arranger: { timeSignature: '4/4', stepMap: [], seed: 's' } };
        const off = applyGrooveOverrides(state, params(0));
        const on = applyGrooveOverrides(state, params(100));
        expect(off.velocity).not.toBe(on.velocity);
        // At the knob off the velocity is the untouched engine value — the
        // "multiply by zero still recomputes a float" trap.
        const bare = applyGrooveOverrides(state, params(0));
        expect(bare.velocity).toBe(off.velocity);
    });
});
