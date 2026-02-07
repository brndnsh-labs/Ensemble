/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conductorState, updateAutoConductor, checkSectionTransition, applyConductor } from '../../../public/conductor.js';
import { dispatch, getState, storage } from '../../../public/state.js';

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    
    // Create distinct mock objects so we can control them
    const mockPlayback = { ...actual.playback };
    const mockArranger = { ...actual.arranger, sections: [] };
    const mockConductorState = { ...actual.conductorState };
    const mockGroove = { ...actual.groove };
    const mockSoloist = { ...actual.soloist };
    const mockHarmony = { enabled: false, buffer: new Map() };
    const mockChords = { ...actual.chords };
    const mockBass = { ...actual.bass };

    const mockStateMap = {
        playback: mockPlayback,
        arranger: mockArranger,
        conductorState: mockConductorState,
        groove: mockGroove,
        soloist: mockSoloist,
        harmony: mockHarmony,
        chords: mockChords,
        bass: mockBass
    };

    return {
        ...actual,
        ...mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn((action, payload) => {
            if (action === 'SET_BAND_INTENSITY') mockPlayback.bandIntensity = payload;
        })
    };
});

vi.mock('../../../public/ui.js', () => ({
    ui: {
        intensitySlider: { value: 0 },
        densitySelect: { value: 'standard' }
    },
    triggerFlash: vi.fn()
}));

vi.mock('../../../public/persistence.js', () => ({
    debounceSaveState: vi.fn()
}));

vi.mock('../../../public/fills.js', () => ({
    generateProceduralFill: vi.fn(() => ({}))
}));

describe('Conductor Logic', () => {
    let arranger, playback, groove;

    beforeEach(() => {
        vi.clearAllMocks();
        const state = getState();
        arranger = state.arranger;
        playback = state.playback;
        groove = state.groove;

        playback.autoIntensity = true;
        playback.isPlaying = true;
        playback.bandIntensity = 0.35;
        conductorState.target = 0.5;
        conductorState.stepSize = 0.01;
        conductorState.formIteration = 0;
        
        arranger.totalSteps = 16;
        arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'A' } }
        ];
    });

    describe('updateAutoConductor', () => {
        it('should ramp intensity towards target', () => {
            conductorState.target = 0.6;
            updateAutoConductor();
            expect(playback.bandIntensity).toBeGreaterThan(0.35);
        });

        it('should use asymmetric ramping (faster drops)', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            // Test Build
            playback.bandIntensity = 0.35;
            conductorState.target = 0.7;
            conductorState.stepSize = 0.01;
            updateAutoConductor();
            const buildDiff = playback.bandIntensity - 0.35;

            // Test Drop
            playback.bandIntensity = 0.35;
            conductorState.target = 0.1; // Lower than 0.35 to ensure a drop
            updateAutoConductor();
            const dropDiff = 0.35 - playback.bandIntensity;

            // Drop should be faster (multiplier 2.5 in code when intensity > target)
            expect(dropDiff).toBeGreaterThan(buildDiff);
        });
    });

    describe('checkSectionTransition', () => {
        it('should trigger a fill and update target energy at loop end', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            groove.enabled = true;
            checkSectionTransition(0, 16); 
            expect(conductorState.formIteration).toBeGreaterThan(0);
        });

        it('should adhere to the Grand Story macro-arc cycles', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            groove.enabled = true;
            
            // Cycle 0: Warm up (Macro Ceiling 0.45)
            conductorState.formIteration = 0;
            checkSectionTransition(0, 16);
            expect(conductorState.target).toBeLessThanOrEqual(0.45 + 0.15); 

            // Cycle 4: The Peak (Macro Floor 0.6)
            conductorState.formIteration = 4;
            checkSectionTransition(0, 16);
            expect(conductorState.target).toBeGreaterThanOrEqual(0.6 - 0.15);
        });

        it('should suppress fills if the next section is seamless', () => {
            groove.enabled = true;
            // Setup: End of Section 1 (steps 0-16), transitioning to Section 2
            arranger.stepMap = [
                { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
                { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'Chorus' } }
            ];
            arranger.totalSteps = 32;
            arranger.sections = [
                { id: 's1', seamless: false },
                { id: 's2', seamless: true } // Target has seamless flag
            ];

            // Trigger at step 0 (which maps to s1, looking ahead to s2 at step 16)
            // Wait, checkSectionTransition logic: "if (modStep % stepsPerMeasure === 0)"
            // If currentStep is 0. measureEnd is 16.
            // entry found for 0. entry is s1.
            // nextEntry found for 16. nextEntry is s2.
            // s2 is seamless. Should suppress fill.
            
            checkSectionTransition(0, 16);
            expect(dispatch).not.toHaveBeenCalledWith('TRIGGER_FILL', expect.anything());
        });
    });
});
