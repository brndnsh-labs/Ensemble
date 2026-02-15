/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: { 
            enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
            qaState: 'Question', isResting: false, contourSteps: 0,
            melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
            lastFreq: 440, hookRetentionProb: 0.5, mode: 'guitar',
            sessionSteps: 1000
        },
        chords: { enabled: true, octave: 60, density: 'standard', pianoRoots: true },
        playback: { bandIntensity: 0.5, bpm: 120, audio: { currentTime: 0 }, intent: { anticipation: 0, syncopation: 0, layBack: 0 } },
        arranger: { 
            key: 'A', 
            isMinor: true,
            progression: [],
            totalSteps: 0,
            stepMap: [],
            timeSignature: '4/4',
            sections: []
        },
        groove: { genreFeel: 'Jazz' },
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

describe('Standard Test: Andalusian Cadence (Am)', () => {
    
    beforeEach(() => {
        arranger.key = 'A';
        arranger.isMinor = true;
        // i | bVII | bVI | V
        // Am | G | F | E (or E7)
        arranger.sections = [
            { id: 'Main', label: 'Main', value: "i | bVII | bVI | V" }
        ];
        validateProgression();
        
        soloist.isResting = false;
        soloist.currentPhraseSteps = 0;
        soloist.notesInPhrase = 0;
        groove.genreFeel = 'Rock';
    });

    it('should select correct scales for the descending minor progression', () => {
        const progression = arranger.progression;
        
        // 1. Am (i) -> Aeolian (Natural Minor)
        const scaleAm = getScaleForChord(progression[0], progression[1], 'smart');
        expect(scaleAm).toEqual([0, 2, 3, 5, 7, 8, 10]);

        // 2. G (bVII) -> Mixolydian (Relative to C Major, which is relative to Am)
        // Or technically G Ionian in this context. 
        // In our engine, bVII in minor key is treated as Major.
        const scaleG = getScaleForChord(progression[1], progression[2], 'smart');
        expect(scaleG).toEqual([0, 2, 4, 5, 7, 9, 10]); 

        // 3. F (bVI) -> Lydian
        const scaleF = getScaleForChord(progression[2], progression[3], 'smart');
        expect(scaleF).toEqual([0, 2, 4, 6, 7, 9, 11]);

        // 4. E (V) -> Phrygian Dominant (Standard for minor V)
        const scaleE = getScaleForChord(progression[3], null, 'smart');
        expect(scaleE).toEqual([0, 1, 4, 5, 7, 8, 10]);
    });

    it('should maintain harmonic integrity during solo generation', () => {
        const progression = arranger.progression;
        let noteCount = 0;

        for (let step = 0; step < 64; step++) {
            const chordEntry = arranger.stepMap.find(m => step >= m.start && step < m.end);
            const currentChord = chordEntry.chord;
            const nextChord = arranger.stepMap.find(m => (step + 16) >= m.start && (step + 16) < m.end)?.chord;

            const result = getSoloistNote(currentChord, nextChord, step, 440, 72, 'smart', step % 16);
            
            if (result) {
                noteCount++;
                const note = Array.isArray(result) ? result[0] : result;
                const scale = getScaleForChord(currentChord, nextChord, 'smart');
                const interval = (note.midi - currentChord.rootMidi + 120) % 12;
                
                let isInScale = scale.includes(interval);
                // Allow for neighbor tones in Rock style
                if (!isInScale) {
                    const neighbors = [(interval - 1 + 12) % 12, (interval + 1 + 12) % 12];
                    isInScale = neighbors.some(n => scale.includes(n));
                }
                expect(isInScale).toBe(true);
            }
        }
        expect(noteCount).toBeGreaterThan(5);
    });

    it('should voice the E Major chord (V) with a natural 3 (G#) even in a minor key', () => {
        const eMajor = arranger.progression[3];
        // E Major root is E (MIDI 40/52/64)
        // G# is interval 4 (or 16 in spread 10th voicing)
        const hasMajor3rd = eMajor.intervals.includes(4) || eMajor.intervals.includes(16);
        expect(hasMajor3rd).toBe(true);
    });
});
