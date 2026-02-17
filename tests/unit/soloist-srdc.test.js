
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
const mockState = {
    soloist: {
        enabled: true,
        busySteps: 0,
        currentPhraseSteps: 0,
        notesInPhrase: 0,
        qaState: 'Question',
        srdcState: 'Conclusion',
        isResting: true,
        pitchHistory: [],
        deviceBuffer: [],
        motifBuffer: []
    },
    groove: { genreFeel: 'Jazz' },
    playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5, intent: { soloistMod: 0 } },
    arranger: { timeSignature: '4/4' },
    chords: {},
    bass: {},
    harmony: { enabled: false },
};

vi.mock('../../public/state.js', () => ({
    getState: () => mockState
}));

vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] }
    }
}));

vi.mock('../../public/utils.js', () => ({
    getFrequency: () => 440,
    getMidi: () => 60
}));

vi.mock('../../public/theory-scales.js', () => ({
    getScaleForChord: () => [0, 2, 4, 5, 7, 9, 11] // C Major
}));

import { getSoloistNote } from '../../public/soloist.js';

describe('Soloist SRDC State Machine', () => {
    
    beforeEach(() => {
        mockState.soloist.currentCell = null;
        mockState.soloist.busySteps = 0;
        mockState.soloist.isResting = true;
        mockState.soloist.currentPhraseSteps = 0;
        mockState.soloist.srdcState = 'Conclusion';
        mockState.soloist.motifBuffer = [];
    });

    it('should cycle through Statement, Restatement, Departure, Conclusion', () => {
        const chordC = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const spy = vi.spyOn(Math, 'random');
        
        // Setup: Ensure phrase starts but doesn't immediately rest
        // 1. startProb check (0.2 < 0.3 is true)
        // 2. motifProb check (not used for Conclusion -> Statement)
        // 3. restProb check (0.8 < 0.1 is false)
        spy.mockReturnValue(0.2); 
        
        // 1. Conclusion -> Statement
        mockState.soloist.srdcState = 'Conclusion';
        mockState.soloist.isResting = true;
        getSoloistNote(chordC, null, 0, 440, 60, 'scalar', 0);
        expect(mockState.soloist.srdcState).toBe('Statement');
        expect(mockState.soloist.qaState).toBe('Question');
        
        // End phrase manually
        mockState.soloist.isResting = true;
        mockState.soloist.currentPhraseSteps = 0;
        
        // 2. Statement -> Restatement
        getSoloistNote(chordC, null, 16, 440, 60, 'scalar', 0);
        expect(mockState.soloist.srdcState).toBe('Restatement');
        expect(mockState.soloist.qaState).toBe('Answer');
        
        mockState.soloist.isResting = true;
        mockState.soloist.currentPhraseSteps = 0;
        
        // 3. Restatement -> Departure
        getSoloistNote(chordC, null, 32, 440, 60, 'scalar', 0);
        expect(mockState.soloist.srdcState).toBe('Departure');
        expect(mockState.soloist.qaState).toBe('Question');
        
        mockState.soloist.isResting = true;
        mockState.soloist.currentPhraseSteps = 0;
        
        // 4. Departure -> Conclusion
        getSoloistNote(chordC, null, 48, 440, 60, 'scalar', 0);
        expect(mockState.soloist.srdcState).toBe('Conclusion');
        expect(mockState.soloist.qaState).toBe('Answer');
        
        spy.mockRestore();
    });

    it('should force motif replay during Restatement', () => {
        const chordC = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const spy = vi.spyOn(Math, 'random');
        
        // 1. Prime a motif in Statement phase
        mockState.soloist.srdcState = 'Conclusion';
        mockState.soloist.isResting = true;
        mockState.soloist.motifBuffer = [];

        // startProb=0.0 (true), motifProb=0.9 (false), restProb=0.8 (false)
        spy.mockReturnValueOnce(0.0).mockReturnValueOnce(0.9).mockReturnValue(0.8);
        
        getSoloistNote(chordC, null, 0, 440, 60, 'scalar', 0);
        expect(mockState.soloist.srdcState).toBe('Statement');
        expect(mockState.soloist.isReplayingMotif).toBe(false);
        
        // Mock a motif being captured (must be "interesting": >2 pitches or >2 range)
        mockState.soloist.motifBuffer = [
            { midi: 60, phraseStep: 0 },
            { midi: 62, phraseStep: 1 },
            { midi: 64, phraseStep: 2 }
        ];
        mockState.soloist.isResting = true;
        mockState.soloist.currentPhraseSteps = 0;
        
        // 2. Restatement forces motif replay
        // startProb=0.0 (true), motifProb=0.5 (true because Restatement motifProb is 0.95), restProb=0.8 (false)
        spy.mockReset();
        spy.mockReturnValueOnce(0.0).mockReturnValueOnce(0.5).mockReturnValue(0.8);
        
        getSoloistNote(chordC, null, 16, 440, 60, 'scalar', 0);
        expect(mockState.soloist.srdcState).toBe('Restatement');
        expect(mockState.soloist.isReplayingMotif).toBe(true);
        
        spy.mockRestore();
    });
});
