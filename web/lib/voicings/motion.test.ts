/**
 * The common tones of a change (#1618): `sharedNotes` reads a note two grips fret (or leave open)
 * in the same place, with what it is in each chord. The narration built on it is
 * `fingersLine`'s, tested in `app/use-neck-view.test.ts`.
 */
import { parseChord } from '@band/index';
import { describe, expect, it } from 'vitest';
import { voicingChord } from './adapter';
import { GUITAR, UKULELE } from './instruments';
import { type SharedNote, sharedNotes, spokenDegree } from './motion';
import { DEGREES } from './theory';
import type { Degree, HomeWindow, InstrumentDef, Voicing } from './types';
import { voiceChart } from './voicing';

const TONIC: Record<string, number> = { C: 0, 'B♭': 10 };
const voiced = (
    instrument: InstrumentDef,
    names: string[],
    home: HomeWindow | null,
    { key = 'C', rootStrings }: { key?: string; rootStrings?: number[] } = {},
): Voicing[] =>
    voiceChart(
        names.map((s) => {
            const p = voicingChord(parseChord(s, { tonic: TONIC[key], minor: false })!, key, false);
            return { root: p.root, quality: p.quality };
        }),
        { instrument, home, rootStrings },
    );
const tab = (inst: InstrumentDef, v: Voicing) => {
    const m = new Map(v.notes.map((n) => [n.string, n.fret]));
    return Array.from({ length: inst.strings }, (_, i) => inst.strings - i)
        .map((s) => m.get(s) ?? 'x')
        .join(' ');
};
/** `F 4/3 ♭3>♭7 1>2`: name, string/fret, the degree in each chord, the finger in each. */
const read = (s: SharedNote) =>
    `${s.name} ${s.string}/${s.fret} ${DEGREES[s.from.degree].label}>${DEGREES[s.to.degree].label} ` +
    `${s.from.finger}>${s.to.finger}`;
const shared = (a: Voicing, b: Voicing) => sharedNotes(a, b).map(read);

describe('sharedNotes (#1618)', () => {
    const [dm7, g7, cmaj7] = voiced(GUITAR, ['Dm7', 'G7', 'Cmaj7'], [2, 7]);

    it('the grips it is read from', () => {
        expect([dm7, g7, cmaj7].map((v) => tab(GUITAR, v))).toEqual([
            'x 5 3 5 x x',
            '3 x 3 4 x x',
            'x 3 x 4 5 x',
        ]);
    });

    it('Dm7 to G7 shares the F: its 3rd, G7’s 7th, under another finger', () => {
        expect(shared(dm7, g7)).toEqual(['F 4/3 ♭3>♭7 1>2']);
    });

    it('G7 to Cmaj7 shares the B under the same finger', () => {
        expect(shared(g7, cmaj7)).toEqual(['B 3/4 3>7 3>3']);
    });

    it('reads nothing where no note is in the same place', () => {
        // Cmaj7 and Dm7 share a C, but an octave apart on different strings: not a common tone
        // for the hand.
        expect(shared(cmaj7, dm7)).toEqual([]);
    });

    it('reads a note with the same degree in both chords as that', () => {
        // In frets 2–7: at the nut both are the book's open chords (#1838).
        const [maj, dom] = voiced(GUITAR, ['Cmaj7', 'C7'], [2, 7]);
        expect(shared(maj, dom)).toEqual(['C 5/3 R>R 1>1', 'E 2/5 3>3 3>3']);
    });

    it('reads every shared note, lowest string first', () => {
        // Am x x x 5 5 5 under one barre, F x x x 5 6 5: the C and the A stay.
        const pop = voiced(GUITAR, ['C', 'G', 'Am', 'F'], [2, 7]);
        expect(shared(pop[2], pop[3])).toEqual(['C 3/5 ♭3>5 1>1', 'A 1/5 R>3 1>1']);
    });

    it('reads an open string that rings in both as fret 0, finger 0', () => {
        const [c, am] = voiced(UKULELE, ['C', 'Am'], [1, 6]);
        expect([c, am].map((v) => tab(UKULELE, v))).toEqual(['0 0 0 3', '2 0 0 0']);
        expect(shared(c, am)).toEqual(['C 3/0 R>♭3 0>0', 'E 2/0 3>5 0>0']);
    });

    it('names the note as the chart’s key spells it', () => {
        // In B♭ the note Cm7 and F7 share is E♭, never D♯.
        const [cm7, f7] = voiced(GUITAR, ['Cm7', 'F7'], [1, 6], { key: 'B♭', rootStrings: [6, 5] });
        expect(shared(cm7, f7)).toEqual(['E♭ 4/1 ♭3>♭7 1>2']);
    });

    it('gives both names where the two chords spell the note differently', () => {
        // F7 to B7, the tritone substitution: F7's E♭ is B7's D♯. In frets 2–7, where B7 is
        // the shell (at the nut, the book's open x 2 1 2 0 2, #1838).
        const v = voiced(GUITAR, ['B♭maj7', 'Gm7', 'Cm7', 'F7', 'B7'], [2, 7], { key: 'B♭' });
        expect(shared(v[3], v[4])).toEqual(['A 3/2 3>♭7 1>2', 'E♭/D♯ 2/4 ♭7>3 3>3']);
    });
});

describe('spokenDegree (#1618)', () => {
    it('says a degree as a teacher does, 3rds and 7ths without their quality', () => {
        const said = (Object.keys(DEGREES) as Degree[]).map((d) => [d, spokenDegree(d)]);
        expect(Object.fromEntries(said)).toEqual({
            R: 'root',
            '2': '2nd',
            '3': '3rd',
            b3: '3rd',
            '4': '4th',
            '5': '5th',
            b5: 'flat 5th',
            '#5': 'sharp 5th',
            '6': '6th',
            '7': '7th',
            b7: '7th',
            // The diminished 7th has no name a student would match to the dot.
            bb7: null,
            // An add9's added tone is the 9th, as the chord names it (#1820), where a sus2's is
            // the 2nd: D 2-2-2-0 to Cadd9 0-2-0-3 is "the root becomes the 9th".
            '9': '9th',
        });
    });
});
