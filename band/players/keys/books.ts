/**
 * The four v0 keys idioms. Each supplies a *rhythm* (where the hand plays in a chord span);
 * `keysIdiom` does the rest the same way for every style: voicing with voice leading,
 * anticipations that tie the next bar's chord over the barline, N.C. rests, the ending.
 */
import { type EnergyTier, energyTier } from '../../arrange/plan.js';
import type { Rng } from '../../core/random.js';
import type { PitchedNote } from '../../core/types.js';
import type { BarContext, PitchedIdiom } from '../../styles/types.js';
import type { ChordFacts } from '../../theory/chord.js';
import { at, barSteps, dyn, pulses, STEP, spanSteps } from '../grid.js';
import { type VoicingKind, voice } from './voicing.js';

export interface Hit {
    step: number;
    /** Length in sixteenths. */
    length: number;
    velocity: number;
}

/** An anticipation ties over the barline for this many sixteenths (an eighth). */
const TIE_STEPS = 2;

interface KeysMemory {
    voicing: number[] | null;
    /** The next bar's first chord was already played as an anticipation. */
    pushed: boolean;
}

interface KeysBook {
    name: string;
    kind: VoicingKind;
    /** Hits for one chord span, in bar steps [from, to). */
    rhythm(
        ctx: BarContext,
        span: { from: number; to: number; attack: boolean; index: number },
        tier: EnergyTier,
        rng: Rng,
    ): Hit[];
    /** Chance that the last hit before a barline anticipates the next chord. */
    push: Record<EnergyTier, number>;
}

function keysIdiom(book: KeysBook): PitchedIdiom {
    return {
        name: book.name,
        init: (): KeysMemory => ({ voicing: null, pushed: false }),
        play(ctx, memory: KeysMemory) {
            const { bar, plan } = ctx;
            const tier = energyTier(plan.energy);
            const total = barSteps(bar);
            const events: PitchedNote[] = [];
            let prev = memory.voicing;
            const chordAt = (midi: number[], step: number, length: number, velocity: number) => {
                for (const m of midi) {
                    events.push({
                        lane: 'keys',
                        tick: at(bar, step),
                        dur: Math.max(STEP / 2, length * STEP),
                        midi: m,
                        velocity: dyn(velocity, plan.energy),
                        offsetMs: 0,
                        bar: bar.index,
                    });
                }
            };
            if (plan.ending) {
                const chord = bar.spans[0]?.chord;
                if (chord) {
                    prev = voice(chord, book.kind, prev);
                    chordAt(prev, 0, total, 92);
                }
                return { events, memory: { voicing: prev, pushed: false } };
            }
            const nextFirst = ctx.next?.bar.spans[0];
            let pushed = false;
            const planned: { step: number; length: number; velocity: number; chord: ChordFacts }[] =
                [];
            spanSteps(bar).forEach(({ span, from, to }, index) => {
                const chord = span.chord;
                if (!chord) {
                    return;
                }
                const rng = ctx.rng(`keys${index}`);
                let hits = book.rhythm(ctx, { from, to, attack: span.attack, index }, tier, rng);
                if (span.fermata) {
                    hits = [{ step: from, length: to - from, velocity: 84 }];
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
                    planned.push({ step: hit.step, length, velocity: hit.velocity, chord: target });
                }
            });
            planned.sort((a, b) => a.step - b.step);
            planned.forEach((hit, i) => {
                // A new strike cuts the chord before it: one hand, one chord at a time.
                const next = planned[i + 1];
                const length = next ? Math.min(hit.length, next.step - hit.step) : hit.length;
                prev = voice(hit.chord, book.kind, prev);
                chordAt(prev, hit.step, length, hit.velocity);
            });
            return { events, memory: { voicing: prev, pushed } };
        },
    };
}

// ---------------------------------------------------------------- rock
export const rockKeys = keysIdiom({
    name: 'rock keys',
    kind: 'close',
    push: { low: 0, mid: 0.2, high: 0.3 },
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

export const jazzKeys = keysIdiom({
    name: 'jazz comp',
    kind: 'rootless',
    push: { low: 0.15, mid: 0.3, high: 0.4 },
    rhythm(_ctx, { from, to, attack }, tier, rng) {
        if (!attack && from === 0 && tier === 'low') {
            return [];
        }
        const length = to - from;
        const cell = rng.weighted(
            COMP_CELLS.filter(([c]) => c.every((s) => s < length) || c[0] < length),
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
    },
});

// ---------------------------------------------------------------- funk
// cspell:disable-next-line
const FUNK_STABS = ['..x..x.x...x.x..', '.x..x..x.x..x...', '..x...x...x..x.x', 'x..x..x...x.x...'];

export const funkKeys = keysIdiom({
    name: 'funk stabs',
    kind: 'stab',
    push: { low: 0, mid: 0.15, high: 0.25 },
    rhythm(ctx, { from, to }, tier, rng) {
        const line = ctx.rng('stabs', 'section').pick(FUNK_STABS);
        const hits: Hit[] = [];
        for (let s = from; s < to; s++) {
            if (line[s] !== 'x') {
                continue;
            }
            // Low energy thins the riff to its offbeats; high plays all of it.
            if (tier === 'low' && s % 4 !== 2) {
                continue;
            }
            if (tier === 'mid' && rng.chance(0.2)) {
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

export const bossaKeys = keysIdiom({
    name: 'bossa comp',
    kind: 'drop2',
    push: { low: 0.6, mid: 0.7, high: 0.75 },
    rhythm(ctx, { from, to }, tier) {
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
        }));
    },
});
