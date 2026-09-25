/**
 * Pitch for a planned phrase, targets first.
 *
 * A phrase's rhythm is fixed before any pitch is chosen. Then its *targets* are placed: the
 * first note, the last note, every note on a chord change and every note before a breath. A
 * change lands on a guide tone and the end on a stable tone, chosen by rule (nearest to the
 * phrase's contour), never by weighted chance. Only then are the notes between filled in: they
 * walk toward the next target through the style's note pool, mostly by step, and the note
 * before a target may approach it by half step or enclose it. That is how a line sounds like it
 * is going somewhere.
 *
 * Some pitches arrive already decided (`carried`): a head restating its opening, a riff played
 * again, a motif developed. The line keeps them and fills around them.
 */
import type { Rng } from '../../core/random.js';
import { type ChordFacts, chordPcs } from '../../theory/chord.js';
import { type KeyContext, mod12 } from '../../theory/pitch.js';

export type Contour = 'arch' | 'fall' | 'climb' | 'wave';

/** One note of a phrase's rhythm, before it has a pitch. */
export interface Onset {
    tick: number;
    dur: number;
    /** Sixteenth-step position within its bar (for downbeat and offbeat rules). */
    step: number;
    chord: ChordFacts;
    key: KeyContext;
    /**
     * The harmony changed since the phrase's previous note — even across a bar the line rested
     * through, or into a chord this note anticipates — so this note is a target.
     */
    change: boolean;
}

/** What a style tells the line about its notes. */
export interface LinePalette {
    /** The notes the line moves through at a chord (absolute pitch classes). */
    pool(chord: ChordFacts, key: KeyContext): number[];
    /** Where a chord change lands, best first (absolute pitch classes). */
    arrive(chord: ChordFacts, key: KeyContext): number[];
    /** Where a phrase comes to rest, best first (absolute pitch classes). */
    settle(chord: ChordFacts, key: KeyContext): number[];
    /** Chance the note before a target is a chromatic neighbour of it. */
    chromatic: number;
    /** Chance a target is enclosed: scale step above, then half step below. */
    enclosure: number;
}

export interface LineShape {
    contour: Contour;
    /** The phrase's centre pitch. */
    centre: number;
    /** How far the contour travels, in semitones. */
    span: number;
    range: readonly [number, number];
    /** Where the line was: the first target leans toward it, so phrases connect. */
    from: number | null;
}

/** An eighth note, in ticks: an approach note is a passing note, never a held one. */
const PASSING = 240;
/** A beat of silence after a note ends a figure. */
const BREATH = 480;

/** The contour's ideal pitch at `t` (0–1 through the phrase). */
function contourAt(shape: LineShape, t: number): number {
    const { centre, span } = shape;
    switch (shape.contour) {
        case 'arch':
            return centre - span / 3 + span * Math.sin(Math.PI * t);
        case 'fall':
            return centre + span / 2 - span * t;
        case 'climb':
            return centre - span / 2 + span * t;
        case 'wave':
            return centre + (span / 2) * Math.sin(2 * Math.PI * t);
    }
}

/**
 * The phrase's register: the contour's reach and a little either side (a step past it, not a
 * register away), inside the instrument. Targets and walks both stay in it.
 */
function registerOf(shape: LineShape): readonly [number, number] {
    const [lo, hi] = shape.range;
    return [
        Math.max(lo, Math.floor(shape.centre - shape.span / 2 - 3)),
        Math.min(hi, Math.ceil(shape.centre + shape.span / 2 + 3)),
    ];
}

/** Every MIDI note of the pitch classes `pcs` inside `range`. */
function candidates(pcs: readonly number[], [lo, hi]: readonly [number, number]): number[] {
    const out: number[] = [];
    for (let m = lo; m <= hi; m++) {
        if (pcs.includes(mod12(m))) {
            out.push(m);
        }
    }
    return out;
}

/**
 * The candidate nearest `ideal`, ranked pitch classes breaking near-ties (earlier = better),
 * never one of `avoid` (a target doesn't restate the note right before it). The rank weight
 * (1.25 per place) is a little more than a semitone: a better-ranked tone wins unless the
 * next one is more than a step nearer the contour.
 */
function nearestRanked(
    pcs: readonly number[],
    ideal: number,
    range: readonly [number, number],
    avoid: readonly (number | null)[] = [],
): number {
    let best = Math.round(ideal);
    let score = Number.POSITIVE_INFINITY;
    for (const m of candidates(pcs, range)) {
        if (avoid.includes(m)) {
            continue;
        }
        const s = Math.abs(m - ideal) + pcs.indexOf(mod12(m)) * 1.25;
        if (s < score) {
            score = s;
            best = m;
        }
    }
    return best;
}

/**
 * The pool note nearest `ideal`, never one of `avoid` (the note before, and the one before
 * that: a line that returns to the note two back is trilling, and a trill belongs in a style's
 * cells, not in a walk). On a downbeat a chord tone within reach wins over a passing tone —
 * the bebop rule that keeps a run's beats on the harmony (1.5: a chord tone a step and a half
 * away still beats a passing tone right at the contour). A held note a half step from a chord
 * tone is a rub, not colour (a b9 held over a minor seventh, a b3 held against a major 3rd):
 * a passing note may brush it, a held one steers clear (3: past any nearer choice).
 */
function snap(
    ideal: number,
    pool: readonly number[],
    tones: readonly number[],
    range: readonly [number, number],
    avoid: readonly (number | null)[],
    downbeat: boolean,
    held: boolean,
): number {
    let best = Math.round(ideal);
    let score = Number.POSITIVE_INFINITY;
    for (const m of candidates(pool, range)) {
        if (avoid.includes(m)) {
            continue;
        }
        const chordTone = tones.includes(mod12(m));
        const rub =
            held && !chordTone && (tones.includes(mod12(m - 1)) || tones.includes(mod12(m + 1)));
        const s = Math.abs(m - ideal) - (downbeat && chordTone ? 1.5 : 0) + (rub ? 3 : 0);
        if (s < score) {
            score = s;
            best = m;
        }
    }
    return best;
}

/** The pool note a step away from `target`, above or below it. */
function neighbour(target: number, pool: readonly number[], above: boolean): number {
    for (let d = 1; d <= 3; d++) {
        const m = above ? target + d : target - d;
        if (pool.includes(mod12(m))) {
            return m;
        }
    }
    return above ? target + 2 : target - 2;
}

function fold(m: number, [lo, hi]: readonly [number, number]): number {
    let out = m;
    while (out < lo) {
        out += 12;
    }
    while (out > hi) {
        out -= 12;
    }
    return out;
}

/** Reflect `want` back inside [lo, hi]: a line reaching a register edge turns round. */
function reflect(want: number, lo: number, hi: number): number {
    if (want > hi) {
        return Math.max(lo, hi - (want - hi));
    }
    if (want < lo) {
        return Math.min(hi, lo + (lo - want));
    }
    return want;
}

/** Which notes of a phrase are targets: first, last, changes, and before a breath. */
export function targetsOf(onsets: readonly Onset[]): boolean[] {
    const n = onsets.length;
    return onsets.map(
        (o, i) =>
            i === 0 || i === n - 1 || o.change || onsets[i + 1].tick - (o.tick + o.dur) >= BREATH,
    );
}

/** Pitches for `onsets`, one per onset, keeping any `carried` pitch as given. */
export function voiceLine(
    onsets: readonly Onset[],
    palette: LinePalette,
    shape: LineShape,
    rng: Rng,
    carried: readonly (number | null)[] = [],
): number[] {
    const n = onsets.length;
    if (!n) {
        return [];
    }
    const { range } = shape;
    const register = registerOf(shape);
    const ideal = (i: number) => {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const at = contourAt(shape, t);
        // The first note leans toward where the last phrase left off.
        return i === 0 && shape.from !== null ? (at + shape.from) / 2 : at;
    };

    const isTarget = targetsOf(onsets);
    const pitches: (number | null)[] = onsets.map((_, i) => carried[i] ?? null);
    const placed = pitches.map((m, i) => m !== null || isTarget[i]);
    let previousTarget: number | null = null;
    for (let i = 0; i < n; i++) {
        if (pitches[i] !== null) {
            previousTarget = pitches[i];
            continue;
        }
        if (!isTarget[i]) {
            continue;
        }
        const { chord, key } = onsets[i];
        const pcs = i === n - 1 ? palette.settle(chord, key) : palette.arrive(chord, key);
        const adjacent = i > 0 ? pitches[i - 1] : null;
        // A phrase doesn't come to rest on the very note the last one ended on: a first chorus
        // that settles on the same F every time a Dm comes round has stopped going anywhere.
        const avoid = i === n - 1 ? [adjacent, shape.from] : [adjacent];
        let m = nearestRanked(pcs, ideal(i), register, avoid);
        // A target a long way from the last one is folded nearer: a line doesn't leap a tenth
        // to reach its next chord when the same tone sits an octave closer.
        if (previousTarget !== null && Math.abs(m - previousTarget) > 9) {
            const closer = m > previousTarget ? m - 12 : m + 12;
            if (closer >= register[0] && closer <= register[1] && closer !== adjacent) {
                m = closer;
            }
        }
        pitches[i] = m;
        previousTarget = m;
    }

    // Fill between each pair of placed notes (targets and carried pitches).
    let a = 0;
    for (let b = 1; b < n; b++) {
        if (!placed[b]) {
            continue;
        }
        if (b - a - 1 > 0) {
            fill(onsets, pitches, a, b, palette, register, rng);
        }
        a = b;
    }
    // A lone sixteenth flicked into a longer note is a grace note: the scale step below it (a
    // hammer-on, a turn's lower note), not a leap.
    for (let i = 0; i + 1 < n; i++) {
        const [o, next] = [onsets[i], onsets[i + 1]];
        const lone = i === 0 || onsets[i - 1].tick + onsets[i - 1].dur < o.tick;
        if (
            !placed[i] &&
            lone &&
            o.dur <= PASSING / 2 &&
            next.tick - o.tick <= PASSING / 2 &&
            next.dur >= PASSING
        ) {
            pitches[i] = neighbour(pitches[i + 1] as number, palette.pool(o.chord, o.key), false);
        }
    }
    // An approach placed before its walk can still complete a trill (a-b-a-b) with the walk's
    // last notes: re-choose the free note in the middle of it.
    for (let i = 3; i < n; i++) {
        const [w, x, y, z] = [pitches[i - 3], pitches[i - 2], pitches[i - 1], pitches[i]];
        if (w === null || w !== y || x !== z || w === x) {
            continue;
        }
        const k = !placed[i - 2] ? i - 2 : !placed[i - 1] ? i - 1 : -1;
        if (k < 0) {
            continue;
        }
        const o = onsets[k];
        pitches[k] = snap(
            pitches[k] as number,
            palette.pool(o.chord, o.key),
            chordPcs(o.chord),
            register,
            [pitches[k], pitches[k - 1], pitches[k + 1], pitches[k - 2] ?? null],
            o.step % 4 === 0,
            o.dur > PASSING,
        );
    }
    return pitches.map((m, i) => fold(m ?? Math.round(ideal(i)), range));
}

function fill(
    onsets: readonly Onset[],
    pitches: (number | null)[],
    a: number,
    b: number,
    palette: LinePalette,
    register: readonly [number, number],
    rng: Rng,
): void {
    const from = pitches[a] as number;
    const to = pitches[b] as number;
    const [floor, ceiling] = register;
    const { chord, key } = onsets[b - 1];
    const pool = palette.pool(chord, key);
    const rising = to >= from;
    const short = (i: number) => onsets[i].dur <= PASSING;
    // A chromatic note is a passing note: off the beat, never held.
    const passing = (i: number) => short(i) && onsets[i].step % 4 !== 0;
    let end = b; // first index that is already placed
    // The approach: the note (or two) before the target.
    if (!short(b - 1)) {
        // A held note steps into the target: the scale step beside it (a 9th onto the root, a
        // 4th onto the 3rd), unless holding that step would rub its chord — then from a chord
        // tone.
        const tones = chordPcs(chord);
        const step = neighbour(to, pool, !rising);
        const rubs =
            !tones.includes(mod12(step)) &&
            (tones.includes(mod12(step - 1)) || tones.includes(mod12(step + 1)));
        pitches[b - 1] =
            rubs || step === from
                ? nearestRanked(tones, rising ? to - 3 : to + 3, register, [
                      to,
                      from,
                      pitches[b - 2] ?? null,
                  ])
                : step;
        end = b - 1;
    } else if (b - a - 1 >= 2 && passing(b - 1) && short(b - 2) && rng.chance(palette.enclosure)) {
        // Scale step above, half step below, target.
        pitches[b - 2] = neighbour(to, pool, true);
        pitches[b - 1] = to - 1;
        end = b - 2;
    } else if (
        passing(b - 1) &&
        // Straight after the note before it, a chromatic approach needs that note within a
        // 3rd: a tritone drop onto a chromatic note is a clam, not a line.
        (b - 1 > a + 1 || Math.abs(to - from) <= 4) &&
        rng.chance(palette.chromatic)
    ) {
        // From above only where the half step above is in the scale (a 4th onto a major 3rd);
        // otherwise from below — a raised note above a minor 3rd is its major 3rd.
        const above = !rising && pool.includes(mod12(to + 1));
        pitches[b - 1] = above ? to + 1 : to - 1;
        end = b - 1;
    } else {
        pitches[b - 1] = neighbour(to, pool, !rising);
        end = b - 1;
    }
    const count = end - a - 1;
    if (count <= 0) {
        return;
    }
    const target = pitches[end] as number;
    const distance = target - from;
    // More notes than the distance needs: the line turns (goes past and comes back) rather
    // than repeating itself, by up to a 5th (7). About 1.8 semitones per note is a scale
    // run's pace; with fewer notes than that pace needs (over 2.6 a note) it skips through
    // chord tones instead: an arpeggio.
    const room = Math.max(0, count * 1.8 - Math.abs(distance));
    const bump = (distance >= 0 ? 1 : -1) * Math.min(7, room / 2);
    const arpeggio = Math.abs(distance) / (count + 1) > 2.6;
    for (let k = 1; k <= count; k++) {
        const t = k / (count + 1);
        const want = reflect(from + distance * t + bump * Math.sin(Math.PI * t), floor, ceiling);
        const i = a + k;
        const onset = onsets[i];
        const localPool = palette.pool(onset.chord, onset.key);
        const localTones = chordPcs(onset.chord);
        pitches[i] = snap(
            want,
            arpeggio ? localTones : localPool,
            localTones,
            register,
            [pitches[i - 1], pitches[i - 2] ?? null],
            onset.step % 4 === 0,
            onset.dur > PASSING,
        );
    }
    // The last walking note never lands on the approach's own pitch or turns back to the note
    // before it: it is chosen again under the same rules with both ruled out.
    const last = end - 1;
    if (last > a && pitches[last] === pitches[end]) {
        const onset = onsets[last];
        pitches[last] = snap(
            pitches[end] as number,
            palette.pool(onset.chord, onset.key),
            chordPcs(onset.chord),
            register,
            [pitches[end], pitches[last - 1]],
            onset.step % 4 === 0,
            onset.dur > PASSING,
        );
    }
}
