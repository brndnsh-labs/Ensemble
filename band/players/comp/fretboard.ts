/**
 * Guitar grips. A piano voicing is any set of notes two hands can reach; a guitar chord is
 * one note per string, within one hand's stretch. So guitar voicings are not placed on a
 * keyboard and hoped to be playable. They are *found on the fretboard*: every grip of the
 * chord's tones on a set of adjacent strings, within a four-fret reach. Then the one that
 * moves least from the previous chord wins, costed the same way as a keyboard voicing.
 *
 * Band rule: the guitar leaves the low strings to the bass player — grips stay at or above
 * the slot's floor, so a strummed chord never muddies the bass line. The exceptions double
 * the bass on purpose: the swing shell's root sits on the low strings, doubling the walking
 * bass (`rootBottom`), and a metal book's low slot puts its power chords (`kind: 'power'`,
 * root-5-8) on the E and A strings, where the riff and the bass are one sound, and an
 * open-position book (`openPosition`) lets an open chord's root (or a fifth over it) ring on
 * the low strings (Am x02210). With no bassist, a book may bring its grips down.
 */
import { type ChordFacts, fifthOf } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import { cost, LOW_INTERVAL_LIMIT, type Slot, type VoicingKind, voicingTones } from './voicing.js';

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
    /**
     * Open position: the singer-songwriter's chord shapes (x32010, 022100, xx0232, 133211).
     * Where a chord has a shape in first position (every fretted note at the 4th fret or
     * below) the hand plays it there, not wherever voice leading would drift. The grip rings
     * as many strings as the shape allows (up to `strings`, where the default search stops at
     * one note more than the chord has), and each open string is rewarded: the ringing open
     * strings are the sound. An open chord stands on its root or its written bass. Root, fifth
     * and bass double freely; the third may double once, one copy on the grip's top two notes
     * (x32010's high E, 320003's B); a seventh chord may drop its perfect fifth over a bassist
     * (C7 x32310). No grip needs more than four fingers (a barre counts as one). With a
     * bassist, a root, fifth or the chord's bass may sit below the slot's floor, down to the
     * low E, in a grip whose lowest note is the root or the bass: it doubles the bassist's own
     * note (Am x02210), the band rule's one exception. Off by default: every other book keeps
     * the search above, unchanged.
     */
    openPosition?: boolean;
    /**
     * The two lowest voices obey the low-interval limits as law, not as a cost that smoother
     * voice leading can outbid (a major 3rd no lower than Bb2: F2-A2 is mud). For a guitar that
     * is the band's bottom, where nobody else covers a muddy low interval.
     */
    bottomLaw?: boolean;
}

/** Whether a grip's two lowest voices keep their low-interval limit. */
const bottomClear = (g: number[]) => g.length < 2 || g[0] >= (LOW_INTERVAL_LIMIT[g[1] - g[0]] ?? 0);

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

/** An open-position grip, with what the selection weighs beyond the notes. */
interface OpenGrip {
    notes: number[];
    /** Open strings it rings. */
    open: number;
    /** Its highest fret: first position is the 4th fret or below. */
    reach: number;
    /** A string inside the grip is muted (3x0003). */
    skipped: boolean;
}

/** The highest fret of first position: x24432 (Bm) and 244222 (F#m) still live there. */
const FIRST_POSITION = 4;

/**
 * Fingers a fretting of `frets` on the strings `set` needs (0 = open). Every fretted note
 * takes a finger, except that the index may lay a barre across the lowest fret: that is one
 * finger for all of its notes, as long as no open or muted string lies under it (133211 is
 * four fingers; 133213 would be five, so no hand plays it). The default search never asks —
 * its grips stop at one note more than the chord — but a six-string open-position grip must.
 */
function fingers(frets: number[], set: number[]): number {
    const fretted = frets.filter((f) => f > 0);
    if (!fretted.length) {
        return 0;
    }
    const low = Math.min(...fretted);
    const at = frets.flatMap((f, i) => (f === low ? [i] : []));
    const [first, last] = [at[0], at[at.length - 1]];
    const clear =
        set[last] - set[first] === last - first && frets.slice(first, last + 1).every((f) => f > 0);
    return clear ? fretted.length - at.length + 1 : fretted.length;
}

interface OpenSearch {
    pcs: number[];
    strings: number;
    floor: number;
    bottom: number | null;
    skip: boolean;
    root: number;
    bass: number;
    fifth: number;
    third: number | null;
    /** A tone the grip may leave out: a seventh chord's perfect fifth (C7 x32310). */
    optional: number | null;
}

/**
 * Every open-position grip of the chord (see `GripShape.openPosition`): any size from the
 * chord's tone count up to `strings`, on adjacent strings (or one skipped), within the
 * hand's four-fret reach, open strings on. Each note set is kept once, as the most open way
 * to finger it.
 */
function openGripsOn(s: OpenSearch): OpenGrip[] {
    const out = new Map<string, OpenGrip>();
    // Below the floor: only the bassist's own notes, and only under a grip standing on the
    // root or the bass (checked at the leaf, once the lowest note is known).
    const low = new Set([s.root, s.fifth, s.bass]);
    for (let size = s.pcs.length; size <= s.strings; size++) {
        for (const set of stringSets(size, s.skip)) {
            const skipped = set[set.length - 1] - set[0] + 1 > set.length;
            for (let base = 1; base + REACH <= MAX_FRET; base++) {
                const frets = [0, ...Array.from({ length: REACH + 1 }, (_, i) => base + i)];
                const options = set.map((i) =>
                    frets
                        .map((fret) => ({ midi: STRINGS[i] + fret, fret }))
                        .filter(({ midi }) => s.pcs.includes(mod12(midi))),
                );
                const chosen: { midi: number; fret: number }[] = [];
                const walk = (i: number) => {
                    if (i === options.length) {
                        if (
                            fingers(
                                chosen.map((c) => c.fret),
                                set,
                            ) > 4
                        ) {
                            return;
                        }
                        const notes = chosen.map((c) => c.midi);
                        const open = chosen.filter((c) => c.fret === 0).length;
                        const reach = Math.max(...chosen.map((c) => c.fret));
                        const key = notes.join(',');
                        const had = out.get(key);
                        if (
                            !had ||
                            open > had.open ||
                            (open === had.open && reach < had.reach) ||
                            (open === had.open && reach === had.reach && had.skipped && !skipped)
                        ) {
                            out.set(key, { notes, open, reach, skipped });
                        }
                        return;
                    }
                    for (const option of options[i]) {
                        const m = option.midi;
                        if (chosen.length && m <= chosen[chosen.length - 1].midi) {
                            continue;
                        }
                        // Root, fifth and the written bass double freely (320003 has three
                        // G's, C/E 032010 three E's); the third may double once; anything else
                        // sounds once.
                        const copies = chosen.filter((c) => mod12(c.midi) === mod12(m)).length;
                        const pc = mod12(m);
                        const doubles = pc === s.root || pc === s.fifth || pc === s.bass;
                        if (copies && !doubles && !(pc === s.third && copies === 1)) {
                            continue;
                        }
                        chosen.push(option);
                        walk(i + 1);
                        chosen.pop();
                    }
                };
                walk(0);
            }
        }
    }
    return [...out.values()].filter(({ notes: g }) => {
        const lowest = mod12(g[0]);
        const standsOnBass = lowest === s.root || lowest === s.bass;
        const thirds =
            s.third === null || s.third === s.bass ? [] : g.filter((m) => mod12(m) === s.third);
        return (
            s.pcs.every((pc) => pc === s.optional || g.some((m) => mod12(m) === pc)) &&
            (s.bottom === null || lowest === s.bottom) &&
            g.every((m) => m >= s.floor || (standsOnBass && low.has(mod12(m)))) &&
            // A doubled third rings on top (x32010's high E), never as two low copies.
            (thirds.length < 2 || g.slice(-2).includes(thirds[thirds.length - 1]))
        );
    });
}

/**
 * How much an open-position grip is worth beyond `cost` (lower is better). A strummed open
 * chord rings: each open string and each string sounded is worth more than a few semitones
 * of voice leading, because an acoustic player changes shapes, not voices. A muted string
 * inside the grip costs a little, so the full shape wins where both exist.
 */
function openBonus(g: OpenGrip): number {
    // why: 3 per open string ≈ the voice-leading cost of moving a voice 6 semitones, so the
    // ringing shape beats a closed one that merely moves less.
    const OPEN = 3;
    // why: 2 per string sounded — a fuller strum wins over a partial one of the same shape.
    const FULL = 2;
    // why: a muted inside string costs about one string's worth (3x0003 only where 320003
    // is not allowed).
    const SKIP = 2.5;
    return -OPEN * g.open - FULL * g.notes.length + (g.skipped ? SKIP : 0);
}

// Grips depend only on the chord's pitch classes and the shape, so they're found once.
const cache = new Map<string, number[][]>();
const openCache = new Map<string, OpenGrip[]>();

/** The open-position grip for a chord (see `GripShape.openPosition`), or null if none. */
function openGrip(
    chord: ChordFacts,
    pcs: number[],
    bottom: number | null,
    shape: GripShape,
    prev: number[] | null,
): number[] | null {
    const search: OpenSearch = {
        pcs,
        strings: shape.strings,
        floor: shape.slot.lo,
        bottom,
        skip: !!shape.skip,
        root: chord.root,
        bass: chord.bass,
        fifth: mod12(chord.root + fifthOf(chord)),
        third: chord.third === null ? null : mod12(chord.root + chord.third),
        // A seventh chord's perfect fifth is the note a guitarist drops to reach an open
        // shape (C7 x32310) — over a bassist. Alone, the grip keeps it: the Travis thumb's
        // alternate bass is the fifth.
        optional:
            bottom === null && chord.seventh !== null && chord.fifth === 7
                ? mod12(chord.root + 7)
                : null,
    };
    const key = JSON.stringify({ ...search, law: !!shape.bottomLaw });
    let found = openCache.get(key);
    if (!found) {
        found = openGripsOn(search);
        if (shape.bottomLaw && found.some((g) => bottomClear(g.notes))) {
            found = found.filter((g) => bottomClear(g.notes));
        }
        // An open chord stands on its root (or the written bass): x32010, not the G/D xx0003
        // or the F/C x33211 a voice-leading search would slide into.
        const stands = (g: OpenGrip) => [chord.root, chord.bass].includes(mod12(g.notes[0]));
        if (found.some(stands)) {
            found = found.filter(stands);
        }
        // First position wherever the chord has a shape there; a barre up the neck otherwise.
        if (found.some((g) => g.reach <= FIRST_POSITION)) {
            found = found.filter((g) => g.reach <= FIRST_POSITION);
        }
        openCache.set(key, found);
    }
    // Notes the search let below the floor are legal: `cost` judges the register from the
    // low E up, and the clashes and low intervals as for any grip. Voice leading is the top
    // string's alone: an open-position player changes shapes, not voices, and what carries
    // from chord to chord is the top of the strum (the anchored top strings of G, Cadd9,
    // Em7 in the songwriter's shape family).
    const slot = { ...shape.slot, lo: Math.min(shape.slot.lo, STRINGS[0]) };
    const prevTop = prev?.length ? Math.max(...prev) : null;
    let best: number[] | null = null;
    let bestCost = Infinity;
    for (const g of found) {
        const top = g.notes[g.notes.length - 1];
        // why: 0.6 per semitone of top-string motion, `cost`'s own weight for the top voice.
        const motion = prevTop === null ? 0 : Math.abs(top - prevTop) * 0.6;
        const c = cost(g.notes, null, chord, slot) + motion + openBonus(g);
        if (c < bestCost) {
            best = g.notes;
            bestCost = c;
        }
    }
    return best;
}

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
    // A power chord is the exception: its root is its bottom, always — over a slash chord the
    // slash note is the bassist's, and adding it to the grip would make the distorted triad a
    // power chord exists to avoid.
    const bottom = shape.rootBottom ? (kind === 'power' ? chord.root : chord.bass) : null;
    if (bottom !== null && !pcs.includes(bottom)) {
        pcs.push(bottom);
    }
    if (shape.openPosition) {
        const open = openGrip(chord, pcs, bottom, shape, prev);
        if (open) {
            return open;
        }
    }
    // A grip with more strings than tones doubles the root or fifth: a fuller strum.
    const size = Math.max(pcs.length, Math.min(shape.strings, pcs.length + 1));
    const doubles = new Set([chord.root, mod12(chord.root + fifthOf(chord))]);
    const search: Search = {
        pcs,
        size,
        floor: shape.slot.lo,
        doubles,
        bottom,
        skip: !!shape.skip,
        open: shape.open ?? true,
    };
    const key = JSON.stringify({ ...search, doubles: [...doubles], law: !!shape.bottomLaw });
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
        if (shape.bottomLaw && found.some(bottomClear)) {
            found = found.filter(bottomClear);
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
