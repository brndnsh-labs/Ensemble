import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote, resetSoloistState } from '../../../public/engine/soloist.js';
import * as pitchEngine from '../../../public/engine/soloist-pitch-engine.js';
import { getState } from '../../../public/state.js';

vi.mock('../../../public/state.js', () => ({
    getState: vi.fn(),
}));

vi.mock('../../../public/engine/soloist-pitch-engine.js', () => ({
    selectPitchAndDevices: vi.fn().mockReturnValue({ midi: 60, durationSteps: 4 }),
}));

vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

describe('Soloist Engine', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: {
                bandIntensity: 0.5,
                currentLoopCount: 0,
            },
            groove: { genreFeel: 'Jazz', pocket: 0 },
            soloist: {
                mode: 'guitar',
                isResting: true,
                busySteps: 0,
                sessionSeed: {
                    loopLengthSteps: 16,
                    notes: [
                        { step: 0, midi: 72, durationSteps: 4, velocity: 0.8 },
                        { step: 8, midi: 74, durationSteps: 2, velocity: 0.9 },
                    ],
                },
            },
            arranger: { timeSignature: '4/4', totalSteps: 16 },
        };
        getState.mockReturnValue(mockState);
    });

    it('should bypass rhythm engine on Loop 0 and yield seed notes directly', () => {
        const mockChord = { rootMidi: 60, intervals: [0, 4, 7] };

        // Check step 0 (should match seed)
        getSoloistNote(mockState, mockChord, null, 0, null, 4, 'scalar', 0, {});

        expect(pitchEngine.selectPitchAndDevices).toHaveBeenCalled();
        const callArgs = pitchEngine.selectPitchAndDevices.mock.calls[0];
        const pseudoRhythmNode = callArgs[2];

        expect(pseudoRhythmNode.isHeadBypass).toBe(true);
        expect(pseudoRhythmNode.targetMidi).toBe(72);
        expect(pseudoRhythmNode.durationSteps).toBe(4);
    });

    it('should rest if no seed note exists at current step in Loop 0', () => {
        const mockChord = { rootMidi: 60, intervals: [0, 4, 7] };

        // Step 1 has no note in the seed array
        const result = getSoloistNote(mockState, mockChord, null, 1, null, 4, 'scalar', 1, {});

        expect(result).toBeNull();
        expect(pitchEngine.selectPitchAndDevices).not.toHaveBeenCalled();
    });

    it('should fallback to normal generative engine on Loop 1+', () => {
        const mockChord = { rootMidi: 60, intervals: [0, 4, 7] };
        mockState.playback.currentLoopCount = 1;
        mockState.soloist.isResting = false; // Force it to generate a plan
        mockState.soloist.activeSteps = 16;

        getSoloistNote(mockState, mockChord, null, 0, null, 4, 'scalar', 0, {});

        // Pitch engine should be called, but WITHOUT the head bypass flag
        expect(pitchEngine.selectPitchAndDevices).toHaveBeenCalled();
        const callArgs = pitchEngine.selectPitchAndDevices.mock.calls[0];
        const rhythmNode = callArgs[2];

        expect(rhythmNode.isHeadBypass).toBeUndefined();
    });
});
