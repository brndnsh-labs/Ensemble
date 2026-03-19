/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition } from '../../../public/engine/conductor.js';
import { dispatch, getState } from '../../../public/state.js';

const { arranger, playback, groove, conductor } = getState();

import { ACTIONS } from '../../../public/types.js';

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();

    // Create distinct mock objects
    const mockPlayback = { ...actual.playback };
    const mockArranger = {
        ...actual.arranger,
        sections: [
            { id: 's1', label: 'Main' },
            { id: 's2', label: 'Turnaround' },
        ],
    };
    const mockConductor = {
        targetIntensity: 0.35,
        stepSize: 0.0005,
        larsBpmOffset: 0,
        form: null,
        loopCount: 0,
        formIteration: 0,
    };
    const mockGroove = { ...actual.groove };
    const mockHarmony = { enabled: false, buffer: new Map() };
    const mockChords = { ...actual.chords };
    const mockBass = { ...actual.bass };
    const mockSoloist = { ...actual.soloist };

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

describe('Jazz Blues Intensity Bug', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.autoIntensity = true;
        playback.isPlaying = true;
        playback.bandIntensity = 0.5;
        conductor.targetIntensity = 0.5;
        conductor.stepSize = 0;
        conductor.formIteration = 0;
        groove.enabled = true;
    });

    it('should trigger intensity change for 12-bar blues (1 chord per measure)', () => {
        // 12 bars of 16 steps = 192 steps
        arranger.totalSteps = 192;
        arranger.stepMap = [];
        for (let i = 0; i < 12; i++) {
            arranger.stepMap.push({
                start: i * 16,
                end: (i + 1) * 16,
                chord: { sectionId: 's1', sectionLabel: 'Main' },
            });
        }

        // Check at the start of the last measure (step 176)
        checkSectionTransition(176, 16);

        // In 12-bar blues, step 176 should match fillStart (192 - 16 = 176)
        expect(conductor.formIteration).toBe(1);
        expect(conductor.targetIntensity).not.toBe(0.5);
    });

    it('should trigger intensity change for Jazz Blues (2 chords in last measure) - Loop End', () => {
        // 12 bars total = 192 steps.
        // Last bar (steps 176 to 192) has two chords.
        arranger.totalSteps = 192;
        arranger.stepMap = [];
        // Bars 1-11
        for (let i = 0; i < 11; i++) {
            arranger.stepMap.push({
                start: i * 16,
                end: (i + 1) * 16,
                chord: { sectionId: 's1', sectionLabel: 'Main' },
            });
        }
        // Bar 12 (Last Bar): Two chords of 8 steps each
        arranger.stepMap.push({
            start: 176,
            end: 184,
            chord: { sectionId: 's1', sectionLabel: 'Main' },
        });
        arranger.stepMap.push({
            start: 184,
            end: 192,
            chord: { sectionId: 's1', sectionLabel: 'Main' },
        });

        // We check every step in the last bar to see if it triggers
        let triggered = false;
        for (let step = 176; step < 192; step++) {
            checkSectionTransition(step, 16);
            if (conductor.formIteration > 0) {
                triggered = true;
                break;
            }
        }

        expect(triggered).toBe(true);
    });

    it('should detect transition when measure ends with a different section (Split Turnaround)', () => {
        // Setup: 2 measures. 32 steps total.
        // Measure 1 (0-16): Split. 0-8 (Main/s1), 8-16 (Turnaround/s2).
        // Measure 2 (16-32): Main/s1.

        arranger.totalSteps = 32;
        arranger.stepMap = [
            { start: 0, end: 8, chord: { sectionId: 's1', sectionLabel: 'Main' } },
            { start: 8, end: 16, chord: { sectionId: 's2', sectionLabel: 'Turnaround' } },
            { start: 16, end: 32, chord: { sectionId: 's1', sectionLabel: 'Main' } },
        ];

        // Check at step 0 (Start of Measure 1)
        checkSectionTransition(0, 16);

        // Expectation: TRIGGER_FILL should be dispatched
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.TRIGGER_FILL, expect.anything());
    });
});
