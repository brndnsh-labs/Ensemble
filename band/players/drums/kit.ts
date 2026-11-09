/**
 * Shared drummer machinery. A drum idiom describes *what its groove is* (a bar of lines per
 * piece, or pulse cells for odd meters) and *how it fills*; this module does the rest the
 * same way for every style: meter fitting, fills replacing the time, crashes on arrivals,
 * the ending, and dynamics.
 */
import { type EnergyTier, energyTier, fillTier } from '../../arrange/plan.js';
import type { Rng } from '../../core/random.js';
import type { DrumHit, DrumPiece } from '../../core/types.js';
import type { BarContext, DrumIdiom, EndingGesture } from '../../styles/types.js';
import {
    at,
    barSteps,
    dyn,
    endingSpans,
    endingStep,
    fitCell,
    isCommonTime,
    pulses,
    readLine,
} from '../grid.js';

/** One bar (or one pulse cell) of drum lines, each a pattern string per piece. */
export type Lines = Partial<Record<DrumPiece, string>>;

export interface DrumBook {
    name: string;
    /** The time-keeping groove for one 4/4 bar (16-step lines). */
    groove(ctx: BarContext, tier: EnergyTier): Lines;
    /** Pulse cells by role (4-step lines) for any other meter. */
    cells(ctx: BarContext, tier: EnergyTier): Record<'down' | 'back' | 'strong', Lines>;
    /**
     * The answer bar (#2022): the groove as the second and fourth bars of a phrase play it
     * (`answerBar`), given the bar's time (`groove`'s lines). Only its back half (beats 3 and 4)
     * is taken: the kit keeps the time's front half, so the answer is the same bar until it turns
     * round. Absent, every groove bar of a section is the same bar.
     */
    answer?(ctx: BarContext, tier: EnergyTier, time: Lines): Lines;
    /**
     * Fill vocabulary, written over the last `steps` sixteenths of the bar. A book that keeps
     * written shapes plays them through `playFill`; `rng` is the bar's own stream.
     */
    fill(ctx: BarContext, steps: number, rng: Rng): Lines;
    /**
     * The style's last bar (#2017): 16-step lines for a 4/4 bar that is home on its downbeat,
     * in the gesture the whole band ends in (`Style.endingGesture`). The kit moves them with
     * the chord the band ends on (`endingStep`), in any meter.
     */
    ending(ctx: BarContext, gesture: EndingGesture): Lines;
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
    // Sized by where the music is going: the bigger tier of this bar and the one it leads into.
    const tier = fillTier(plan.energy, ctx.next?.plan.energy ?? null);
    // why: the set-up into an ending is sized to the ending, not to the bar's energy (#2017):
    // the band's last arrival gets the style's biggest section fill, so a quiet song still
    // rolls into its final hit rather than ticking a two-step pickup into it.
    const setup = plan.fill === 'section' && ctx.next?.plan.ending?.setup === true;
    const sized = Math.min(
        setup ? book.fillLength.section.high : book.fillLength[plan.fill][tier],
        total - 4,
    );
    // A short loop's fill at the smaller boundary (odd ordinal: 16, 48… bars) is the shorter
    // pickup, and the full fill marks the bigger one (32, 64…): the size follows the form's
    // hierarchy, so a drummer vamping four bars doesn't play the same run each time (#2009).
    const length = plan.fillOrdinal % 2 === 1 && sized >= 4 ? sized / 2 : sized;
    return length > 0 ? total - length : null;
}

/**
 * Whether this bar answers (#2022): the second and fourth bars of a phrase (and the sixth of a
 * six-bar one). A phrase starts on a multiple of four bars in its section, so this is the same
 * bar as the second of each two-bar pair in the section: hip hop's loop answers on it too.
 */
export const answerBar = (ctx: BarContext): boolean => ctx.bar.phrase.bar % 2 === 1;

/**
 * The time with its back half (beats 3 and 4 of a 4/4 bar) taken from the answer. The pieces
 * keep the answer's order, which is the order their strokes are written in on a shared step.
 */
function answered(time: Lines, answer: Lines): Lines {
    const out: Record<string, string> = {};
    for (const piece of new Set([...Object.keys(answer), ...Object.keys(time)])) {
        const front = (time[piece as DrumPiece] ?? '').padEnd(16, '.').slice(0, 8);
        const back = (answer[piece as DrumPiece] ?? '').padEnd(16, '.').slice(8, 16);
        out[piece] = front + back;
    }
    return out as Lines;
}

/** One way a groove's answer turns its bar round: the time's lines in, the answer's out. */
export type Turn = (time: Lines) => Lines;

/**
 * The section's answer (#2022): one of the style's turns, drawn once per section so every
 * answer bar of the section turns round the same way (the drummer's part, not a new idea each
 * phrase). The draw is over the whole list, so it lands on the same turn in every bar of the
 * section; only in a bar where that turn would change nothing (an added kick the groove already
 * plays there, an open hat the bar already lifts) does it move on to the next turn in the list
 * that is heard, so the answer is always heard and the rest of the section keeps its turn.
 */
export function pickTurn(
    ctx: BarContext,
    time: Lines,
    turns: readonly (readonly [Turn, number])[],
) {
    const same = (lines: Lines) =>
        Object.keys({ ...time, ...lines }).every(
            (p) =>
                (time[p as DrumPiece] ?? '').replace(/\.+$/, '') ===
                (lines[p as DrumPiece] ?? '').replace(/\.+$/, ''),
        );
    const drawn = ctx.rng('answer', 'section').weighted(turns.map(([, w], i) => [i, w] as const));
    for (let k = 0; k < turns.length; k++) {
        const lines = turns[(drawn + k) % turns.length][0](time);
        if (!same(lines)) {
            return lines;
        }
    }
    return time;
}

/** Write `char` at `step` of a 16-step line (a stroke the answer adds). */
export function strike(line: string | undefined, step: number, char: string): string {
    const padded = (line ?? '').padEnd(16, '.');
    return `${padded.slice(0, step)}${char}${padded.slice(step + 1)}`;
}

/**
 * Where a fill sits in the form (#2022): the end of a phrase inside a section, the end of a
 * section, or the top. "Top" is any boundary the drummer lifts the band over, not only the top
 * of the form: the loop's wrap or a new chorus, a lift into a louder section (a verse into its
 * chorus), and the set-up into the band's last hit. A drummer marks the bigger boundary with the
 * bigger idea.
 */
export type FillPlace = 'phrase' | 'section' | 'top';

const TIER_RANK: Record<EnergyTier, number> = { low: 0, mid: 1, high: 2 };

function fillPlace(ctx: BarContext): FillPlace {
    const { plan, next, bar } = ctx;
    if (plan.fill === 'phrase') {
        return 'phrase';
    }
    if (!next) {
        return 'section';
    }
    const louder = TIER_RANK[energyTier(next.plan.level)] > TIER_RANK[energyTier(plan.level)];
    const top = next.wraps || next.bar.visit.chorus !== bar.visit.chorus || next.bar.index === 0;
    return top || louder || next.plan.ending?.setup ? 'top' : 'section';
}

/**
 * A written fill (#2022): its lines at each length the kit plays fills at, in sixteenths
 * before the barline. A length it doesn't write is played as the end of the next longer one
 * (a six-step fill in a 5/8 bar is the eight-step's last six), so its last stroke still lands
 * on the barline's eve.
 */
export type FillShape = Partial<Record<2 | 4 | 8, Lines>>;

function writeFill(shape: FillShape, steps: number): Lines {
    const lengths = ([2, 4, 8] as const).filter((l) => shape[l]);
    const length = lengths.find((l) => l >= steps) ?? lengths[lengths.length - 1];
    const lines = shape[length] ?? {};
    return Object.fromEntries(
        Object.entries(lines).map(([piece, line]) => [
            piece,
            line.padStart(steps, '.').slice(-steps),
        ]),
    ) as Lines;
}

/**
 * Play one of a style's written fills (#2022): one draw per fill, from the shapes its place in
 * the form allows (`fillPlace`), so the choice is the fill's — never a coin per stroke, which
 * reads as a scatter, not a figure.
 */
export function playFill(
    ctx: BarContext,
    steps: number,
    vocabulary: Record<FillPlace, readonly (readonly [FillShape, number])[]>,
): Lines {
    const shape = ctx.rng('fillShape').weighted(vocabulary[fillPlace(ctx)]);
    return writeFill(shape, steps);
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
        fillStart: (ctx) => fillStart(ctx, book),
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
                // The style's own last bar (`DrumBook.ending`, #2017). A bar that gets home
                // itself (`| G7 C |`): the band strikes the V on 1 and the I on 3 (#1502).
                // why: the ending's arrival is the I, so the book's line moves to where the I
                // lands; the V on 1 is a hit the drummer catches with the kick alone. Two
                // crashes two beats apart would announce the end twice, the first time under
                // the chord that isn't it.
                const held = endingSpans(ctx)
                    .filter(({ span }) => span.chord)
                    .at(-1);
                const arrival = held && held.from > 0 ? held.from : 0;
                // Nothing is struck in a written rest after home (`G7:2 N.C.:2`).
                const end = held ? held.to : total;
                const lines = book.ending(ctx, plan.ending);
                if (arrival > 0) {
                    // why: the kick under the V is the book's own downbeat kick, at its level
                    // (a bossa's soft surdo, not a rock kick): never louder than the I it leads
                    // to. A line with no kick on 1 catches the V at the softest stroke the
                    // line plays there.
                    const downbeat = Object.values(lines).flatMap((line) =>
                        readLine(line.slice(0, 1)).map(([, velocity]) => velocity),
                    );
                    const kick = readLine((lines.kick ?? '').slice(0, 1))[0]?.[1];
                    hit('kick', 0, kick ?? Math.min(...downbeat, 110));
                }
                for (const [piece, line] of Object.entries(lines) as [DrumPiece, string][]) {
                    for (const [step, velocity] of readLine(line.slice(0, 16))) {
                        const placed = endingStep(plan.ending, step, arrival, bar, end);
                        if (placed !== null && placed < end) {
                            hit(
                                piece === 'snare' && velocity < 50 ? 'ghost' : piece,
                                placed,
                                velocity,
                            );
                        }
                    }
                }
                return { events, memory: null };
            }
            const tier = energyTier(plan.energy);
            const role = plan.lead;
            const soloing = role.kind === 'trade' && role.with === 'drums' && role.turn === 'band';
            const groove = isCommonTime(bar) ? book.groove(ctx, tier) : null;
            // The answer turns a 4/4 groove round at the phrase's second and fourth bars
            // (`DrumBook.answer`, #2022); other meters' pulse cells keep their bar.
            const time = groove
                ? book.answer && answerBar(ctx)
                    ? answered(groove, book.answer(ctx, tier, groove))
                    : groove
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
