import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state and global config
const mockState = {
    soloist: {
        enabled: true,
        busySteps: 0,
        currentPhraseSteps: 0,
        notesInPhrase: 0,
        qaState: 'Question',
        isResting: false,
        pitchHistory: [],
        deviceBuffer: [],
        motifBuffer: [],
    },
    groove: { genreFeel: 'Jazz' },
    playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5, intent: { soloistMod: 0 } },
    arranger: { timeSignature: '4/4' },
    chords: {},
    bass: {},
    harmony: { enabled: false },
};

vi.mock('../../public/state.js', () => ({
    getState: () => mockState,
}));

vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] },
    },
}));

vi.mock('../../public/utils.js', () => ({
    getFrequency: () => 440,
    getMidi: () => 60,
    calculateTimingOffset: vi.fn(() => 0),
}));

vi.mock('../../public/theory-scales.js', () => ({
    getScaleForChord: () => [0, 2, 4, 5, 7, 9, 11], // C Major
}));

import { getSoloistNote } from '../../public/soloist.js';

describe('Soloist Logic Improvements', () => {
    beforeEach(() => {
        mockState.soloist.currentCell = null;
        mockState.soloist.busySteps = 0;
        mockState.soloist.isResting = false;
        mockState.soloist.currentPhraseSteps = 10;
        mockState.soloist.deviceBuffer = [];
    });

    it('should initialize a rhythmic cell even mid-beat (pickup logic)', () => {
        const chordC = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        // Force start in resting state
        mockState.soloist.isResting = true;
        mockState.soloist.currentPhraseSteps = 0;

        // Force Math.random to return 0.0 so startProb check passes
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.0);

        getSoloistNote(chordC, null, 3, 440, 60, 'scalar', 3);

        expect(mockState.soloist.currentCell).not.toBeNull();

        // The cell MUST have a hit on index 3 if our filtering worked
        if (mockState.soloist.currentCell) {
            expect(mockState.soloist.currentCell[3]).toBe(1);
        }
        spy.mockRestore();
    });

    it('should calculate voice leading without crashing for non-bird styles', () => {
        const chordC = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const chordF = { rootMidi: 65, intervals: [0, 4, 7], beats: 4 };

        // Approaching change: stepInChord = 14 (Last 2 steps of 16-step bar)
        // style 'scalar' previously skipped voice leading logic

        const res = getSoloistNote(chordC, chordF, 14, 440, 60, 'scalar', 14);

        // We just ensure it runs. Result might be null if it rests, but logic path is exercised.
        expect(res === null || typeof res === 'object').toBe(true);
    });
});
