/**
 * Voicings: which notes of a chord the keys play, and where. A voicing *kind* picks the
 * tones (a close triad, a rootless jazz voicing, a funk stab, a bossa drop-2); `voice()`
 * then places them, choosing the inversion that moves least from the previous chord, stays
 * in the keys register, and avoids the clashes a player's hand would avoid.
 */
import type { ChordFacts } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';

/** The keys register slot (MIDI). Voicings live inside it; the top voice aims for `top`. */
const KEYS = { lo: 52, hi: 84, top: 72 } as const;

export type VoicingKind = 'close' | 'rootless' | 'stab' | 'drop2';

const has = (chord: ChordFacts, n: number) => chord.intervals.some((i) => mod12(i) === n);

/** A written alteration of a tension wins over the default natural one. */
function ninth(chord: ChordFacts): number {
    return has(chord, 1) ? 1 : has(chord, 3) && chord.third === 4 ? 3 : 2;
}
function thirteenth(chord: ChordFacts): number {
    return has(chord, 8) && chord.fifth !== 8 ? 8 : 9;
}

/** The tones (semitones above the root, < 12) a voicing kind plays for a chord. */
function voicingTones(chord: ChordFacts, kind: VoicingKind): number[] {
    const third = chord.third ?? (has(chord, 5) ? 5 : has(chord, 2) ? 2 : null);
    const fifth = chord.fifth ?? 7;
    const colour = chord.seventh ?? (chord.sixth ? 9 : null);
    const written = chord.tensions;
    if (chord.family === 'power') {
        return [0, 7];
    }
    if (chord.family === 'diminished' && chord.seventh === 9) {
        return [0, 3, 6, 9];
    }
    switch (kind) {
        case 'close': {
            const tones = [0, third ?? 7, fifth];
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
            const upper =
                chord.family === 'dominant'
                    ? // Dominants: 9 and 13 (or their written alterations) in place of root and 5th.
                      [
                          written.includes(8)
                              ? 8
                              : has(chord, 6) && chord.fifth !== 7
                                ? 6
                                : thirteenth(chord),
                          ninth(chord),
                      ]
                    : [
                          written.some((t) => t === 9) ? 9 : fifth,
                          written.includes(5) ? 5 : ninth(chord),
                      ];
            return [...new Set([third ?? 7, colour, ...upper])];
        }
        case 'stab': {
            if (colour === null) {
                return [...new Set([0, third ?? 7, fifth])];
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
        case 'drop2': {
            if (colour === null) {
                return [...new Set([0, third ?? 7, fifth, written[0] ?? 0])];
            }
            // Bossa colour: the 9th (or a written b9/#9) replaces the root; a half-diminished
            // chord keeps its root, since its 9th is a minor 9th above it.
            const top = chord.family === 'half-diminished' ? 0 : ninth(chord);
            return [...new Set([third ?? 7, fifth, colour, top])];
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

function cost(v: number[], prev: number[] | null, chord: ChordFacts): number {
    let c = 0;
    const top = v[v.length - 1];
    // Register: out of the slot is forbidden in effect; the top voice aims for the sweet spot.
    for (const m of v) {
        if (m < 52 || m > 84) {
            c += 40;
        }
    }
    c += Math.abs(top - KEYS.top) * 0.35;
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
    const tense = chord.family === 'dominant' && chord.tensions.length > 0;
    for (let i = 0; i < v.length; i++) {
        for (let j = i + 1; j < v.length; j++) {
            const gap = v[j] - v[i];
            if (gap === 13 && !tense) {
                c += 12;
            }
            if (gap === 1 && !tense) {
                c += 8;
            }
        }
    }
    if (v.length > 1 && v[0] < 57 && v[1] - v[0] < 5) {
        c += 10;
    }
    return c;
}

/** Place a chord's voicing near the previous one. Deterministic. */
export function voice(chord: ChordFacts, kind: VoicingKind, prev: number[] | null): number[] {
    const pcs = voicingTones(chord, kind).map((n) => mod12(chord.root + n));
    let best: number[] | null = null;
    let bestCost = Infinity;
    for (const v of candidates(pcs, kind)) {
        const c = cost(v, prev, chord);
        if (c < bestCost) {
            best = v;
            bestCost = c;
        }
    }
    return (best ?? [60, 64, 67]).filter((m) => m >= KEYS.lo && m <= KEYS.hi);
}
