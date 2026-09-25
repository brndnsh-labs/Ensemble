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
 * of an eighth-note run. Each is built on one mode, so each is added only over it: the major
 * 7th between a mixolydian dominant's b7 and root (never over an altered or diminished
 * dominant, whose scale has other plans), the natural 3rd between a dorian minor's b3 and 4th,
 * the #5 between a major chord's 5th and 6th.
 */
export function bebopScale(chord: ChordFacts): number[] {
    const has = (...degrees: number[]) => degrees.every((d) => chord.scale.includes(d));
    const extra =
        chord.family === 'dominant' && has(2, 4, 7, 9, 10)
            ? [11]
            : chord.family === 'minor' && has(2, 3, 5, 7, 9, 10)
              ? [4]
              : chord.family === 'major' && has(7, 9, 11)
                ? [8]
                : [];
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
function minorPentatonic(tonic: number): number[] {
    return [0, 3, 5, 7, 10].map((i) => mod12(tonic + i));
}

/** The key's major pentatonic (1 2 3 5 6). */
function majorPentatonic(tonic: number): number[] {
    return [0, 2, 4, 7, 9].map((i) => mod12(tonic + i));
}

/**
 * Where a rock or funk phrase lands mid-phrase: the 5th, then the 3rd and a written 7th, the
 * root last — the bass has the root, and a lead that lands on it at every change is just the
 * bass line up an octave.
 */
export function fifthFirst(chord: ChordFacts): number[] {
    const order = [fifthOf(chord)];
    if (chord.third !== null) {
        order.push(chord.third);
    }
    if (chord.seventh !== null) {
        order.push(chord.seventh);
    }
    order.push(0);
    return abs(chord, order);
}

/** Where a rock or funk phrase comes to rest: the root first, then the 5th and 3rd. */
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
        : [...majorPentatonic(key.tonic), ...bluesColour(chord, key).slice(1, 2)];
    return [...new Set([...scale, ...chordPcs(chord)])];
}

/**
 * The key's minor pentatonic as colour over a chord it suits: in a minor key, always; in a
 * major key only over the I and the IV, where its b3 is the blue third (and the IV's b7). Over
 * the V or the vi it is a wrong note held, not a blue one. Ordered 1 b3 4 5 b7.
 */
export function bluesColour(chord: ChordFacts, key: KeyContext): number[] {
    const degree = mod12(chord.root - key.tonic);
    return key.minor || degree === 0 || degree === 5 ? minorPentatonic(key.tonic) : [];
}

/**
 * A songwriter's pentatonic: the key's major pentatonic (minor pentatonic in a minor key), kept
 * only where the chord's own scale has the note and it isn't an avoid note (a half step above
 * one of the chord's tones: the key's C over a G chord, a 4th leaning on its 3rd), plus the
 * chord's tones. It is the scale a folk or country picker hears in the song, not the blues: no
 * blue third, and over a chord from outside the key (a secondary dominant, a borrowed iv) the
 * pentatonic gives way to the chord — the key's C over an A7 yields to the chord's C#. A
 * pentatonic line skips the notes a singer would only lean on; any note of this pool can be
 * held.
 */
export function songPentatonic(chord: ChordFacts, key: KeyContext): number[] {
    const tones = chordPcs(chord);
    const scale = (key.minor ? minorPentatonic(key.tonic) : majorPentatonic(key.tonic)).filter(
        (pc) => chord.scale.includes(mod12(pc - chord.root)) && !tones.includes(mod12(pc - 1)),
    );
    return [...new Set([...scale, ...tones])];
}

/**
 * The pentatonic on the chord's own root, following the changes rather than the key: the
 * major pentatonic over a major chord (1 2 3 5 6), with the b7 over a dominant; the minor
 * pentatonic with the 9th over a minor chord (1 2 b3 4 5 b7). It is the vocabulary a pop, soul
 * or disco player moves in over a vamp: no half-step rubs (no 4th against a major 3rd, no
 * major 7th against a dominant), and the colour tones a soul player leans on — the 9th, the
 * minor chord's 11th, the 6th or 13th — built in. A degree is kept only where the chord's own
 * scale has it (a phrygian iii drops the 9th, an altered dominant its natural 9th and 13th),
 * and the chord's written tones are always in. A diminished, half-diminished or augmented
 * chord has no pentatonic that sits on it: it keeps its chord scale.
 */
export function chordPentatonic(chord: ChordFacts): number[] {
    const shapes: Partial<Record<ChordFacts['family'], readonly number[]>> = {
        major: [0, 2, 4, 7, 9],
        dominant: [0, 2, 4, 7, 9, 10],
        minor: [0, 2, 3, 5, 7, 10],
        sus: [0, 2, 5, 7, 10],
        power: [0, 3, 5, 7, 10],
    };
    const shape = shapes[chord.family];
    if (!shape) {
        return chordScale(chord);
    }
    const kept = shape.filter((i) => chord.scale.includes(i));
    return [...new Set([...abs(chord, kept), ...chordPcs(chord)])];
}
