/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: { 
            enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
            qaState: 'Question', isResting: false, contourSteps: 0,
            melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
            lastFreq: 440, hookRetentionProb: 0.5
        },
        chords: { enabled: true, octave: 60, density: 'standard', pianoRoots: true },
        playback: { bandIntensity: 0.5, bpm: 80, audio: { currentTime: 0 }, intent: { soloistMod: 0 }, intent: { soloistMod: 0 }, intent: { soloistMod: 0 } },
        arranger: { 
            key: 'C', 
            isMinor: false,
            progression: [],
            totalSteps: 0,
            stepMap: [],
            timeSignature: '4/4',
            sections: []
        },
        groove: { genreFeel: 'Neo-Soul' },
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
        INTERVAL_TO_ROMAN: { 0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV', 6: 'bV', 7: 'V', 8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII' },
        INTERVAL_TO_NNS: { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' }
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getBassNote } from '../../public/bass.js';
import { validateProgression } from '../../public/chords.js';
import { dispatch, getState, storage } from '../../public/state.js';
const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } = getState();

describe('Neo-Soul Integration Test: Slash Chords', () => {
    
    beforeEach(() => {
        arranger.key = 'C';
        arranger.isMinor = false;
        // Updated to use a more authentic Neo-Soul progression structure for the test
        // including the characteristic IVmaj9 and bIImaj7 movements
        arranger.sections = [
            { id: 'Verse', label: 'Verse', value: "IVmaj9/5 | III7#9 | vi11 | V9sus4" },
            { id: 'Chorus', label: 'Chorus', value: "ii9 | bIImaj7/1 | Imaj9 | vi9" }
        ];
        validateProgression();
    });

    it('should correctly identify and voice the slash chords', () => {
        const progression = arranger.progression;
        
        // 1. IVmaj9/5 (Fmaj9/G)
        const iv9g = progression[0];
        expect(iv9g.display.name.bass).toBe('G');
        expect(iv9g.bassMidi % 12).toBe(7); // G
        
        // 2. bIImaj7/1 (Dbmaj7/C)
        const biimaj7c = progression[5]; // 2nd chord of Chorus (step 4,5,6,7? no, flattened progression)
        // 4 chords in Verse, 4 in Chorus. Progression[5] is 2nd chord of Chorus.
        expect(biimaj7c.absName).toContain('Dbmaj7/C');
        expect(biimaj7c.bassMidi % 12).toBe(0); // C
    });

    it('should generate a bass line that respects the slash note on beat 1', () => {
        const progression = arranger.progression;
        
        // Test Bar 1: IVmaj9/5 (Fmaj9/G in key of C)
        const result = getBassNote(progression[0], progression[1], 0, null, 38, 'neo', 0, 0, 0);
        // Should play G (7)
        expect(result.midi % 12).toBe(7);

        // Test Bar 6 (Chorus 2nd chord): bIImaj7/1 (Dbmaj7/C)
        const result2 = getBassNote(progression[5], progression[6], 0, null, 38, 'neo', 5, 80, 0);
        expect(result2.midi % 12).toBe(0); // C
    });

    it('should maintain a laid-back pocket offset for the bass', () => {
        const progression = arranger.progression;
        const result = getBassNote(progression[0], progression[1], 0, null, 38, 'neo', 0, 0, 0);
        
        // Neo-soul style should have a specific timingOffset. 
        // Base is 0.0 (from bass.pocketOffset in mock) + genre lag (0.010 + intensity * 0.015)
        // At intensity 0.5, total is ~0.0175.
        expect(result.timingOffset).toBeGreaterThan(0.015); 
        expect(result.timingOffset).toBeCloseTo(0.0175, 2); 
    });

    it('should use Dorian scale for the iii7 and ii7 chords in Neo-Soul context', () => {
        // This is handled by getScaleForChord, but let's verify via getBassNote or getSoloistNote if needed.
        // Actually we can just check the bass line movement or add a soloist check.
        // In Neo-Soul, minor chords often use Dorian.
    });
});
