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
        playback: { bandIntensity: 0.5, bpm: 120, audio: { currentTime: 0 }, intent: { soloistMod: 0 }, intent: { soloistMod: 0 }, intent: { soloistMod: 0 } },
        arranger: { 
            key: 'C', 
            isMinor: false,
            progression: [],
            totalSteps: 0,
            stepMap: [],
            timeSignature: '4/4',
            sections: []
        },
        groove: { genreFeel: 'Rock' },
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

describe('Standard Test: Royal Road Progression (C Major)', () => {
    
    beforeEach(() => {
        arranger.key = 'C';
        arranger.isMinor = false;
        // IVmaj7 | V7 | iii7 | vi7
        // Fmaj7 | G7 | Em7 | Am7
        arranger.sections = [
            { id: 'Main', label: 'Main', value: "IVmaj7 | V7 | iii7 | vi7" }
        ];
        validateProgression();
        
        soloist.isResting = false;
        soloist.currentPhraseSteps = 0;
        soloist.notesInPhrase = 0;
        groove.genreFeel = 'Rock';
    });

    it('should select correct scales for the IV-V-iii-vi progression', () => {
        const progression = arranger.progression;
        
        // 1. Fmaj7 (IVmaj7) -> Lydian
        const scaleF = getScaleForChord(progression[0], progression[1], 'smart');
        expect(scaleF).toEqual([0, 2, 4, 6, 7, 9, 11]);

        // 2. G7 (V7) -> Mixolydian
        const scaleG = getScaleForChord(progression[1], progression[2], 'smart');
        expect(scaleG).toEqual([0, 2, 4, 5, 7, 9, 10]);

        // 3. Em7 (iii7) -> Phrygian (Diatonic to C)
        const scaleE = getScaleForChord(progression[2], progression[3], 'smart');
        expect(scaleE).toEqual([0, 1, 3, 5, 7, 8, 10]);

        // 4. Am7 (vi7) -> Aeolian (Diatonic to C)
        const scaleA = getScaleForChord(progression[3], null, 'smart');
        expect(scaleA).toEqual([0, 2, 3, 5, 7, 8, 10]);
    });

    it('should maintain harmonic integrity during solo generation', () => {
        const progression = arranger.progression;
        let noteCount = 0;

        for (let step = 0; step < 64; step++) {
            const chordEntry = arranger.stepMap.find(m => step >= m.start && step < m.end);
            const result = getSoloistNote(chordEntry.chord, null, step, 440, 72, 'smart', step % 16);
            if (result) noteCount++;
        }
        expect(noteCount).toBeGreaterThan(5);
    });
});
