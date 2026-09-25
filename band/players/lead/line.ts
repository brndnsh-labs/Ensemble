/**
 * Pitch for a planned phrase, targets first.
 *
 * A phrase's rhythm is fixed before any pitch is chosen. Then its *targets* are placed: the
 * first note, the last note, and every note that falls on a chord change. A change lands on a
 * guide tone and the end on a stable tone, chosen by rule (nearest to the phrase's contour),
 * never by weighted chance. Only then are the notes between filled in: they walk toward the next
 * target through the style's note pool, mostly by step, and the note before a target may
 * approach it by half step or enclose it. That is how a line sounds like it is going somewhere.
 */
import type { Rng } from '../../core/random.js';
import type { ChordFacts } from '../../theory/chord.js';
import { chordPcs } from '../../theory/chord.js';
import type { KeyContext } from '../../theory/pitch.js';
import { mod12 } from '../../theory/pitch.js';

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
     * through — so this note is a target.
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

/** An eighth note, in ticks: an approach note is a passing note, never a held one. */
const PASSING = 240;

/**
 * The candidate nearest `ideal`, ranked pitch classes breaking near-ties (earlier = better),
 * never `avoid` (a target doesn't restate the note right before it).
 */
function nearestRanked(
    pcs: readonly number[],
    ideal: number,
    range: readonly [number, number],
    avoid: number | null | readonly (number | null)[] = null,
) {
    const avoided = Array.isArray(avoid) ? avoid : [avoid];
    let best = Math.round(ideal);
    let score = Number.POSITIVE_INFINITY;
    for (const m of candidates(pcs, range)) {
        if (avoided.includes(m)) {
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
 * The pool note nearest `ideal`, never `avoid` (no repeated pitch inside a run). On a downbeat,
 * a chord tone within reach wins over a passing tone: the bebop rule that keeps a line's strong
 * beats on the harmony.
 */
function snap(
    ideal: number,
    pool: readonly number[],
    tones: readonly number[],
    range: readonly [number, number],
    avoid: number | null,
    downbeat: boolean,
    held: boolean,
): number {
    let best = Math.round(ideal);
    let score = Number.POSITIVE_INFINITY;
    for (const m of candidates(pool, range)) {
        if (m === avoid) {
            continue;
        }
        const chordTone = tones.includes(mod12(m));
        // A held note a half step above a chord tone is a rub, not colour (a b9 held over a
        // minor seventh chord): a passing note may brush it, a held one steers clear.
        const rub = held && !chordTone && tones.includes(mod12(m - 1));
        const s = Math.abs(m - ideal) - (downbeat && chordTone ? 1.5 : 0) + (rub ? 3 : 0);
        if (s < score) {
            score = s;
            best = m;
        }
    }
    return best;
}

/** The pool note a step away from `target` on the side `from` comes from. */
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

/**
 * Pitches for `onsets`, one per onset. `targets` may add indices that must be chord tones
 * (a style's strong beats); the first, the last and every chord change are always targets.
 */
export function voiceLine(
    onsets: readonly Onset[],
    palette: LinePalette,
    shape: LineShape,
    rng: Rng,
): number[] {
    const n = onsets.length;
    if (!n) {
        return [];
    }
    const { range } = shape;
    const ideal = (i: number) => {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const at = contourAt(shape, t);
        // The first note leans toward where the last phrase left off.
        return i === 0 && shape.from !== null ? (at + shape.from) / 2 : at;
    };

    // A note followed by a breath (a beat or more of silence) ends a figure: it lands too.
    const breath = (i: number) => onsets[i + 1].tick - (onsets[i].tick + onsets[i].dur) >= 480;
    const isTarget = onsets.map((o, i) => i === 0 || i === n - 1 || o.change || breath(i));
    const pitches: (number | null)[] = onsets.map(() => null);
    let previousTarget: number | null = null;
    for (let i = 0; i < n; i++) {
        if (!isTarget[i]) {
            continue;
        }
        const { chord, key } = onsets[i];
        const pcs = i === n - 1 ? palette.settle(chord, key) : palette.arrive(chord, key);
        const adjacent = i > 0 && isTarget[i - 1] ? pitches[i - 1] : null;
        let m = nearestRanked(pcs, ideal(i), range, adjacent);
        // A target a long way from the last one is folded nearer: a line doesn't leap a tenth
        // to reach its next chord when the same tone sits an octave closer.
        if (previousTarget !== null && Math.abs(m - previousTarget) > 9) {
            const closer = m > previousTarget ? m - 12 : m + 12;
            if (closer >= range[0] && closer <= range[1] && closer !== adjacent) {
                m = closer;
            }
        }
        pitches[i] = m;
        previousTarget = m;
    }

    // Fill between each pair of targets.
    let a = 0;
    for (let b = 1; b < n; b++) {
        if (!isTarget[b]) {
            continue;
        }
        const from = pitches[a] as number;
        const to = pitches[b] as number;
        const gap = b - a - 1;
        if (gap > 0) {
            fill(onsets, pitches, a, b, from, to, palette, shape, rng);
        }
        a = b;
    }
    return pitches.map((m, i) => fold(m ?? Math.round(ideal(i)), range));
}

function fill(
    onsets: readonly Onset[],
    pitches: (number | null)[],
    a: number,
    b: number,
    from: number,
    to: number,
    palette: LinePalette,
    shape: LineShape,
    rng: Rng,
): void {
    const { range } = shape;
    // A walk may turn past its target, but stays inside the phrase's register.
    const floor = shape.centre - shape.span / 2 - 2;
    const ceiling = shape.centre + shape.span / 2 + 2;
    const { chord, key } = onsets[b - 1];
    const pool = palette.pool(chord, key);
    const rising = to >= from;
    let end = b; // first index that is already placed
    // The approach: the note (or two) before the target. A chromatic or enclosing approach is
    // a passing note; on a held note the line steps into the target from a chord tone instead.
    const short = (i: number) => onsets[i].dur <= PASSING;
    if (!short(b - 1)) {
        const tones = chordPcs(chord);
        pitches[b - 1] = nearestRanked(tones, rising ? to - 3 : to + 3, range, [to, from]);
        end = b - 1;
    } else if (b - a - 1 >= 2 && short(b - 2) && rng.chance(palette.enclosure)) {
        pitches[b - 2] = neighbour(to, pool, true);
        pitches[b - 1] = to - 1;
        end = b - 2;
    } else if (rng.chance(palette.chromatic)) {
        pitches[b - 1] = rising ? to - 1 : to + 1;
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
    // than repeating itself; fewer: it skips through chord tones (an arpeggio).
    const room = Math.max(0, count * 1.8 - Math.abs(distance));
    const bump = (distance >= 0 ? 1 : -1) * Math.min(7, room / 2);
    const arpeggio = Math.abs(distance) / (count + 1) > 2.6;
    let previous = from;
    for (let k = 1; k <= count; k++) {
        const t = k / (count + 1);
        const want = Math.min(
            ceiling,
            Math.max(floor, from + distance * t + bump * Math.sin(Math.PI * t)),
        );
        const i = a + k;
        const onset = onsets[i];
        const localPool = palette.pool(onset.chord, onset.key);
        const localTones = chordPcs(onset.chord);
        const m = snap(
            want,
            arpeggio ? localTones : localPool,
            localTones,
            range,
            previous,
            onset.step % 4 === 0,
            onset.dur > PASSING,
        );
        pitches[i] = m;
        previous = m;
    }
    // The last walking note never lands on the approach's own pitch, nor falls back onto the
    // note before it: it takes whichever neighbour of the approach is free.
    const last = end - 1;
    if (last > a && pitches[last] === pitches[end]) {
        const onset = onsets[last];
        const pool = palette.pool(onset.chord, onset.key);
        const approachPitch = pitches[end] as number;
        const options = [
            neighbour(approachPitch, pool, approachPitch > to),
            neighbour(approachPitch, pool, approachPitch <= to),
        ];
        pitches[last] = options.find((m) => m !== pitches[last - 1]) ?? options[0];
    }
}
