import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition } from '../../../public/conductor.js';

// Mock state
const mockState = {
    groove: {
        enabled: true,
        creativity: true,
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
};

vi.mock('../../../public/state.js', () => ({
    getState: () => mockState,
    dispatch: vi.fn((action, payload) => {
        if (action === 'SET_GROOVE_SEED') {
            mockState.groove.sectionSeedMap[payload.sectionId] = payload.seed;
        }
    }),
}));

vi.mock('../../../public/fills.js', () => ({
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
        checkSectionTransition(0, 16);

        // Verify seed was assigned to s2
        expect(mockState.groove.sectionSeedMap.s2).toBeDefined();
    });

    it('should dynamically update the seed for repeating sections based on intensity', () => {
        // Setup a repeating section
        mockState.arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
            { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'Chorus' } },
            { start: 32, end: 48, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
        ];
        mockState.arranger.totalSteps = 48;

        // 1. High intensity transition to s2 -> likely seed 2 (Driven)
        mockState.playback.bandIntensity = 0.99; // force high
        // Force Math.random to always pick the highest probability path for high intensity (< 0.7 = seed 2)
        vi.spyOn(Math, 'random').mockReturnValue(0.1);
        checkSectionTransition(0, 16);
        expect(mockState.groove.sectionSeedMap.s2).toBe(2);

        // 2. Low intensity transition back to s1 -> likely seed 1 (Sparse)
        mockState.playback.bandIntensity = 0.1; // force low
        // Force Math.random to pick seed 1 (< 0.6 = seed 1)
        vi.spyOn(Math, 'random').mockReturnValue(0.1);
        checkSectionTransition(16, 16);
        expect(mockState.groove.sectionSeedMap.s1).toBe(1);

        // Restore random
        vi.restoreAllMocks();
    });
});
