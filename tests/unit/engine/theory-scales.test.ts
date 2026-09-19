// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// cspell:ignore Bdim tonicization tonicized

// --- Global Mocks ---

const { mockState } = vi.hoisted(() => ({
    mockState: {
        arranger: {
            key: 'C',
            isMinor: false,
        },
        groove: {
            genreFeel: 'Jazz',
        },
        soloist: makeSoloistMock({
            tension: 0,
        }),
    },
}));

vi.mock('../../../public/state.js', () => ({
    stateMap: mockState,
    getState: () => mockState,
}));

vi.mock('../../../public/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    };
});

// --- Import Module Under Test ---
import { GENRE_NAMES } from '../../../public/data/smart-genres.js';
import { getScaleForChord } from '../../../public/engine/theory-scales.js';

describe('Music Theory: Scale Correctness', () => {
    beforeEach(() => {
        // Reset state to default C Major Jazz context
        mockState.arranger.key = 'C';
        mockState.arranger.isMinor = false;
        mockState.groove.genreFeel = 'Jazz';
        mockState.soloist.session.tension = 0;
    });

    describe('Diatonic Mode Selection', () => {
        beforeEach(() => {
            mockState.groove.genreFeel = 'Rock';
        });

        it('identifies Ionian for the I chord in Major', () => {
            const chordI = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7] };
            expect(getScaleForChord(mockState, chordI, null, 'scalar')).toEqual([
                0, 2, 4, 5, 7, 9, 11,
            ]);
        });

        it('identifies Dorian for the ii chord in Major', () => {
            const chordII = { rootMidi: 62, quality: 'minor', intervals: [0, 3, 7] };
            expect(getScaleForChord(mockState, chordII, null, 'scalar')).toEqual([
                0, 2, 3, 5, 7, 9, 10,
            ]);
        });

        it('identifies Phrygian for the iii chord in Major', () => {
            const chordIII = { rootMidi: 64, quality: 'minor', intervals: [0, 3, 7] };
            expect(getScaleForChord(mockState, chordIII, null, 'scalar')).toEqual([
                0, 1, 3, 5, 7, 8, 10,
            ]);
        });

        it('identifies Lydian for the IV chord in Major', () => {
            const chordIV = { rootMidi: 65, quality: 'major', intervals: [0, 4, 7] };
            expect(getScaleForChord(mockState, chordIV, null, 'scalar')).toEqual([
                0, 2, 4, 6, 7, 9, 11,
            ]);
        });

        it('identifies Mixolydian for the V chord in Major', () => {
            const chordV = { rootMidi: 67, quality: 'major', intervals: [0, 4, 7] };
            expect(getScaleForChord(mockState, chordV, null, 'scalar')).toEqual([
                0, 2, 4, 5, 7, 9, 10,
            ]);
        });

        it('identifies Natural Minor (Aeolian) for the vi chord in Major', () => {
            const chordVI = { rootMidi: 69, quality: 'minor', intervals: [0, 3, 7] };
            expect(getScaleForChord(mockState, chordVI, null, 'scalar')).toEqual([
                0, 2, 3, 5, 7, 8, 10,
            ]);
        });

        it('identifies Locrian for the vii chord in Major', () => {
            const chordVII = { rootMidi: 71, quality: 'halfdim', intervals: [0, 3, 6, 10] };
            expect(getScaleForChord(mockState, chordVII, null, 'scalar')).toEqual([
                0, 1, 3, 5, 6, 8, 10,
            ]);
        });
    });

    describe('Special Quality Specialists', () => {
        it('assigns Whole-Half Diminished to chromatic dim chords', () => {
            const chordDim = { rootMidi: 60, quality: 'dim', intervals: [0, 3, 6] };
            expect(getScaleForChord(mockState, chordDim)).toEqual([0, 2, 3, 5, 6, 8, 9, 11]);
        });

        it('uses diatonic Locrian for natural vii diminished triads in major', () => {
            mockState.groove.genreFeel = 'Rock';
            const chordBdim = { rootMidi: 71, quality: 'dim', intervals: [0, 3, 6] };
            expect(getScaleForChord(mockState, chordBdim, null, 'scalar')).toEqual([
                0, 1, 3, 5, 6, 8, 10,
            ]);
        });

        it('assigns Whole-Half Diminished to dim7 chords', () => {
            const chordDim7 = { rootMidi: 60, quality: 'dim7', intervals: [0, 3, 6, 9] };
            expect(getScaleForChord(mockState, chordDim7)).toEqual([0, 2, 3, 5, 6, 8, 9, 11]);
        });

        it('assigns Whole Tone to aug chords', () => {
            const chordAug = { rootMidi: 60, quality: 'aug', intervals: [0, 4, 8] };
            expect(getScaleForChord(mockState, chordAug)).toEqual([0, 2, 4, 6, 8, 10]);
        });

        it('assigns Lydian Augmented to augmaj7 chords', () => {
            const chordAugMaj7 = { rootMidi: 60, quality: 'augmaj7', intervals: [0, 4, 8, 11] };
            expect(getScaleForChord(mockState, chordAugMaj7)).toEqual([0, 2, 4, 6, 8, 9, 11]);
        });

        it('assigns fifth-less Lydian to maj7b5 chords', () => {
            const chordMaj7b5 = { rootMidi: 60, quality: 'maj7b5', intervals: [0, 4, 6, 11] };
            expect(getScaleForChord(mockState, chordMaj7b5)).toEqual([0, 2, 4, 6, 9, 11]);
        });

        it('assigns fifth-less Aeolian to m#5 chords', () => {
            const chordMSharp5 = { rootMidi: 60, quality: 'm#5', intervals: [0, 3, 8] };
            expect(getScaleForChord(mockState, chordMSharp5)).toEqual([0, 2, 3, 5, 8, 10]);
        });

        // #1340 — the 7th-chord sibling reuses the same pool: the b3, the ♯5 (as Aeolian's ♭6)
        // and the b7 are all there, and the 5 the chart sharpened is not. LOCRIAN also fits the
        // four chord tones but adds a FLAT fifth beside the written sharp one.
        it('assigns fifth-less Aeolian to m7#5 chords', () => {
            const chordM7Sharp5 = { rootMidi: 60, quality: 'm7#5', intervals: [0, 3, 8, 10] };
            expect(getScaleForChord(mockState, chordM7Sharp5)).toEqual([0, 2, 3, 5, 8, 10]);
        });

        // #1340 — `mb6` keeps its natural 5 (a ♭6 is a colour above the fifth, not an alteration
        // of it), so the honest pool is plain Aeolian. The branch exists to outrank the minor
        // family's DORIAN flavour override, whose natural 6 is the tone the chart flattened.
        it('assigns Aeolian to mb6 chords', () => {
            const chordMFlat6 = { rootMidi: 60, quality: 'mb6', intervals: [0, 3, 7, 8] };
            expect(getScaleForChord(mockState, chordMFlat6)).toEqual([0, 2, 3, 5, 7, 8, 10]);
        });

        /**
         * #1336 — `maj7b5` used to have no branch at all and fell through to LYDIAN, whose
         * natural 5 contradicts the written b5 on the one lane that still offered it (the
         * soloist's scale and the jazz walking bass's beat-2 path note); `m#5` fell through
         * to the minor family's Aeolian/Dorian, same defect one alteration over. The natural
         * 5 must be unreachable for EVERY root and EVERY genre, not just the jazz default:
         * country's MINOR/MAJOR_PENTATONIC, funk/blues' MAJOR_BLUES, the minor family's
         * DORIAN flavour override and the jazz/bossa non-diatonic LYDIAN fallback all carry a
         * 7, so this sweep is what pins the branches above them. The tension sweep covers
         * country's high-tension pool and the altered-dominant substitution, both of which
         * sit downstream of the branches.
         */
        it.each([
            // quality, its chord tones, the identity degrees the pool must still state
            ['maj7b5', [0, 4, 6, 11], [4, 6, 11]],
            ['m#5', [0, 3, 8], [3, 8]],
            // #1340 — the ♯5's 7th-chord sibling. Without its own branch the minor family below
            // answered DORIAN (Jazz/Neo-Soul/funk/bossa) or NATURAL_MINOR; both carry the 7.
            ['m7#5', [0, 3, 8, 10], [3, 8, 10]],
        ])('never offers the natural 5 of a %s in any key or genre', (quality, tones, identity) => {
            expect(GENRE_NAMES.length).toBe(13);
            for (const genre of GENRE_NAMES) {
                for (const tension of [0, 0.8]) {
                    for (let root = 60; root < 72; root++) {
                        mockState.groove.genreFeel = genre;
                        mockState.soloist.session.tension = tension;
                        const chord = { rootMidi: root, quality, intervals: tones };
                        const scale = getScaleForChord(mockState, chord, null, 'smart');
                        const where = `${quality} in ${genre} root=${root} tension=${tension}`;
                        expect(scale, `${where} offers the natural 5`).not.toContain(7);
                        // Subset-not-contradiction: the pool must still state the chord's own
                        // identity (its 3rd, its altered 5th, and its 7th where it has one).
                        for (const degree of identity) {
                            expect(scale, `${where} drops degree ${degree}`).toContain(degree);
                        }
                    }
                }
            }
        });

        // Same rule, one degree over: country's MINOR_PENTATONIC early return used to answer
        // before the mMaj7 specialist, handing the soloist the b7 the chord's maj7 replaces.
        it('never offers the b7 of an mMaj7 in any key or genre', () => {
            for (const genre of GENRE_NAMES) {
                for (const tension of [0, 0.8]) {
                    for (let root = 60; root < 72; root++) {
                        mockState.groove.genreFeel = genre;
                        mockState.soloist.session.tension = tension;
                        const chord = {
                            rootMidi: root,
                            quality: 'mMaj7',
                            intervals: [0, 3, 7, 11],
                        };
                        const scale = getScaleForChord(mockState, chord, null, 'smart');
                        const where = `mMaj7 in ${genre} root=${root} tension=${tension}`;
                        expect(scale, `${where} offers the b7`).not.toContain(10);
                        expect(scale, `${where} drops the b3`).toContain(3);
                        expect(scale, `${where} drops the maj7`).toContain(11);
                    }
                }
            }
        });

        /**
         * #1340 — the mirror sweep for `mb6`. Here the contradicted tone is the NATURAL 6
         * (degree 9): the minor family's genre flavour override answers DORIAN in Jazz,
         * Neo-Soul, funk and bossa, and Dorian's 6 is exactly the note the chart flattened —
         * the soloist would run it a semitone above the ♭6 the comper is voicing. The chord's
         * own 5 must SURVIVE (unlike the ♯5 qualities above, this fifth is written), and so
         * must the b3 and the ♭6 itself, or the written colour is unreachable — which is what
         * country's MINOR_PENTATONIC early return would have left it.
         */
        it('never offers the natural 6 of an mb6 in any key or genre, and keeps its 5th', () => {
            expect(GENRE_NAMES.length).toBe(13);
            for (const genre of GENRE_NAMES) {
                for (const tension of [0, 0.8]) {
                    for (let root = 60; root < 72; root++) {
                        mockState.groove.genreFeel = genre;
                        mockState.soloist.session.tension = tension;
                        const chord = { rootMidi: root, quality: 'mb6', intervals: [0, 3, 7, 8] };
                        const scale = getScaleForChord(mockState, chord, null, 'smart');
                        const where = `mb6 in ${genre} root=${root} tension=${tension}`;
                        expect(scale, `${where} offers the natural 6`).not.toContain(9);
                        for (const degree of [3, 7, 8]) {
                            expect(scale, `${where} drops degree ${degree}`).toContain(degree);
                        }
                    }
                }
            }
        });
    });

    describe('Dominant Chord Handling', () => {
        it('assigns Altered Dominant to 7alt chords', () => {
            const chord7alt = { rootMidi: 67, quality: '7alt', intervals: [0, 4, 10, 13] };
            expect(getScaleForChord(mockState, chord7alt)).toEqual([0, 1, 3, 4, 6, 8, 10]);
        });

        it('assigns Lydian Dominant to 7#11 chords', () => {
            const chord7sharp11 = { rootMidi: 67, quality: '7#11', intervals: [0, 4, 7, 10, 18] };
            expect(getScaleForChord(mockState, chord7sharp11)).toEqual([0, 2, 4, 6, 7, 9, 10]);
        });

        it('preserves explicit 7#11 quality even when tension is high', () => {
            mockState.soloist.session.tension = 0.8;
            const chord7sharp11 = { rootMidi: 67, quality: '7#11', intervals: [0, 4, 7, 10, 18] };
            expect(getScaleForChord(mockState, chord7sharp11)).toEqual([0, 2, 4, 6, 7, 9, 10]);
        });

        it('defaults plain dominants to Mixolydian when the minor target is not explicitly tonicized', () => {
            const chordV7 = { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10] };
            const chordIm = { rootMidi: 60, quality: 'minor', intervals: [0, 3, 7] };
            expect(getScaleForChord(mockState, chordV7, chordIm)).toEqual([0, 2, 4, 5, 7, 9, 10]);
        });

        it('assigns Phrygian Dominant when local minor metadata marks the target tonicization', () => {
            const chordV7 = { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10], key: 'C' };
            const chordIm = {
                rootMidi: 60,
                quality: 'minor',
                intervals: [0, 3, 7],
                key: 'C',
                keyIsMinor: true,
            };
            expect(getScaleForChord(mockState, chordV7, chordIm)).toEqual([0, 1, 4, 5, 7, 8, 10]);
        });

        it('assigns Phrygian Dominant to 7b9 chords', () => {
            const chord7b9 = { rootMidi: 67, quality: '7b9', intervals: [0, 4, 7, 10, 13] };
            expect(getScaleForChord(mockState, chord7b9)).toEqual([0, 1, 4, 5, 7, 8, 10]);
        });

        it('preserves explicit 7b9 quality over the jazz Lydian-dominant shortcut', () => {
            mockState.arranger.key = 'C';
            mockState.groove.genreFeel = 'Jazz';
            const chordD7b9 = { rootMidi: 62, quality: '7b9', intervals: [0, 4, 7, 10, 13] };
            const chordBb7b9 = { rootMidi: 70, quality: '7b9', intervals: [0, 4, 7, 10, 13] };
            expect(getScaleForChord(mockState, chordD7b9, null, 'bird')).toEqual([
                0, 1, 4, 5, 7, 8, 10,
            ]);
            expect(getScaleForChord(mockState, chordBb7b9, null, 'bird')).toEqual([
                0, 1, 4, 5, 7, 8, 10,
            ]);
        });

        it('uses Locrian natural 2 for half-diminished chords approaching a minor-colored dominant', () => {
            mockState.arranger.key = 'Bb';
            mockState.arranger.isMinor = false;
            const chordDm7b5 = { rootMidi: 62, quality: 'halfdim', intervals: [0, 3, 6, 10] };
            const chordG7b9 = { rootMidi: 67, quality: '7b9', intervals: [0, 4, 7, 10, 13] };
            expect(getScaleForChord(mockState, chordDm7b5, chordG7b9, 'bird')).toEqual([
                0, 2, 3, 5, 6, 8, 10,
            ]);
        });

        it('uses Locrian natural 2 for half-diminished chords in an explicitly minor local key', () => {
            const chordBm7b5 = {
                rootMidi: 71,
                quality: 'halfdim',
                intervals: [0, 3, 6, 10],
                key: 'A',
                keyIsMinor: true,
            };
            const chordE7 = {
                rootMidi: 64,
                quality: '7',
                intervals: [0, 4, 7, 10],
                key: 'A',
                keyIsMinor: true,
            };
            expect(getScaleForChord(mockState, chordBm7b5, chordE7, 'bird')).toEqual([
                0, 2, 3, 5, 6, 8, 10,
            ]);
        });

        it('detects Lydian Dominant for bVII7 in Jazz', () => {
            mockState.arranger.key = 'C';
            mockState.groove.genreFeel = 'Jazz';
            const chordBb7 = { rootMidi: 70, quality: '7', intervals: [0, 4, 7, 10] };
            expect(getScaleForChord(mockState, chordBb7, null, 'smart')).toEqual([
                0, 2, 4, 6, 7, 9, 10,
            ]);
        });

        it('uses a chord local key center for dominant-function detection in modulated sections', () => {
            mockState.arranger.key = 'C';
            mockState.groove.genreFeel = 'Jazz';
            const chordF7 = { rootMidi: 65, quality: '7', intervals: [0, 4, 7, 10], key: 'G' };
            expect(getScaleForChord(mockState, chordF7, null, 'bird')).toEqual([
                0, 2, 4, 6, 7, 9, 10,
            ]);
        });
    });

    describe('Genre & Style Overrides', () => {
        it('assigns Major Pentatonic to Country Major chords', () => {
            mockState.groove.genreFeel = 'Country';
            const chordC = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7] };
            expect(getScaleForChord(mockState, chordC, null, 'smart')).toEqual([0, 2, 4, 7, 9]);
        });

        it('assigns Major Blues to Country Major chords at high tension', () => {
            mockState.groove.genreFeel = 'Country';
            mockState.soloist.session.tension = 0.8;
            const chordC = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7] };
            expect(getScaleForChord(mockState, chordC, null, 'smart')).toEqual([0, 2, 3, 4, 7, 9]);
        });

        it('assigns Blues scale to Blues style dominant chords', () => {
            mockState.groove.genreFeel = 'Blues';
            const chordF7 = { rootMidi: 65, quality: '7', intervals: [0, 4, 7, 10] };
            // In theory-scales.js, blues style with dominant usually adds blue note.
            // Let's check the implementation:
            // `if (style === 'blues' || style === 'rock') return [0, 2, 3, 4, 5, 7, 9, 10].sort((a,b)=>a-b);`
            expect(getScaleForChord(mockState, chordF7, null, 'blues')).toEqual([
                0, 2, 3, 4, 5, 7, 9, 10,
            ]);
        });

        it('assigns Dorian to Neo-Soul minor chords', () => {
            mockState.groove.genreFeel = 'Neo-Soul';
            const chordAm7 = { rootMidi: 69, quality: 'm7', intervals: [0, 3, 7, 10] };
            expect(getScaleForChord(mockState, chordAm7, null, 'smart')).toEqual([
                0, 2, 3, 5, 7, 9, 10,
            ]);
        });

        it('assigns Phrygian Dominant to Metal dominant chords', () => {
            mockState.groove.genreFeel = 'Metal';
            const chordE7 = { rootMidi: 64, quality: '7', intervals: [0, 4, 7, 10] };
            expect(getScaleForChord(mockState, chordE7, null, 'smart')).toEqual([
                0, 1, 4, 5, 7, 8, 10,
            ]);
        });
    });

    describe('Non-Diatonic Fallbacks', () => {
        it('assigns Natural Minor for non-diatonic minor chords by default', () => {
            mockState.arranger.key = 'C';
            mockState.groove.genreFeel = 'Rock';
            // Eb minor is not diatonic to C Major
            const chordEbm = { rootMidi: 63, quality: 'minor', intervals: [0, 3, 7] };
            expect(getScaleForChord(mockState, chordEbm, null, 'smart')).toEqual([
                0, 2, 3, 5, 7, 8, 10,
            ]);
        });

        it('assigns Lydian for non-diatonic Major chords in Jazz/Bird style', () => {
            mockState.arranger.key = 'C';
            mockState.groove.genreFeel = 'Jazz';
            // Db Major is not diatonic to C Major
            const chordDbMaj7 = { rootMidi: 61, quality: 'maj7', intervals: [0, 4, 7, 11] };
            expect(getScaleForChord(mockState, chordDbMaj7, null, 'bird')).toEqual([
                0, 2, 4, 6, 7, 9, 11,
            ]);
        });

        it('assigns Major for non-diatonic Major chords in Rock style', () => {
            mockState.arranger.key = 'C';
            mockState.groove.genreFeel = 'Rock';
            // Eb Major is not diatonic to C Major
            const chordEb = { rootMidi: 63, quality: 'major', intervals: [0, 4, 7] };
            expect(getScaleForChord(mockState, chordEb, null, 'smart')).toEqual([
                0, 2, 4, 5, 7, 9, 11,
            ]);
        });

        it('normalizes sharp keys before doing diatonic mode checks', () => {
            mockState.arranger.key = 'F#';
            mockState.arranger.isMinor = false;
            mockState.groove.genreFeel = 'Rock';
            const chordAbm = { rootMidi: 68, quality: 'minor', intervals: [0, 3, 7] };
            expect(getScaleForChord(mockState, chordAbm, null, 'scalar')).toEqual([
                0, 2, 3, 5, 7, 9, 10,
            ]);
        });
    });
});
