// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition } from '../../../public/engine/conductor.js';
import { deriveSectionSeed } from '../../../public/engine/hash-utils.js';
import { dispatch, getState } from '../../../public/state.js';

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
