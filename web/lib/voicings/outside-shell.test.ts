import { describe, expect, it } from 'vitest';
import {
    allPositions,
    GUITAR,
    type InstrumentDef,
    outsideShell,
    UKULELE,
    type Voicing,
} from './index';
import { keyRoot } from './test/keys';
import type { Quality } from './types';

// "Show the shell" (#1853): which notes of a grip the neck dims, so the root, 3rd and 7th stand
// out. Each case is a real grip from the voicer, read string by string.

const tab = (inst: InstrumentDef, v: Voicing) => {
    const m = new Map(v.notes.map((n) => [n.string, n.fret]));
    return Array.from({ length: inst.strings }, (_, i) => inst.strings - i)
        .map((s) => m.get(s) ?? 'x')
        .join(' ');
};

/** The grip with these frets, low string first. */
function grip(inst: InstrumentDef, root: string, quality: Quality, frets: string): Voicing {
    const found = allPositions(inst, keyRoot(root), quality).find((v) => tab(inst, v) === frets);
    if (!found) {
        throw new Error(`no ${root} ${quality} grip ${frets}`);
    }
    return found;
}

/** The strings whose notes lie outside the shell, low string first. */
const outside = (v: Voicing) =>
    v.notes
        .filter((n) => outsideShell(v.quality, n))
        .map((n) => n.string)
        .sort((a, b) => b - a);

describe('outsideShell (#1853)', () => {
    it('open G7 3 2 0 0 0 1: the D and the second G and B dim; the low G, B and top F stay', () => {
        expect(outside(grip(GUITAR, 'G', 'dom7', '3 2 0 0 0 1'))).toEqual([4, 3, 2]);
    });

    it('open C x 3 2 0 1 0: a triad keeps its 5th, only the doubled C and E dim', () => {
        expect(outside(grip(GUITAR, 'C', 'maj', 'x 3 2 0 1 0'))).toEqual([2, 1]);
    });

    it('open Cmaj7 x 3 2 0 0 0: the perfect 5th and the doubled E dim', () => {
        expect(outside(grip(GUITAR, 'C', 'maj7', 'x 3 2 0 0 0'))).toEqual([3, 1]);
    });

    it('a m7♭5 keeps its ♭5 bright: no Bm7♭5 grip dims it', () => {
        const withFlatFive = allPositions(GUITAR, keyRoot('B'), 'm7b5').filter((v) =>
            v.notes.some((n) => n.degree === 'b5'),
        );
        expect(withFlatFive.length).toBeGreaterThan(0);
        for (const v of withFlatFive) {
            for (const n of v.notes.filter((x) => x.degree === 'b5')) {
                expect(outsideShell(v.quality, n), tab(GUITAR, v)).toBe(false);
            }
        }
    });

    it('a 6 chord is R–3–6: uke C6 0 0 0 0 dims its G, the 5th', () => {
        expect(outside(grip(UKULELE, 'C', 'six', '0 0 0 0'))).toEqual([4]);
    });

    it('a sus chord keeps its 4th: Dsus4 x x 0 2 3 3 dims only the doubled D', () => {
        expect(outside(grip(GUITAR, 'D', 'sus4', 'x x 0 2 3 3'))).toEqual([2]);
    });

    it('A7sus4 x 0 2 0 3 0: both E 5ths dim; the A, the open G ♭7 and the D 4th stay', () => {
        expect(outside(grip(GUITAR, 'A', '7sus4', 'x 0 2 0 3 0'))).toEqual([4, 1]);
    });

    it('up the neck a three-note shell has nothing to dim: G7 3 x 3 4 x x', () => {
        expect(outside(grip(GUITAR, 'G', 'dom7', '3 x 3 4 x x'))).toEqual([]);
    });

    it('an aug triad keeps its ♯5', () => {
        for (const v of allPositions(GUITAR, keyRoot('C'), 'aug')) {
            for (const n of v.notes.filter((x) => x.degree === '#5')) {
                expect(outsideShell(v.quality, n)).toBe(false);
            }
        }
    });
});
