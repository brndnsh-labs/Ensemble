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
            key: 'C', 
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
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 },
        NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11]
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getSoloistNote } from '../../public/soloist.js';
import { getScaleForChord } from '../../public/theory-scales.js';

import { validateProgression } from '../../public/chords.js';
import { getState } from '../../public/state.js';
const { arranger } = getState();
import { KEY_ORDER } from '../../public/config.js';

function getKeyAtOffset(startKey, semitones) {
    const startIdx = KEY_ORDER.indexOf(startKey);
    const targetIdx = (startIdx + semitones + 12) % 12;
    return KEY_ORDER[targetIdx];
}

describe('Jazz Standard Test: All The Things You Are (Single Key)', () => {
    
    const rootKey = 'Ab'; // Original Key

    describe(`Key of ${rootKey}`, () => {
        beforeEach(() => {
            arranger.key = rootKey;
            arranger.isMinor = false;

            // Modulations relative to root (Ab in original):
            // A1: Root (Ab) -> vi, ii, V, I, IV
            // A2: Major 3rd (C) -> ii, V, I
            // A3: Perfect 5th (Eb) -> ii, V, I
            // A4: Major 7th (G) -> ii, V, I
            // B1: Major 7th (G) -> ii, V, I
            // B2: Minor 6th (E) -> ii, V, I

            const keyA2 = getKeyAtOffset(rootKey, 4); // Major 3rd
            const keyA3 = getKeyAtOffset(rootKey, 7); // Perfect 5th
            const keyA4 = getKeyAtOffset(rootKey, 11); // Major 7th (or -1)
            const keyB2 = getKeyAtOffset(rootKey, 8); // Minor 6th (Ab -> E is 8 semitones: 0->8)

            arranger.sections = [
                { id: 'A1', label: `A (${rootKey})`, key: rootKey, value: "vi7 | ii7 | V7 | Imaj7 | IVmaj7" },
                { id: 'A2', label: `A (${keyA2})`, key: keyA2, value: "ii7 | V7 | Imaj7", seamless: true },
                { id: 'A3', label: `A2 (${keyA3})`, key: keyA3, value: "ii7 | V7 | Imaj7 | IVmaj7" }, // Adjusted slightly from original chords to simpler numerals
                { id: 'A4', label: `A2 (${keyA4})`, key: keyA4, value: "ii7 | V7 | Imaj7", seamless: true },
                { id: 'B1', label: `B (${keyA4})`, key: keyA4, value: "ii7 | V7 | Imaj7 | Imaj7" },
                { id: 'B2', label: `B (${keyB2})`, key: keyB2, value: "iiø7 | V7 | Imaj7 | V7alt", seamless: true }, // V7alt acts as C7alt (V of Fm)
                { id: 'A5', label: `A3 (${rootKey})`, key: rootKey, value: "vi7 | ii7 | V7 | Imaj7 | IVmaj7 | ivm7 | iii7 | biiio7 | ii7 | V7 | Imaj7 | Imaj7" }
            ];
            validateProgression();

            // Reset soloist state
            const { soloist } = getState();
            soloist.isResting = false;
            soloist.currentPhraseSteps = 0;
            soloist.notesInPhrase = 0;
        });

        it('should navigate the Cycle of Fifths in the first 5 bars', () => {
            const progression = arranger.progression;

            // 1. vi7
            const scaleVi = getScaleForChord(progression[0], progression[1], 'bird');
            // Should contain b3, b7 relative to root of chord
            // For Fm7 (Ab vi): F, G, Ab, Bb, C, D, Eb.
            // Intervals: 0, 2, 3, 5, 7, 9, 10
            expect(scaleVi).toContain(3);
            expect(scaleVi).toContain(10);

            // Verify Bass Scale Compatibility
            const bassScaleVi = getScaleForChord(progression[0], progression[1], 'smart');
            expect(bassScaleVi).toContain(3);
            expect(bassScaleVi).toContain(10);

            // 2. V7 -> Mixolydian
            const scaleV = getScaleForChord(progression[2], progression[3], 'bird');
            expect(scaleV).toEqual([0, 2, 4, 5, 7, 9, 10]);

            // 3. Imaj7 -> Ionian
            const scaleI = getScaleForChord(progression[3], progression[4], 'bird');
            expect(scaleI).toEqual([0, 2, 4, 5, 7, 9, 11]);
        });

        it('should switch to new Major scale during the modulation (A2 section)', () => {
            const a2Start = arranger.sections[1].key;
            // We find chords belonging to section A2
            const a2Chords = arranger.progression.filter(c => c.sectionId === 'A2');
            const ii7 = a2Chords[0];
            const v7 = a2Chords[1];
            const imaj7 = a2Chords[2];

            expect(ii7).toBeDefined();

            // ii7 (Dorian)
            const scaleIi = getScaleForChord(ii7, v7, 'bird');
            expect(scaleIi).toEqual([0, 2, 3, 5, 7, 9, 10]);

            // Imaj7 (Ionian) -> Refactor defaults to Lydian for non-diatonic Major in Jazz
            const scaleI = getScaleForChord(imaj7, null, 'bird');
            expect(scaleI).toEqual([0, 2, 4, 6, 7, 9, 11]);
        });

        it('should handle the Bridge modulation to Minor 6th interval', () => {
            // B2 Section: iiø7 | V7 | Imaj7 | V7alt
            const b2Chords = arranger.progression.filter(c => c.sectionId === 'B2');
            const iihalfdim = b2Chords[0];
            const v7 = b2Chords[1];
            const imaj7 = b2Chords[2];

            // iiø7 -> Locrian (0, 1, 3, 5, 6, 8, 10)
            const scaleLoc = getScaleForChord(iihalfdim, v7, 'bird');
            expect(scaleLoc).toEqual([0, 1, 3, 5, 6, 8, 10]);

            // V7 -> Mixolydian (resolving to Major)
            const scaleV = getScaleForChord(v7, imaj7, 'bird');
            expect(scaleV).toEqual([0, 2, 4, 5, 7, 9, 10]);
        });

        it('should select Altered scale for the turnaround chord', () => {
            // Last chord of B2 is V7alt (resolving back to vi of original key)
            const b2Chords = arranger.progression.filter(c => c.sectionId === 'B2');
            const turnaround = b2Chords[3];

            // V7alt -> Altered Scale (0, 1, 3, 4, 6, 8, 10)
            const scaleAlt = getScaleForChord(turnaround, null, 'bird');
            expect(scaleAlt).toEqual([0, 1, 3, 4, 6, 8, 10]);
        });
    });
});
