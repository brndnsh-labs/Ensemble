/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: {
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            qaState: 'Question',
            isResting: false,
            contourSteps: 0,
            melodicTrend: 'Static',
            tension: 0,
            motifBuffer: [],
            hookBuffer: [],
            lastFreq: 440,
            hookRetentionProb: 0.5,
            mode: 'guitar',
            sessionSteps: 1000,
        },
        chords: { enabled: true, octave: 60, density: 'standard', pianoRoots: true },
        playback: {
            bandIntensity: 0.5,
            bpm: 120,
            audio: { currentTime: 0 },
            intent: { soloistMod: 0, anticipation: 0, syncopation: 0, layBack: 0 },
        },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: [],
            totalSteps: 0,
            stepMap: [],
            timeSignature: '4/4',
            sections: [],
        },
        groove: { genreFeel: 'Jazz' },
        bass: { enabled: true },
        harmony: { enabled: false },
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        getState: () => mockState,
    };
});

vi.mock('../../public/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] },
            '5/4': {
                beats: 5,
                stepsPerBeat: 4,
                subdivision: '16th',
                pulse: [0, 4, 8, 12, 16],
                grouping: [3, 2],
            },
        },
        ROMAN_VALS: { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 },
        NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11],
        INTERVAL_TO_NNS: ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'],
        INTERVAL_TO_ROMAN: [
            'I',
            'bII',
            'II',
            'bIII',
            'III',
            'IV',
            '#IV',
            'V',
            'bVI',
            'VI',
            'bVII',
            'VII',
        ],
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getBassNote } from '../../public/bass.js';
import { validateProgression } from '../../public/chords.js';
import { getSoloistNote } from '../../public/soloist.js';
import { getState } from '../../public/state.js';
import { getScaleForChord } from '../../public/theory-scales.js';

const { arranger, playback, soloist, groove } = getState();

import { KEY_ORDER } from '../../public/config.js';

// Helper for All The Things You Are
function getKeyAtOffset(startKey, semitones) {
    const startIdx = KEY_ORDER.indexOf(startKey);
    const targetIdx = (startIdx + semitones + 12) % 12;
    return KEY_ORDER[targetIdx];
}

describe('Standards Compliance Test Suite', () => {
    // --- Autumn Leaves ---
    describe('Autumn Leaves', () => {
        const ROMAN_PROG = 'iim7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7alt | vim7';
        const TEST_KEY = 'Bb';

        beforeEach(() => {
            arranger.key = TEST_KEY;
            arranger.isMinor = false;
            arranger.sections = [{ id: 'A', label: 'A', value: ROMAN_PROG }];
            validateProgression();
        });

        it('should identify correct relative scales', () => {
            const p = arranger.progression;
            expect(getScaleForChord(p[0], p[1], 'bird')).toEqual([0, 2, 3, 5, 7, 9, 10]); // iim7
            expect(getScaleForChord(p[1], p[2], 'bird')).toEqual([0, 2, 4, 5, 7, 9, 10]); // V7
            expect(getScaleForChord(p[4], p[5], 'bird')).toEqual([0, 1, 3, 5, 6, 8, 10]); // viiø7
            expect(getScaleForChord(p[5], p[6], 'bird')).toEqual([0, 1, 3, 4, 6, 8, 10]); // III7alt
        });

        it('should generate valid bass notes', () => {
            const p = arranger.progression;
            const result = getBassNote(p[0], p[1], 0, 55, 38, 'quarter', 0, 0, 0);
            expect(result).not.toBeNull();
            expect(result.midi % 12).toBe(p[0].rootMidi % 12);
        });
    });

    // --- Giant Steps ---
    describe('Giant Steps', () => {
        const TEST_KEY = 'B';
        const BASE_PROG =
            'Bmaj7 D7 | Gmaj7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 Bb7 | Ebmaj7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 | C#m7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | C#m7 F#7';

        beforeEach(() => {
            arranger.key = TEST_KEY;
            arranger.isMinor = false;
            arranger.sections = [{ id: 'Main', label: 'Main', value: BASE_PROG }];
            validateProgression();
        });

        it('should select correct scales for rapid major-third key shifts', () => {
            const p = arranger.progression;
            expect(getScaleForChord(p[0], p[1], 'bird')).toEqual([0, 2, 4, 5, 7, 9, 11]); // Imaj7
            expect(getScaleForChord(p[1], p[2], 'bird')).toEqual([0, 2, 4, 5, 7, 9, 10]); // V7 of bVI
            expect(getScaleForChord(p[2], p[3], 'bird')).toEqual([0, 2, 4, 6, 7, 9, 11]); // Imaj7 (Lydian default)
        });

        it('should select Phrygian Dominant when anticipating minor resolutions', () => {
            const v7 = arranger.progression[1];
            const minorTarget = {
                rootMidi: v7.rootMidi + 5,
                quality: 'minor',
                intervals: [0, 3, 7],
            };
            expect(getScaleForChord(v7, minorTarget, 'bird')).toEqual([0, 1, 4, 5, 7, 8, 10]);
        });
    });

    // --- Cherokee ---
    describe('Cherokee', () => {
        beforeEach(() => {
            arranger.key = 'Bb';
            arranger.sections = [
                {
                    id: 'A1',
                    label: 'A',
                    key: 'Bb',
                    value: 'Bbmaj7 | Fm7 Bb7 | Ebmaj7 | Ebm7 Ab7 | Bbmaj7 C7 | Cm7 F7 | Bbmaj7 | Cm7 F7',
                },
                { id: 'B1', label: 'B (B)', key: 'B', value: 'C#m7 | F#7 | Bmaj7 | Bmaj7' },
                {
                    id: 'B2',
                    label: 'B (A)',
                    key: 'A',
                    value: 'Bm7 | E7 | Amaj7 | Amaj7',
                    seamless: true,
                },
            ];
            validateProgression();
        });

        it('should correctly identify the key center for the Bridge modulations', () => {
            const bChord = arranger.progression.find(
                (c) => c.sectionLabel === 'B (B)' && c.quality === 'maj7',
            );
            expect(bChord.key).toBe('B');
            const scale = getScaleForChord(bChord, null, 'bird');
            expect(scale).toContain(0);
            expect(scale).toContain(4);
            expect(scale).toContain(11);
        });

        it('should shift key center for the A Major modulation', () => {
            const aSection = arranger.progression.find(
                (c) => c.sectionLabel === 'B (A)' && c.quality === 'maj7',
            );
            expect(aSection.key).toBe('A');
            const scale = getScaleForChord(aSection, null, 'bird');
            expect(scale).toContain(0);
            expect(scale).toContain(4);
            expect(scale).toContain(11);
        });
    });

    // --- Andalusian Cadence ---
    describe('Andalusian Cadence', () => {
        beforeEach(() => {
            arranger.key = 'A';
            arranger.isMinor = true;
            arranger.sections = [{ id: 'Main', label: 'Main', value: 'i | bVII | bVI | V' }];
            validateProgression();
            soloist.isResting = false;
            soloist.currentPhraseSteps = 0;
            soloist.notesInPhrase = 0;
            groove.genreFeel = 'Rock';
        });

        it('should select correct scales for the descending minor progression', () => {
            const p = arranger.progression;
            expect(getScaleForChord(p[0], p[1], 'smart')).toEqual([0, 2, 3, 5, 7, 8, 10]); // i (Am)
            expect(getScaleForChord(p[1], p[2], 'smart')).toEqual([0, 2, 4, 5, 7, 9, 10]); // bVII (G)
            expect(getScaleForChord(p[2], p[3], 'smart')).toEqual([0, 2, 4, 6, 7, 9, 11]); // bVI (F) Lydian
            expect(getScaleForChord(p[3], null, 'smart')).toEqual([0, 1, 4, 5, 7, 8, 10]); // V (E) Phryg Dom
        });

        it('should voice the E Major chord (V) with a natural 3', () => {
            const eMajor = arranger.progression[3];
            expect(eMajor.intervals.includes(4) || eMajor.intervals.includes(16)).toBe(true);
        });
    });

    // --- Blues Improvisation ---
    describe('Blues Improvisation', () => {
        beforeEach(() => {
            playback.currentLoopCount = 3;
            arranger.key = 'F';
            arranger.isMinor = false;
            arranger.sections = [
                {
                    id: 'A',
                    label: 'Chorus',
                    value: 'F7 | Bb7 | F7 | F7 | Bb7 | Bb7 | F7 | D7alt | Gm7 | C7 | F7 | C7',
                },
            ];
            validateProgression();
            soloist.isResting = false;
            soloist.currentPhraseSteps = 0;
            soloist.notesInPhrase = 0;
            groove.genreFeel = 'Blues';
        });

        it('should prioritize the Blues Scale over Dominant I chords', () => {
            const scale = getScaleForChord(
                arranger.progression[0],
                arranger.progression[1],
                'blues',
            );
            expect(scale).toContain(3); // b3
            expect(scale).toContain(10); // b7
            expect(scale).toContain(5); // 4
        });

        it('should generate Blue Notes in the solo line', () => {
            let blueNoteCount = 0;
            for (let i = 0; i < 200; i++) {
                const result = getSoloistNote(
                    arranger.progression[0],
                    null,
                    i % 16,
                    440,
                    72,
                    'blues',
                    i % 16,
                );
                if (result) {
                    const notes = Array.isArray(result) ? result : [result];
                    notes.forEach((note) => {
                        if (((note.midi % 12) - 5 + 12) % 12 === 3) {
                            blueNoteCount++;
                        }
                    });
                }
            }
            expect(blueNoteCount).toBeGreaterThan(0);
        });
    });

    // --- Jazz Anthology (Blue Bossa, So What, Take Five) ---
    describe('Jazz Anthology', () => {
        describe('Blue Bossa', () => {
            beforeEach(() => {
                arranger.key = 'C';
                arranger.isMinor = true;
                groove.genreFeel = 'Bossa Nova';
                arranger.sections = [
                    {
                        id: 'Main',
                        label: 'Main',
                        value: 'Cm7 | Cm7 | Fm7 | Fm7 | Dm7b5 | G7alt | Cm7 | Cm7 | Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 | Dm7b5 | G7alt | Cm7 | Dm7b5 G7alt',
                    },
                ];
                validateProgression();
            });

            it('should select correct scales for modulation to Db Major', () => {
                const p = arranger.progression;
                expect(getScaleForChord(p[8], p[9], 'bossa')).toEqual([0, 2, 3, 5, 7, 9, 10]); // Ebm7 (Dorian)
                expect(getScaleForChord(p[9], p[10], 'bossa')).toEqual([0, 2, 4, 5, 7, 9, 10]); // Ab7 (Mixolydian)
                expect(getScaleForChord(p[10], null, 'bossa')).toContain(6); // Dbmaj7 (Lydian)
            });
        });

        describe('So What', () => {
            beforeEach(() => {
                arranger.key = 'C';
                arranger.isMinor = true;
                groove.genreFeel = 'Jazz';
                arranger.sections = [
                    { id: 'A', label: 'A', value: 'Dm7 | Dm7' },
                    { id: 'B', label: 'B', value: 'Ebm7' },
                ];
                validateProgression();
            });

            it('should maintain Dorian mode', () => {
                const scale = getScaleForChord(arranger.progression[0], null, 'bird');
                expect(scale).toEqual([0, 2, 3, 5, 7, 9, 10]);
                expect(scale).not.toContain(8);
            });
        });

        describe('Take Five', () => {
            beforeEach(() => {
                arranger.key = 'Eb';
                arranger.isMinor = true;
                arranger.timeSignature = '5/4';
                groove.genreFeel = 'Jazz';
                arranger.sections = [{ id: 'A', label: 'A', value: 'Ebm7 | Bbm7' }];
                validateProgression();
            });

            it('should handle 5/4 meter in bass', () => {
                const note1 = getBassNote(
                    arranger.progression[0],
                    arranger.progression[1],
                    0,
                    440,
                    38,
                    'quarter',
                    0,
                    0,
                    0,
                );
                expect(note1).not.toBeNull();
                expect(note1.midi % 12).toBe(arranger.progression[0].rootMidi % 12);
            });
        });
    });

    // --- Neo-Soul ---
    describe('Neo-Soul', () => {
        beforeEach(() => {
            arranger.key = 'C';
            arranger.isMinor = false;
            groove.genreFeel = 'Neo-Soul';
            arranger.sections = [{ id: 'Verse', label: 'Verse', value: 'IVmaj9/5 | III7#9' }];
            validateProgression();
        });

        it('should correctly identify and voice slash chords', () => {
            const iv9g = arranger.progression[0];
            expect(iv9g.display.name.bass).toBe('G');
            expect(iv9g.bassMidi % 12).toBe(7); // G
        });

        it('should generate bass line respecting slash note', () => {
            const result = getBassNote(
                arranger.progression[0],
                arranger.progression[1],
                0,
                null,
                38,
                'neo',
                0,
                0,
                0,
            );
            expect(result.midi % 12).toBe(7); // G
        });
    });

    // --- Ornithology ---
    describe('Ornithology', () => {
        beforeEach(() => {
            arranger.key = 'G';
            arranger.isMinor = false;
            groove.genreFeel = 'Jazz';
            playback.bpm = 180;
            arranger.sections = [
                {
                    id: 'A',
                    label: 'A',
                    value: 'Gmaj7 | Gmaj7 | Gm7 | C7 | Fmaj7 | Fmaj7 | Fm7 | Bb7',
                },
            ];
            validateProgression();
        });

        it('should correctly select scales for shifting ii-V patterns', () => {
            const p = arranger.progression;
            expect(getScaleForChord(p[0], p[1], 'bird')).toEqual([0, 2, 4, 5, 7, 9, 11]); // Gmaj7
            expect(getScaleForChord(p[2], p[3], 'bird')).toEqual([0, 2, 3, 5, 7, 9, 10]); // Gm7
            expect(getScaleForChord(p[3], p[4], 'bird')).toEqual([0, 2, 4, 5, 7, 9, 10]); // C7
        });
    });

    // --- Donna Lee ---
    describe('Donna Lee', () => {
        beforeEach(() => {
            arranger.key = 'Ab';
            arranger.isMinor = false;
            groove.genreFeel = 'Jazz';
            playback.bpm = 220;
            arranger.sections = [
                {
                    id: 'A1',
                    label: 'A',
                    value: 'Imaj7 | VI7 | II7 | II7 | iim7 | V7 | Imaj7 | iim7 V7',
                },
                {
                    id: 'B1',
                    label: 'B (G)',
                    value: 'Imaj7 | VI7 | II7 | II7 | #im7 #IV7 | VIImaj7 | iim7 | V7',
                },
                { id: 'A2', label: 'A', value: 'Imaj7 | VI7 | II7 | II7 | iim7 | V7 | III7 | vi7' },
                {
                    id: 'C1',
                    label: 'C',
                    value: 'IVmaj7 | #IVdim7 | Imaj7/V | VI7 | II7 | V7 | Imaj7 | iim7 V7',
                },
            ];
            validateProgression();
        });

        it('should correctly handle the Bird-style chromatic shifts and Lydian Dominant II7', () => {
            const p = arranger.progression;
            expect(getScaleForChord(p[1], p[2], 'bird')).toEqual([0, 2, 4, 5, 7, 9, 10]); // VI7 (F7)
            expect(getScaleForChord(p[2], p[3], 'bird')).toEqual([0, 2, 4, 6, 7, 9, 10]); // II7 (Bb7) Lydian Dominant
        });

        it('should select correct scales for the modulation to G Major (B)', () => {
            const p = arranger.progression;
            // B starts at index 9
            const am7 = p[13]; // #im7
            const d7 = p[14]; // #IV7
            const gmaj7 = p[15]; // VIImaj7

            expect(getScaleForChord(am7, d7, 'bird')).toEqual([0, 2, 3, 5, 7, 9, 10]); // Am7 Dorian
            expect(getScaleForChord(d7, gmaj7, 'bird')).toEqual([0, 2, 4, 5, 7, 9, 10]); // D7 Mixolydian
            expect(getScaleForChord(gmaj7, null, 'bird')).toEqual([0, 2, 4, 6, 7, 9, 11]); // Gmaj7 Lydian
        });

        it('should handle the C section progression correctly', () => {
            const p = arranger.progression;
            // C starts at index 26
            const dbmaj7 = p[26]; // IVmaj7
            const ddim7 = p[27]; // #IVdim7
            const ab_eb = p[28]; // Imaj7/V

            expect(getScaleForChord(dbmaj7, ddim7, 'bird')).toEqual([0, 2, 4, 6, 7, 9, 11]); // Dbmaj7 Lydian
            expect(getScaleForChord(ddim7, ab_eb, 'bird')).toEqual([0, 2, 3, 5, 6, 8, 9, 11]); // Ddim7 Whole-Half
            expect(ab_eb.bassMidi % 12).toBe(3); // Eb bass (V of Ab)
        });
    });

    // --- Royal Road ---
    describe('Royal Road', () => {
        beforeEach(() => {
            arranger.key = 'C';
            arranger.isMinor = false;
            groove.genreFeel = 'Rock';
            arranger.sections = [{ id: 'Main', label: 'Main', value: 'IVmaj7 | V7 | iii7 | vi7' }];
            validateProgression();
        });

        it('should select correct scales', () => {
            const p = arranger.progression;
            expect(getScaleForChord(p[0], p[1], 'smart')).toEqual([0, 2, 4, 6, 7, 9, 11]); // Fmaj7 Lydian
            expect(getScaleForChord(p[2], p[3], 'smart')).toEqual([0, 1, 3, 5, 7, 8, 10]); // Em7 Phrygian
        });
    });

    // --- Stella by Starlight ---
    describe('Stella by Starlight', () => {
        beforeEach(() => {
            arranger.key = 'Bb';
            arranger.isMinor = false;
            arranger.sections = [
                {
                    id: 'A',
                    label: 'A',
                    value: 'Em7b5 | A7alt | Cm7 | F7 | Fm7 | Bb7 | Ebmaj7 | Ab7',
                },
            ];
            validateProgression();
        });

        it('should select appropriate scales', () => {
            const p = arranger.progression;
            expect(getScaleForChord(p[0], p[1], 'bird')).toEqual([0, 1, 3, 5, 6, 8, 10]); // Locrian
            expect(getScaleForChord(p[1], p[2], 'bird')).toEqual([0, 1, 3, 4, 6, 8, 10]); // Altered
            expect(getScaleForChord(p[7], null, 'bird')).toEqual([0, 2, 4, 6, 7, 9, 10]); // Lydian Dominant
        });
    });

    // --- Rhythm Changes ---
    describe('Rhythm Changes', () => {
        beforeEach(() => {
            arranger.key = 'Bb';
            arranger.isMinor = false;
            groove.genreFeel = 'Jazz';
            arranger.sections = [
                { label: 'A', value: 'I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I' },
                { label: 'B', value: 'III7 | III7 | VI7 | VI7 | II7 | II7 | V7 | V7' },
            ];
            validateProgression();
        });

        it('should select appropriate scales for turnaround', () => {
            const p = arranger.progression;
            expect(getScaleForChord(p[0], p[1], 'bird')).toEqual([0, 2, 4, 5, 7, 9, 11]); // I
            expect(getScaleForChord(p[1], p[2], 'bird')).toEqual([0, 2, 3, 5, 7, 9, 10]); // vi7
        });

        it('should handle Bridge secondary dominants', () => {
            const iii7 = arranger.progression.find((c) => c.sectionLabel === 'B');
            expect(getScaleForChord(iii7, null, 'bird')).toEqual([0, 2, 4, 5, 7, 9, 10]); // III7
        });
    });

    // --- All The Things You Are ---
    describe('All The Things You Are', () => {
        const rootKey = 'Ab';
        const keyA2 = getKeyAtOffset(rootKey, 4);
        const _keyA3 = getKeyAtOffset(rootKey, 7);
        const _keyA4 = getKeyAtOffset(rootKey, 11);
        const keyB2 = getKeyAtOffset(rootKey, 8);

        beforeEach(() => {
            arranger.key = rootKey;
            arranger.isMinor = false;
            arranger.sections = [
                {
                    id: 'A1',
                    label: `A (${rootKey})`,
                    key: rootKey,
                    value: 'vi7 | ii7 | V7 | Imaj7 | IVmaj7',
                },
                {
                    id: 'A2',
                    label: `A (${keyA2})`,
                    key: keyA2,
                    value: 'ii7 | V7 | Imaj7',
                    seamless: true,
                },
                {
                    id: 'B2',
                    label: `B (${keyB2})`,
                    key: keyB2,
                    value: 'iiø7 | V7 | Imaj7 | V7alt',
                    seamless: true,
                },
            ];
            validateProgression();
        });

        it('should navigate Cycle of Fifths', () => {
            const p = arranger.progression;
            const scaleVi = getScaleForChord(p[0], p[1], 'bird');
            expect(scaleVi).toContain(3);
            expect(scaleVi).toContain(10);
        });

        it('should handle Bridge modulation', () => {
            const b2Chords = arranger.progression.filter((c) => c.sectionId === 'B2');
            expect(getScaleForChord(b2Chords[0], b2Chords[1], 'bird')).toEqual([
                0, 1, 3, 5, 6, 8, 10,
            ]); // Locrian
            expect(getScaleForChord(b2Chords[3], null, 'bird')).toEqual([0, 1, 3, 4, 6, 8, 10]); // Altered
        });
    });
});
