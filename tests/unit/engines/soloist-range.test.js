import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSoloistNote } from '../../../public/soloist.js';
import { getState } from '../../../public/state.js';
const { soloist } = getState();

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5 },
        soloist: { busySteps: 0, tension: 0, mode: 'monophonic', sessionSteps: 1000, pitchHistory: [], motifBuffer: [], deviceBuffer: [] },
        groove: { genreFeel: 'Rock' },
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

vi.mock('../../../public/config.js', () => {
    const STYLE_CONFIG = {
        scalar: { deviceProb: 0, cells: [0], allowedDevices: [], registerSoar: 5, restBase: 0, restGrowth: 0, doubleStopProb: 0, maxNotesPerPhrase: 100 }
    };
    return {
        STYLE_CONFIG,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] }
        }
    };
});

describe('Soloist Range Constraints', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };

    beforeEach(() => {
        soloist.isResting = false;
        soloist.currentPhraseSteps = 1;
        soloist.notesInPhrase = 0;
        soloist.busySteps = 0;
        soloist.deviceBuffer = [];
        soloist.lastInterval = 0;
        soloist.sessionSteps = 1000;
        soloist.tension = 0;
        soloist.currentCell = [1, 1, 1, 1]; // Always play 16ths
    });

    it('should generally stay above G3 (MIDI 55), with rare exceptions', () => {
        let violations = 0;
        let totalNotes = 0;
        let lowestMidi = 127;
        // Start at the floor (MIDI 55) to test stability
        let lastFreq = 440 * Math.pow(2, (55 - 69) / 12); 

        // Generate a large sample of notes
        for(let i=0; i<1000; i++) {
            const note = getSoloistNote(chordC, null, 16, lastFreq, 64, 'scalar', 0);
            if (note) {
                const primary = Array.isArray(note) ? note[0] : note;
                totalNotes++;
                
                if (primary.midi < 55) {
                    violations++;
                }
                if (primary.midi < lowestMidi) lowestMidi = primary.midi;
                
                // If the engine picks a note, use that as the next "prevFreq"
                lastFreq = 440 * Math.pow(2, (primary.midi - 69) / 12);
            }
        }
        
        console.log(`Violations (<55): ${violations}/${totalNotes} (${((violations/totalNotes)*100).toFixed(2)}%)`);
        console.log('Lowest MIDI observed:', lowestMidi);

        // 1. It should generally respect the floor (allow < 5% for slides/ornaments)
        expect(violations / totalNotes).toBeLessThan(0.05);

        // 2. It should NEVER go ridiculously low (e.g. below E3/52)
        expect(lowestMidi).toBeGreaterThanOrEqual(52); 
    });
});
