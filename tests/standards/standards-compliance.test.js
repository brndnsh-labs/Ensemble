/* eslint-disable */
// cspell:ignore Emaj Ebdim Yelverton Gershwin Pachelbel Coltrane
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
        stateMap: mockState,
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

import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { getBassNote } from '../../public/engine/bass-engine.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getScaleForChord } from '../../public/engine/theory-scales.js';
import { getState } from '../../public/state.js';
import { getFrequency, getMidi } from '../../public/utils.js';

const { arranger, playback, soloist, groove } = getState();

import { KEY_ORDER } from '../../public/config.js';

// Helper for All The Things You Are
function getKeyAtOffset(startKey, semitones) {
    const startIdx = KEY_ORDER.indexOf(startKey);
    const targetIdx = (startIdx + semitones + 12) % 12;
    return KEY_ORDER[targetIdx];
}

function loadPreset(name, baseKey, isMinor = false) {
    const preset = CHORD_PRESETS.find((candidate) => candidate.name === name);
    expect(preset).toBeDefined();

    arranger.key = baseKey;
    arranger.isMinor = isMinor;
    arranger.sections = preset.sections.map((section, index) => ({
        ...section,
        id: `${name}-${index}`,
        key:
            section.key ||
            (typeof section.keyShift === 'number'
                ? getKeyAtOffset(baseKey, section.keyShift)
                : undefined),
    }));

    validateProgression(getState());
    return preset;
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
            validateProgression(getState());
        });

        it('should identify correct relative scales', () => {
            const p = arranger.progression;
            expect(getScaleForChord(getState(), p[0], p[1], 'bird')).toEqual([
                0, 2, 3, 5, 7, 9, 10,
            ]); // iim7
            expect(getScaleForChord(getState(), p[1], p[2], 'bird')).toEqual([
                0, 2, 4, 5, 7, 9, 10,
            ]); // V7
            expect(getScaleForChord(getState(), p[4], p[5], 'bird')).toEqual([
                0, 2, 3, 5, 6, 8, 10,
            ]); // viiø7 -> minor-colored dominant
            expect(getScaleForChord(getState(), p[5], p[6], 'bird')).toEqual([
                0, 1, 3, 4, 6, 8, 10,
            ]); // III7alt
        });

        it('should generate valid bass notes', () => {
            const p = arranger.progression;
            const result = getBassNote(getState(), p[0], p[1], 0, 55, 38, 'quarter', 0, 0, 0);
            expect(result).not.toBeNull();
            expect(result.midi % 12).toBe(p[0].rootMidi % 12);
        });
    });

    describe('Shipped Standards Presets', () => {
        it('Blue Bossa uses a local ii-V-I when it modulates to Db major', () => {
            loadPreset('Blue Bossa', 'C', true);

            const modulation = arranger.progression.filter(
                (chord) => chord.sectionLabel === 'Modulation',
            );
            expect(modulation.map((chord) => chord.absName)).toEqual([
                'Ebm7',
                'Ab7',
                'Dbmaj7',
                'Dbmaj7',
            ]);
            expect(new Set(modulation.map((chord) => chord.key))).toEqual(new Set(['Db']));
        });

        it('Autumn Leaves stores the turnaround dominant as altered rather than merely augmented', () => {
            loadPreset('Autumn Leaves', 'Bb', false);

            const turnaroundChord = arranger.progression.find(
                (chord) => chord.sectionLabel === 'A' && chord.localIndex === 5,
            );
            expect(turnaroundChord.absName).toBe('D7alt');
            expect(turnaroundChord.quality).toBe('7alt');
        });

        it('All The Things You Are follows the common descending local-key cycle', () => {
            loadPreset('All The Things You Are', 'Ab', false);

            const cSection = arranger.progression.filter((chord) => chord.sectionLabel === 'A (C)');
            expect(cSection.map((chord) => chord.absName)).toEqual(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
            expect(new Set(cSection.map((chord) => chord.key))).toEqual(new Set(['C']));

            const ebSection = arranger.progression.filter(
                (chord) => chord.sectionLabel === 'A2 (Eb)',
            );
            expect(ebSection.map((chord) => chord.absName)).toEqual([
                'Cm7',
                'Fm7',
                'Bb7',
                'Ebmaj7',
                'Abmaj7',
            ]);
            expect(new Set(ebSection.map((chord) => chord.key))).toEqual(new Set(['Eb']));

            const gSection = arranger.progression.filter(
                (chord) => chord.sectionLabel === 'A2 (G)',
            );
            expect(gSection.map((chord) => chord.absName)).toEqual(['Am7', 'D7', 'Gmaj7', 'Gmaj7']);
            expect(new Set(gSection.map((chord) => chord.key))).toEqual(new Set(['G']));

            const eSection = arranger.progression.filter((chord) => chord.sectionLabel === 'B (E)');
            expect(eSection.map((chord) => chord.absName)).toEqual([
                'F#dim7',
                'B7',
                'Emaj7',
                'C7alt',
            ]);
            expect(new Set(eSection.map((chord) => chord.key))).toEqual(new Set(['E']));

            const turnaround = arranger.progression.at(-1);
            expect(turnaround.absName).toBe('C7alt');
            expect(turnaround.quality).toBe('7alt');
        });

        it('Cherokee uses the common B-A-G bridge and a 64-bar linearized form', () => {
            loadPreset('Cherokee', 'Bb', false);

            expect(arranger.measureMap).toHaveLength(64);

            const bSection = arranger.progression.filter((chord) => chord.sectionLabel === 'B (B)');
            expect(bSection.map((chord) => chord.absName)).toEqual([
                'C#m7',
                'F#7',
                'Bmaj7',
                'Bmaj7',
            ]);
            expect(new Set(bSection.map((chord) => chord.key))).toEqual(new Set(['B']));

            const aSection = arranger.progression.filter((chord) => chord.sectionLabel === 'B (A)');
            expect(aSection.map((chord) => chord.absName)).toEqual(['Bm7', 'E7', 'Amaj7', 'Amaj7']);
            expect(new Set(aSection.map((chord) => chord.key))).toEqual(new Set(['A']));

            const gSection = arranger.progression.filter((chord) => chord.sectionLabel === 'B (G)');
            expect(gSection.map((chord) => chord.absName)).toEqual(['Am7', 'D7', 'Gmaj7', 'Gmaj7']);
            expect(new Set(gSection.map((chord) => chord.key))).toEqual(new Set(['G']));

            const returnSection = arranger.progression.filter(
                (chord) => chord.sectionLabel === 'B (Bb)',
            );
            expect(returnSection.map((chord) => chord.absName)).toEqual([
                'Gm7',
                'C7',
                'Cm7',
                'F7+',
            ]);
            expect(new Set(returnSection.map((chord) => chord.key))).toEqual(new Set(['Bb']));
        });

        it('Stella by Starlight matches the source-backed modern Real Book changes', () => {
            loadPreset('Stella by Starlight', 'Bb', false);

            expect(arranger.measureMap).toHaveLength(32);

            expect(arranger.progression.slice(0, 8).map((chord) => chord.absName)).toEqual([
                'Em7b5',
                'A7b9',
                'Cm7',
                'F7b9',
                'Fm7',
                'Bb7',
                'Ebmaj7',
                'Ab7',
            ]);

            const bridgeInPlace = arranger.progression.filter(
                (chord) => chord.sectionLabel === 'B',
            );
            expect(bridgeInPlace.map((chord) => chord.absName)).toEqual([
                'Bbmaj7',
                'Em7b5',
                'A7b9',
                'Dm7',
                'Bbm7',
                'Eb7',
                'Fmaj7',
                'Em7b5',
                'A7',
                'Am7b5',
                'D7b9',
            ]);

            const turnaround = arranger.progression.filter((chord) => chord.sectionLabel === 'D');
            expect(turnaround.map((chord) => chord.absName)).toEqual([
                'Em7b5',
                'A7b9',
                'Dm7b5',
                'G7b9',
                'Cm7b5',
                'F7b9',
                'Bbmaj7',
                'Bbmaj7',
            ]);
            expect(new Set(turnaround.map((chord) => chord.key))).toEqual(new Set(['Bb']));
        });

        it('stores provenance notes for audited standards and theory-heavy reference presets', () => {
            const auditedPresets = [
                'Blue Bossa',
                'Autumn Leaves',
                'All The Things You Are',
                'Cherokee',
                'Stella by Starlight',
                'Giant Steps',
                'Ornithology',
                'Donna Lee',
                'Rhythm Changes',
                'Night and Day',
                'All Blues',
                'Circle of 4ths',
                'Plagal Flow',
            ].map((name) => CHORD_PRESETS.find((preset) => preset.name === name));

            auditedPresets.forEach((preset) => {
                expect(preset).toBeDefined();
                expect(preset.provenance?.variant).toBeTruthy();
                expect(preset.provenance?.notes).toBeTruthy();
            });

            const stella = CHORD_PRESETS.find((preset) => preset.name === 'Stella by Starlight');
            expect(stella.provenance).toMatchObject({
                variant: 'Modern / Real Book-oriented changes',
                references: ['Nat Yelverton, "Analysis of Stella by Starlight"'],
            });

            const referencedPresets = [
                'Giant Steps',
                'Donna Lee',
                'Rhythm Changes',
                'Night and Day',
            ].map((name) => CHORD_PRESETS.find((preset) => preset.name === name));
            referencedPresets.forEach((preset) => {
                expect(preset.provenance?.references?.length).toBeGreaterThan(0);
            });
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
            validateProgression(getState());
        });

        it('should select correct scales for rapid major-third key shifts', () => {
            const p = arranger.progression;
            expect(getScaleForChord(getState(), p[0], p[1], 'bird')).toEqual([
                0, 2, 4, 5, 7, 9, 11,
            ]); // Imaj7
            expect(getScaleForChord(getState(), p[1], p[2], 'bird')).toEqual([
                0, 2, 4, 5, 7, 9, 10,
            ]); // V7 of bVI
            expect(getScaleForChord(getState(), p[2], p[3], 'bird')).toEqual([
                0, 2, 4, 6, 7, 9, 11,
            ]); // Imaj7 (Lydian default)
        });

        it('should select Phrygian Dominant when anticipating minor resolutions', () => {
            const v7 = arranger.progression[1];
            const minorTarget = {
                rootMidi: v7.rootMidi + 5,
                quality: 'minor',
                intervals: [0, 3, 7],
                key: 'G',
                keyIsMinor: true,
            };
            expect(getScaleForChord(getState(), v7, minorTarget, 'bird')).toEqual([
                0, 1, 4, 5, 7, 8, 10,
            ]);
        });
    });

    // --- Rhythm Changes ---
    describe('Rhythm Changes', () => {
        beforeEach(() => {
            loadPreset('Rhythm Changes', 'Bb', false);
            groove.genreFeel = 'Jazz';
        });

        it('keeps plain bridge dominants idiomatic without forcing altered colors', () => {
            const bridge = arranger.progression.filter((chord) => chord.sectionLabel === 'B');
            expect(bridge.map((chord) => chord.absName)).toEqual([
                'D7',
                'D7',
                'G7',
                'G7',
                'C7',
                'C7',
                'F7',
                'F7',
            ]);

            expect(getScaleForChord(getState(), bridge[1], bridge[2], 'bird')).toEqual([
                0, 2, 4, 5, 7, 9, 10,
            ]); // III7 stays Mixolydian
            expect(getScaleForChord(getState(), bridge[3], bridge[4], 'bird')).toEqual([
                0, 2, 4, 5, 7, 9, 10,
            ]); // VI7 stays Mixolydian
            expect(getScaleForChord(getState(), bridge[5], bridge[6], 'bird')).toEqual([
                0, 2, 4, 6, 7, 9, 10,
            ]); // II7 keeps the brighter Lydian Dominant color
        });
    });

    // --- Night and Day ---
    describe('Night and Day', () => {
        beforeEach(() => {
            loadPreset('Night and Day', 'C', false);
            groove.genreFeel = 'Jazz';
        });

        it('keeps chromatic diminished passing chords on the symmetric whole-half collection', () => {
            const verseB = arranger.progression.filter(
                (chord) => chord.sectionLabel === 'Verse (B)',
            );
            expect(verseB.map((chord) => chord.absName)).toEqual([
                'F#m7',
                'Fm7',
                'Em7',
                'Ebdim7',
                'Dm7',
                'G7',
                'Cmaj7',
                'Cmaj7',
            ]);

            expect(getScaleForChord(getState(), verseB[3], verseB[4], 'bird')).toEqual([
                0, 2, 3, 5, 6, 8, 9, 11,
            ]); // Ebdim7 as chromatic passing diminished
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
                    value: 'Bbmaj7 | Bbmaj7 | Fm7 | Bb7 | Ebmaj7 | Ebmaj7 | Ab7 | Ab7 | Bbmaj7 | Bbmaj7 | C7 | C7 | Cm7 | G7 | Cm7 | F7+',
                },
                {
                    id: 'A2',
                    label: 'A2',
                    key: 'Bb',
                    value: 'Bbmaj7 | Bbmaj7 | Fm7 | Bb7 | Ebmaj7 | Ebmaj7 | Ab7 | Ab7 | Bbmaj7 | Bbmaj7 | C7 | C7 | Cm7 | F7 | Bbmaj7 | Bbmaj7',
                },
                { id: 'B1', label: 'B (B)', key: 'B', value: 'C#m7 | F#7 | Bmaj7 | Bmaj7' },
                {
                    id: 'B2',
                    label: 'B (A)',
                    key: 'A',
                    value: 'Bm7 | E7 | Amaj7 | Amaj7',
                    seamless: true,
                },
                {
                    id: 'B3',
                    label: 'B (G)',
                    key: 'G',
                    value: 'Am7 | D7 | Gmaj7 | Gmaj7',
                    seamless: true,
                },
                {
                    id: 'B4',
                    label: 'B (Bb)',
                    key: 'Bb',
                    value: 'Gm7 | C7 | Cm7 | F7+',
                    seamless: true,
                },
            ];
            validateProgression(getState());
        });

        it('should correctly identify the key center for the Bridge modulations', () => {
            const bChord = arranger.progression.find(
                (c) => c.sectionLabel === 'B (B)' && c.quality === 'maj7',
            );
            expect(bChord.key).toBe('B');
            const scale = getScaleForChord(getState(), bChord, null, 'bird');
            expect(scale).toContain(0);
            expect(scale).toContain(4);
            expect(scale).toContain(11);
        });

        it('should shift key center for the A Major modulation', () => {
            const aSection = arranger.progression.find(
                (c) => c.sectionLabel === 'B (A)' && c.quality === 'maj7',
            );
            expect(aSection.key).toBe('A');
            const scale = getScaleForChord(getState(), aSection, null, 'bird');
            expect(scale).toContain(0);
            expect(scale).toContain(4);
            expect(scale).toContain(11);
        });

        it('should shift key center for the G Major modulation', () => {
            const gSection = arranger.progression.find(
                (c) => c.sectionLabel === 'B (G)' && c.quality === 'maj7',
            );
            expect(gSection.key).toBe('G');
            const scale = getScaleForChord(getState(), gSection, null, 'bird');
            expect(scale).toContain(0);
            expect(scale).toContain(4);
            expect(scale).toContain(11);
        });

        it('should return toward Bb with the common Gm7-C7 / Cm7-F7#5 motion', () => {
            const returnSection = arranger.progression.filter((c) => c.sectionLabel === 'B (Bb)');
            expect(returnSection.map((chord) => chord.absName)).toEqual([
                'Gm7',
                'C7',
                'Cm7',
                'F7+',
            ]);
            expect(returnSection.at(-1).quality).toBe('aug');
            expect(returnSection.at(-1).is7th).toBe(true);
        });
    });

    // --- Andalusian Cadence ---
    describe('Andalusian Cadence', () => {
        beforeEach(() => {
            arranger.key = 'A';
            arranger.isMinor = true;
            arranger.sections = [{ id: 'Main', label: 'Main', value: 'i | bVII | bVI | V' }];
            validateProgression(getState());
            soloist.isResting = false;
            soloist.currentPhraseSteps = 0;
            soloist.notesInPhrase = 0;
            groove.genreFeel = 'Rock';
        });

        it('should select correct scales for the descending minor progression', () => {
            const p = arranger.progression;
            expect(getScaleForChord(getState(), p[0], p[1], 'smart')).toEqual([
                0, 2, 3, 5, 7, 8, 10,
            ]); // i (Am)
            expect(getScaleForChord(getState(), p[1], p[2], 'smart')).toEqual([
                0, 2, 4, 5, 7, 9, 10,
            ]); // bVII (G)
            expect(getScaleForChord(getState(), p[2], p[3], 'smart')).toEqual([
                0, 2, 4, 6, 7, 9, 11,
            ]); // bVI (F) Lydian
            expect(getScaleForChord(getState(), p[3], null, 'smart')).toEqual([
                0, 1, 4, 5, 7, 8, 10,
            ]); // V (E) Phryg Dom
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
            validateProgression(getState());
            soloist.isResting = false;
            soloist.currentPhraseSteps = 0;
            soloist.notesInPhrase = 0;
            groove.genreFeel = 'Blues';
        });

        it('should prioritize the Blues Scale over Dominant I chords', () => {
            const scale = getScaleForChord(
                getState(),
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
            let lastFreq = 440;
            for (let i = 0; i < 400; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.lastAttackStep = -100;
                const result = getSoloistNote(
                    getState(),
                    arranger.progression[0],
                    null,
                    i * 4,
                    lastFreq,
                    72,
                    'blues',
                    0,
                    { bypassRhythm: true },
                );
                if (result) {
                    const notes = Array.isArray(result) ? result : [result];
                    lastFreq = getFrequency(notes[0].midi);
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
                validateProgression(getState());
            });

            it('should select correct scales for modulation to Db Major', () => {
                const p = arranger.progression;
                expect(getScaleForChord(getState(), p[8], p[9], 'bossa')).toEqual([
                    0, 2, 3, 5, 7, 9, 10,
                ]); // Ebm7 (Dorian)
                expect(getScaleForChord(getState(), p[9], p[10], 'bossa')).toEqual([
                    0, 2, 4, 5, 7, 9, 10,
                ]); // Ab7 (Mixolydian)
                expect(getScaleForChord(getState(), p[10], null, 'bossa')).toContain(6); // Dbmaj7 (Lydian)
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
                validateProgression(getState());
            });

            it('should maintain Dorian mode', () => {
                const scale = getScaleForChord(getState(), arranger.progression[0], null, 'bird');
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
                validateProgression(getState());
            });

            it('should handle 5/4 meter in bass', () => {
                const note1 = getBassNote(
                    getState(),
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
            validateProgression(getState());
        });

        it('should correctly identify and voice slash chords', () => {
            const iv9g = arranger.progression[0];
            expect(iv9g.display.name.bass).toBe('G');
            expect(iv9g.bassMidi % 12).toBe(7); // G
        });

        it('should generate bass line respecting slash note', () => {
            const result = getBassNote(
                getState(),
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
            validateProgression(getState());
        });

        it('should correctly select scales for shifting ii-V patterns', () => {
            const p = arranger.progression;
            expect(getScaleForChord(getState(), p[0], p[1], 'bird')).toEqual([
                0, 2, 4, 5, 7, 9, 11,
            ]); // Gmaj7
            expect(getScaleForChord(getState(), p[2], p[3], 'bird')).toEqual([
                0, 2, 3, 5, 7, 9, 10,
            ]); // Gm7
            expect(getScaleForChord(getState(), p[3], p[4], 'bird')).toEqual([
                0, 2, 4, 5, 7, 9, 10,
            ]); // C7
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
            validateProgression(getState());
        });

        it('should correctly handle the Bird-style chromatic shifts and Lydian Dominant II7', () => {
            const p = arranger.progression;
            expect(getScaleForChord(getState(), p[1], p[2], 'bird')).toEqual([
                0, 2, 4, 5, 7, 9, 10,
            ]); // VI7 (F7)
            expect(getScaleForChord(getState(), p[2], p[3], 'bird')).toEqual([
                0, 2, 4, 6, 7, 9, 10,
            ]); // II7 (Bb7) Lydian Dominant
        });

        it('should select correct scales for the modulation to G Major (B)', () => {
            const p = arranger.progression;
            // B starts at index 9
            const am7 = p[13]; // #im7
            const d7 = p[14]; // #IV7
            const gmaj7 = p[15]; // VIImaj7

            expect(getScaleForChord(getState(), am7, d7, 'bird')).toEqual([0, 2, 3, 5, 7, 9, 10]); // Am7 Dorian
            expect(getScaleForChord(getState(), d7, gmaj7, 'bird')).toEqual([0, 2, 4, 5, 7, 9, 10]); // D7 Mixolydian
            expect(getScaleForChord(getState(), gmaj7, null, 'bird')).toEqual([
                0, 2, 4, 6, 7, 9, 11,
            ]); // Gmaj7 Lydian
        });

        it('should handle the C section progression correctly', () => {
            const p = arranger.progression;
            // C starts at index 26
            const dbmaj7 = p[26]; // IVmaj7
            const ddim7 = p[27]; // #IVdim7
            const ab_eb = p[28]; // Imaj7/V

            expect(getScaleForChord(getState(), dbmaj7, ddim7, 'bird')).toEqual([
                0, 2, 4, 6, 7, 9, 11,
            ]); // Dbmaj7 Lydian
            expect(getScaleForChord(getState(), ddim7, ab_eb, 'bird')).toEqual([
                0, 2, 3, 5, 6, 8, 9, 11,
            ]); // Ddim7 Whole-Half
            expect(ab_eb.bassMidi % 12).toBe(3); // Eb bass (V of Ab)
            const voicedPitchClasses = new Set(ab_eb.freqs.map((freq) => getMidi(freq) % 12));
            expect(voicedPitchClasses.has(8)).toBe(true); // Ab root
            expect(voicedPitchClasses.has(0)).toBe(true); // C third
            expect(voicedPitchClasses.has(7)).toBe(true); // G major seventh
        });
    });

    // --- Royal Road ---
    describe('Royal Road', () => {
        beforeEach(() => {
            arranger.key = 'C';
            arranger.isMinor = false;
            groove.genreFeel = 'Rock';
            arranger.sections = [{ id: 'Main', label: 'Main', value: 'IVmaj7 | V7 | iii7 | vi7' }];
            validateProgression(getState());
        });

        it('should select correct scales', () => {
            const p = arranger.progression;
            expect(getScaleForChord(getState(), p[0], p[1], 'smart')).toEqual([
                0, 2, 4, 6, 7, 9, 11,
            ]); // Fmaj7 Lydian
            expect(getScaleForChord(getState(), p[2], p[3], 'smart')).toEqual([
                0, 1, 3, 5, 7, 8, 10,
            ]); // Em7 Phrygian
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
                    value: 'Em7b5 | A7b9 | Cm7 | F7b9 | Fm7 | Bb7 | Ebmaj7 | Ab7',
                },
                {
                    id: 'B',
                    label: 'B',
                    value: 'Bbmaj7 | Em7b5 A7b9 | Dm7 | Bbm7 Eb7 | Fmaj7 | Em7b5 A7 | Am7b5 | D7b9',
                },
                {
                    id: 'C',
                    label: 'C',
                    value: 'G7#5 | G7#5 | Cm7 | Cm7 | Ab7 | Ab7 | Bbmaj7 | Bbmaj7',
                },
                {
                    id: 'D',
                    label: 'D',
                    value: 'Em7b5 | A7b9 | Dm7b5 | G7b9 | Cm7b5 | F7b9 | Bbmaj7 | Bbmaj7',
                },
            ];
            validateProgression(getState());
        });

        it('should parse the source-backed modern form', () => {
            expect(arranger.measureMap).toHaveLength(32);
            expect(arranger.progression.slice(0, 8).map((chord) => chord.absName)).toEqual([
                'Em7b5',
                'A7b9',
                'Cm7',
                'F7b9',
                'Fm7',
                'Bb7',
                'Ebmaj7',
                'Ab7',
            ]);
            expect(
                arranger.progression
                    .filter((chord) => chord.sectionLabel === 'D')
                    .map((chord) => chord.absName),
            ).toEqual(['Em7b5', 'A7b9', 'Dm7b5', 'G7b9', 'Cm7b5', 'F7b9', 'Bbmaj7', 'Bbmaj7']);
        });

        it('should select appropriate scales for the modern dominant colors', () => {
            const p = arranger.progression;
            expect(getScaleForChord(getState(), p[0], p[1], 'bird')).toEqual([
                0, 2, 3, 5, 6, 8, 10,
            ]); // Locrian natural 2
            expect(getScaleForChord(getState(), p[1], p[2], 'bird')).toEqual([
                0, 1, 4, 5, 7, 8, 10,
            ]); // Phrygian Dominant
            expect(getScaleForChord(getState(), p[3], p[4], 'bird')).toEqual([
                0, 1, 4, 5, 7, 8, 10,
            ]); // Phrygian Dominant
            expect(getScaleForChord(getState(), p[17], p[18], 'bird')).toEqual([
                0, 2, 3, 5, 6, 8, 10,
            ]); // Locrian natural 2 on Am7b5
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
            validateProgression(getState());
        });

        it('should select appropriate scales for turnaround', () => {
            const p = arranger.progression;
            expect(getScaleForChord(getState(), p[0], p[1], 'bird')).toEqual([
                0, 2, 4, 5, 7, 9, 11,
            ]); // I
            expect(getScaleForChord(getState(), p[1], p[2], 'bird')).toEqual([
                0, 2, 3, 5, 7, 9, 10,
            ]); // vi7
        });

        it('should handle Bridge secondary dominants', () => {
            const iii7 = arranger.progression.find((c) => c.sectionLabel === 'B');
            expect(getScaleForChord(getState(), iii7, null, 'bird')).toEqual([
                0, 2, 4, 5, 7, 9, 10,
            ]); // III7
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
            validateProgression(getState());
        });

        it('should navigate Cycle of Fifths', () => {
            const p = arranger.progression;
            const scaleVi = getScaleForChord(getState(), p[0], p[1], 'bird');
            expect(scaleVi).toContain(3);
            expect(scaleVi).toContain(10);
        });

        it('should handle Bridge modulation', () => {
            const b2Chords = arranger.progression.filter((c) => c.sectionId === 'B2');
            expect(getScaleForChord(getState(), b2Chords[0], b2Chords[1], 'bird')).toEqual([
                0, 1, 3, 5, 6, 8, 10,
            ]); // Locrian
            expect(getScaleForChord(getState(), b2Chords[3], null, 'bird')).toEqual([
                0, 1, 3, 4, 6, 8, 10,
            ]); // Altered
        });
    });
});
