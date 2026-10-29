import type { Degree, GripKind, Note, Quality, Role, Spelled } from './types';

export const LETTERS = 'CDEFGAB';
export const NAT = [0, 2, 4, 5, 7, 9, 11];
const ACC: Record<number, string> = { 0: '', 1: '♯', 2: '♯♯', [-1]: '♭', [-2]: '♭♭' };

export const mod = (a: number, n: number): number => ((a % n) + n) % n;
export const ordinal = (n: number): string =>
    n +
    (n % 10 === 1 && n !== 11
        ? 'st'
        : n % 10 === 2 && n !== 12
          ? 'nd'
          : n % 10 === 3 && n !== 13
            ? 'rd'
            : 'th');

/**
 * Spell the note `interval` semitones and `step` letters above `key`, e.g. the ii of B♭ is C.
 * @internal a test seam: only the voicing tests' chart builders call it.
 */
export function spellFrom(key: Spelled, interval: number, step: number): Spelled {
    const letter = (key.letter + step) % 7;
    const pc = mod(key.pc + interval, 12);
    let d = mod(pc - NAT[letter], 12);
    if (d > 6) {
        d -= 12;
    }
    return { name: LETTERS[letter] + ACC[d], pc, letter };
}

export interface DegreeDef {
    label: string;
    int: number;
    step: number;
    name: string;
}
export const DEGREES: Record<Degree, DegreeDef> = {
    R: { label: 'R', int: 0, step: 0, name: 'Root' },
    '2': { label: '2', int: 2, step: 1, name: '2nd' },
    '4': { label: '4', int: 5, step: 3, name: '4th' },
    '3': { label: '3', int: 4, step: 2, name: 'Major 3rd' },
    b3: { label: '♭3', int: 3, step: 2, name: 'Minor 3rd' },
    '7': { label: '7', int: 11, step: 6, name: 'Major 7th' },
    b7: { label: '♭7', int: 10, step: 6, name: 'Flat 7th' },
    bb7: { label: '♭♭7', int: 9, step: 6, name: 'Diminished 7th' },
    '6': { label: '6', int: 9, step: 5, name: '6th' },
    '5': { label: '5', int: 7, step: 4, name: '5th' },
    b5: { label: '♭5', int: 6, step: 4, name: 'Flat 5th' },
    '#5': { label: '♯5', int: 8, step: 4, name: 'Sharp 5th' },
    '9': { label: '9', int: 2, step: 1, name: '9th' },
};

/** Spell a chord tone, e.g. the ♭7 of G is F. */
export function spellDegree(root: Spelled, degree: Degree): string {
    const d = DEGREES[degree];
    const letter = (root.letter + d.step) % 7;
    let diff = mod(root.pc + d.int - NAT[letter], 12);
    if (diff > 6) {
        diff -= 12;
    }
    return LETTERS[letter] + ACC[diff];
}

export interface QualityDef {
    /** Which shapes voice it: 7th-chord shells, closed triads, or power chords. */
    kind: GripKind;
    symbol: string;
    /**
     * The T role's degree; a sus chord's 4th or 2nd sits there, and a 7sus4 shell's 4th. Null
     * for a power chord.
     */
    third: Degree | null;
    /** The S role's degree: a shell's 7th (or a 6 or m6's 6th). Triads and power chords have none. */
    seventh?: Degree;
    /** The F role's degree: the triad's 5th, or what a uke shell's helper note plays. */
    five: Degree;
    /**
     * Tones beyond root, 3rd and 7th without which the grip is another chord: the ♭5 of an
     * m7♭5 (else a plain m7) and of a °7 (else the three notes of a m6 — the tritone is what
     * says "diminished"). A uke shell's helper note already plays it; a guitar shell takes it
     * on a free string (`buildAt`), and a grip with no room for it is offered only when the
     * chord has no complete grip at all (`allPositions`). So wherever a complete grip exists,
     * the chord is voiced with every tone listed here. Triads and power chords list none: all
     * their tones are in the shape.
     */
    required: Degree[];
    /**
     * A tone added to a triad (#1820: an add9's 9th), played in the seat a ukulele triad
     * otherwise doubles (role N). Only shapes with that seat serve a quality that has one, and
     * only such a quality uses them (`taughtFor` in `voicing.ts`); a guitar has none, so the
     * adapter reads an add9 there as its plain triad, with a notice.
     */
    added?: Degree;
}
export const QUALITIES: Record<Quality, QualityDef> = {
    maj7: { kind: 'shell', symbol: 'maj7', third: '3', seventh: '7', five: '5', required: [] },
    dom7: { kind: 'shell', symbol: '7', third: '3', seventh: 'b7', five: '5', required: [] },
    m7: { kind: 'shell', symbol: 'm7', third: 'b3', seventh: 'b7', five: '5', required: [] },
    m7b5: {
        kind: 'shell',
        symbol: 'm7♭5',
        third: 'b3',
        seventh: 'b7',
        five: 'b5',
        required: ['b5'],
    },
    dim7: {
        kind: 'shell',
        symbol: '°7',
        third: 'b3',
        seventh: 'bb7',
        five: 'b5',
        required: ['b5'],
    },
    six: { kind: 'shell', symbol: '6', third: '3', seventh: '6', five: '5', required: [] },
    // A shell's two seats hold whatever names the chord (#1817): a 7sus4 is R–4–♭7, the 4th in
    // the 3rd's seat as in a sus triad, and a m6 is R–♭3–6, the 6th in the 7th's as in `six`.
    // So Wonderwall's A7sus4 plays its D, where the dominant 7 it used to be played a C♯.
    '7sus4': { kind: 'shell', symbol: '7sus4', third: '4', seventh: 'b7', five: '5', required: [] },
    m6: { kind: 'shell', symbol: 'm6', third: 'b3', seventh: '6', five: '5', required: [] },
    // Triads (#1588): three chord tones, all of them played — a pop, rock or country chart writes
    // these, and adding a 7th to them would teach a chord the chart doesn't ask for.
    maj: { kind: 'triad', symbol: '', third: '3', five: '5', required: [] },
    min: { kind: 'triad', symbol: 'm', third: 'b3', five: '5', required: [] },
    // Both 5ths are altered: the ♭5 and ♯5 are what make dim and aug sound like themselves.
    dim: { kind: 'triad', symbol: 'dim', third: 'b3', five: 'b5', required: [] },
    aug: { kind: 'triad', symbol: 'aug', third: '3', five: '#5', required: [] },
    // A sus chord suspends its 3rd: the 4th (or 2nd) takes the 3rd's seat in the grip.
    sus4: { kind: 'triad', symbol: 'sus4', third: '4', five: '5', required: [] },
    sus2: { kind: 'triad', symbol: 'sus2', third: '2', five: '5', required: [] },
    // An add9 keeps its 3rd and adds the 9th (#1820), where a sus2's 2 replaces the 3rd. A
    // ukulele triad doubles one tone to fill four strings; the 9th takes that string, as the
    // chord charts print it (Cadd9 0-2-0-3, the C chord's C-string root played as D). Ukulele
    // only: a guitar's three-string triad has no string to spare (`voicingChord`).
    add9: { kind: 'triad', symbol: 'add9', third: '3', five: '5', required: [], added: '9' },
    // A power chord has no 3rd: root, 5th and the octave root is what rock guitar plays.
    five: { kind: 'power', symbol: '5', third: null, five: '5', required: [] },
};

/** The roles that sound a tone the grip already holds: a doubled root, 3rd or 5th. */
const DOUBLED: ReadonlySet<Role> = new Set<Role>(['R2', 'T2', 'F2']);

/**
 * Whether a note of a grip lies outside its shell (#1853, the neck's "Show the shell"): the
 * notes it dims so the root, 3rd and 7th stand out. A display rule only; the grip is unchanged.
 * Every doubled note is outside (G7 `3 2 0 0 0 1`'s second G and B). So is a PERFECT 5th, but
 * only on a 7th or 6th chord, because a shell is R–3–7 or R–3–6 and drops it (that G7's D); a
 * ♭5 or ♯5 names the chord (m7♭5, °7, dim, aug) and stays, and a plain triad keeps its 5th.
 * A sus chord's 4th or 2nd sits in the 3rd's seat and stays, as does an added tone (an add9's
 * 9th). Up the neck a three-note shell has nothing outside. A power chord has no shell to
 * show (no 3rd), so none of its notes dim, its octave included.
 */
export function outsideShell(quality: Quality, note: Pick<Note, 'role' | 'degree'>): boolean {
    if (QUALITIES[quality].kind === 'power') {
        return false;
    }
    if (DOUBLED.has(note.role)) {
        return true;
    }
    return note.degree === '5' && QUALITIES[quality].kind === 'shell';
}
