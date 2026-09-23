/**
 * Guitar grips. A piano voicing is any set of notes two hands can reach; a guitar chord is
 * one note per string, within one hand's stretch. So guitar voicings are not placed on a
 * keyboard and hoped to be playable. They are *found on the fretboard*: every grip of the
 * chord's tones on a set of adjacent strings, within a four-fret reach. Then the one that
 * moves least from the previous chord wins, costed the same way as a keyboard voicing.
 *
 * Band rule: the guitar leaves the low strings to the bass player — grips stay at or above
 * the slot's floor, so a strummed chord never muddies the bass line. The one exception is
 * the bass note itself: the swing shell's root sits on the low strings on purpose, doubling
 * the walking bass (`rootBottom`). With no bassist, a book may bring its grips down.
 */
import type { ChordFacts } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import { cost, type Slot, type VoicingKind, voicingTones } from './voicing.js';

/** Standard tuning, low E to high E. */
const STRINGS = [40, 45, 50, 55, 59, 64] as const;
/** The highest fret a comping grip uses (past it, the neck gets cramped and thin). */
const MAX_FRET = 15;
/** Frets between the lowest and highest fretted note: a four-fret hand. */
const REACH = 3;

export interface GripShape {
    /** How many strings the grip sounds. */
    strings: number;
    /** Where the grips may sit; the top voice aims for `slot.top`. */
    slot: Slot;
    /**
     * The chord's bass note is the grip's lowest note — the swing shell's root on the low
     * strings, doubling the walking bass an octave up, is what makes it felt.
     */
    rootBottom?: boolean;
    /** One string inside the grip may be skipped (muted by the fretting hand): 8x89xx. */
    skip?: boolean;
    /**
     * Open strings allowed. Off where the idiom mutes by releasing the fretting hand (the
     * swing chunk, the funk scratch) — an open string would ring on through the release.
     */
    open?: boolean;
}

interface Search {
    pcs: number[];
    size: number;
    floor: number;
    doubles: Set<number>;
    bottom: number | null;
    skip: boolean;
    open: boolean;
}

/** The string sets a grip may use: adjacent strings, or (with `skip`) one gap inside. */
function stringSets(size: number, skip: boolean): number[][] {
    const sets: number[][] = [];
    for (let first = 0; first + size <= STRINGS.length; first++) {
        sets.push(Array.from({ length: size }, (_, i) => first + i));
    }
    if (skip) {
        for (let first = 0; first + size + 1 <= STRINGS.length; first++) {
            for (let gap = 1; gap < size; gap++) {
                sets.push(
                    Array.from({ length: size + 1 }, (_, i) => first + i).filter(
                        (i) => i !== first + gap,
                    ),
                );
            }
        }
    }
    return sets;
}

/** Grips of the chord tones on a string set, covering every tone, lowest note ≥ floor. */
function gripsOn({ pcs, size, floor, doubles, bottom, skip, open }: Search): number[][] {
    const out = new Map<string, number[]>();
    for (const set of stringSets(size, skip)) {
        const strings = set.map((i) => STRINGS[i]);
        for (let base = 1; base + REACH <= MAX_FRET; base++) {
            // Each string: open, or a fret inside the hand's reach, sounding a chord tone.
            const frets = [
                ...(open ? [0] : []),
                ...Array.from({ length: REACH + 1 }, (_, i) => base + i),
            ];
            const options = strings.map((string) =>
                frets.map((fret) => string + fret).filter((m) => pcs.includes(mod12(m))),
            );
            const walk = (i: number, chosen: number[]) => {
                if (i === options.length) {
                    out.set(chosen.join(','), [...chosen]);
                    return;
                }
                for (const m of options[i]) {
                    // Pitch rises string to string (no crossed voices), and only the tones
                    // a player would double (root, fifth) appear twice.
                    if (chosen.length && m <= chosen[chosen.length - 1]) {
                        continue;
                    }
                    if (chosen.some((c) => mod12(c) === mod12(m)) && !doubles.has(mod12(m))) {
                        continue;
                    }
                    chosen.push(m);
                    walk(i + 1, chosen);
                    chosen.pop();
                }
            };
            walk(0, []);
        }
    }
    return [...out.values()].filter(
        (g) =>
            g[0] >= floor &&
            (bottom === null || mod12(g[0]) === bottom) &&
            pcs.every((pc) => g.some((m) => mod12(m) === pc)),
    );
}

// Grips depend only on the chord's pitch classes and the shape, so they're found once.
const cache = new Map<string, number[][]>();

/** Place a chord as a guitar grip near the previous one. Deterministic. */
export function grip(
    chord: ChordFacts,
    kind: VoicingKind,
    shape: GripShape,
    prev: number[] | null,
): number[] {
    const tones = voicingTones(chord, kind);
    const pcs = [...new Set(tones.map((n) => mod12(chord.root + n)))];
    // A root-position shape puts the chord's bass under it (and needs it among the tones).
    const bottom = shape.rootBottom ? chord.bass : null;
    if (bottom !== null && !pcs.includes(bottom)) {
        pcs.push(bottom);
    }
    // A grip with more strings than tones doubles the root or fifth: a fuller strum.
    const size = Math.max(pcs.length, Math.min(shape.strings, pcs.length + 1));
    const doubles = new Set([chord.root, mod12(chord.root + (chord.fifth ?? 7))]);
    const search: Search = {
        pcs,
        size,
        floor: shape.slot.lo,
        doubles,
        bottom,
        skip: !!shape.skip,
        open: shape.open ?? true,
    };
    const key = JSON.stringify({ ...search, doubles: [...doubles] });
    let found = cache.get(key);
    if (!found) {
        found = gripsOn(search);
        // A chord too dense for the shape still gets played: drop to exactly its tones, then
        // let go of the root-position rule before giving up on the chord.
        if (!found.length && size > pcs.length) {
            found = gripsOn({ ...search, size: pcs.length });
        }
        if (!found.length && bottom !== null) {
            found = gripsOn({ ...search, size: Math.max(pcs.length, size), bottom: null });
        }
        cache.set(key, found);
    }
    let best: number[] | null = null;
    let bestCost = Infinity;
    for (const g of found) {
        const c = cost(g, prev, chord, shape.slot);
        if (c < bestCost) {
            best = g;
            bestCost = c;
        }
    }
    return best ?? [];
}

/**
 * Whether a set of notes can be fretted as one chord in standard tuning: one note per
 * string, on distinct strings, within the hand's reach. The invariant suite holds every
 * guitar chord the band plays to this.
 */
export function isPlayable(notes: number[]): boolean {
    const sorted = [...notes].sort((a, b) => a - b);
    const place = (i: number, used: number[], frets: number[]): boolean => {
        if (i === sorted.length) {
            const fretted = frets.filter((f) => f > 0);
            return !fretted.length || Math.max(...fretted) - Math.min(...fretted) <= REACH;
        }
        for (let s = 0; s < STRINGS.length; s++) {
            const fret = sorted[i] - STRINGS[s];
            // Strings in pitch order: each note on a higher string than the note below it.
            if (fret < 0 || fret > MAX_FRET + REACH || used.some((u) => u >= s)) {
                continue;
            }
            if (place(i + 1, [...used, s], [...frets, fret])) {
                return true;
            }
        }
        return false;
    };
    return sorted.length <= STRINGS.length && place(0, [], []);
}
