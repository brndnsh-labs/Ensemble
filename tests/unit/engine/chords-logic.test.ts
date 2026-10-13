// @ts-nocheck
/* eslint-disable */
// cspell:ignore iidim Emaj Fbmaj Cbmaj
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock dependencies
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.5 },
        chords: {},
        arranger: {
            timeSignature: '4/4',
            key: 'C',
            isMinor: false,
            notation: 'roman',
            sections: [],
        },
        groove: { genreFeel: 'Rock' },
        bass: { enabled: true },
        harmony: { enabled: false },
        soloist: makeSoloistMock({}),
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    ENHARMONIC_MAP: {
        'C#': 'Db',
        'D#': 'Eb',
        'F#': 'Gb',
        'G#': 'Ab',
        'A#': 'Bb',
        'B#': 'C',
        Cb: 'B',
        'E#': 'F',
        Fb: 'E',
    },
    ROMAN_VALS: { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 },
    NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11],
    INTERVAL_TO_ROMAN: {
        0: 'I',
        1: 'bII',
        2: 'II',
        3: 'bIII',
        4: 'III',
        5: 'IV',
        6: '#IV',
        7: 'V',
        8: 'bVI',
        9: 'VI',
        10: 'bVII',
        11: 'VII',
    },
    INTERVAL_TO_NNS: {
        0: '1',
        1: 'b2',
        2: '2',
        3: 'b3',
        4: '3',
        5: '4',
        6: 'b5',
        7: '5',
        8: 'b6',
        9: '6',
        10: 'b7',
        11: '7',
    },
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
}));

import { getChordDetails, validateProgression } from '../../../public/engine/chords-engine.js';
import { getState } from '../../../public/state.js';

const { arranger } = getState();

// The chart shows this: the Roman numeral a chord is written as, bass included.
const romanOf = (chord) => chord.display.roman.root + chord.display.roman.suffix;

describe('Chord parsing and naming', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Chord Parsing (getChordDetails)', () => {
        it('should correctly identify various chord qualities', () => {
            expect(getChordDetails('C').quality).toBe('major');
            expect(getChordDetails('m7').quality).toBe('minor');
            expect(getChordDetails('m7').is7th).toBe(true);
            expect(getChordDetails('maj7').quality).toBe('maj7');
            expect(getChordDetails('7alt').quality).toBe('7alt');
            // #1329 — this pin used to assert '13', which sounds a NATURAL 9 against the
            // written b9. The bare `13b9` spelling already moved to the altered dominant in
            // #1324; this compound one was left behind only because this line pinned it.
            expect(getChordDetails('13(#11b9)').quality).toBe('7b9');
            expect(getChordDetails('m7/G').quality).toBe('minor');
        });

        it.each([
            ['Cmaj11', 'maj11'],
            ['Cmaj7#11', 'maj7#11'],
            ['Cadd9', 'add9'],
            ['Cm6', 'm6'],
        ])('extracts the extended quality of %s as %s', (input, quality) => {
            expect(getChordDetails(input).quality).toBe(quality);
        });

        it.each([
            ['C9', '9'],
            ['C11', '11'],
            ['C13', '13'],
            ['C7b9', '7b9'],
            ['C7#9', '7#9'],
            ['C7b5', '7b5'],
            ['C7#5', 'aug'],
        ])('reads the dominant extension %s as %s, a seventh chord', (input, quality) => {
            const details = getChordDetails(input);
            expect(details.quality).toBe(quality);
            expect(details.is7th).toBe(true);
        });
    });

    describe('Preset Validation (validateProgression)', () => {
        it('should generate correct chords for Minor Blues in C Minor', () => {
            arranger.sections = [
                { id: 's1', label: 'Main', value: 'i7 | i7 | iv7 | V7', repeat: 1 },
            ];
            arranger.key = 'C';
            arranger.isMinor = true;
            validateProgression(getState());

            expect(arranger.progression[0].absName).toBe('Cm7');
            expect(arranger.progression[2].absName).toBe('Fm7');
            expect(arranger.progression[3].absName).toBe('G7');
        });

        it('should preserve explicit sharp roman spellings in parsed display names', () => {
            arranger.sections = [
                { id: 's1', label: 'Main', value: '#ivm7b5 | VII7alt', repeat: 1 },
            ];
            arranger.key = 'Bb';
            arranger.isMinor = false;

            validateProgression(getState());

            expect(romanOf(arranger.progression[0])).toBe('#ivø');
            expect(romanOf(arranger.progression[1])).toBe('VII7alt');
        });

        // #1662 — a lowercase numeral is read literally as minor, on every degree, because that
        // is what the band plays for the token. `vii` and `vii7` were once shown as the key's
        // half-diminished seventh while the band played a B minor chord under it.
        it('reads plain vii and vii7 as minor chords; the half-diminished is written out', () => {
            arranger.sections = [
                { id: 's1', label: 'Main', value: 'vii | vii7 | viim7b5 | Imaj7', repeat: 1 },
            ];
            arranger.key = 'C';
            arranger.isMinor = false;

            validateProgression(getState());

            expect(arranger.progression.map((chord) => chord.absName)).toEqual([
                'Bm',
                'Bm7',
                'Bm7b5',
                'Cmaj7',
            ]);
            expect(arranger.progression.map(romanOf)).toEqual(['vii', 'vii7', 'viiø', 'Imaj7']);
        });

        // #1662 — the rest of the same rule: the suffix's major third is lowered and nothing
        // else moves. A dominant 11th is written without a third, so `i11` takes a minor one
        // outright and reads as the minor 11th (#1674).
        it.each([
            ['i7b5', 'Cm7b5', 'iø'],
            ['i7#5', 'Cm7#5', 'i7#5'],
            ['i7b9', 'Cm7b9', 'i7b9'],
            ['i7#11', 'Cm7#11', 'i7#11'],
            ['i7b13', 'Cm7b13', 'i7b13'],
            ['i7#9', 'Cm7', 'i7'],
            ['i11', 'Cm11', 'i11'],
            ['ii11', 'Dm11', 'ii11'],
            ['bvii11', 'Bbm11', 'bvii11'],
            ['i+', 'Cm#5', 'i#5'],
            ['imaj7', 'CmMaj7', 'iMaj7'],
            ['iadd9', 'Cmadd9', 'iadd9'],
            ['I7b9', 'C7b9', 'I7b9'],
            ['I11', 'C11', 'I11'],
        ])('names %s as %s (%s in roman numerals)', (written, name, roman) => {
            arranger.sections = [{ id: 's1', label: 'Main', value: written, repeat: 1 }];
            arranger.key = 'C';
            arranger.isMinor = false;

            validateProgression(getState());

            expect(arranger.progression[0].absName).toBe(name);
            expect(romanOf(arranger.progression[0])).toBe(roman);
        });

        it('should preserve uppercase VII7 as an explicit dominant rather than forcing half-diminished', () => {
            arranger.sections = [{ id: 's1', label: 'Main', value: 'VII7 | Imaj7', repeat: 1 }];
            arranger.key = 'Bb';
            arranger.isMinor = false;

            validateProgression(getState());

            expect(arranger.progression[0].absName).toBe('A7');
            expect(romanOf(arranger.progression[0])).toBe('VII7');
        });

        it('should spell sharp-side local-key chords with sharp absolute names', () => {
            arranger.sections = [
                { id: 's1', label: 'Bridge', key: 'E', value: 'iidim7 | V7 | Imaj7' },
            ];
            arranger.key = 'Ab';
            arranger.isMinor = false;

            validateProgression(getState());

            expect(arranger.progression[0].absName).toBe('F#dim7');
            expect(arranger.progression[1].absName).toBe('B7');
            expect(arranger.progression[2].absName).toBe('Emaj7');
        });

        it('names a slash chord with its bass note in the key it is written in', () => {
            arranger.sections = [
                { id: 's1', label: 'Verse', value: 'IVmaj9/5 | III7#9 | G7/B', repeat: 1 },
            ];
            arranger.key = 'C';
            arranger.isMinor = false;

            validateProgression(getState());

            expect(arranger.progression[0].absName).toBe('Fmaj9/G');
            expect(arranger.progression[2].absName).toBe('G7/B');
        });
    });

    // -----------------------------------------------------------------------
    // Bug-fix regression tests (GitHub #776)
    // -----------------------------------------------------------------------

    describe('Bug #776 — maj7 alt-symbol parsing', () => {
        it('△7 should resolve to maj7, not dominant 7', () => {
            expect(getChordDetails('△7').quality).toBe('maj7');
        });

        it('^7 should resolve to maj7, not dominant 7', () => {
            expect(getChordDetails('^7').quality).toBe('maj7');
        });

        it('ma7 should resolve to maj7, not minor', () => {
            const details = getChordDetails('ma7');
            expect(details.quality).toBe('maj7');
            // Cma7 must NOT parse as minor (the 'm' prefix must not win over 'ma7')
            expect(details.quality).not.toBe('minor');
        });

        it('Cma7 full symbol should not be minor', () => {
            expect(getChordDetails('Cma7').quality).not.toBe('minor');
            expect(getChordDetails('Cma7').quality).toBe('maj7');
        });

        it('existing m7b5/ø/h7 → halfdim still correct after regex change', () => {
            expect(getChordDetails('m7b5').quality).toBe('halfdim');
            expect(getChordDetails('ø7').quality).toBe('halfdim');
            expect(getChordDetails('h7').quality).toBe('halfdim');
        });

        it('existing dim7/o7/°7 → dim still correct after regex change', () => {
            expect(getChordDetails('dim7').quality).toBe('dim');
            expect(getChordDetails('o7').quality).toBe('dim');
        });

        it('existing aug/7#5/aug7/+7 → aug still correct after regex change', () => {
            expect(getChordDetails('7#5').quality).toBe('aug');
            expect(getChordDetails('aug7').quality).toBe('aug');
            expect(getChordDetails('+7').quality).toBe('aug');
        });

        it('existing sus4/sus2 still correct after regex change', () => {
            expect(getChordDetails('sus4').quality).toBe('sus4');
            expect(getChordDetails('sus2').quality).toBe('sus2');
        });

        it('existing 6 still correct after regex change', () => {
            expect(getChordDetails('6').quality).toBe('6');
        });
    });

    // Read off the Nashville number: in C it names the degree the root resolved to.
    describe('Bug #776 — enharmonic root pitch resolution', () => {
        it('B# resolves to the 1 (C)', () => {
            arranger.sections = [{ id: 's1', label: 'Main', value: 'B#maj7', repeat: 1 }];
            arranger.key = 'C';
            arranger.isMinor = false;
            validateProgression(getState());
            expect(arranger.progression[0].display.nns.root).toBe('1');
        });

        it('E# resolves to the 4 (F)', () => {
            arranger.sections = [{ id: 's1', label: 'Main', value: 'E#maj7', repeat: 1 }];
            arranger.key = 'C';
            arranger.isMinor = false;
            validateProgression(getState());
            expect(arranger.progression[0].display.nns.root).toBe('4');
        });

        it('Fb resolves to the 3 (E)', () => {
            arranger.sections = [{ id: 's1', label: 'Main', value: 'Fbmaj7', repeat: 1 }];
            arranger.key = 'C';
            arranger.isMinor = false;
            validateProgression(getState());
            expect(arranger.progression[0].display.nns.root).toBe('3');
        });

        it('Cb resolves to the 7 (B)', () => {
            arranger.sections = [{ id: 's1', label: 'Main', value: 'Cbmaj7', repeat: 1 }];
            arranger.key = 'C';
            arranger.isMinor = false;
            validateProgression(getState());
            expect(arranger.progression[0].display.nns.root).toBe('7');
        });
    });

    describe('Bug #776 — Cadd9 display label', () => {
        it('Cadd9 absName should not contain a stray 7', () => {
            arranger.sections = [{ id: 's1', label: 'Main', value: 'Cadd9', repeat: 1 }];
            arranger.key = 'C';
            arranger.isMinor = false;
            validateProgression(getState());
            expect(arranger.progression[0].absName).toBe('Cadd9');
            expect(arranger.progression[0].absName).not.toContain('7');
        });

        // #1316 → #1322. `getChordDetails('add9')` used to report is7th=TRUE (its "9" tripped
        // the raw-symbol heuristic), which sent a b7 in that the chart explicitly didn't
        // write. #1322 derives `is7th` from the matched QUALITY, so an added tone can no longer
        // claim a seventh.
        it('Cadd9 declares no seventh', () => {
            expect(getChordDetails('add9').is7th).toBe(false);
        });
    });

    describe('#780 — 6/9, 7sus4, add2 qualities (no silent-major fallback)', () => {
        it('parses the compound qualities instead of the bare prefix', () => {
            expect(getChordDetails('6/9').quality).toBe('6/9');
            expect(getChordDetails('6/9').is7th).toBe(false); // 6/9 has no 7th
            expect(getChordDetails('7sus4').quality).toBe('7sus4');
            expect(getChordDetails('7sus4').is7th).toBe(true); // suspended dominant
            expect(getChordDetails('add2').quality).toBe('add2');
        });

        it('C6/9 parses end-to-end as one chord, not "C6 over a 9 bass"', () => {
            arranger.sections = [{ id: 's1', label: 'Main', value: 'C6/9', repeat: 1 }];
            arranger.key = 'C';
            arranger.isMinor = false;
            validateProgression(getState());
            // The whole token is one chord — the slash is notation, not a bass split.
            expect(arranger.progression).toHaveLength(1);
            expect(arranger.progression[0].absName).toBe('C6/9');
        });
    });

    // #1317 — in roman-numeral notation a lowercase numeral means minor, and
    // `parseProgressionPart` remaps the quality accordingly — but its remap had no
    // entry for a 6th, so `iv6` (an everyday minor-key chord: the Minor Swing changes
    // are `i6 | iv6 | V7`) parsed as the MAJOR 6th quality, sounding an A natural over
    // an F minor triad.
    describe('#1317 — a lowercase numeral makes a 6th chord minor', () => {
        it('parses iv6 as Fm6 in C and leaves IV6 major', () => {
            arranger.sections = [{ id: 's1', label: 'Main', value: 'iv6 | IV6', repeat: 1 }];
            arranger.key = 'C';
            arranger.isMinor = false;
            validateProgression(getState());

            const [minorSix, majorSix] = arranger.progression;
            expect(minorSix.absName).toBe('Fm6');
            // #1313 — an m6 has no 7th; a true is7th re-adds the b7 it must never carry.
            expect(getChordDetails('m6').is7th).toBe(false);

            expect(majorSix.absName).toBe('F6'); // IV6 is still major
        });

        it('parses the Minor Swing changes in A minor as Am6 | Dm6 | E7', () => {
            arranger.sections = [{ id: 's1', label: 'Main', value: 'i6 | iv6 | V7', repeat: 1 }];
            arranger.key = 'A';
            arranger.isMinor = true;
            validateProgression(getState());

            expect(arranger.progression.map((chord) => chord.absName)).toEqual([
                'Am6',
                'Dm6',
                'E7',
            ]);
        });
    });

    describe('Step maps (updateProgressionCache, via validateProgression)', () => {
        it('rebuilds the progression, step map and total from the sections', () => {
            arranger.sections = [{ id: 's1', label: 'Main', value: 'F G7 | C', repeat: 1 }];
            arranger.key = 'C';
            arranger.isMinor = false;
            validateProgression(getState());

            expect(arranger.progression.map((chord) => chord.absName)).toEqual(['F', 'G7', 'C']);
            expect(arranger.stepMap.map(({ start, end }) => [start, end])).toEqual([
                [0, 8],
                [8, 16],
                [16, 32],
            ]);
            expect(arranger.totalSteps).toBe(32);
        });
    });
});
