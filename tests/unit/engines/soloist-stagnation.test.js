import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSoloistNote } from '../../../public/soloist.js';
import { getState } from '../../../public/state.js';
const { soloist, playback } = getState();

// Mock config to avoid loading external files
vi.mock('../../../public/config.js', () => ({
    STYLE_CONFIG: {
        scalar: { 
            restBase: 0.1, restGrowth: 0.05, cells: [0, 2], registerSoar: 10,
            tensionScale: 0.6, timingJitter: 0, maxNotesPerPhrase: 16,
            deviceProb: 0.1, allowedDevices: [], motifProb: 0.3 
        }
    },
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' }
    }
}));

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5, intent: { soloistMod: 0 } },
        soloist: { busySteps: 0, tension: 0, mode: 'monophonic', sessionSteps: 1000, pitchHistory: [], motifBuffer: [], deviceBuffer: [] },
        groove: { genreFeel: 'Jazz' },
        arranger: { timeSignature: '4/4', totalSteps: 64 },
        chords: {},
        bass: {},
        harmony: {},
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn()
    };
    return {
        ...mockState,
        getState: () => mockState
    };
});

vi.mock('../../../public/utils.js', () => ({
    getFrequency: (m) => 440 * Math.pow(2, (m - 69) / 12),
    getMidi: (f) => Math.round(12 * Math.log2(f / 440) + 69),
    calculateTimingOffset: vi.fn(() => 0)
}));

vi.mock('../../../public/theory-scales.js', () => ({
    getScaleForChord: () => [0, 2, 4, 5, 7, 9, 11] // C Major scale
}));

describe('Soloist Stagnation Analysis', () => {
    // Pop Standard Progression (C - G - Am - F)
    const chords = [
        { rootMidi: 60, intervals: [0, 4, 7], quality: 'maj', beats: 4 }, // C
        { rootMidi: 55, intervals: [0, 4, 7], quality: 'maj', beats: 4 }, // G
        { rootMidi: 57, intervals: [0, 3, 7], quality: 'min', beats: 4 }, // Am
        { rootMidi: 53, intervals: [0, 4, 7], quality: 'maj', beats: 4 }  // F
    ];

    beforeEach(() => {
        soloist.sessionSteps = 0;
        soloist.stagnationCount = 0;
        soloist.motifBuffer.splice(0); // Clear array
        soloist.deviceBuffer.splice(0);
        soloist.busySteps = 0;
        playback.bandIntensity = 0.5;
        soloist.pitchHistory.splice(0); // Clear array
    });

    it('should not get stuck in a narrow range (trill/stagnation) for more than 4 measures', () => {
        const history = [];
        let maxRangeStagnation = 0;
        
        // Force Answer state where Root weight is high (+500)
        soloist.qaState = 'Answer';

        // Simulate ~2 minutes (approx 2000 steps at 16 steps/measure)
        for (let step = 0; step < 2000; step++) {
            const chordIdx = Math.floor((step % 64) / 16);
            const chord = chords[chordIdx];
            
            // Advance maturity
            soloist.sessionSteps++;
            
            const note = getSoloistNote(chord, null, step, 440, 60, 'scalar', step % 16, false);
            
            if (note) {
                const primary = Array.isArray(note) ? note[0] : note;
                history.push(primary.midi);
                if (history.length > 16) history.shift(); // Keep last measure

                // Check for range stagnation in the last 8 notes
                if (history.length >= 8) {
                    const recent = history.slice(-8);
                    const min = Math.min(...recent);
                    const max = Math.max(...recent);
                    if ((max - min) <= 2) {
                        maxRangeStagnation++;
                    } else {
                        maxRangeStagnation = 0;
                    }
                }
            } else {
                // Rest breaks stagnation
                maxRangeStagnation = 0;
                history.splice(0);
            }
            
            // Fail if we are stagnant for more than 32 steps (2 measures)
            expect(maxRangeStagnation).toBeLessThan(32);
        }
    });

    it('should abort motif replay if the note is dominating pitch history', () => {
        // 1. Setup a "Magnet Note" situation
        const magnetMidi = 69; // A4
        for (let i = 0; i < 20; i++) soloist.pitchHistory.push(magnetMidi); // 20/20 = 100% dominance
        
        // 2. Setup a Motif that uses this note
        soloist.motifBuffer.push({ midi: magnetMidi, durationSteps: 4 });
        soloist.isReplayingMotif = true;
        soloist.motifReplayIndex = 0;
        
        // 3. Call generator
        const chord = chords[0];
        const note = getSoloistNote(chord, null, 16, 440, 60, 'scalar', 0, false);
        
        // 4. Verification
        if (note) {
            const primary = Array.isArray(note) ? note[0] : note;
            // The logic should have picked a different note due to magnet repulsion
            expect(primary.midi).not.toBe(magnetMidi); 
        }
    });

    it('should avoid overused pitch classes even during potential replays', () => {
        // 1. Setup a PC dominance situation (various octaves of A)
        const magnetPC = 9; // A
        const magnetNotes = [45, 57, 69, 81]; 
        for (let i = 0; i < 20; i++) {
            soloist.pitchHistory.push(magnetNotes[i % 4]);
        }
        
        // 2. Setup a Motif that uses an A
        soloist.motifBuffer.push({ midi: 69, durationSteps: 4 });
        soloist.isReplayingMotif = true;
        
        // 3. Call generator
        const chord = chords[0];
        const note = getSoloistNote(chord, null, 16, 440, 60, 'scalar', 0, false);
        
        // 4. Verification
        if (note) {
            const primary = Array.isArray(note) ? note[0] : note;
            expect(primary.midi % 12).not.toBe(magnetPC); 
        }
    });
});
