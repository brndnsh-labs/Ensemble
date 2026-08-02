// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition } from '../../../public/engine/conductor.js';
import { deriveSectionSeed } from '../../../public/engine/hash-utils.js';
import { grooveReducer, groove as realGrooveSlice } from '../../../public/state/groove.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

// Mock state
const { mockState } = vi.hoisted(() => ({
    mockState: {
        groove: {
            enabled: true,
            sectionSeedMap: {},
            genreFeel: 'Rock',
        },
        arranger: {
            totalSteps: 32,
            stepMap: [
                { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
                { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'Chorus' } },
            ],
            sections: [
                { id: 's1', label: 'Verse' },
                { id: 's2', label: 'Chorus' },
            ],
            timeSignature: '4/4',
        },
        playback: {
            bandIntensity: 0.5,
            autoIntensity: false,
            visualFlash: false,
        },
        conductor: {
            targetIntensity: 0.35,
            stepSize: 0.0005,
            form: null,
            loopCount: 0,
            formIteration: 0,
        },
    },
}));

vi.mock('../../../public/state.js', () => ({
    stateMap: mockState,
    getState: () => mockState,
    dispatch: vi.fn((action, payload) => {
        if (action === 'SET_GROOVE_SEED') {
            mockState.groove.sectionSeedMap[payload.sectionId] = payload.seed;
        }
    }),
}));

vi.mock('../../../public/engine/fills.js', () => ({
    generateProceduralFill: () => ({}),
}));

vi.mock('../../../public/ui.js', () => ({
    triggerFlash: vi.fn(),
}));

describe('Groove Engine - Multi-Seed Memory', () => {
    beforeEach(() => {
        mockState.groove.sectionSeedMap = {};
        vi.clearAllMocks();
    });

    it('should assign a seed to a new section', () => {
        checkSectionTransition(getState(), 0, 16, dispatch);

        // Verify seed was assigned to s2
        expect(mockState.groove.sectionSeedMap.s2).toBeDefined();
    });

    it('should NOT dynamically update the seed for repeating sections and should persist section memory', () => {
        // Setup a repeating section
        mockState.arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
            { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'Chorus' } },
            { start: 32, end: 48, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
        ];
        mockState.arranger.totalSteps = 48;

        // Manually seed s1 since step 0 doesn't cross a boundary to create one initially
        mockState.groove.sectionSeedMap.s1 = 0.999;

        // 1. Transition to s2 -> seed is generated. #791: it is DERIVED from
        // (sectionId, songSeed), not Math.random — so it is reproducible.
        checkSectionTransition(getState(), 0, 16, dispatch);
        expect(mockState.groove.sectionSeedMap.s2).toBe(
            deriveSectionSeed('s2', mockState.arranger.seed ?? ''),
        );

        // 2. Transition back to s1 -> seed should NOT be overwritten (remains 0.999)
        checkSectionTransition(getState(), 16, 16, dispatch);
        expect(mockState.groove.sectionSeedMap.s1).toBe(0.999);
    });

    it('#791: derives a reproducible seed from (sectionId, songSeed), not Math.random', () => {
        // Same chart + same song seed → identical section seed on every run
        // (this is the cross-device / replay reproducibility contract).
        mockState.arranger.seed = 'ABC123';
        checkSectionTransition(getState(), 0, 16, dispatch);
        const firstRun = mockState.groove.sectionSeedMap.s2;
        expect(firstRun).toBe(deriveSectionSeed('s2', 'ABC123'));

        // Re-rolling the section memory and replaying reproduces the exact seed.
        mockState.groove.sectionSeedMap = {};
        checkSectionTransition(getState(), 0, 16, dispatch);
        expect(mockState.groove.sectionSeedMap.s2).toBe(firstRun);

        // A different song seed yields a different groove marker.
        mockState.groove.sectionSeedMap = {};
        mockState.arranger.seed = 'XYZ789';
        checkSectionTransition(getState(), 0, 16, dispatch);
        expect(mockState.groove.sectionSeedMap.s2).not.toBe(firstRun);

        mockState.arranger.seed = undefined;
    });
});

// #1266 — the load-bearing runtime facts behind the section-id guard, pinned here
// because both are easy to forget and invisible in code review. The reflex fix for a
// `TABLE[untrusted]` hole is to null-prototype the table; on a STATE SLICE field that
// does not work, for two independent reasons, so the guard has to reject the KEY at
// the reader instead.
describe('a null prototype cannot protect a synced slice field (#1266)', () => {
    it('grooveReducer re-creates sectionSeedMap as a plain object on SET_SONG_SEED', () => {
        // This fires on the FIRST TOGGLE_PLAY (state-effects.ts) whenever
        // `arranger.randomizeSeed` is true — which is the default. So a hardened map
        // installed at hydration is plain again before a single bar plays.
        // The REAL groove slice — this file mocks `public/state.js`, but grooveReducer
        // closes over the actual deepSignal from `public/state/groove.js`.
        realGrooveSlice.sectionSeedMap = Object.create(null);
        expect(Object.getPrototypeOf(realGrooveSlice.sectionSeedMap)).toBeNull();

        grooveReducer({ type: ACTIONS.SET_SONG_SEED, payload: 'A1B2C3' });

        expect(Object.getPrototypeOf(realGrooveSlice.sectionSeedMap)).toBe(Object.prototype);
    });

    it('the structured-clone/toRaw hop rebuilds Object.prototype', () => {
        const hardened: Record<string, number> = Object.create(null);
        hardened.s1 = 0.5;
        expect(hardened.constructor).toBeUndefined();

        // `toRaw` (worker-client.ts) copies into a fresh `{}` before postMessage;
        // structuredClone would rebuild the prototype too. Either way the worker's
        // mirror — where groove-engine and drums-tick read — is prototype-bearing.
        const asTheWorkerSeesIt = structuredClone(hardened);

        expect(asTheWorkerSeesIt.s1).toBe(0.5);
        expect(Object.getPrototypeOf(asTheWorkerSeesIt)).toBe(Object.prototype);
        // The consequence: a section id naming a prototype member reads as a hit,
        // and it is truthy, so it defeats the `|| fallback` at every consumer.
        expect(asTheWorkerSeesIt.constructor || 0).not.toBe(0);
    });
});
