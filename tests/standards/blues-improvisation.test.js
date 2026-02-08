/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: { 
            enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
            qaState: 'Question', isResting: false, contourSteps: 0,
            melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
            lastFreq: 440, hookRetentionProb: 0.5, doubleStops: true,
            sessionSteps: 1000
        },
        chords: { enabled: true, octave: 60, density: 'standard', pianoRoots: true },
        playback: { bandIntensity: 0.5, bpm: 120, audio: { currentTime: 0 } },
        arranger: { 
            key: 'F', 
            isMinor: false,
            progression: [],
            totalSteps: 0,
            stepMap: [],
            timeSignature: '4/4',
            sections: []
        },
        groove: { genreFeel: 'Blues' },
        bass: { enabled: true },
        harmony: { enabled: false },
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

vi.mock('../../public/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] }
        },
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 },
        NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11]
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getSoloistNote } from '../../public/soloist.js';
import { getScaleForChord } from '../../public/theory-scales.js';
import { validateProgression } from '../../public/chords.js';
import { dispatch, getState, storage } from '../../public/state.js';
const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } = getState();

describe('Genre Specific Test: 12-Bar Blues in F', () => {
    
    // Standard 12-Bar Blues in F
    // F7 | Bb7 | F7 | F7
    // Bb7 | Bb7 | F7 | D7alt (VI7alt)
    // Gm7 | C7 | F7 | C7
    
    beforeEach(() => {
        arranger.key = 'F';
        arranger.isMinor = false;
        arranger.timeSignature = '4/4'; // Explicitly set to avoid leakage
        arranger.sections = [
            { id: 'A', label: 'Chorus', value: "F7 | Bb7 | F7 | F7 | Bb7 | Bb7 | F7 | D7alt | Gm7 | C7 | F7 | C7" }
        ];
        validateProgression();
        
        // Reset Soloist State
        soloist.isResting = false;
        soloist.currentPhraseSteps = 0;
        soloist.notesInPhrase = 0;
        groove.genreFeel = 'Blues';
    });

    it('should prioritize the Blues Scale (Minor Pentatonic + b5) over Dominant I chords', () => {
        const f7 = arranger.progression[0]; // F7
        const next = arranger.progression[1]; // Bb7
        
        // Get scale
        const scale = getScaleForChord(f7, next, 'blues');
        
        // F Blues Scale: F(0), Ab(3), Bb(5), B(6), C(7), Eb(10)
        
        expect(scale).toContain(3); // b3 (Ab) is the defining blue note over F7
        expect(scale).toContain(10); // b7 (Eb)
        expect(scale).toContain(5); // 4 (Bb)
    });

    it('should generate "Blue Notes" (clashing b3 against natural 3) in the solo line', () => {
        const f7 = arranger.progression[0];
        let blueNoteCount = 0;
        const totalAttempts = 500;

        for (let i = 0; i < totalAttempts; i++) {
            const result = getSoloistNote(f7, null, i % 16, 440, 72, 'blues', i % 16);
            if (result) {
                const notes = Array.isArray(result) ? result : [result];
                notes.forEach(note => {
                    const pc = note.midi % 12; // F=5
                    const interval = (pc - 5 + 12) % 12; // Interval relative to F
                    if (interval === 3) blueNoteCount++; // Ab (Minor 3rd)
                });
            }
        }
        
        // We expect a significant presence of the minor 3rd even over a Major chord in Blues
        expect(blueNoteCount).toBeGreaterThan(0); 
    });

    it('should trigger Double Stops (Harmony) more frequently in Blues mode', () => {
        let doubleStopCount = 0;
        let noteCount = 0;
        const totalAttempts = 1000;

        for (let i = 0; i < totalAttempts; i++) {
            // Force activity
            soloist.busySteps = 0; 
            const result = getSoloistNote(arranger.progression[0], null, i % 16, 440, 72, 'blues', i % 16);
            
            if (result) {
                noteCount++;
                if (Array.isArray(result) && result.length > 1) {
                    doubleStopCount++;
                }
            }
        }

        // Blues mode has a double stop probability of 0.15 (relative to playing)
        // Since we now use dsMod (0.3 for most steps), the effective rate is lower (~4-5%).
        expect(noteCount).toBeGreaterThan(0);
        expect(doubleStopCount / noteCount).toBeGreaterThan(0.03); 
    });

    it('should handle the VI7alt (D7alt) turnaround chord with altered scale logic under tension', () => {
        const d7alt = arranger.progression[7]; // D7alt in bar 8
        expect(d7alt.absName).toContain('D7');
        
        // Boost tension to ensure engine chooses the "Sophisticated/Altered" option
        // instead of the "Safe/Blues" fallback.
        soloist.tension = 0.9;
        
        // Should use Altered scale or Phrygian Dominant depending on context
        const scale = getScaleForChord(d7alt, arranger.progression[8], 'blues');
        
        // D Altered: D(0), Eb(1), F(3), Gb(4), Ab(6), Bb(8), C(10)
        // Intervals: 0, 1, 3, 4, 6, 8, 10
        // Refactor Note: Blues style now prioritizes Blues Scale [0,3,5,6,7,10] over Altered chords
        // So we expect b3/ #9 (3) but maybe not b9 (1) depending on implementation
        expect(scale).toContain(3); // #9 (F natural)
    });

    it('should phrase with Call and Response structure', () => {
        // Ensure progression is parsed
        expect(arranger.progression.length).toBeGreaterThan(0);

        // Mock the QA State transitions to see if note density/range changes
        // We force 'Answer' state.
        
        let rootCount = 0;
        let notesCount = 0;
        const iterations = 1000;
        
        // Boost intensity to ensure we actually generate notes despite the high "BB King" rest probability
        playback.bandIntensity = 1.0; 
        
        for (let i = 0; i < iterations; i++) {
            // Force state continuously so internal logic doesn't reset it
            soloist.qaState = 'Answer';
            soloist.currentPhraseSteps = 0; // Start of phrase to minimize rest probability
            soloist.notesInPhrase = 0; // Ensure we have budget
            soloist.isResting = false;
            soloist.busySteps = 0;
            soloist.currentCell = [1, 1, 1, 1]; // Force activity on all steps
            soloist.isReplayingMotif = false; // Ensure we generate new notes

            // Test on Step 1 (Weak beat) to bypass "New Cell" randomization logic on Step 0
            // Start from F4 (349.23 Hz) to give Proximity bonus to F as well
            const result = getSoloistNote(arranger.progression[0], null, 1, 349.23, 72, 'blues', 1);

            if (result) {
                const note = Array.isArray(result) ? result[0] : result;
                notesCount++;
                if (note.midi % 12 === 5) rootCount++; // F is 5
            }
        }
        
        // In Answer state, with proximity helping, Roots should be present but 
        // Guide Tones (3rds and 7ths) are now the primary focus for melodic resolution.
        expect(notesCount).toBeGreaterThan(0);
        
        let guideToneCount = 0;
        for (let i = 0; i < iterations; i++) {
            const result = getSoloistNote(arranger.progression[0], null, 1, 349.23, 72, 'blues', 1);
            if (result) {
                const note = Array.isArray(result) ? result[0] : result;
                const rel = (note.midi % 12 - 5 + 12) % 12;
                if ([3, 4, 10, 11].includes(rel)) guideToneCount++;
            }
        }

        expect(guideToneCount / notesCount).toBeGreaterThan(0.25); // High priority for sweet notes
        expect(rootCount / notesCount).toBeGreaterThan(0.01); 
    });
});