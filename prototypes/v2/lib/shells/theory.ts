import type { Degree, GripKind, Quality, Spelled, Tone } from './types';

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

/** Spell the note `interval` semitones and `step` letters above `key`, e.g. the ii of B♭ is C. */
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
    '9': { label: '9', int: 14, step: 1, name: '9th' },
    '13': { label: '13', int: 21, step: 5, name: '13th' },
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
    /** The T role's degree; a sus chord's 4th or 2nd sits there. Null for a power chord. */
    third: Degree | null;
    /** The S role's degree: a shell's 7th (or 6th). Triads and power chords have none. */
    seventh?: Degree;
    /** The F role's degree: the triad's 5th, or what a uke shell's helper note plays. */
    five: Degree;
    /** Tones that must be added for the chord to be recognizable (m7♭5 needs its ♭5). */
    required: Degree[];
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
    dim7: { kind: 'shell', symbol: '°7', third: 'b3', seventh: 'bb7', five: 'b5', required: [] },
    six: { kind: 'shell', symbol: '6', third: '3', seventh: '6', five: '5', required: [] },
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
    // A power chord has no 3rd: root, 5th and the octave root is what rock guitar plays.
    five: { kind: 'power', symbol: '5', third: null, five: '5', required: [] },
};

/** Which degree an optional tone becomes for a given quality (null if it duplicates a chord tone). */
export function toneDegree(quality: Quality, tone: Tone | undefined): Degree | null {
    // A triad or power grip has no free string for a colour tone yet (#1588 keeps them plain).
    if (!tone || tone === 'none' || QUALITIES[quality].kind !== 'shell') {
        return null;
    }
    if (tone === '5') {
        return quality === 'm7b5' ? null : quality === 'dim7' ? 'b5' : '5';
    }
    if (tone === '13' && (quality === 'six' || quality === 'dim7')) {
        return null;
    }
    return tone;
}
