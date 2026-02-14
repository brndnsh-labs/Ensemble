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
        playback: { bandIntensity: 0.5, bpm: 120, audio: { currentTime: 0 } },
        arranger: { 
            key: 'C', 
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
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] },
            '5/4': { beats: 5, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12, 16], grouping: [3, 2] }
        },
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 },
        NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11]
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getSoloistNote } from '../../public/soloist.js';
import { getScaleForChord } from '../../public/theory-scales.js';
import { getBassNote } from '../../public/bass.js';
import { validateProgression } from '../../public/chords.js';
import { dispatch, getState, storage } from '../../public/state.js';
const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } = getState();
import { getStepsPerMeasure } from '../../public/utils.js';

describe('Jazz Anthology Tests', () => {

    describe('Blue Bossa (Kenny Dorham)', () => {
        beforeEach(() => {
            arranger.key = 'C';
            arranger.isMinor = true;
            groove.genreFeel = 'Bossa Nova';
            // Cm7 | Cm7 | Fm7 | Fm7 | Dm7b5 | G7alt | Cm7 | Cm7
            // Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 | Dm7b5 | G7alt | Cm7 | Dm7b5 G7alt
            arranger.sections = [
                { id: 'Main', label: 'Main', value: "Cm7 | Cm7 | Fm7 | Fm7 | Dm7b5 | G7alt | Cm7 | Cm7 | Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 | Dm7b5 | G7alt | Cm7 | Dm7b5 G7alt" }
            ];
            validateProgression();
        });

        it('should select correct scales for the modulation to Db Major', () => {
            const progression = arranger.progression;
            
            // Bar 9: Ebm7 (ii of Db)
            const ebm7 = progression[8];
            const scaleEb = getScaleForChord(ebm7, progression[9], 'bossa');
            // Dorian (Eb, F, Gb, Ab, Bb, C, Db) -> 0, 2, 3, 5, 7, 9, 10
            expect(scaleEb).toEqual([0, 2, 3, 5, 7, 9, 10]);

            // Bar 10: Ab7 (V of Db)
            const ab7 = progression[9];
            const scaleAb = getScaleForChord(ab7, progression[10], 'bossa');
            // Mixolydian (Ab, Bb, C, Db, Eb, F, Gb) -> 0, 2, 4, 5, 7, 9, 10
            expect(scaleAb).toEqual([0, 2, 4, 5, 7, 9, 10]);

            // Bar 11: Dbmaj7 (I of Db)
            const dbMaj = progression[10];
            const scaleDb = getScaleForChord(dbMaj, null, 'bossa');
            // Lydian (Db, Eb, F, G, Ab, Bb, C) -> 0, 2, 4, 6, 7, 9, 11 (Bossa loves Lydian)
            expect(scaleDb).toContain(6); 
        });

        it('should use Harmonic Minor/Altered for the G7alt resolving to Cm7', () => {
            const g7alt = arranger.progression[5]; // Bar 6
            const scaleG = getScaleForChord(g7alt, arranger.progression[6], 'bossa');
            // Altered: 0, 1, 3, 4, 6, 8, 10
            expect(scaleG).toEqual([0, 1, 3, 4, 6, 8, 10]);
        });
    });

    describe('So What (Miles Davis)', () => {
        beforeEach(() => {
            arranger.key = 'C'; // Key center usually D minor, let's say C Major (D is ii) or just D Minor
            arranger.isMinor = true; 
            groove.genreFeel = 'Jazz';
            // Dm7 (16) | Ebm7 (8) | Dm7 (8)
            // Simplified for test: 4 bars Dm7, 2 bars Ebm7, 2 bars Dm7
            arranger.sections = [
                { id: 'A', label: 'A', value: "Dm7 | Dm7 | Dm7 | Dm7" },
                { id: 'B', label: 'B', value: "Ebm7 | Ebm7" },
                { id: 'A2', label: 'A2', value: "Dm7 | Dm7" }
            ];
            validateProgression();
        });

        it('should maintain Dorian mode on the main Dm7 chord', () => {
            const dm7 = arranger.progression[0];
            const scale = getScaleForChord(dm7, null, 'bird');
            // D Dorian: D, E, F, G, A, B, C (No Bb!)
            // Intervals: 0, 2, 3, 5, 7, 9, 10
            expect(scale).toEqual([0, 2, 3, 5, 7, 9, 10]);
            expect(scale).not.toContain(8); // No b6
        });

        it('should shift semitonically to Eb Dorian for the B section', () => {
            const ebm7 = arranger.progression.find(c => c.absName === 'Ebm7');
            const scale = getScaleForChord(ebm7, null, 'bird');
            // Eb Dorian
            expect(scale).toEqual([0, 2, 3, 5, 7, 9, 10]);
        });
    });

    describe('Take Five (Dave Brubeck)', () => {
        beforeEach(() => {
            arranger.key = 'Eb';
            arranger.isMinor = true;
            arranger.timeSignature = '5/4';
            groove.genreFeel = 'Jazz';
            // Vamp: Ebm7 | Bbm7
            arranger.sections = [
                { id: 'A', label: 'A', value: "Ebm7 | Bbm7 | Ebm7 | Bbm7" }
            ];
            validateProgression();
        });

        it('should handle the 5/4 meter in the bass line (Root on 1, maybe on 4 or 5)', () => {
            const ebm7 = arranger.progression[0];
            const bbm7 = arranger.progression[1];
            
            // 5/4 -> 20 16th steps per bar. Beats at 0, 4, 8, 12, 16.
            // Take Five groove is typically 3+2 (dotted q, dotted q, q | q q) or (1, 2&, 4 | 4, 5)
            // Or piano vamp: 1, 2, 3&, 4, 5...
            // Bass usually plays beat 1, 4, 5 or 1, 3, 5.
            
            // Let's verify we get a valid note on Beat 1 (Step 0)
            const note1 = getBassNote(ebm7, bbm7, 0, 440, 38, 'quarter', 0, 0, 0);
            expect(note1).not.toBeNull();
            expect(note1.midi % 12).toBe(ebm7.rootMidi % 12); // Root on 1

            // Verify Bass doesn't crash on Beat 5 (Index 4)
            const note5 = getBassNote(ebm7, bbm7, 4, 440, 38, 'quarter', 0, 16, 16);
            // In 5/4, 'quarter' style usually plays on all beats or patterned.
            // Expect a note or null, but NO error.
            if (note5) expect(note5.midi).toBeDefined();
        });

        it('should use Dorian for the Ebm7 vamp', () => {
            const ebm7 = arranger.progression[0];
            const scale = getScaleForChord(ebm7, null, 'bird');
            expect(scale).toEqual([0, 2, 3, 5, 7, 9, 10]);
        });
    });
});
