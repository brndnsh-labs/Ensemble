/**
 * The comping idioms, for keyboards and guitars. Each book supplies a *rhythm* (where the
 * hand plays in a chord span); `compIdiom` does the rest the same way for every style:
 * voicing with voice leading (a keyboard voicing or a fretboard grip), anticipations that
 * tie the next bar's chord over the barline, N.C. rests, the ending.
 */
import { type EnergyTier, energyTier } from '../../arrange/plan.js';
import type { Rng } from '../../core/random.js';
import type { PitchedNote } from '../../core/types.js';
import type { BarContext, PitchedIdiom } from '../../styles/types.js';
import type { ChordFacts } from '../../theory/chord.js';
import { mod12, nearestMidi } from '../../theory/pitch.js';
import { at, barSteps, dyn, isCommonTime, pulses, STEP, spanSteps } from '../grid.js';
import { type GripShape, grip } from './fretboard.js';
import { type VoicingKind, voice } from './voicing.js';

export interface Hit {
    step: number;
    /** Length in sixteenths. */
    length: number;
    velocity: number;
    /** A strummed hit's direction (guitar books). */
    stroke?: 'down' | 'up';
    /** A muted scratch: the hand deadens the strings of the grip it's holding. */
    muted?: boolean;
}

/** An anticipation ties over the barline for this many sixteenths (an eighth). */
const TIE_STEPS = 2;

interface CompMemory {
    voicing: number[] | null;
    /** The next bar's first chord was already played as an anticipation. */
    pushed: boolean;
}

interface CompBook {
    name: string;
    kind: VoicingKind;
    /** Guitar books: the grip shape. Without it, chords are voiced for a keyboard. */
    grip?: GripShape;
    /** Hits for one chord span, in bar steps [from, to). */
    rhythm(
        ctx: BarContext,
        span: { from: number; to: number; attack: boolean; index: number },
        tier: EnergyTier,
        rng: Rng,
    ): Hit[];
    /** Chance that the last hit before a barline anticipates the next chord. */
    push: Record<EnergyTier, number>;
    /** A hit an eighth before a mid-bar chord change plays the new chord (bossa). */
    pushInBar?: boolean;
}

function compIdiom(book: CompBook): PitchedIdiom {
    const place = (chord: ChordFacts, prev: number[] | null) =>
        book.grip ? grip(chord, book.kind, book.grip, prev) : voice(chord, book.kind, prev);
    return {
        name: book.name,
        init: (): CompMemory => ({ voicing: null, pushed: false }),
        play(ctx, memory: CompMemory) {
            const { bar, plan } = ctx;
            const tier = energyTier(plan.energy);
            const total = barSteps(bar);
            const events: PitchedNote[] = [];
            let prev = memory.voicing;
            const chordAt = (
                midi: number[],
                step: number,
                length: number,
                velocity: number,
                hit?: { stroke?: 'down' | 'up'; muted?: boolean },
            ) => {
                for (const m of midi) {
                    const note: PitchedNote = {
                        lane: 'comp',
                        tick: at(bar, step),
                        dur: Math.max(STEP / 2, length * STEP),
                        midi: m,
                        velocity: dyn(velocity, plan.energy),
                        offsetMs: 0,
                        bar: bar.index,
                    };
                    if (hit?.stroke) {
                        note.stroke = hit.stroke;
                    }
                    if (hit?.muted) {
                        note.muted = true;
                    }
                    events.push(note);
                }
            };
            if (plan.ending) {
                const chord = bar.spans[0]?.chord;
                if (chord) {
                    prev = place(chord, prev);
                    chordAt(prev, 0, total, 92, book.grip && { stroke: 'down' });
                }
                return { events, memory: { voicing: prev, pushed: false } };
            }
            const nextFirst = ctx.next?.bar.spans[0];
            let pushed = false;
            const planned: (Hit & { chord: ChordFacts })[] = [];
            const spans = spanSteps(bar);
            spans.forEach(({ span, from, to }, index) => {
                const chord = span.chord;
                if (!chord) {
                    return;
                }
                const rng = ctx.rng(`comp${index}`);
                let hits = book.rhythm(ctx, { from, to, attack: span.attack, index }, tier, rng);
                if (span.fermata) {
                    hits = [{ step: from, length: to - from, velocity: 84, stroke: 'down' }];
                }
                // The previous bar already played this chord early and tied it over its
                // first eighth.
                if (memory.pushed && index === 0) {
                    hits = hits.filter((h) => h.step >= TIE_STEPS);
                }
                const isLastSpan = to >= total;
                for (const hit of hits) {
                    let target = chord;
                    let length = Math.min(hit.length, to - hit.step);
                    const anticipates =
                        !hit.muted &&
                        isLastSpan &&
                        hit.step >= total - 2 &&
                        nextFirst?.attack &&
                        nextFirst.chord &&
                        nextFirst.chord.symbol !== chord.symbol &&
                        !span.fermata &&
                        // The final chord lands on its downbeat, never early.
                        !ctx.next?.plan.ending &&
                        rng.chance(book.push[tier]);
                    if (anticipates && nextFirst?.chord) {
                        target = nextFirst.chord;
                        length = total - hit.step + TIE_STEPS;
                        pushed = true;
                    }
                    planned.push({ ...hit, length, chord: target });
                }
            });
            spans.forEach(({ span, from }, index) => {
                if (!span.chord || index === 0) {
                    return;
                }
                // Anticipate a mid-bar change: the hit an eighth before it plays the new chord.
                if (book.pushInBar) {
                    for (const hit of planned) {
                        if (!hit.muted && hit.step >= from - TIE_STEPS && hit.step < from) {
                            hit.chord = span.chord;
                            hit.length = Math.max(hit.length, from - hit.step + TIE_STEPS);
                        }
                    }
                }
            });
            // Every chord the chart writes is struck at least once — a comping figure may
            // skip beats, but never a chord.
            spans.forEach(({ span, from, to }, index) => {
                const chord = span.chord;
                const tiedIn = index === 0 && (memory.pushed || !span.attack);
                if (!chord || tiedIn || span.fermata) {
                    return;
                }
                const struck = planned.some(
                    (h) =>
                        !h.muted && h.chord === chord && h.step >= from - TIE_STEPS && h.step < to,
                );
                if (!struck) {
                    // A scratch already on the chord's arrival gives way to the strike.
                    const clash = planned.findIndex((h) => h.step === from);
                    if (clash >= 0) {
                        planned.splice(clash, 1);
                    }
                    planned.push({
                        step: from,
                        length: Math.min(4, to - from),
                        velocity: 80,
                        stroke: book.grip ? 'down' : undefined,
                        chord,
                    });
                }
            });
            planned.sort((a, b) => a.step - b.step);
            const { legato } = ctx.instrument;
            let held: ChordFacts | null = null;
            planned.forEach((hit, i) => {
                // A new strike cuts the chord before it: one hand, one chord at a time. A
                // sustaining instrument (the organ) holds each chord until that next strike.
                const next = planned[i + 1];
                const room = next ? next.step - hit.step : Math.max(hit.length, total - hit.step);
                const length = legato ? room : Math.min(hit.length, room);
                if (!book.grip) {
                    // A pianist re-voices every strike, leading from the last one.
                    prev = place(hit.chord, prev);
                } else if (!prev || hit.chord !== held) {
                    // A guitarist holds a grip, and moves to the next as its chord arrives —
                    // so even a scratch on that chord's first sixteenth deadens the new shape.
                    prev = place(hit.chord, prev);
                    held = hit.chord;
                }
                if (hit.muted) {
                    chordAt(prev, hit.step, Math.min(length, 0.5), hit.velocity, hit);
                    return;
                }
                // An upstroke catches the top strings, not the whole grip — it misses the
                // lowest string when that note is doubled higher up, so the chord stays whole.
                const [low, ...rest] = prev;
                const doubled = rest.some((m) => mod12(m) === mod12(low));
                const notes = hit.stroke === 'up' && doubled ? rest : prev;
                chordAt(notes, hit.step, length, hit.velocity, hit);
            });
            return { events, memory: { voicing: prev, pushed } };
        },
    };
}

// ---------------------------------------------------------------- rock
export const rockKeys = compIdiom({
    name: 'rock keys',
    kind: 'close',
    // In rock a push is an ensemble hit (kick, bass and keys together); keys pushing alone
    // put the next chord over the old bass note. Off until the plan can push the band.
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, { from, to, attack }, tier) {
        const hits: Hit[] = [];
        if (tier === 'low') {
            // Sustained: strike at the chord (or re-strike softly at the barline).
            hits.push({ step: from, length: to - from, velocity: attack ? 80 : 64 });
            return hits;
        }
        const every = tier === 'mid' ? 4 : 2;
        const beats = pulses(ctx.bar).map((p) => p.step);
        for (let s = from; s < to; s += every) {
            // Mid energy plays on the pulses (quarters); high pumps eighths.
            if (tier === 'mid' && !beats.includes(s) && s !== from) {
                continue;
            }
            hits.push({ step: s, length: every * 0.85, velocity: s % 4 === 0 ? 92 : 76 });
        }
        return hits;
    },
});

// ---------------------------------------------------------------- jazz
/**
 * Comping: short rootless chords in conversation with the soloist that isn't there yet —
 * a Charleston, its reverse, pushes on the "and". Rhythm per chord span is seeded per bar,
 * sparse at low energy and busier at high.
 */
const COMP_CELLS: readonly [number[], number][] = [
    [[0, 6], 4], // Charleston
    [[2, 8], 2], // reverse Charleston
    [[6], 3], // the "and" of 2
    [[0], 2],
    [[2, 6], 1],
    [[4, 10], 2],
    [[6, 14], 2],
];

// Two-beat spans (two chords in a bar) get half-bar figures: on the chord, on its "and",
// or both — never a four-beat figure that would never strike the chord.
const SHORT_COMP_CELLS: readonly [number[], number][] = [
    [[0], 3],
    [[2], 2],
    [[0, 6], 1],
];

function jazzComp(
    { from, to, attack }: { from: number; to: number; attack: boolean },
    tier: EnergyTier,
    rng: Rng,
): Hit[] {
    if (!attack && from === 0 && tier === 'low') {
        return [];
    }
    const length = to - from;
    const cell = rng.weighted(
        length <= 8
            ? SHORT_COMP_CELLS
            : COMP_CELLS.filter(([c]) => c.every((s) => s < length) || c[0] < length),
    );
    const hits: Hit[] = [];
    for (const offset of cell) {
        const step = from + offset;
        if (step >= to) {
            continue;
        }
        // Mostly short stabs; some held (a legato comp breathes).
        const held = rng.chance(tier === 'low' ? 0.5 : 0.25);
        hits.push({
            step,
            length: held ? to - step : 1.5,
            velocity: offset % 4 === 0 ? 78 : 88,
        });
    }
    if (tier === 'high' && length >= 8 && rng.chance(0.4)) {
        const extra = from + rng.pick([10, 14].filter((s) => s < length));
        if (extra && !hits.some((h) => h.step === extra)) {
            hits.push({ step: extra, length: 1.5, velocity: 84 });
        }
    }
    return hits.sort((a, b) => a.step - b.step);
}

export const jazzKeys = compIdiom({
    name: 'jazz comp',
    kind: 'rootless',
    push: { low: 0.15, mid: 0.3, high: 0.4 },
    rhythm: (_ctx, span, tier, rng) => jazzComp(span, tier, rng),
});

// ---------------------------------------------------------------- funk
// cspell:disable-next-line
const FUNK_STABS = ['..x..x.x...x.x..', '.x..x..x.x..x...', '..x...x...x..x.x', 'x..x..x...x.x...'];

export const funkKeys = compIdiom({
    name: 'funk stabs',
    kind: 'stab',
    push: { low: 0, mid: 0.15, high: 0.25 },
    rhythm(ctx, { from, to }, tier) {
        const line = ctx.rng('stabs', 'section').pick(FUNK_STABS);
        const riffSteps = [...line].flatMap((c, i) => (c === 'x' ? [i] : []));
        const dropped = ctx.rng('thin', 'section').pick(riffSteps);
        const hits: Hit[] = [];
        for (let s = from; s < to; s++) {
            if (line[s] !== 'x') {
                continue;
            }
            // Low energy thins the riff to its offbeats; high plays all of it.
            if (tier === 'low' && s % 4 !== 2) {
                continue;
            }
            // Mid energy drops the same stab every bar of the section — a thinner riff, not a
            // stuttering one.
            if (tier === 'mid' && s === dropped) {
                continue;
            }
            hits.push({ step: s, length: 0.9, velocity: s % 4 === 2 ? 98 : 88 });
        }
        if (!hits.length) {
            hits.push({ step: from + (to - from > 2 ? 2 : 0), length: 0.9, velocity: 90 });
        }
        return hits;
    },
});

// ---------------------------------------------------------------- bossa
// Two-bar comping figures (bar A, bar B) in sixteenths; the last hit of bar B is the
// classic anticipation of the next bar's chord.
const BOSSA_FIGURES: readonly [number[], number[]][] = [
    [
        [0, 6, 10],
        [4, 8, 14],
    ],
    [
        [0, 6, 12],
        [4, 10, 14],
    ],
];

/**
 * The bossa comping figure, for piano and guitar alike — it *is* the guitar's pattern
 * (João Gilberto's right hand), which the piano borrowed.
 */
function bossaFigure(
    ctx: BarContext,
    { from, to }: { from: number; to: number },
    tier: EnergyTier,
    stroke?: 'down',
): Hit[] {
    const figure = ctx.rng('figure', 'section').pick(BOSSA_FIGURES);
    const cell =
        ctx.bar.meter.name === '4/4'
            ? figure[ctx.bar.barInVisit % 2]
            : pulses(ctx.bar).map((p) => p.step);
    const steps = cell.filter((s) => s >= from && s < to);
    // A chord change mid-bar gets struck on (or an eighth before) its arrival.
    if (from > 0 && !steps.some((s) => s <= from + 2)) {
        steps.unshift(from);
    }
    if (tier === 'low' && steps.length > 2) {
        steps.splice(1, 1);
    }
    return steps.map((step, i) => ({
        step,
        length: Math.min(3, (steps[i + 1] ?? to) - step),
        velocity: step % 4 === 0 ? 74 : 82,
        stroke,
    }));
}

export const bossaKeys = compIdiom({
    name: 'bossa comp',
    kind: 'drop2',
    pushInBar: true,
    push: { low: 0.6, mid: 0.7, high: 0.75 },
    rhythm: (ctx, span, tier) => bossaFigure(ctx, span, tier),
});

// ================================================================ guitars
// A guitarist's strumming hand swings like a pendulum on the grid it strums — down on the
// beat side of each pair, up on the offbeat — whether or not the pick touches the strings.
// That's why a strum's direction is a function of *where* it lands, not a choice.
const pendulum = (step: number, grid: 1 | 2): 'down' | 'up' =>
    step % (2 * grid) === 0 ? 'down' : 'up';

/**
 * Reads a strum line, one char per sixteenth: `x` a strum (`X` accented), `-` a muted
 * scratch, `.` the hand passing without touching the strings. Directions come from the
 * pendulum, so a line can never ask for an impossible hand.
 */
function strums(line: string, from: number, to: number, grid: 1 | 2): Hit[] {
    const hits: Hit[] = [];
    for (let s = from; s < to && s < line.length; s++) {
        const c = line[s];
        if (c === '.') {
            continue;
        }
        if (c === '-') {
            hits.push({
                step: s,
                length: 0.5,
                velocity: 44,
                stroke: pendulum(s, grid),
                muted: true,
            });
            continue;
        }
        const accent = c === 'X';
        hits.push({
            step: s,
            length: 16,
            velocity: accent ? 100 : pendulum(s, grid) === 'down' ? 86 : 72,
            stroke: pendulum(s, grid),
        });
    }
    return hits;
}

// ---------------------------------------------------------------- rock guitar
// Strum lines in sixteenths (`x` a strum, `X` an accented one), on the eighth-note pendulum.
const ROCK_STRUMS = [
    // "Old faithful": down, down-up, up-down-up.
    'x...x.x...x.x.x.',
    // Downstrokes on the beat, a lift into beats 3 and 4.
    'x...x...x.x.x.x.',
];

export const rockGuitar = compIdiom({
    name: 'rock rhythm guitar',
    kind: 'close',
    // Four strings: a full strum with the root or fifth doubled, off the bass's low strings.
    grip: { strings: 4, slot: { lo: 50, hi: 79, top: 67 } },
    // Same reason as the rock keys: a push is an ensemble hit, not the guitar's alone.
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, { from, to, attack }, tier) {
        if (tier === 'low' || !isCommonTime(ctx.bar)) {
            // Let it ring: one strum per chord (per pulse in odd meters at mid energy up).
            const at =
                tier === 'low'
                    ? [from]
                    : pulses(ctx.bar)
                          .map((p) => p.step)
                          .filter((s) => s >= from && s < to);
            return (at.length ? at : [from]).map((step) => ({
                step,
                length: to - step,
                velocity: attack || step > from ? 84 : 66,
                stroke: 'down' as const,
            }));
        }
        if (tier === 'high') {
            // Driving eighth-note downstrokes, the backbeat leaned on.
            const hits: Hit[] = [];
            for (let s = from; s < to; s += 2) {
                hits.push({
                    step: s,
                    length: 1.6,
                    velocity: s % 8 === 4 ? 104 : s % 4 === 0 ? 92 : 80,
                    stroke: 'down',
                });
            }
            return hits;
        }
        const line = ctx.rng('strum', 'section').pick(ROCK_STRUMS);
        return strums(line, from, to, 2);
    },
});

// ---------------------------------------------------------------- jazz guitar
export const jazzGuitar = compIdiom({
    name: 'swing rhythm guitar',
    kind: 'shell',
    // Three strings, low on the neck: the Freddie Green chunk is felt more than heard.
    grip: { strings: 3, slot: { lo: 48, hi: 72, top: 60 } },
    // Four-to-the-bar never anticipates; the sparse comp sometimes does.
    push: { low: 0.15, mid: 0, high: 0 },
    rhythm(ctx, span, tier, rng) {
        if (tier === 'low') {
            // Quiet choruses: comp like the piano (a Charleston, a push on the "and").
            return jazzComp(span, tier, rng).map((h) => ({ ...h, stroke: 'down' as const }));
        }
        // Four to the bar: short, even downstrokes, 2 and 4 a touch stronger.
        return pulses(ctx.bar)
            .filter((p) => p.step >= span.from && p.step < span.to)
            .map((p) => ({
                step: p.step,
                length: 1.6,
                velocity: p.role === 'back' ? 80 : 72,
                stroke: 'down' as const,
            }));
    },
});

// ---------------------------------------------------------------- funk guitar
// Sixteenth-note chicken scratch: the hand never stops (`-` is a muted scratch), chord
// stabs land where the riff says. Section-scoped, so a section keeps its riff.
const FUNK_SCRATCH = [
    // Backbeat stabs with a sixteenth pickup.
    '-.-xX-x--.-xX-x-',
    // The One, then dotted-eighth pushes into the backbeat.
    'x--x--X--x-xX-x-',
    // Offbeat eighths answering the kick.
    '--x-X--x-x--X-x-',
];

export const funkGuitar = compIdiom({
    name: 'funk rhythm guitar',
    // The three-note "E9" grip: 3rd, 7th and 9th on the top strings.
    kind: 'stab',
    grip: { strings: 3, slot: { lo: 52, hi: 79, top: 69 } },
    push: { low: 0, mid: 0.1, high: 0.2 },
    rhythm(ctx, { from, to }, tier) {
        const line = ctx.rng('scratch', 'section').pick(FUNK_SCRATCH);
        let hits = strums(line, from, to, 1);
        if (tier === 'low') {
            // Low energy: just the stabs, no scratch between them.
            hits = hits.filter((h) => !h.muted);
        } else if (tier === 'high') {
            // High energy: the hand digs in — every pass of the pendulum sounds.
            const taken = new Set(hits.map((h) => h.step));
            for (let s = from; s < to; s++) {
                if (!taken.has(s)) {
                    hits.push({
                        step: s,
                        length: 0.5,
                        velocity: 40,
                        stroke: pendulum(s, 1),
                        muted: true,
                    });
                }
            }
        }
        return hits.sort((a, b) => a.step - b.step);
    },
});

// ---------------------------------------------------------------- bossa guitar
const bossaNylon = compIdiom({
    name: 'bossa guitar',
    kind: 'drop2',
    // Four strings plucked together by the fingers, mid-neck.
    grip: { strings: 4, slot: { lo: 50, hi: 76, top: 67 } },
    pushInBar: true,
    push: { low: 0.6, mid: 0.7, high: 0.75 },
    rhythm: (ctx, span, tier) => bossaFigure(ctx, span, tier, 'down'),
});

/**
 * The bossa guitarist's thumb plays the bass — root on the One, fifth on beat 3 — but only
 * when there is no bassist. With a bass in the band the thumb rests, so the two never
 * double (or fight over) the bottom.
 */
export const bossaGuitar: PitchedIdiom = {
    name: bossaNylon.name,
    init: bossaNylon.init,
    play(ctx, memory) {
        const out = bossaNylon.play(ctx, memory);
        if (ctx.plan.lanes.bass || ctx.plan.ending || !isCommonTime(ctx.bar)) {
            return out;
        }
        const thumb: PitchedNote[] = [];
        let last = 45;
        for (const { span, from, to } of spanSteps(ctx.bar)) {
            const chord = span.chord;
            if (!chord || span.fermata) {
                continue;
            }
            for (const step of [0, 8]) {
                if (step < from || step >= to || (step === from && !span.attack)) {
                    continue;
                }
                // The chord's bass where it arrives, its fifth on the other half of the bar.
                const pc = step === from ? chord.bass : mod12(chord.root + (chord.fifth ?? 7));
                last = nearestMidi(pc, last, 40, 52);
                thumb.push({
                    lane: 'comp',
                    tick: at(ctx.bar, step),
                    dur: Math.min(7, to - step) * STEP,
                    midi: last,
                    velocity: dyn(70, ctx.plan.energy),
                    offsetMs: 0,
                    bar: ctx.bar.index,
                });
            }
        }
        return { events: [...out.events, ...thumb], memory: out.memory };
    },
};
