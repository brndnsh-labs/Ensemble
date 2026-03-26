import { beforeEach, describe, expect, it, vi } from 'vitest';

// cspell:ignore Bdim

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
        soloist: {
            tension: 0,
        },
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
import { getScaleForChord } from '../../../public/engine/theory-scales.js';

describe('Music Theory: Scale Correctness', () => {
    beforeEach(() => {
        // Reset state to default C Major Jazz context
        mockState.arranger.key = 'C';
        mockState.arranger.isMinor = false;
        mockState.groove.genreFeel = 'Jazz';
        mockState.soloist.tension = 0;
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
            mockState.soloist.tension = 0.8;
            const chord7sharp11 = { rootMidi: 67, quality: '7#11', intervals: [0, 4, 7, 10, 18] };
            expect(getScaleForChord(mockState, chord7sharp11)).toEqual([0, 2, 4, 6, 7, 9, 10]);
        });

        it('assigns Phrygian Dominant to V7 resolving to minor', () => {
            const chordV7 = { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10] };
            const chordIm = { rootMidi: 60, quality: 'minor', intervals: [0, 3, 7] };
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
            mockState.soloist.tension = 0.8;
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
