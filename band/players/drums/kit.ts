/**
 * Shared drummer machinery. A drum idiom describes *what its groove is* (a bar of lines per
 * piece, or pulse cells for odd meters) and *how it fills*; this module does the rest the
 * same way for every style: meter fitting, fills replacing the time, crashes on arrivals,
 * the ending, and dynamics.
 */
import { type EnergyTier, energyTier } from '../../arrange/plan.js';
import type { Rng } from '../../core/random.js';
import type { DrumHit, DrumPiece } from '../../core/types.js';
import type { BarContext, DrumIdiom } from '../../styles/types.js';
import { at, barSteps, dyn, fitCell, isCommonTime, pulses, readLine } from '../grid.js';

/** One bar (or one pulse cell) of drum lines, each a pattern string per piece. */
export type Lines = Partial<Record<DrumPiece, string>>;

export interface DrumBook {
    name: string;
    /** The time-keeping groove for one 4/4 bar (16-step lines). */
    groove(ctx: BarContext, tier: EnergyTier): Lines;
    /** Pulse cells by role (4-step lines) for any other meter. */
    cells(ctx: BarContext, tier: EnergyTier): Record<'down' | 'back' | 'strong', Lines>;
    /** Fill vocabulary, written over the last `steps` sixteenths of the bar. */
    fill(ctx: BarContext, steps: number, rng: Rng): Lines;
    /** The cymbal that keeps time (crashes replace it on arrivals). */
    timekeeper: DrumPiece[];
    /** How many sixteenths a section fill / phrase fill takes at each tier. */
    fillLength: Record<'phrase' | 'section', Record<EnergyTier, number>>;
    /**
     * The drummer's turn when the player trades with him: bar `bar` of a solo `length` bars
     * long, written over the whole bar in place of the time. Absent, the drummer doesn't solo
     * and trading with the drums isn't offered in the style.
     */
    trade?(ctx: BarContext, bar: number, length: number, tier: EnergyTier): Lines;
}

function composeFromCells(ctx: BarContext, tier: EnergyTier, book: DrumBook): Lines {
    const cells = book.cells(ctx, tier);
    const out: Record<string, string> = {};
    const pieces = new Set(Object.values(cells).flatMap((c) => Object.keys(c)));
    for (const piece of pieces) {
        out[piece] = pulses(ctx.bar)
            .map((p) => fitCell(cells[p.role][piece as DrumPiece] ?? '....', p.steps))
            .join('');
    }
    return out as Lines;
}

/**
 * The step where a bar's fill begins, or null when it plays no fill: the kit uses this to
 * lay the fill over the time; a lane that needs to know where the beat drops out (hip hop's
 * sub bass follows the kick loop's own drop, `fillFrom` in `styles/hiphop.ts`) shares it
 * instead of re-deriving the same arithmetic against its own copy of `fillLength`.
 */
export function fillStart(ctx: BarContext, book: DrumBook): number | null {
    const { plan, bar } = ctx;
    if (plan.fill === 'none' || plan.ending) {
        return null;
    }
    const total = barSteps(bar);
    const length = Math.min(book.fillLength[plan.fill][energyTier(plan.energy)], total - 4);
    return length > 0 ? total - length : null;
}

function overlay(base: Lines, fill: Lines, from: number, total: number, keep: DrumPiece[]): Lines {
    const out: Record<string, string> = {};
    const pieces = new Set([...Object.keys(base), ...Object.keys(fill)]);
    for (const piece of pieces) {
        const line = (base[piece as DrumPiece] ?? '').padEnd(total, '.');
        const over = fill[piece as DrumPiece];
        // A fill replaces the time over its span; the kick (and anything listed) keeps its
        // own part unless the fill writes one.
        const kept = keep.includes(piece as DrumPiece) && !over;
        const tail = over
            ? over.padStart(total - from, '.').slice(-(total - from))
            : kept
              ? line.slice(from)
              : '.'.repeat(total - from);
        out[piece] = line.slice(0, from) + tail;
    }
    return out as Lines;
}

export function drumIdiom(book: DrumBook): DrumIdiom {
    return {
        name: book.name,
        solos: Boolean(book.trade),
        init: () => null,
        play(ctx) {
            const { bar, plan } = ctx;
            const total = barSteps(bar);
            const events: DrumHit[] = [];
            const hit = (piece: DrumPiece, step: number, velocity: number) =>
                events.push({
                    lane: 'drums',
                    piece,
                    tick: at(bar, step),
                    velocity: dyn(velocity, plan.energy),
                    offsetMs: 0,
                    bar: bar.index,
                });
            if (plan.ending) {
                hit('crash', 0, 118);
                hit('kick', 0, 110);
                return { events, memory: null };
            }
            const tier = energyTier(plan.energy);
            const role = plan.lead;
            const soloing = role.kind === 'trade' && role.with === 'drums' && role.turn === 'band';
            const time = isCommonTime(bar)
                ? book.groove(ctx, tier)
                : composeFromCells(ctx, tier, book);
            // A drum solo in a chorus of fours keeps the time's own hi-hat foot, whatever the
            // meter: the form is never lost.
            let lines =
                soloing && book.trade
                    ? {
                          ...book.trade(
                              ctx,
                              role.kind === 'trade' ? role.at : 0,
                              role.kind === 'trade' ? role.bars : 1,
                              tier,
                          ),
                          ...(time.hatPedal ? { hatPedal: time.hatPedal } : {}),
                      }
                    : time;
            const fillStep = fillStart(ctx, book);
            if (fillStep !== null) {
                const fill = book.fill(ctx, total - fillStep, ctx.rng('fill'));
                lines = overlay(lines, fill, fillStep, total, ['kick', 'hatPedal']);
            }
            for (const [piece, line] of Object.entries(lines) as [DrumPiece, string][]) {
                for (const [step, velocity] of readLine(line.slice(0, total))) {
                    if (plan.crash && step === 0 && book.timekeeper.includes(piece)) {
                        continue;
                    }
                    hit(piece === 'snare' && velocity < 50 ? 'ghost' : piece, step, velocity);
                }
            }
            if (plan.crash) {
                hit('crash', 0, 112);
                if (!events.some((e) => e.piece === 'kick' && e.tick === bar.start)) {
                    hit('kick', 0, 100);
                }
            }
            return { events, memory: null };
        },
    };
}

/** Descending tom run over `steps` sixteenths, snare lead-in first. The rock/funk fill. */
export function tomRun(steps: number, rng: Rng, density: 1 | 2 = 2): Lines {
    const snare: string[] = [];
    const high: string[] = [];
    const mid: string[] = [];
    const low: string[] = [];
    const kick: string[] = [];
    const order: [string[], number][] = [
        [snare, 0.25],
        [high, 0.5],
        [mid, 0.75],
        [low, 1],
    ];
    for (let i = 0; i < steps; i++) {
        const onBeat = i % density === 0;
        const place = (i + 1) / steps;
        const lane = order.find(([, until]) => place <= until)?.[0] ?? low;
        for (const l of [snare, high, mid, low]) {
            l.push(l === lane && onBeat ? (i % 4 === 0 ? 'x' : 'o') : '.');
        }
        // Kick under the quarter notes holds the fill to the time.
        kick.push(i % 4 === 0 && rng.chance(0.7) ? 'x' : '.');
    }
    // Crescendo into the next downbeat: the last hit is an accent.
    const accent = (line: string[]) => {
        const last = line.lastIndexOf('o');
        if (last >= 0 && last === steps - (density === 2 ? 2 : 1)) {
            line[last] = 'X';
        }
    };
    [snare, high, mid, low].forEach(accent);
    return {
        snare: snare.join(''),
        tomHigh: high.join(''),
        tomMid: mid.join(''),
        tomLow: low.join(''),
        kick: kick.join(''),
    };
}

/** Snare roll/figure over `steps` sixteenths with a crescendo. */
export function snareFigure(steps: number, rng: Rng, spacing = 1): string {
    const out: string[] = [];
    for (let i = 0; i < steps; i++) {
        const onGrid = i % spacing === 0;
        const late = i >= steps / 2;
        out.push(onGrid && (late || rng.chance(0.6)) ? (late ? 'x' : 'o') : '.');
    }
    out[steps - spacing] = 'X';
    return out.join('');
}
