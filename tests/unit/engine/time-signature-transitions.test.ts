// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition } from '../../../public/engine/conductor.js';
import { dispatch, getState } from '../../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();

    // Create distinct mock objects
    const mockPlayback = { ...actual.playback };
    const mockArranger = { ...actual.arranger, sections: [] };
    const mockConductor = {
        targetIntensity: 0.35,
        stepSize: 0.0005,
        form: null,
        loopCount: 0,
        formIteration: 0,
    };
    const mockGroove = { ...actual.groove };
    const mockHarmony = { enabled: false, buffer: new Map() };
    const mockChords = { ...actual.chords };
    const mockBass = { ...actual.bass };
    const mockSoloist = makeSoloistMock({ ...actual.soloist });

    const mockStateMap = {
        playback: mockPlayback,
        arranger: mockArranger,
        conductor: mockConductor,
        groove: mockGroove,
        harmony: mockHarmony,
        chords: mockChords,
        bass: mockBass,
        soloist: mockSoloist,
    };

    return {
        ...actual,
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn((action, payload) => {
            if (action === 'SET_BAND_INTENSITY') {
                mockPlayback.bandIntensity = payload;
            } else if (action === 'UPDATE_CONDUCTOR_STATE') {
                Object.assign(mockConductor, payload);
            }
        }),
    };
});

vi.mock('../../../public/ui.js', () => ({
    ui: {
        intensitySlider: { value: 0 },
        densitySelect: { value: 'standard' },
    },
    triggerFlash: vi.fn(),
}));

vi.mock('../../../public/persistence.js', () => ({
    debounceSaveState: vi.fn(),
}));

vi.mock('../../../public/engine/fills.js', () => ({
    generateProceduralFill: vi.fn(() => ({})),
}));

describe('Time Signature Transitions', () => {
    let arranger, playback, groove, conductor;

    beforeEach(() => {
        vi.clearAllMocks();
        const state = getState();
        arranger = state.arranger;
        playback = state.playback;
        groove = state.groove;
        conductor = state.conductor;

        playback.autoIntensity = true;
        playback.isPlaying = true;
        playback.bandIntensity = 0.5;
        conductor.targetIntensity = 0.5;
        conductor.stepSize = 0;
        conductor.formIteration = 0;
        conductor.loopCount = 0;
        groove.enabled = true;
    });

    it('should trigger transition for 3/4 time (12 steps per measure)', () => {
        const stepsPerMeasure = 12;
        // Use 8 bars to exceed the 64-step "short loop" threshold (8 * 12 = 96)
        arranger.totalSteps = 96;
        arranger.stepMap = [];
        for (let i = 0; i < 8; i++) {
            arranger.stepMap.push({
                start: i * stepsPerMeasure,
                end: (i + 1) * stepsPerMeasure,
                chord: { sectionId: 's1', sectionLabel: 'Main' },
            });
        }

        // Check at the start of the last measure (step 84)
        checkSectionTransition(getState(), 84, stepsPerMeasure, dispatch);

        expect(conductor.formIteration).toBe(1);
        expect(conductor.targetIntensity).not.toBe(0.5);
    });

    it('should trigger transition for 5/4 time (20 steps per measure)', () => {
        const stepsPerMeasure = 20;
        // 4 bars of 5/4 = 80 steps
        // The dynamic threshold is `stepsPerMeasure * 4` = 80 steps
        // This is a "short loop", so `shouldFill` logic triggers based on `conductor.loopCount` logic
        // For intensity 0.5 (playback.bandIntensity = 0.5), freq is 2. Loop count needs to be % 2 === 0
        // We ensure loop count allows the fill target re-calculation.
        conductor.loopCount = 1;

        arranger.totalSteps = 80;
        arranger.stepMap = [];
        for (let i = 0; i < 4; i++) {
            arranger.stepMap.push({
                start: i * stepsPerMeasure,
                end: (i + 1) * stepsPerMeasure,
                chord: { sectionId: 's1', sectionLabel: 'Main' },
            });
        }

        // Check at the start of the last measure (step 60)
        checkSectionTransition(getState(), 60, stepsPerMeasure, dispatch);

        expect(conductor.formIteration).toBe(1);
        expect(conductor.targetIntensity).not.toBe(0.5);
    });

    it('should trigger transition for 6/8 time (12 steps per measure)', () => {
        const stepsPerMeasure = 12;
        // 8 bars of 6/8 = 96 steps
        arranger.totalSteps = 96;
        arranger.stepMap = [];
        for (let i = 0; i < 8; i++) {
            arranger.stepMap.push({
                start: i * stepsPerMeasure,
                end: (i + 1) * stepsPerMeasure,
                chord: { sectionId: 's1', sectionLabel: 'Main' },
            });
        }

        // Check at the start of the last measure (step 84)
        checkSectionTransition(getState(), 84, stepsPerMeasure, dispatch);

        expect(conductor.formIteration).toBe(1);
        expect(conductor.targetIntensity).not.toBe(0.5);
    });
});
