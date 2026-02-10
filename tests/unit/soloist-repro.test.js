
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
        sessionSteps: 0
    },
    groove: { genreFeel: 'Rock' },
    playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5 },
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
    getFrequency: (midi) => 440 * Math.pow(2, (midi - 69) / 12),
    getMidi: (freq) => Math.round(12 * Math.log2(freq / 440) + 69)
}));

vi.mock('../../public/theory-scales.js', () => ({
    getScaleForChord: () => [0, 2, 4, 5, 7, 9, 11] // C Major
}));

import { getSoloistNote } from '../../public/soloist.js';

describe('Soloist Motif Repetition Repro', () => {
    
    beforeEach(() => {
        mockState.soloist = {
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            qaState: 'Question',
            isResting: false,
            pitchHistory: [],
            deviceBuffer: [],
            motifBuffer: [],
            sessionSteps: 0,
            lastFreq: 440
        };
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    it('should show increased motif replay likelihood after history buffer fills', () => {
        const chordC = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        
        // Scenario: We want to see how many times isReplayingMotif is true 
        // in the first 128 steps vs the next 128 steps.
        
        let replayCountEarly = 0;
        let replayCountLate = 0;
        
        // Mock Math.random to favor motif replaying but still allow some variety
        // motifProb for 'scalar' (Rock) is 0.3
        // restProb is around 0.3-0.5
        // startProb is 0.3 + 0.5*0.4 = 0.5
        
        const randomSpy = vi.spyOn(Math, 'random');
        
        // Sequence of random values to:
        // 1. Start a phrase (random < 0.5)
        // 2. Not motif replay initially (random > 0.3)
        // 3. Play some notes
        // 4. End phrase (random < restProb)
        // 5. Start next phrase
        // 6. Try motif replay (random < 0.3)
        
        let step = 0;
        const runSimulation = (steps) => {
            let replayingCount = 0;
            for (let i = 0; i < steps; i++) {
                // Adjust random to encourage phrase cycles
                randomSpy.mockImplementation(() => {
                    if (mockState.soloist.isResting) return 0.1; // Force start
                    if (mockState.soloist.currentPhraseSteps === 0) return 0.1; // Force motif replay check
                    if (mockState.soloist.currentPhraseSteps > 12) return 0.01; // Force end phrase
                    return 0.5; // Normal play
                });
                
                getSoloistNote(chordC, null, step, mockState.soloist.lastFreq, 60, 'scalar', step % 16);
                if (mockState.soloist.isReplayingMotif) replayingCount++;
                step++;
            }
            return replayingCount;
        };

        replayCountEarly = runSimulation(128);
        replayCountLate = runSimulation(128);

        console.log(`Replay Count Early: ${replayCountEarly}`);
        console.log(`Replay Count Late: ${replayCountLate}`);
        
        // If the bug exists, replayCountLate should be significantly higher because 
        // the "stale" check (count / historyLen > 0.35) fails to trigger.
        // Actually, the check is inside isReplayingMotif block, it TURNS OFF replaying if stale.
        // So if it's NOT stale, it stays on.
        // If the check is weak, it stays on more often.
        
        expect(replayCountLate).toBeGreaterThanOrEqual(replayCountEarly);
    });
});
