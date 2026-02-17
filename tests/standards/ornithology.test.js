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
        playback: { bandIntensity: 0.5, bpm: 180, audio: { currentTime: 0 }, intent: { soloistMod: 0 }, intent: { soloistMod: 0 }, intent: { soloistMod: 0 } },
        arranger: { 
            key: 'G', 
            isMinor: false,
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
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 }
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getSoloistNote } from '../../public/soloist.js';
import { getScaleForChord } from '../../public/theory-scales.js';
import { validateProgression } from '../../public/chords.js';
import { dispatch, getState, storage } from '../../public/state.js';
const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } = getState();

describe('Jazz Standard Test: Ornithology', () => {
    
    beforeEach(() => {
        arranger.key = 'G';
        arranger.isMinor = false;
        // Gmaj7 | Gmaj7 | Gm7 | C7 | Fmaj7 | Fmaj7 | Fm7 | Bb7
        arranger.sections = [
            { id: 'A', label: 'A', value: "Gmaj7 | Gmaj7 | Gm7 | C7 | Fmaj7 | Fmaj7 | Fm7 | Bb7" }
        ];
        validateProgression();
        
        soloist.isResting = false;
        soloist.currentPhraseSteps = 0;
        soloist.notesInPhrase = 0;
        playback.bpm = 180;
    });

    it('should correctly select scales for the shifting ii-V patterns', () => {
        const progression = arranger.progression;
        
        // 1. Gmaj7 (I)
        expect(getScaleForChord(progression[0], progression[1], 'bird')).toEqual([0, 2, 4, 5, 7, 9, 11]);
        
        // 2. Gm7 (iim7 of F)
        const gm7 = progression[2];
        expect(getScaleForChord(gm7, progression[3], 'bird')).toEqual([0, 2, 3, 5, 7, 9, 10]); // Dorian

        // 3. C7 (V7 of F)
        const c7 = progression[3];
        expect(getScaleForChord(c7, progression[4], 'bird')).toEqual([0, 2, 4, 5, 7, 9, 10]); // Mixolydian
    });

    it('should generate Bebop-style phrasing at high tempo', () => {
        const progression = arranger.progression;
        let noteCount = 0;
        let shortNoteCount = 0; // Duration 1 or 2 (16ths or 8ths)

        // Run for 32 bars (512 steps) to get a better statistical sample
        for (let step = 0; step < 512; step++) {
            const chordEntry = arranger.stepMap.find(m => (step % arranger.totalSteps) >= m.start && (step % arranger.totalSteps) < m.end);
            const currentChord = chordEntry.chord;
            const nextChord = arranger.stepMap.find(m => ((step + 16) % arranger.totalSteps) >= m.start && ((step + 16) % arranger.totalSteps) < m.end)?.chord;

            const result = getSoloistNote(currentChord, nextChord, step, 440, 72, 'bird', step % 16);
            
            if (result) {
                const notes = Array.isArray(result) ? result : [result];
                noteCount += notes.length;
                notes.forEach(note => {
                    // Bird style uses mostly 8th notes (2) and occasional 16th enclosures (1)
                    if (note.durationSteps === 1 || note.durationSteps === 2) shortNoteCount++;
                });
            }
        }

        // At 180 BPM, Bebop style should be busy
        expect(noteCount).toBeGreaterThan(50);
        // Statistical check: Short notes should be the dominant rhythmic feature
        expect(shortNoteCount).toBeGreaterThan(noteCount * 0.6);
    });

    it('should use Dorian for the minor chords in ii-V transitions', () => {
        const progression = arranger.progression;
        const fm7 = progression[6]; // Fm7
        const scale = getScaleForChord(fm7, progression[7], 'bird');
        
        // Dorian: [0, 2, 3, 5, 7, 9, 10]
        expect(scale).toEqual([0, 2, 3, 5, 7, 9, 10]);
    });
});
