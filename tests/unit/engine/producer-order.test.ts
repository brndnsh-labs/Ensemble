// @ts-nocheck
// tests/unit/engine/producer-order.test.ts
//
// Guards the producer call order invariant in tick-logic.ts:
//   drum-preamble → soloist producer → bass producer → chords producer → harmony
//
// If someone reorders the producers (e.g. harmony before soloist), this test
// fails because `coordination.soloistMidi` will be 0 when getHarmonyNotes runs.
//
// Strategy: mock getSoloistNote to return a deterministic non-zero midi=72 so the
// test is isolated from the full soloist-engine stack. Spy on getHarmonyNotes to
// capture the coordination object it receives. Assert coordination.soloistMidi > 0.
//
// Source: docs/audit/harmony-coordination.md P1 #10;
//         docs/audit/epic-coordination-contract.md S6.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── hoisted helpers ──────────────────────────────────────────────────────────
const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Capture the harmony spy across test scope.
let harmonyCoordinationArg: any = null;

// ── module mocks ─────────────────────────────────────────────────────────────
// Mock the soloist to return a deterministic non-rest note (midi=72, F5).
// why: sidesteps the full soloist engine so a change there can't mask a
// reordering regression. We only need the producer to have written
// coordination.soloistMidi before harmony runs.
vi.mock('../../../public/engine/soloist.js', () => ({
    getSoloistNote: vi.fn(() => ({
        midi: 72,
        freq: 523.25,
        velocity: 0.7,
        durationSteps: 2,
        isBusy: true,
        isDoubleStop: false,
    })),
}));

// Spy on getHarmonyNotes to capture the coordination arg it receives.
vi.mock('../../../public/engine/harmonies.js', () => ({
    getHarmonyNotes: vi.fn((...args) => {
        // args[8] is the coordination context per getHarmonyNotes signature:
        // (state, chord, nextChord, step, octave, style, stepInChord, soloResult, coordination, stepInfo)
        harmonyCoordinationArg = args[8];
        return [];
    }),
    clearHarmonyMemory: vi.fn(),
}));

// Minimal config mock.
vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

// Silence the bass engine (not the module under test here).
vi.mock('../../../public/engine/bass-engine.js', () => ({
    getBassNote: vi.fn(() => null),
    isBassActive: vi.fn(() => false),
}));

// Silence the accompaniment engine.
vi.mock('../../../public/engine/accompaniment.js', () => ({
    getAccompanimentNotes: vi.fn(() => []),
}));

// Silence the groove engine overrides (avoid grooves mutating anything).
vi.mock('../../../public/engine/groove-engine.js', () => ({
    applyGrooveOverrides: vi.fn(() => ({
        shouldPlay: false,
        velocity: 0,
        soundName: '',
        instTimeOffset: 0,
    })),
    calculatePocketOffset: vi.fn(() => 0),
}));

// ── imports (after mocks) ────────────────────────────────────────────────────
import { getHarmonyNotes } from '../../../public/engine/harmonies.js';
import { generateNotesForStep } from '../../../public/engine/tick-logic.js';
import { getFrequency } from '../../../public/utils.js';

// ── fixtures ─────────────────────────────────────────────────────────────────
const CHORD_C = {
    rootMidi: 60,
    quality: 'maj7',
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [261.63, 329.63, 392.0, 493.88],
    sectionId: 'A',
};

function makeState() {
    // Minimal EnsembleState sufficient for generateNotesForStep to reach all
    // five producer blocks. The shape mirrors existing test fixtures
    // (see logic-worker-core.test.ts, bass-section-anticipation.test.ts).
    const mockChord = CHORD_C;
    return {
        arranger: {
            totalSteps: 16,
            timeSignature: '4/4',
            measureMap: [{ start: 0, end: 16 }],
            sectionMap: [{ start: 0, end: 16, chord: mockChord }],
            stepMap: [{ start: 0, end: 16, chord: mockChord, sectionStart: 0, sectionEnd: 16 }],
            progression: [mockChord],
            key: 'C',
            isMinor: false,
        },
        chords: {
            enabled: true,
            style: 'smart',
            volume: 0.5,
        },
        bass: {
            enabled: false, // keep bass silent; not needed for this guard
            style: 'smart',
            volume: 0.5,
            lastFreq: null,
            octave: 0,
        },
        soloist: makeSoloistMock({
            enabled: true,
            style: 'smart',
            volume: 0.5,
            octave: 0,
            isResting: false, // soloist is active this tick
            busySteps: 4,
            notesInPhrase: 1,
        }),
        harmony: {
            enabled: true,
            style: 'smart',
            volume: 0.5,
            complexity: 0.5,
            octave: 0,
            lastMidis: [],
        },
        groove: {
            enabled: false, // drums silent; not needed for this guard
            measures: 1,
            instruments: [],
            fillActive: false,
        },
        playback: {
            bpm: 120,
            bandIntensity: 0.6,
            intent: {},
        },
    } as any;
}

// ── tests ─────────────────────────────────────────────────────────────────────
describe('Producer order guard', () => {
    beforeEach(() => {
        harmonyCoordinationArg = null;
        vi.clearAllMocks();
    });

    it('coordination.soloistMidi is non-zero when harmony receives the context (soloist ran before harmony)', () => {
        // why: this is the core producer-order invariant. updateCoordinationContext('soloist')
        // at tick-logic.ts:318 must run before getHarmonyNotes at tick-logic.ts:409.
        // If the order is reversed, soloistMidi stays 0 and harmony's yielding logic
        // (harmonies.ts:335, 349, 361, 364, 443) breaks silently.
        const state = makeState();
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };

        generateNotesForStep(state, 0, cursors, {
            includeSoloist: true,
            includeHarmony: true,
            includeBass: false,
            includeChords: false,
            includeDrums: false,
        });

        // getHarmonyNotes must have been called
        expect(harmonyCoordinationArg).not.toBeNull();

        // The coordination arg must carry the soloist's midi — proving soloist ran first
        // (coordination.soloistMidi is written by updateCoordinationContext('soloist'))
        expect(harmonyCoordinationArg.soloistMidi).toBe(72);
    });

    it('coordination.soloistMidi is 0 when soloist is disabled (sanity / negative control)', () => {
        // why: confirms the assertion above is meaningful — if the soloist is disabled
        // (not run), soloistMidi stays 0, so the positive test above is only green
        // because the soloist actually did run before harmony.
        const state = makeState();
        (state as any).soloist.enabled = false;
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };

        generateNotesForStep(state, 0, cursors, {
            includeSoloist: false,
            includeHarmony: true,
            includeBass: false,
            includeChords: false,
            includeDrums: false,
        });

        expect(harmonyCoordinationArg).not.toBeNull();
        // Soloist was skipped — soloistMidi must remain 0
        expect(harmonyCoordinationArg.soloistMidi).toBe(0);
    });

    it('#709 (B8) — harmony freq is recomputed from the register-clamped midi', () => {
        // The harmony engine voices freq pre-clamp (getBestInversion max:100); the
        // tick's enforceRegisterSlotting then pulls a too-high midi down to ≤84.
        // freq must follow the clamped midi, or the pad sounds an octave high and
        // the visualizer falls out of sync. Return a deliberately out-of-slot
        // voice (95) to force the clamp.
        vi.mocked(getHarmonyNotes).mockReturnValueOnce([
            { midi: 95, freq: getFrequency(95), velocity: 0.5, durationSteps: 1 } as any,
        ]);
        const state = makeState();
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };

        const { notes } = generateNotesForStep(state, 0, cursors, {
            includeSoloist: false,
            includeHarmony: true,
            includeBass: false,
            includeChords: false,
            includeDrums: false,
        });

        const harm = notes.find((n: any) => n.module === 'harmony');
        expect(harm).toBeDefined();
        // Clamped into the harmony slot...
        expect(harm.midi).toBeLessThanOrEqual(84);
        // ...and freq recomputed to match (was stale at the pre-clamp pitch).
        expect(harm.freq).toBeCloseTo(getFrequency(harm.midi), 6);
        expect(harm.freq).not.toBeCloseTo(getFrequency(95), 6);
    });
});
