/**
 * Note palettes a lead book composes: which pitch classes a line moves through and which it
 * lands on. All answers are absolute pitch classes, best first where order matters.
 */
import { type ChordFacts, chordPcs, fifthOf } from '../../theory/chord.js';
import { type KeyContext, mod12 } from '../../theory/pitch.js';

const abs = (chord: ChordFacts, intervals: readonly number[]) => [
    ...new Set(intervals.map((i) => mod12(chord.root + i))),
];

/** The chord's own scale (`theory/chord.ts` chooses it: mixolydian, dorian, altered…). */
export function chordScale(chord: ChordFacts): number[] {
    return abs(chord, chord.scale);
}

/**
 * The bebop scale: the chord scale plus the passing tone that puts chord tones on the beats
 * of an eighth-note run — the major 7th between a dominant's b7 and root, the #5 between a
 * major chord's 5th and 6th.
 */
export function bebopScale(chord: ChordFacts): number[] {
    const extra = chord.family === 'dominant' ? [11] : chord.family === 'major' ? [8] : [];
    return abs(chord, [...chord.scale, ...extra]);
}

/** The chord's 3rd and 7th (a 6 chord's 6th), then its 9th, 5th and root. */
export function guideTones(chord: ChordFacts): number[] {
    const order: number[] = [];
    if (chord.third !== null) {
        order.push(chord.third);
    }
    if (chord.seventh !== null) {
        order.push(chord.seventh);
    } else if (chord.sixth) {
        order.push(9);
    }
    if (chord.family === 'sus') {
        order.push(5);
    }
    order.push(...chord.tensions.slice(0, 1), fifthOf(chord), 0);
    return abs(chord, order);
}

/** Where a phrase comes to rest on a chord: its 3rd, root and 5th (then 9th or 6th). */
export function restingTones(chord: ChordFacts): number[] {
    const order: number[] = [];
    if (chord.third !== null) {
        order.push(chord.third);
    }
    order.push(0, fifthOf(chord));
    if (chord.sixth) {
        order.push(9);
    }
    return abs(chord, order);
}

/** The key's blues scale: minor pentatonic plus the flat five (1 b3 4 b5 5 b7). */
function bluesScale(key: KeyContext): number[] {
    return [0, 3, 5, 6, 7, 10].map((i) => mod12(key.tonic + i));
}

/** The key's minor pentatonic (1 b3 4 5 b7). */
export function minorPentatonic(tonic: number): number[] {
    return [0, 3, 5, 7, 10].map((i) => mod12(tonic + i));
}

/** The key's major pentatonic (1 2 3 5 6). */
function majorPentatonic(tonic: number): number[] {
    return [0, 2, 4, 7, 9].map((i) => mod12(tonic + i));
}

/** A rock or funk landing: the root first, then the 5th and 3rd (and a written 7th). */
export function rootFirst(chord: ChordFacts): number[] {
    const order = [0, fifthOf(chord)];
    if (chord.third !== null) {
        order.push(chord.third);
    }
    if (chord.seventh !== null) {
        order.push(chord.seventh);
    }
    return abs(chord, order);
}

/**
 * A blues landing: the chord's own 3rd (a guitarist bends up to it from the blue third), its
 * root and b7, then its 5th. Over the IV that 3rd is the key's 6th, the note that tells the
 * listener the chord moved.
 */
export function bluesTargets(chord: ChordFacts): number[] {
    const order: number[] = [];
    if (chord.third !== null) {
        order.push(chord.third);
    }
    order.push(0);
    if (chord.seventh !== null) {
        order.push(chord.seventh);
    }
    order.push(fifthOf(chord));
    return abs(chord, order);
}

/**
 * The pool a blues line moves through: the key's blues scale and the chord's own tones (its 3rd
 * above all), so a chord outside the key still has its notes to land on.
 */
export function bluesPool(chord: ChordFacts, key: KeyContext): number[] {
    return [...new Set([...bluesScale(key), ...chordPcs(chord)])];
}

/**
 * A key's pentatonic with the chord's own tones added: the scale a rock player moves in, and
 * the notes of whatever chord is under it (a bVII or a borrowed iv included).
 */
export function pentatonicPool(chord: ChordFacts, key: KeyContext): number[] {
    const scale = key.minor
        ? minorPentatonic(key.tonic)
        : [...majorPentatonic(key.tonic), mod12(key.tonic + 3)];
    return [...new Set([...scale, ...chordPcs(chord)])];
}
