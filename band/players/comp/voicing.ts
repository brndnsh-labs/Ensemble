/**
 * Voicings: which notes of a chord the comp plays, and where. A voicing *kind* picks the
 * tones (a close triad, a rootless jazz voicing, a funk stab, a bossa drop-2, a guitar
 * shell, a power chord); `voice()` then places them for two hands on a keyboard — and
 * `fretboard.ts`'s `grip()` for a guitar — choosing the placement that moves least from the previous chord,
 * sits in the instrument's register, and avoids the clashes a player would avoid.
 */
import { type ChordFacts, fifthOf } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';

/** Where a voicing may sit (MIDI), and where its top voice aims. */
export interface Slot {
    lo: number;
    hi: number;
    top: number;
    /**
     * How strongly the top voice is pulled to `top` (default 0.35). A funk guitarist stays in
     * one position on the neck; smooth voice leading alone would let the grips drift away.
     */
    pull?: number;
}

/** The keyboard comp's register slot. */
const KEYS: Slot = { lo: 52, hi: 84, top: 72 };

/**
 * `power`: root and fifth (and octave), whatever the chord's quality — the distorted rhythm
 * guitar's chord, since a third beating against root and fifth under drive turns to mud.
 * The fifth is the chord's own (`fifthOf`): a diminished chord gets the tritone power chord,
 * an augmented one the #5, so the chart's quality still speaks where it lives in the 5th.
 */
export type VoicingKind = 'close' | 'rootless' | 'stab' | 'drop2' | 'shell' | 'power';

const has = (chord: ChordFacts, n: number) => chord.intervals.some((i) => mod12(i) === n);

/**
 * A written alteration of a tension wins over the default natural one; otherwise the chord's
 * scale decides. A phrygian minor 7th (iii7 in a major key) owns no natural 9, and its b9 is
 * an avoid note on a minor chord, so the 11th takes the seat (b3-5-b7-11). A dominant whose
 * scale has only the b9 takes it.
 */
function ninth(chord: ChordFacts): number {
    if (has(chord, 1)) {
        return 1;
    }
    if (has(chord, 3) && chord.third === 4) {
        return 3;
    }
    if (chord.implied) {
        return chord.implied.ninth;
    }
    if (chord.scale.includes(2)) {
        return 2;
    }
    return chord.third === 3 ? 5 : chord.scale.includes(1) ? 1 : 2;
}
function thirteenth(chord: ChordFacts): number {
    if (has(chord, 8) && chord.fifth !== 8) {
        return 8;
    }
    if (chord.implied) {
        return chord.implied.thirteenth;
    }
    // A dominant whose scale has a b13 and no 13 (mixolydian b13) voices the b13.
    return !chord.scale.includes(9) && chord.scale.includes(8) ? 8 : 9;
}

/**
 * What sits in the 5th's seat of a four-note voicing: a written b13, #11 (or a dominant's
 * 13) replaces the plain 5th, because that colour is what the chart asks to hear. An altered
 * dominant has no 5th at all.
 */
function fifthSeat(chord: ChordFacts): number {
    const written = chord.tensions;
    if (written.includes(8)) {
        return 8;
    }
    if (written.includes(6)) {
        return 6;
    }
    if (chord.family === 'dominant' && written.includes(9)) {
        return 9;
    }
    return fifthOf(chord);
}

/** The tones (semitones above the root, < 12) a voicing kind plays for a chord. */
export function voicingTones(chord: ChordFacts, kind: VoicingKind): number[] {
    const third = chord.third ?? (has(chord, 5) ? 5 : has(chord, 2) ? 2 : null);
    const fifth = fifthOf(chord);
    const colour = chord.seventh ?? (chord.sixth ? 9 : null);
    const written = chord.tensions;
    if (kind === 'power') {
        return [0, fifth];
    }
    if (chord.family === 'power') {
        return [0, 7];
    }
    if (chord.family === 'diminished' && chord.seventh === 9) {
        return [0, 3, 6, 9];
    }
    switch (kind) {
        case 'close': {
            if (chord.family === 'dominant' && chord.third === 4 && written.includes(3)) {
                return [0, 4, 10, 3]; // the "Hendrix" 7#9: root, 3rd, b7, #9 on top
            }
            const tones = [0, third ?? 7, colour !== null ? fifthSeat(chord) : fifth];
            if (colour !== null) {
                tones.push(colour);
            } else if (written.length) {
                tones.push(written[0]); // add9 and friends keep their colour tone
            }
            return [...new Set(tones)];
        }
        case 'rootless': {
            if (colour === null) {
                return [...new Set([0, third ?? 7, fifth, ...(written.length ? written : [2])])];
            }
            if (chord.family === 'half-diminished') {
                return [3, 5, 6, 10]; // b3 11 b5 b7: the root would sit a b9 from nothing
            }
            // A written #11 (or b5) takes the place of the 5th/13th, so it is always heard.
            const sharpEleven = has(chord, 6);
            const upper =
                chord.family === 'dominant'
                    ? // Dominants: 9 and 13 (or their written alterations) in place of root and 5th.
                      [written.includes(8) ? 8 : sharpEleven ? 6 : thirteenth(chord), ninth(chord)]
                    : [
                          sharpEleven ? 6 : written.includes(9) ? 9 : fifth,
                          written.includes(5) ? 5 : ninth(chord),
                      ];
            return [...new Set([third ?? 7, colour, ...upper])];
        }
        case 'stab': {
            if (colour === null) {
                return [...new Set([0, third ?? 7, fifth])];
            }
            if (chord.family === 'half-diminished') {
                return [3, 6, 10]; // b3 b5 b7: the b5 is what makes it half-diminished
            }
            // Three notes: guide tones plus one colour on top (the "E9" funk chord).
            const top =
                chord.family === 'dominant'
                    ? written.includes(9)
                        ? 9
                        : ninth(chord)
                    : ninth(chord);
            return [...new Set([third ?? 7, colour, top])];
        }
        case 'shell': {
            // The swing guitarist's three-note chord: root, 3rd and 7th (or 6th) — the
            // harmony's skeleton, all a four-to-the-bar rhythm guitar needs. Half-diminished
            // adds its b5 (R-b5-b7-b3, x3434x), the tone that tells it from a minor 7th.
            if (chord.family === 'half-diminished') {
                return [0, 3, 6, 10];
            }
            return [...new Set([0, third ?? 7, colour ?? fifth])];
        }
        case 'drop2': {
            if (colour === null) {
                // A plain triad is coloured the bossa way: a 6/9 (major or minor). A minor
                // chord whose scale owns no natural 6th (aeolian vi, phrygian iii) takes its
                // b7 instead — a b6 there is an avoid note.
                if (chord.family === 'major' || chord.family === 'minor') {
                    const sixth = chord.scale.includes(9) || chord.family === 'major' ? 9 : 10;
                    return [...new Set([third ?? 7, fifth, sixth, ninth(chord)])];
                }
                return [...new Set([0, third ?? 7, fifth, written[0] ?? 0])];
            }
            // Bossa colour: the 9th (or a written b9/#9) replaces the root; a half-diminished
            // chord keeps its root, since its 9th is a minor 9th above it.
            const top = chord.family === 'half-diminished' ? 0 : ninth(chord);
            return [...new Set([third ?? 7, fifthSeat(chord), colour, top])];
        }
    }
}

function candidates(tones: number[], kind: VoicingKind): number[][] {
    // Rotations of the pitch-class set in ascending order are its close positions (for a
    // rootless voicing, rotations 3-5-7-9 and 7-9-3-5 are the A and B forms).
    const pcs = [...new Set(tones)].sort((a, b) => a - b);
    const out: number[][] = [];
    for (let rotation = 0; rotation < pcs.length; rotation++) {
        const order = [...pcs.slice(rotation), ...pcs.slice(0, rotation)];
        for (let base = 36; base <= 84; base += 12) {
            const stack: number[] = [];
            let floor = base + order[0] - 1;
            for (const pc of order) {
                let m = floor + 1 + mod12(pc - (floor + 1));
                if (stack.length && m <= stack[stack.length - 1]) {
                    m += 12;
                }
                stack.push(m);
                floor = m;
            }
            let voicing = stack;
            if (kind === 'drop2' && stack.length === 4) {
                voicing = [stack[2] - 12, stack[0], stack[1], stack[3]].sort((a, b) => a - b);
            }
            if (voicing[0] >= 48 && voicing[voicing.length - 1] <= 88) {
                out.push(voicing);
            }
        }
    }
    return out;
}

/** Lowest note (MIDI) for the lower voice of each interval, in semitones. */
const LOW_INTERVAL_LIMIT: Record<number, number> = {
    1: 52, // m2: E3
    2: 51, // M2: Eb3
    3: 48, // m3: C3
    4: 46, // M3: Bb2
    5: 46, // P4: Bb2
    6: 47, // tritone: B2
    7: 34, // P5: Bb1
    8: 43, // m6: G2
    9: 41, // M6: F2
    10: 41, // m7: F2
    11: 41, // M7: F2
};

/** How good a placement is (lower is better): register, voice leading, and clashes. */
export function cost(v: number[], prev: number[] | null, chord: ChordFacts, slot: Slot): number {
    let c = 0;
    const top = v[v.length - 1];
    // Register: out of the slot is forbidden in effect; the top voice aims for the sweet spot.
    for (const m of v) {
        if (m < slot.lo || m > slot.hi) {
            c += 40;
        }
    }
    c += Math.abs(top - slot.top) * (slot.pull ?? 0.35);
    // Voice leading: the smallest total movement from the last chord.
    if (prev?.length) {
        const n = Math.min(prev.length, v.length);
        const a = [...prev].sort((x, y) => x - y);
        for (let i = 0; i < n; i++) {
            c += Math.abs(v[i] - a[i]) * 0.5;
        }
        c += Math.abs(top - a[a.length - 1]) * 0.6;
    }
    // Hand shape: no muddy thirds down low, no minor-9th rubs, no minor-2nd clusters on
    // chords that don't ask for them.
    // Dominants carry their colour in semitones (b7 against 13, 3 against b9/#9, the
    // altered tensions) — the rubs are the sound. Everything else avoids them.
    const tense = chord.family === 'dominant';
    // …except a #9 *below* the 3rd, which is a cluster, not the "Hendrix" 3–b7–#9.
    if (chord.family === 'dominant' && chord.third === 4) {
        const sharpNine = v.find((m) => mod12(m - chord.root) === 3);
        const third = v.find((m) => mod12(m - chord.root) === 4);
        if (sharpNine !== undefined && third !== undefined && sharpNine < third) {
            c += 20;
        }
    }
    for (let i = 0; i < v.length; i++) {
        for (let j = i + 1; j < v.length; j++) {
            const gap = v[j] - v[i];
            if (gap === 13 && !tense) {
                c += 12;
            }
            // In a three-note stab the rub is naked (Dm7 as E-F-C), where a fuller voicing
            // absorbs it (Em9 as F#-G-B-D).
            if (gap === 1 && !tense) {
                c += v.length <= 3 ? 24 : 8;
            }
        }
    }
    // Low interval limits: a close interval low down is mud. Each interval has a floor below
    // which its lower note shouldn't sit (the arranger's table, for the two lowest voices up).
    for (let i = 0; i + 1 < v.length; i++) {
        const limit = LOW_INTERVAL_LIMIT[v[i + 1] - v[i]];
        if (limit !== undefined && v[i] < limit) {
            c += 10;
        }
    }
    return c;
}

/**
 * A keyboard power chord: root, fifth and the root's octave, never inverted — a power chord
 * with its fifth underneath is a fourth, and loses the root the whole sound rests on.
 */
function powerCandidates(chord: ChordFacts): number[][] {
    const fifth = fifthOf(chord);
    const out: number[][] = [];
    for (let root = KEYS.lo; root + 12 <= KEYS.hi; root++) {
        if (mod12(root) === chord.root) {
            out.push([root, root + fifth, root + 12]);
        }
    }
    return out;
}

/** Place a chord's voicing near the previous one. Deterministic. */
export function voice(chord: ChordFacts, kind: VoicingKind, prev: number[] | null): number[] {
    const pcs = voicingTones(chord, kind).map((n) => mod12(chord.root + n));
    let best: number[] | null = null;
    let bestCost = Infinity;
    for (const v of kind === 'power' ? powerCandidates(chord) : candidates(pcs, kind)) {
        const c = cost(v, prev, chord, KEYS);
        if (c < bestCost) {
            best = v;
            bestCost = c;
        }
    }
    return (best ?? [60, 64, 67]).filter((m) => m >= KEYS.lo && m <= KEYS.hi);
}
