import { mod } from './theory';
import type { HomeWindow, InstrumentDef } from './types';

/** A key as the window rule reads it: the tonic's pitch class and the mode. */
export interface HomeKey {
    tonic: number;
    minor: boolean;
}

/** Frets in a home window: `[start, start + HOME_FRETS − 1]` (the neck's handle moves one). */
export const HOME_FRETS = 6;

/**
 * The lowest fret (1 to 12, never the open string) where pitch class `pc` sits on string `s`:
 * its first-position home on that string.
 */
export function lowestFret(inst: InstrumentDef, s: number, pc: number): number {
    return mod(pc - inst.open[s], 12) || 12;
}

// Semitones above the tonic of each scale degree, the primary chords (I, IV, V — or i, iv, v)
// apart from the rest. The minor is the natural minor: a minor chart's V7 is still rooted a 5th
// up, and its III, VI and VII are the relative major's I, IV and V.
const PRIMARY = [0, 5, 7];
const MAJOR_REST = [2, 4, 9, 11];
const MINOR_REST = [2, 3, 8, 10];

/**
 * Where the hand sits for a key (#1598): the home window a chart opens with until the musician
 * moves it. `lowStrings` are the strings a root is looked for on.
 *
 * A player picks a position from the key, not from the neck: they sit where the ROOTS of the
 * key's chords fall on the lowest strings, because a shell is built up from its root and those
 * are the strings a comper puts it on (root on the 6th, then "same fret, one string over" to the
 * 5th for the chord a 4th up). So, among the `HOME_FRETS`-wide windows:
 *
 * 1. the I, IV and V come first — the window holding the most of their roots on a low string
 *    (on a guitar always all three; a blues is nothing else);
 * 2. then the most of the key's other four roots (ii, iii, vi, vii), so a ii–V or a vi does not
 *    send its root off to the 4th string;
 * 3. then the lowest window: first position is where the dots are best known.
 *
 * Only FRETTED roots count. An open 6th or 5th string is a fine root for a strummed chord, but a
 * shell on it is a one-off shape, not the movable one being learned; the voicer still takes one
 * when it is the best grip (an open string is inside every window, `inHome`), the window just
 * does not plan on it.
 *
 * On a guitar this lands on the two positions players use near the nut: frets 1–6 for C, F and
 * the flat keys, whose tonic or IV (F, B♭) lives at the 1st fret, and frets 2–7 for the sharp
 * keys (G, D, A, E, B), whose roots run up to the 7th fret (E on the 5th string) and never need
 * the 1st. F♯/G♭ sits with the flat keys: every one of its roots is inside frets 1–6.
 */
export function keyHomeWindow(inst: InstrumentDef, lowStrings: number[], key: HomeKey): HomeWindow {
    // Each root where it sits nearest the nut on a low string: 1 to 7 on a guitar.
    const rootFret = (interval: number): number =>
        Math.min(...lowStrings.map((s) => lowestFret(inst, s, mod(key.tonic + interval, 12))));
    const held = (start: number, interval: number): boolean =>
        rootFret(interval) >= start && rootFret(interval) < start + HOME_FRETS;
    const rest = key.minor ? MINOR_REST : MAJOR_REST;
    let best = 1;
    let bestScore = -1;
    for (let start = 1; start + HOME_FRETS - 1 <= inst.maxFret; start++) {
        const count = (intervals: number[]) => intervals.filter((i) => held(start, i)).length;
        // One primary root outweighs all four of the others together.
        const score = count(PRIMARY) * (rest.length + 1) + count(rest);
        if (score > bestScore) {
            best = start;
            bestScore = score;
        }
    }
    return [best, best + HOME_FRETS - 1];
}
