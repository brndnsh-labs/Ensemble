import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkSectionTransition } from '../../../public/conductor.js';

// Mock state
const mockState = {
    groove: { 
        enabled: true, 
        creativity: true, 
        sectionSeedMap: {},
        genreFeel: 'Rock'
    },
    arranger: {
        totalSteps: 32,
        stepMap: [
            { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
            { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'Chorus' } }
        ],
        sections: [
            { id: 's1', label: 'Verse' },
            { id: 's2', label: 'Chorus' }
        ],
        timeSignature: '4/4'
    },
    playback: {
        bandIntensity: 0.5,
        autoIntensity: false,
        visualFlash: false
    }
};

vi.mock('../../../public/state.js', () => ({
    getState: () => mockState,
    dispatch: vi.fn((action, payload) => {
        if (action === 'SET_GROOVE_SEED') {
            mockState.groove.sectionSeedMap[payload.sectionId] = payload.seed;
        }
    })
}));

vi.mock('../../../public/fills.js', () => ({
    generateProceduralFill: () => ({})
}));

vi.mock('../../../public/ui.js', () => ({
    triggerFlash: vi.fn()
}));

describe('Groove Engine - Multi-Seed Memory', () => {
    beforeEach(() => {
        mockState.groove.sectionSeedMap = {};
        vi.clearAllMocks();
    });

    it('should assign a seed to a new section and remember it', () => {
        // Simulate transitioning to s2 (Chorus) at step 16
        // checkSectionTransition is called at the START of the measure that transitions
        // In 4/4, stepsPerMeasure is 16.
        // We call it at step 0 to schedule the measure [0-15].
        // At step 0, we look at measureEnd = 16. EffectiveStep = 15.
        // Step 15 is in s1. nextEntry is step 16 which is s2.
        
        checkSectionTransition(0, 16);
        
        // Verify seed was assigned to s2
        expect(mockState.groove.sectionSeedMap['s2']).toBeDefined();
        const firstSeed = mockState.groove.sectionSeedMap['s2'];
        
        // Call again - should not change the seed
        checkSectionTransition(0, 16);
        expect(mockState.groove.sectionSeedMap['s2']).toBe(firstSeed);
    });

    it('should use the same seed for repeating sections', () => {
        // Setup a repeating section
        mockState.arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
            { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'Chorus' } },
            { start: 32, end: 48, chord: { sectionId: 's1', sectionLabel: 'Verse' } }
        ];
        mockState.arranger.totalSteps = 48;

        // Transition to s2
        checkSectionTransition(0, 16);

        // Transition back to s1 (at step 16, looking at step 32)
        checkSectionTransition(16, 16);
        
        // Since s1 is the current section at step 0, it should have been assigned a seed if it didn't have one?
        // Wait, checkSectionTransition only assigns to NEXT section.
        // Let's manually assign s1 seed or simulate loop end.
        mockState.groove.sectionSeedMap['s1'] = 0;

        checkSectionTransition(16, 16); // Transition to s1 at step 32
        expect(mockState.groove.sectionSeedMap['s1']).toBe(0); // Should still be 0
    });
});
