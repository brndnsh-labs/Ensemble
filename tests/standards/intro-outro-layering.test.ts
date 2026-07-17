// @ts-nocheck
// tests/standards/intro-outro-layering.test.ts
//
// Critique test for `epic-form-arrangement` S5 — Intro/Outro instrument layering.
//
// A produced track opens drums-only for 2-4 bars, then layers in bass, then
// chord comp, then harmonic color — and inverts the order on the outro. Today
// (without this story) all six engines emit from beat 1; the "Intro" is just
// "the same band, quieter" (form-arranger.md P1 #4).
//
// Mute config:
//   INTRO_MUTES = { bass: 2, chords: 3, harmony: 4 }
//   OUTRO_MUTES = { bass: 1, chords: 3, harmony: 4 }
//
// Concretely (intro):
//   - Bar 0-1 of intro: ONLY drums emit (bass/chords/harmony silent).
//   - Bar 2:   drums + bass.
//   - Bar 3:   drums + bass + chords.
//   - Bar 4+:  drums + bass + chords + harmony.
//
// Concretely (8-bar outro):
//   - Bar 0-3 of outro: drums + bass + chords (harmony has dropped out).
//   - Bar 4:   drums + bass + chords.
//   - Bar 5-6: drums + bass (chords drop on the last 3 bars).
//   - Bar 7:   drums only (bass drops on the last bar). S4's final-bar
//     cadence OVERRIDES the bass mute on the very last bar to land the
//     resolution.
//
// Test strategy: rather than running `generateNotesForStep` end-to-end (which
// would require mocking every engine), this test exercises the publish/gate
// contract at two layers:
//   (1) Coordination publication via `generateNotesForStep` with all engines
//       disabled — assert that `introBarsElapsed` / `outroBarsRemaining` are
//       computed correctly across the form.
//   (2) Engine-isolated gates: feed each engine a coordination object with
//       hand-built values and confirm note emission / silence matches the
//       config. This is the same pattern as `final-bar-cadence.test.ts`.
//
// Determinism: Math.random is stubbed in the engine-isolation tests at both
// 0.05 and 0.95 across two `describe.each` blocks so a single seed quirk
// can't make a broken gate appear passing
// (memory:feedback_determinism_test_pattern).
//
// Reliability: 30/30 measured 2026-05-17.
//
// Source: docs/audit/form-arranger.md P1 #4;
//         docs/audit/epic-form-arrangement.md S5.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { INTRO_MUTES, OUTRO_MUTES } from '../../public/engine/arrangement-layering.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// --- Fixtures ----------------------------------------------------------------

const TS_CONFIG = TIME_SIGNATURES['4/4'];
const STEPS_PER_BEAT = TS_CONFIG.stepsPerBeat; // 4
const STEPS_PER_BAR = TS_CONFIG.beats * STEPS_PER_BEAT; // 16

const INTRO_BARS = 4;
const VERSE_BARS = 4;
const OUTRO_BARS = 8;
const INTRO_STEPS = INTRO_BARS * STEPS_PER_BAR; // 64
const VERSE_STEPS = VERSE_BARS * STEPS_PER_BAR; // 64
const OUTRO_STEPS = OUTRO_BARS * STEPS_PER_BAR; // 128

const CHORD_C_CHORDS = {
    rootMidi: 60,
    quality: 'maj7',
    is7th: true,
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [261.63, 329.63, 392.0, 493.88],
    sectionId: 'sec-intro',
    sectionLabel: 'Intro',
};

const CHORD_C_BASS = {
    rootMidi: 48,
    quality: 'maj7',
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [130.81, 164.81, 196.0, 246.94],
    sectionId: 'sec-intro',
    sectionLabel: 'Intro',
};

function makeCoordination(
    opts: {
        introBarsElapsed?: number;
        outroBarsRemaining?: number;
        isFinalMeasure?: boolean;
        sectionStart?: number;
        sectionEnd?: number;
    } = {},
) {
    return {
        sectionStart: opts.sectionStart ?? 0,
        sectionEnd: opts.sectionEnd ?? INTRO_STEPS + VERSE_STEPS,
        sectionOccurrence: 1,
        introBarsElapsed: opts.introBarsElapsed ?? -1,
        outroBarsRemaining: opts.outroBarsRemaining ?? -1,
        isFinalMeasure: opts.isFinalMeasure === true,
        kickHit: false,
        snareHit: false,
        soloistBusy: false,
        soloistMidi: 0,
        bassHit: false,
        bassMidi: 0,
    };
}

// --- Coordination publication (end-to-end via tick-logic) -------------------

function makeTickStateIntroVerse() {
    // Form: 4 bars Intro → 4 bars Verse → 8 bars Outro (so we can verify
    // both bar-count fields against the SAME state object).
    const introChord = { ...CHORD_C_CHORDS, sectionId: 'sec-intro', sectionLabel: 'Intro' };
    const verseChord = { ...CHORD_C_CHORDS, sectionId: 'sec-verse', sectionLabel: 'Verse' };
    const outroChord = { ...CHORD_C_CHORDS, sectionId: 'sec-outro', sectionLabel: 'Outro' };
    const total = INTRO_STEPS + VERSE_STEPS + OUTRO_STEPS;

    return {
        arranger: {
            totalSteps: total,
            timeSignature: '4/4',
            stepMap: [
                {
                    start: 0,
                    end: INTRO_STEPS,
                    chord: introChord,
                    sectionStart: 0,
                    sectionEnd: INTRO_STEPS,
                },
                {
                    start: INTRO_STEPS,
                    end: INTRO_STEPS + VERSE_STEPS,
                    chord: verseChord,
                    sectionStart: INTRO_STEPS,
                    sectionEnd: INTRO_STEPS + VERSE_STEPS,
                },
                {
                    start: INTRO_STEPS + VERSE_STEPS,
                    end: total,
                    chord: outroChord,
                    sectionStart: INTRO_STEPS + VERSE_STEPS,
                    sectionEnd: total,
                },
            ],
            sectionMap: [
                { id: 'sec-intro', start: 0, end: INTRO_STEPS, label: 'Intro' },
                {
                    id: 'sec-verse',
                    start: INTRO_STEPS,
                    end: INTRO_STEPS + VERSE_STEPS,
                    label: 'Verse',
                },
                {
                    id: 'sec-outro',
                    start: INTRO_STEPS + VERSE_STEPS,
                    end: total,
                    label: 'Outro',
                },
            ],
            progression: [introChord, verseChord, outroChord],
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: false, style: 'smart', volume: 0.5 },
        bass: { enabled: false, style: 'smart', volume: 0.5, lastFreq: null, octave: 0 },
        soloist: makeSoloistMock({
            enabled: false,
            style: 'smart',
            busySteps: 0,
            notesInPhrase: 0,
        }),
        harmony: { enabled: false, style: 'smart', complexity: 0.5, lastMidis: [] },
        groove: {
            enabled: false,
            measures: 1,
            instruments: [],
            fillActive: false,
            sectionSeedMap: {},
        },
        playback: {
            bpm: 120,
            bandIntensity: 0.6,
            songMode: true,
            isEndingPending: false,
            intent: {},
        },
    } as any;
}

// why: smell guard — every silence-loop in this file iterates
// `for (let bar = 0; bar < INTRO_MUTES.<engine>; bar++)`. If anyone tuned a
// mute to 0 (deliberately or via a merge), those loops would run zero
// iterations and the silence claim would pass vacuously with no assertions
// executed. Anchoring the config to non-zero here cements the contract that
// the mute schedule is non-trivial — the silence tests below only mean
// something if these constants are positive integers.
describe('Intro/Outro layering — mute-config sanity (epic-form-arrangement S5)', () => {
    it('every mute value is a positive integer', () => {
        for (const [engine, bars] of Object.entries(INTRO_MUTES)) {
            expect(bars, `INTRO_MUTES.${engine}`).toBeGreaterThan(0);
            expect(Number.isInteger(bars), `INTRO_MUTES.${engine} integer`).toBe(true);
        }
        for (const [engine, bars] of Object.entries(OUTRO_MUTES)) {
            expect(bars, `OUTRO_MUTES.${engine}`).toBeGreaterThan(0);
            expect(Number.isInteger(bars), `OUTRO_MUTES.${engine} integer`).toBe(true);
        }
    });
});

describe('Intro/Outro layering — coordination publication (epic-form-arrangement S5)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('publishes introBarsElapsed=0..N-1 across the Intro section and -1 elsewhere', () => {
        const state = makeTickStateIntroVerse();
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };

        // Probe the first step of each bar across the Intro + Verse so the
        // bar counter ticks visibly. Intro is bars 0..3 (steps 0,16,32,48);
        // Verse begins at step 64 → introBarsElapsed must drop to -1.
        const probes: { step: number; introBarsElapsed: number; outroBarsRemaining: number }[] = [];
        for (let bar = 0; bar < INTRO_BARS + VERSE_BARS; bar++) {
            const step = bar * STEPS_PER_BAR;
            const r = generateNotesForStep(state, step, cursors, {
                includeSoloist: false,
                includeBass: false,
                includeChords: false,
                includeHarmony: false,
                includeDrums: false,
            });
            probes.push({
                step,
                introBarsElapsed: r.coordination.introBarsElapsed,
                outroBarsRemaining: r.coordination.outroBarsRemaining,
            });
        }

        // eslint-disable-next-line no-console
        console.log(
            `[intro-outro] probes: ${probes
                .map((p) => `${p.step}:intro=${p.introBarsElapsed},outro=${p.outroBarsRemaining}`)
                .join(' ')}`,
        );

        // Intro section: introBarsElapsed = 0,1,2,3
        expect(probes[0].introBarsElapsed).toBe(0);
        expect(probes[1].introBarsElapsed).toBe(1);
        expect(probes[2].introBarsElapsed).toBe(2);
        expect(probes[3].introBarsElapsed).toBe(3);
        // Verse section: introBarsElapsed must reset to -1 (sentinel).
        for (let i = INTRO_BARS; i < INTRO_BARS + VERSE_BARS; i++) {
            expect(probes[i].introBarsElapsed).toBe(-1);
        }
        // Verse is not an Outro section either — outroBarsRemaining = -1
        // for ALL Intro+Verse probes (Outro begins after step 128).
        for (const p of probes) {
            expect(p.outroBarsRemaining).toBe(-1);
        }
    });

    it('publishes outroBarsRemaining=N..1 across the Outro section and -1 elsewhere', () => {
        const state = makeTickStateIntroVerse();
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };

        // Probe the first step of each bar across the 8-bar Outro.
        const probes: { bar: number; outroBarsRemaining: number; introBarsElapsed: number }[] = [];
        const outroStart = INTRO_STEPS + VERSE_STEPS;
        for (let bar = 0; bar < OUTRO_BARS; bar++) {
            const step = outroStart + bar * STEPS_PER_BAR;
            const r = generateNotesForStep(state, step, cursors, {
                includeSoloist: false,
                includeBass: false,
                includeChords: false,
                includeHarmony: false,
                includeDrums: false,
            });
            probes.push({
                bar,
                outroBarsRemaining: r.coordination.outroBarsRemaining,
                introBarsElapsed: r.coordination.introBarsElapsed,
            });
        }

        // eslint-disable-next-line no-console
        console.log(
            `[intro-outro] outro probes: ${probes
                .map((p) => `bar${p.bar}:remaining=${p.outroBarsRemaining}`)
                .join(' ')}`,
        );

        // Outro bars: remaining = 8,7,6,5,4,3,2,1.
        for (let bar = 0; bar < OUTRO_BARS; bar++) {
            expect(probes[bar].outroBarsRemaining).toBe(OUTRO_BARS - bar);
            expect(probes[bar].introBarsElapsed).toBe(-1);
        }
    });

    it('reports outroBarsRemaining=1 on the very last step of the form', () => {
        // why: regression guard — Math.ceil on (sectionEnd - step) must yield
        // 1 (not 0) for the absolute last step. A regression that used
        // Math.floor or omitted Math.ceil would let the last bar's last
        // step report remaining=0, and outro mute logic could skip the very
        // last bar's silence.
        const state = makeTickStateIntroVerse();
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };
        const total = state.arranger.totalSteps;
        const lastStep = total - 1;
        const r = generateNotesForStep(state, lastStep, cursors, {
            includeSoloist: false,
            includeBass: false,
            includeChords: false,
            includeHarmony: false,
            includeDrums: false,
        });
        expect(r.coordination.outroBarsRemaining).toBe(1);
    });

    it('reports -1 for both fields on a Verse-only chart (no intro, no outro labels)', () => {
        // why: regression — a chart without Intro/Outro labels must NEVER
        // trigger the mute. A bug that defaulted introBarsElapsed to 0
        // (instead of -1) would mute the bass at the start of every chart.
        const verseOnlyChord = {
            ...CHORD_C_CHORDS,
            sectionId: 'sec-verse',
            sectionLabel: 'Verse',
        };
        const state = {
            ...makeTickStateIntroVerse(),
            arranger: {
                totalSteps: VERSE_STEPS,
                timeSignature: '4/4',
                stepMap: [
                    {
                        start: 0,
                        end: VERSE_STEPS,
                        chord: verseOnlyChord,
                        sectionStart: 0,
                        sectionEnd: VERSE_STEPS,
                    },
                ],
                sectionMap: [{ id: 'sec-verse', start: 0, end: VERSE_STEPS, label: 'Verse' }],
                progression: [verseOnlyChord],
                key: 'C',
                isMinor: false,
            },
        };
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };
        for (const step of [0, STEPS_PER_BAR, VERSE_STEPS - 1]) {
            const r = generateNotesForStep(state, step, cursors, {
                includeSoloist: false,
                includeBass: false,
                includeChords: false,
                includeHarmony: false,
                includeDrums: false,
            });
            expect(r.coordination.introBarsElapsed).toBe(-1);
            expect(r.coordination.outroBarsRemaining).toBe(-1);
        }
    });
});

// --- Bass engine intro/outro gates -----------------------------------------

function makeBassMockState() {
    return {
        playback: { bandIntensity: 0.6, bpm: 120, complexity: 0.4, intent: {} },
        groove: { genreFeel: 'Rock', pocket: 0, instruments: [], measures: 1 },
        soloist: makeSoloistMock({ busySteps: 0, tension: 0, enabled: false }),
        arranger: {
            timeSignature: '4/4',
            totalSteps: INTRO_STEPS + VERSE_STEPS,
            stepMap: [],
            sectionMap: [],
        },
        bass: { lastFreq: null, busySteps: 0, lastMidiPlayed: null },
    };
}

// why: parameterize over two Math.random seeds so a broken gate can't pass
// by luck on one seed. 0.05 and 0.95 cover the low/high halves of any
// probability-gated branch inside getBassNote / applyGrooveOverrides.
describe.each([0.05, 0.95])('Intro/Outro layering — Bass engine (Math.random=%s)', (randomVal) => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Math, 'random').mockReturnValue(randomVal);
    });

    it(`is silent on bars 0..${INTRO_MUTES.bass - 1} of the Intro (mute config)`, () => {
        const mockState = makeBassMockState();
        getState.mockReturnValue(mockState);

        for (let bar = 0; bar < INTRO_MUTES.bass; bar++) {
            const step = bar * STEPS_PER_BAR;
            const stepInfo = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
            const coord = makeCoordination({ introBarsElapsed: bar });

            // isBassActive must return false.
            const active = isBassActive(mockState, 'rock', step, 0, stepInfo, coord);
            expect(active).toBe(false);

            // getBassNote called directly must also return null (defense-in-depth).
            const note = getBassNote(
                mockState,
                CHORD_C_BASS,
                CHORD_C_BASS,
                step / STEPS_PER_BEAT,
                null,
                48,
                'rock',
                0,
                step,
                0,
                {
                    sectionStart: 0,
                    sectionEnd: INTRO_STEPS,
                    stepCoordination: coord,
                },
                stepInfo,
            );
            expect(note).toBeNull();
        }
    });

    it(`enters at bar ${INTRO_MUTES.bass} of the Intro`, () => {
        const mockState = makeBassMockState();
        getState.mockReturnValue(mockState);

        const bar = INTRO_MUTES.bass;
        const step = bar * STEPS_PER_BAR;
        const stepInfo = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
        const coord = makeCoordination({ introBarsElapsed: bar });

        // isBassActive should NOT be muted now.
        const active = isBassActive(mockState, 'rock', step, 0, stepInfo, coord);
        expect(active).toBe(true);

        const note = getBassNote(
            mockState,
            CHORD_C_BASS,
            CHORD_C_BASS,
            step / STEPS_PER_BEAT,
            null,
            48,
            'rock',
            0,
            step,
            0,
            {
                sectionStart: 0,
                sectionEnd: INTRO_STEPS,
                stepCoordination: coord,
            },
            stepInfo,
        );
        expect(note).not.toBeNull();
        // Note's pitch class should be the chord root (C = pc 0).
        const pc = (((note.midi as number) % 12) + 12) % 12;
        expect(pc).toBe(0);
    });

    it(`is silent during the last ${OUTRO_MUTES.bass} bar(s) of the Outro (mute config)`, () => {
        const mockState = makeBassMockState();
        getState.mockReturnValue(mockState);

        // outroBarsRemaining values 1..OUTRO_MUTES.bass — bass muted.
        for (let remaining = 1; remaining <= OUTRO_MUTES.bass; remaining++) {
            const step = STEPS_PER_BAR * (OUTRO_BARS - remaining); // arbitrary
            const stepInfo = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
            const coord = makeCoordination({ outroBarsRemaining: remaining });

            const active = isBassActive(mockState, 'rock', step, 0, stepInfo, coord);
            expect(active).toBe(false);

            const note = getBassNote(
                mockState,
                CHORD_C_BASS,
                CHORD_C_BASS,
                step / STEPS_PER_BEAT,
                null,
                48,
                'rock',
                0,
                step,
                0,
                { sectionStart: 0, sectionEnd: OUTRO_STEPS, stepCoordination: coord },
                stepInfo,
            );
            expect(note).toBeNull();
        }
    });

    it('plays through the outro UNTIL the last mute window (regression guard)', () => {
        // why: outroBarsRemaining = OUTRO_MUTES.bass + 1 → bass must still
        // be active. Catches a regression where the gate uses `<`
        // instead of `<=` (off-by-one).
        const mockState = makeBassMockState();
        getState.mockReturnValue(mockState);

        const remaining = OUTRO_MUTES.bass + 1;
        const step = STEPS_PER_BAR * (OUTRO_BARS - remaining);
        const stepInfo = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
        const coord = makeCoordination({ outroBarsRemaining: remaining });

        const active = isBassActive(mockState, 'rock', step, 0, stepInfo, coord);
        expect(active).toBe(true);
    });

    it('final-bar cadence OVERRIDES outro mute (S4 precedence)', () => {
        // why: even on the absolute final bar (where outroBarsRemaining=1
        // would mute the bass), if `isFinalMeasure` is true the S4
        // cadence must fire its sustained tonic. Without this precedence
        // check, the band ends silent instead of landing the resolution.
        const mockState = makeBassMockState();
        getState.mockReturnValue(mockState);

        const step = STEPS_PER_BAR * (OUTRO_BARS - 1);
        const stepInfo = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
        const coord = makeCoordination({
            outroBarsRemaining: 1,
            isFinalMeasure: true,
        });

        const active = isBassActive(mockState, 'rock', step, 0, stepInfo, coord);
        expect(active).toBe(true);

        const note = getBassNote(
            mockState,
            CHORD_C_BASS,
            CHORD_C_BASS,
            step / STEPS_PER_BEAT,
            null,
            48,
            'rock',
            0,
            step,
            0,
            {
                sectionStart: 0,
                sectionEnd: OUTRO_STEPS,
                stepCoordination: coord,
            },
            stepInfo,
        );
        // S4 cadence: sustained tonic.
        expect(note).not.toBeNull();
        expect(note.durationSteps).toBeGreaterThanOrEqual(STEPS_PER_BAR - 1);
    });

    it('plays normally on a Verse chart (no intro/outro labels)', () => {
        // Negative control — without intro/outro coordination, bass plays.
        const mockState = makeBassMockState();
        getState.mockReturnValue(mockState);

        const stepInfo = getStepInfo(0, TS_CONFIG, [], TIME_SIGNATURES);
        const coord = makeCoordination(); // both sentinels = -1.

        const active = isBassActive(mockState, 'rock', 0, 0, stepInfo, coord);
        expect(active).toBe(true);
    });
});

// --- Accompaniment intro/outro gates ---------------------------------------

function makeChordsMockState(overrides: any = {}) {
    return {
        playback: {
            bandIntensity: 0.55,
            bpm: 120,
            complexity: 0.4,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
        },
        arranger: {
            timeSignature: '4/4',
            totalSteps: INTRO_STEPS + VERSE_STEPS,
            progression: [CHORD_C_CHORDS],
        },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: false, lastFreq: null },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        groove: { genreFeel: 'Jazz', pocket: 0, instruments: [] },
        harmony: { enabled: false, buffer: new Map(), rhythmicMask: 0 },
        ...overrides,
    };
}

function makeStepInfoForBeat(measureStep: number) {
    return {
        isMeasureStart: measureStep === 0,
        isBeatStart: measureStep % STEPS_PER_BEAT === 0,
        isGroupStart: measureStep === 0,
        isBackbeat: measureStep === 4 || measureStep === 12,
        isPulse: measureStep % 4 === 0,
        isPulseStart: measureStep === 0,
        isOffbeat: measureStep % 4 !== 0,
        isEOfBeat: false,
        isAOfBeat: false,
        beatIndex: Math.floor(measureStep / STEPS_PER_BEAT),
        mStep: measureStep,
        tsConfig: { beats: 4, stepsPerBeat: 4 },
    };
}

describe.each([0.05, 0.95])(
    'Intro/Outro layering — Accompaniment (Math.random=%s)',
    (randomVal) => {
        beforeEach(() => {
            vi.restoreAllMocks();
            vi.spyOn(Math, 'random').mockReturnValue(randomVal);
        });

        it(`is silent on bars 0..${INTRO_MUTES.chords - 1} of the Intro (mute config)`, () => {
            const state = makeChordsMockState();
            getState.mockReturnValue(state);

            for (let bar = 0; bar < INTRO_MUTES.chords; bar++) {
                const step = bar * STEPS_PER_BAR;
                const stepInfo = makeStepInfoForBeat(0);
                const coord = makeCoordination({ introBarsElapsed: bar });

                const notes = getAccompanimentNotes(
                    state,
                    CHORD_C_CHORDS,
                    step,
                    0,
                    0,
                    stepInfo,
                    coord,
                );
                const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
                expect(musical.length).toBe(0);
            }
        });

        it(`enters at bar ${INTRO_MUTES.chords} of the Intro`, () => {
            const state = makeChordsMockState();
            getState.mockReturnValue(state);

            const bar = INTRO_MUTES.chords;
            const step = bar * STEPS_PER_BAR;
            const stepInfo = makeStepInfoForBeat(0);
            const coord = makeCoordination({ introBarsElapsed: bar });

            const notes = getAccompanimentNotes(state, CHORD_C_CHORDS, step, 0, 0, stepInfo, coord);
            const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
            // eslint-disable-next-line no-console
            console.log(`[intro-outro] chords entry at bar ${bar}: ${musical.length} notes`);
            expect(musical.length).toBeGreaterThan(0);
        });

        it(`is silent during the last ${OUTRO_MUTES.chords} bar(s) of the Outro`, () => {
            const state = makeChordsMockState();
            getState.mockReturnValue(state);

            for (let remaining = 1; remaining <= OUTRO_MUTES.chords; remaining++) {
                const stepInfo = makeStepInfoForBeat(0);
                const coord = makeCoordination({ outroBarsRemaining: remaining });
                const notes = getAccompanimentNotes(
                    state,
                    CHORD_C_CHORDS,
                    0,
                    0,
                    0,
                    stepInfo,
                    coord,
                );
                const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
                expect(musical.length).toBe(0);
            }
        });

        it('plays at outroBarsRemaining=OUTRO_MUTES.chords+1 (off-by-one guard)', () => {
            const state = makeChordsMockState();
            getState.mockReturnValue(state);

            const stepInfo = makeStepInfoForBeat(0);
            const coord = makeCoordination({
                outroBarsRemaining: OUTRO_MUTES.chords + 1,
            });
            const notes = getAccompanimentNotes(state, CHORD_C_CHORDS, 0, 0, 0, stepInfo, coord);
            const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
            expect(musical.length).toBeGreaterThan(0);
        });

        it('final-bar cadence OVERRIDES outro mute (S4 precedence)', () => {
            const state = makeChordsMockState();
            getState.mockReturnValue(state);

            const stepInfo = makeStepInfoForBeat(0);
            const coord = makeCoordination({
                outroBarsRemaining: 1,
                isFinalMeasure: true,
            });
            const notes = getAccompanimentNotes(state, CHORD_C_CHORDS, 0, 0, 0, stepInfo, coord);
            // S4 cadence: root-position voicing with ≥3 notes (root+3rd+5th
            // at minimum).
            const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
            expect(musical.length).toBeGreaterThanOrEqual(3);
        });
    },
);

// --- Harmony intro/outro gates ---------------------------------------------

function makeHarmonyMockState(overrides: any = {}) {
    return {
        playback: {
            bandIntensity: 0.7, // why: above the 0.22 floor so harmony isn't pre-silenced.
            bpm: 120,
            complexity: 0.5,
            intent: {},
        },
        arranger: {
            timeSignature: '4/4',
            totalSteps: INTRO_STEPS + VERSE_STEPS,
            progression: [CHORD_C_CHORDS],
        },
        chords: { enabled: false, style: 'smart' },
        bass: { enabled: false, lastFreq: null, lastMidiPlayed: null },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0, notesInPhrase: 0 }),
        groove: { genreFeel: 'Jazz', pocket: 0, instruments: [] },
        harmony: {
            enabled: true,
            style: 'strings',
            complexity: 0.5,
            buffer: new Map(),
            rhythmicMask: 0,
            lastMidis: [],
            octave: 72,
        },
        ...overrides,
    };
}

describe.each([0.05, 0.95])('Intro/Outro layering — Harmony (Math.random=%s)', (randomVal) => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Math, 'random').mockReturnValue(randomVal);
    });

    it(`is silent on bars 0..${INTRO_MUTES.harmony - 1} of the Intro`, () => {
        const state = makeHarmonyMockState();
        getState.mockReturnValue(state);

        for (let bar = 0; bar < INTRO_MUTES.harmony; bar++) {
            const step = bar * STEPS_PER_BAR;
            const stepInfo = makeStepInfoForBeat(0);
            const coord = makeCoordination({ introBarsElapsed: bar });
            const notes = getHarmonyNotes(
                state,
                CHORD_C_CHORDS,
                null,
                step,
                72,
                'strings',
                0,
                null,
                coord,
                stepInfo,
            );
            expect(notes.length).toBe(0);
        }
    });

    it(`is silent during the last ${OUTRO_MUTES.harmony} bar(s) of the Outro`, () => {
        const state = makeHarmonyMockState();
        getState.mockReturnValue(state);

        for (let remaining = 1; remaining <= OUTRO_MUTES.harmony; remaining++) {
            const stepInfo = makeStepInfoForBeat(0);
            const coord = makeCoordination({ outroBarsRemaining: remaining });
            const notes = getHarmonyNotes(
                state,
                CHORD_C_CHORDS,
                null,
                0,
                72,
                'strings',
                0,
                null,
                coord,
                stepInfo,
            );
            expect(notes.length).toBe(0);
        }
    });

    it('plays normally with sentinel coordination (-1, -1)', () => {
        // Negative control — without intro/outro signals, harmony emits.
        const state = makeHarmonyMockState();
        getState.mockReturnValue(state);

        const coord = makeCoordination(); // both -1.
        // why: harmony engine may not always emit on beat 1 of every
        // chord (style decisions), but with intensity=0.7 + sentinel
        // coordination + strings/jazz the early-returns are bypassed.
        // The KEY assertion is "this is not categorically blocked by
        // the mute". If a regression makes the mute fire on sentinel
        // values, the totals across a full bar would be 0. We sample
        // multiple beats to dodge style-driven single-step exits —
        // passing simply means "not categorically zero."
        let totalAcrossBar = 0;
        for (let ms = 0; ms < STEPS_PER_BAR; ms++) {
            const si = makeStepInfoForBeat(ms);
            const n = getHarmonyNotes(
                state,
                CHORD_C_CHORDS,
                null,
                ms,
                72,
                'strings',
                0,
                null,
                coord,
                si,
            );
            totalAcrossBar += n.length;
        }
        // eslint-disable-next-line no-console
        console.log(`[intro-outro] harmony notes/bar (sentinel coord): ${totalAcrossBar}`);
        expect(totalAcrossBar).toBeGreaterThan(0);
    });
});

// --- Drums do NOT mute (regression guard) ----------------------------------

// Minimal Rock-groove state for the drum-exemption tests: an Intro section,
// no soloist, no orchestration overrides — just enough for applyGrooveOverrides
// to resolve a base drum hit.
function makeDrumExemptState() {
    return {
        playback: {
            bandIntensity: 0.6,
            bpm: 120,
            songMode: false,
            currentLoopCount: 0,
            complexity: 0.5,
            intent: {},
        },
        groove: {
            genreFeel: 'Rock',
            lastDrumPreset: 'Rock',
            instruments: [],
            accentMap: null,
            fillMap: null,
            sectionSeedMap: {},
            seedTimelineStartStep: 0,
            orchestrationMap: null,
        },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        arranger: {
            timeSignature: '4/4',
            sectionMap: [{ id: 'sec-intro', start: 0, end: INTRO_STEPS, label: 'Intro' }],
            stepMap: [{ start: 0, end: INTRO_STEPS, chord: { sectionId: 'sec-intro' } }],
            totalSteps: INTRO_STEPS,
        },
    };
}

describe('Intro/Outro layering — Drums NOT muted (epic-form-arrangement S5)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('the mute config keys stay within the layered non-drum roles', () => {
        // why: config-shape canary. The intro/outro layering schedule should
        // only ever carry the three non-drum roles — drums are deliberately
        // exempt so the drums-only opening / final-bar landing survive. A
        // subset check (rather than a drum-family denylist) is regression-proof:
        // ANY new key — `kick`, `ride`, `tom`, anything — fails it.
        // Scope note: this guards the config SHAPE only. A drum-mute gate added
        // inside a groove file would not surface here — the per-voice bar-scan
        // tests below are the behavior guard for that.
        const LAYERED_ROLES = ['bass', 'chords', 'harmony'];
        for (const map of [INTRO_MUTES, OUTRO_MUTES]) {
            for (const key of Object.keys(map)) {
                expect(LAYERED_ROLES, `unexpected mute role "${key}"`).toContain(key);
            }
        }
    });

    // Each percussion voice must emit somewhere inside bar 0 of the Intro —
    // drums are exempt from layering, so a hit present in the base pattern
    // (stepVal=1) is never suppressed by the intro gate. Scanning the whole
    // bar (rather than a hand-picked step) keeps the test groove-agnostic:
    // Kick lands on the downbeat, Snare on the backbeats, HiHat across the
    // 8th-note grid — all we assert is that at least one survives.
    for (const drumName of ['Kick', 'Snare', 'HiHat'] as const) {
        it(`${drumName} fires during bar 0 of the Intro (exempt from layering)`, () => {
            const mockState = makeDrumExemptState();
            getState.mockReturnValue(mockState);
            vi.spyOn(Math, 'random').mockReturnValue(0.5);

            let firedSteps = 0;
            for (let step = 0; step < STEPS_PER_BAR; step++) {
                const stepInfo = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
                const result = applyGrooveOverrides(mockState, {
                    step,
                    inst: { name: drumName, muted: false, steps: [] },
                    stepVal: 1,
                    playback: mockState.playback,
                    groove: mockState.groove,
                    isDownbeat: stepInfo.isMeasureStart,
                    isBeatStart: stepInfo.isBeatStart,
                    isPulse: stepInfo.isPulse,
                    isPulseStart: stepInfo.isPulseStart,
                    isGroupStart: stepInfo.isGroupStart,
                    isBackbeat: stepInfo.isBackbeat,
                    isOffbeat: stepInfo.isOffbeat,
                    isEOfBeat: stepInfo.isEOfBeat,
                    isAOfBeat: stepInfo.isAOfBeat,
                    beatIndex: stepInfo.beatIndex,
                    tsConfig: stepInfo.tsConfig,
                    mStep: stepInfo.mStep,
                    isCompound: false,
                    stepInGroup: 0,
                    groupIndex: 0,
                    sectionId: 'sec-intro',
                    sectionOccurrence: 1,
                    isFinalMeasure: false,
                });
                if (result.shouldPlay) {
                    firedSteps++;
                }
            }
            // why: drums are exempt from INTRO_MUTES — at least one hit must
            // survive across bar 0. A regression adding drum muting would
            // zero this out.
            expect(firedSteps).toBeGreaterThan(0);
        });
    }
});

// Reliability target: 30/30. Run via
//   for i in $(seq 1 30); do npx vitest run tests/standards/intro-outro-layering.test.ts; done
