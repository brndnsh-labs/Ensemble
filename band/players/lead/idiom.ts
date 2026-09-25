/**
 * The lead idiom: a style's lead book (its rhythm vocabulary and note palette) played through
 * one shared phrase planner. Each four-bar phrase slot of the timeline is planned whole at its
 * first bar and kept in memory, so the lead can resume at any barline; the rest of the slot's
 * bars just play what was planned.
 */
import { energyTier } from '../../arrange/plan.js';
import type { Rng } from '../../core/random.js';
import type { PitchedNote } from '../../core/types.js';
import { type Bar, chordAt } from '../../form/timeline.js';
import type { BarContext, PitchedIdiom } from '../../styles/types.js';
import { mod12 } from '../../theory/pitch.js';
import { barSteps, dyn, STEP } from '../grid.js';
import { type Density, type LeadRole, leadRole, soloArc } from './form.js';
import { type Contour, type LinePalette, type Onset, voiceLine } from './line.js';

/** What a bar of a phrase does: carries the line, ends it on an arrival, or breathes. */
type BarKind = 'line' | 'end' | 'rest';

export interface LeadBook extends LinePalette {
    name: string;
    /**
     * One-bar rhythm cells, sixteen steps: `x` an attack, `-` held, `.` silent. The style's
     * dialect: bebop eighth lines, a blues call, funk stabs.
     */
    cells: Record<Density, readonly string[]>;
    /** The last bar a phrase plays: it ends on a long note (an arrival). */
    endings: readonly string[];
    head: {
        cells: readonly string[];
        endings: readonly string[];
        /**
         * How the head's phrases relate. `period`: a statement, its answer, a contrast, the
         * statement back (a song's A section). `aab`: a call, the same call again, a different
         * answer (a blues chorus).
         */
        form: 'period' | 'aab';
    };
    /** Chance a solo bar repeats the bar before it (a riff) rather than moving on. */
    riff: number;
    /** Chance a solo phrase slot rests entirely (never two in a row, never the peak). */
    space: number;
    /** Guitar bends into a note from below: the blue third (b3 → 3) and the root (b7 → 1). */
    bends: { blue: number; root: number };
    /** A horn's scoop into a long note. */
    scoop: number;
}

/** A planned note, with the bar it sounds in. */
interface Planned {
    tick: number;
    dur: number;
    midi: number;
    velocity: number;
    bar: number;
    bendIn?: number;
    vibrato?: boolean;
}

interface Motif {
    cell: string;
    contour: Contour;
}

export interface LeadMemory {
    /** Which slot (pass and first bar) `notes` belong to. */
    slot: string;
    notes: Planned[];
    /** The last pitch the lead played, so the next phrase connects to it. */
    last: number | null;
    /** The last solo phrase's opening cell and contour: the next may develop it. */
    motif: Motif | null;
    /** The last solo slot rested (never two in a row). */
    rested: boolean;
}

const SPAN: Record<Density, number> = { sparse: 6, mid: 9, busy: 12 };

const SOLO_SHAPES: Record<Density, readonly (readonly [BarKind[], number])[]> = {
    sparse: [
        [['line', 'end', 'rest', 'rest'], 4],
        [['rest', 'line', 'end', 'rest'], 3],
        [['end', 'rest', 'end', 'rest'], 3],
    ],
    mid: [
        [['line', 'line', 'end', 'rest'], 4.5],
        [['line', 'end', 'rest', 'rest'], 2.5],
        [['end', 'rest', 'line', 'end'], 3],
    ],
    busy: [
        [['line', 'line', 'line', 'end'], 4],
        [['line', 'line', 'end', 'rest'], 4.5],
        [['line', 'end', 'line', 'end'], 1.5],
    ],
};

/** A four-bar shape fitted to a slot of `length` bars: shorter slots keep the end, longer add line. */
function fitShape(shape: readonly BarKind[], length: number): BarKind[] {
    if (length === shape.length) {
        return [...shape];
    }
    if (length > shape.length) {
        return [...Array(length - shape.length).fill('line' as BarKind), ...shape];
    }
    const out = shape.slice(0, length) as BarKind[];
    if (!out.includes('end')) {
        const last = out.map((k) => k !== 'rest').lastIndexOf(true);
        out[last >= 0 ? last : length - 1] = 'end';
    }
    return out;
}

/** A cell fitted to a bar of any length: sliced, or padded with silence. */
function fitCell(cell: string, steps: number): string {
    return cell.length >= steps ? cell.slice(0, steps) : cell.padEnd(steps, '.');
}

/** Shift a cell later by `by` steps (a displaced motif), dropping what falls off the end. */
function displace(cell: string, by: number): string {
    return ('.'.repeat(by) + cell).slice(0, cell.length);
}

/** Onsets of `cell` in `bar`: each attack lasts through its `-` steps. */
function cellOnsets(cell: string, bar: Bar): { step: number; steps: number }[] {
    const fitted = fitCell(cell, barSteps(bar));
    const out: { step: number; steps: number }[] = [];
    for (let i = 0; i < fitted.length; i++) {
        if (fitted[i] !== 'x') {
            continue;
        }
        let steps = 1;
        while (fitted[i + steps] === '-') {
            steps++;
        }
        out.push({ step: i, steps });
    }
    return out;
}

/** Two different cells (a phrase's figures), unless the list has only one. */
function twoCells(rng: Rng, cells: readonly string[]): string[] {
    const first = rng.pick(cells);
    const rest = cells.filter((c) => c !== first);
    return [first, rest.length ? rng.pick(rest) : first];
}

function pickContour(rng: Rng): Contour {
    return rng.weighted<Contour>([
        ['arch', 4],
        ['fall', 3],
        ['climb', 2],
        ['wave', 2],
    ]);
}

interface SlotPlan {
    kinds: BarKind[];
    cells: (string | null)[];
    contour: Contour;
    centre: number;
    span: number;
    velocity: number;
    from: number | null;
    motif: Motif | null;
}

function headPlan(ctx: BarContext, book: LeadBook, slotStart: number): SlotPlan {
    const { bars } = ctx.timeline;
    const first = bars[slotStart];
    const length = first.phrase.length;
    const section = first.visit.sectionIndex;
    // Keyed on the written section, never the pass: the head is the same tune every time.
    const motifRng = ctx.rng(`head:${section}:motif`, 'song');
    const statement = twoCells(motifRng, book.head.cells);
    const statementEnd = motifRng.pick(book.head.endings);
    const contour = pickContour(motifRng);
    const contrastRng = ctx.rng(`head:${section}:contrast`, 'song');
    // The contrast opens with a figure the statement didn't use, where there is one.
    const unused = book.head.cells.filter((c) => !statement.includes(c));
    const contrast = twoCells(contrastRng, unused.length >= 2 ? unused : book.head.cells);
    const contrastEnd = contrastRng.pick(book.head.endings);
    const answerEnd =
        book.head.endings[(book.head.endings.indexOf(statementEnd) + 1) % book.head.endings.length];
    const p = first.phrase.index;
    // Which part of the tune this phrase is.
    const part: 'statement' | 'answer' | 'contrast' =
        book.head.form === 'aab'
            ? p % 3 === 2
                ? 'contrast'
                : 'statement'
            : p % 4 === 2
              ? 'contrast'
              : p % 4 === 1 || p % 4 === 3
                ? 'answer'
                : 'statement';
    const lines = part === 'contrast' ? contrast : statement;
    const end = part === 'contrast' ? contrastEnd : part === 'answer' ? answerEnd : statementEnd;
    // A song's tune fills its phrase; a blues call leaves the second half of its four bars for
    // the band to answer, as a singer does.
    const kinds = fitShape(
        book.head.form === 'aab'
            ? ['line', 'end', 'rest', 'rest']
            : ['line', 'line', 'line', 'end'],
        length,
    );
    let line = 0;
    const cells = kinds.map((k) =>
        k === 'end' ? end : k === 'line' ? lines[line++ % lines.length] : null,
    );
    return {
        kinds,
        cells,
        contour: part === 'contrast' ? 'arch' : contour,
        centre: ctx.lead.home + (part === 'contrast' ? 3 : 0),
        span: 7,
        velocity: 84,
        from: null,
        motif: null,
    };
}

function soloPlan(
    ctx: BarContext,
    book: LeadBook,
    slotStart: number,
    chorus: 1 | 2 | 3,
    memory: LeadMemory,
): SlotPlan | null {
    const { bars } = ctx.timeline;
    const first = bars[slotStart];
    const rng = ctx.rng(`solo:${ctx.pass}:${slotStart}`, 'song');
    const arc = soloArc(chorus, ctx.timeline, slotStart, energyTier(ctx.plan.energy));
    const firstOfChorus = slotStart === 0 || bars[slotStart - 1].visit.label.match(/^intro/i);
    const restChance =
        book.space * (arc.density === 'sparse' ? 1.4 : arc.density === 'busy' ? 0.6 : 1);
    if (!firstOfChorus && !memory.rested && !arc.peak && rng.chance(restChance)) {
        return null;
    }
    const shape = arc.peak
        ? (['line', 'line', 'line', 'end'] as BarKind[])
        : rng.weighted(SOLO_SHAPES[arc.density]);
    const kinds = fitShape(shape, first.phrase.length);
    // The opening cell: develop the last phrase's motif, or say something new.
    let opening = rng.pick(book.cells[arc.density]);
    let contour = arc.windDown ? 'fall' : arc.peak ? 'arch' : pickContour(rng);
    if (memory.motif && !arc.peak && !arc.windDown && rng.chance(0.4)) {
        opening = rng.chance(0.3) ? displace(memory.motif.cell, 2) : memory.motif.cell;
        contour = memory.motif.contour;
    }
    let previous: string | null = null;
    const cells = kinds.map((kind, i) => {
        if (kind === 'rest') {
            return null;
        }
        if (kind === 'end') {
            return rng.pick(book.endings);
        }
        const cell =
            previous === null
                ? i === 0 || kinds[i - 1] === 'rest'
                    ? opening
                    : rng.pick(book.cells[arc.density])
                : rng.chance(book.riff)
                  ? previous
                  : rng.pick(book.cells[arc.density]);
        previous = cell;
        return cell;
    });
    const [lo, hi] = ctx.lead.range;
    const span = SPAN[arc.density];
    const centre = arc.peak ? hi - span / 2 - 1 : ctx.lead.home + arc.register;
    return {
        kinds,
        cells,
        contour: contour as Contour,
        centre: Math.min(hi - 2, Math.max(lo + 2, centre)),
        span,
        velocity: 88 + (arc.peak ? 8 : 0),
        from: memory.last,
        motif: { cell: opening, contour: contour as Contour },
    };
}

function onsetsFor(ctx: BarContext, slotStart: number, plan: SlotPlan): Onset[] {
    const { bars } = ctx.timeline;
    const onsets: (Onset & { span: number })[] = [];
    plan.kinds.forEach((kind, k) => {
        const bar = bars[slotStart + k];
        const cell = plan.cells[k];
        if (!bar || kind === 'rest' || !cell) {
            return;
        }
        // The last bar of a performance that ends: one long note to finish on.
        const final = !ctx.looping && bar.index === bars.length - 1;
        for (const { step, steps } of cellOnsets(final ? 'x'.padEnd(16, '-') : cell, bar)) {
            const tick = bar.start + step * STEP;
            const chord = chordAt(ctx.timeline, tick);
            if (!chord) {
                continue; // N.C.: the whole band rests
            }
            const span = ctx.timeline.spans.findIndex((s) => s.start <= tick && tick < s.end);
            onsets.push({
                tick,
                dur: steps * STEP,
                step,
                chord,
                key: bar.key,
                change: false,
                span,
            });
        }
    });
    // A change is any different chord between this note and the phrase's previous one.
    const { spans } = ctx.timeline;
    for (let i = 1; i < onsets.length; i++) {
        const before = onsets[i - 1];
        for (let s = before.span + 1; s <= onsets[i].span; s++) {
            if (spans[s].chord && spans[s].chord?.symbol !== before.chord.symbol) {
                onsets[i].change = true;
                break;
            }
        }
    }
    // A note never outlasts the next one (the lead is one voice) or the slot.
    const lastBar = bars[Math.min(bars.length, slotStart + plan.kinds.length) - 1];
    const slotEnd = lastBar.start + lastBar.meter.barTicks;
    for (let i = 0; i < onsets.length; i++) {
        const limit = onsets[i + 1]?.tick ?? slotEnd;
        onsets[i].dur = Math.max(STEP / 2, Math.min(onsets[i].dur, limit - onsets[i].tick));
    }
    return onsets;
}

function barOf(ctx: BarContext, tick: number): number {
    const bars = ctx.timeline.bars;
    let i = 0;
    while (i + 1 < bars.length && bars[i + 1].start <= tick) {
        i++;
    }
    return i;
}

function planSlot(
    ctx: BarContext,
    book: LeadBook,
    slotStart: number,
    role: LeadRole,
    memory: LeadMemory,
): { notes: Planned[]; motif: Motif | null; rested: boolean } {
    if (role.kind === 'rest') {
        return { notes: [], motif: memory.motif, rested: memory.rested };
    }
    const plan =
        role.kind === 'head'
            ? headPlan(ctx, book, slotStart)
            : soloPlan(ctx, book, slotStart, role.chorus, memory);
    if (!plan) {
        return { notes: [], motif: memory.motif, rested: true };
    }
    const onsets = onsetsFor(ctx, slotStart, plan);
    const rng =
        role.kind === 'head'
            ? ctx.rng(
                  `head:${ctx.timeline.bars[slotStart].visit.sectionIndex}:${ctx.timeline.bars[slotStart].phrase.index}:line`,
                  'song',
              )
            : ctx.rng(`solo:${ctx.pass}:${slotStart}:line`, 'song');
    // A head is a tune: it steps into its chords, and leaves the half-step approaches and
    // enclosures to the solos.
    const palette =
        role.kind === 'head' ? { ...book, chromatic: book.chromatic * 0.3, enclosure: 0 } : book;
    const pitches = voiceLine(
        onsets,
        palette,
        {
            contour: plan.contour,
            centre: plan.centre,
            span: plan.span,
            range: ctx.lead.range,
            from: plan.from,
        },
        rng,
    );
    const notes = onsets.map((o, i): Planned => {
        const midi = pitches[i];
        const prev = pitches[i - 1];
        const next = pitches[i + 1];
        let velocity = plan.velocity + (midi - ctx.lead.home) * 0.8;
        // Upbeats inside a line lift a little; a note in a valley of a run is ghosted.
        if (o.step % 4 === 2 && o.dur <= STEP * 2) {
            velocity += 5;
        }
        if (prev !== undefined && next !== undefined && midi < prev && midi < next) {
            velocity -= 10;
        }
        const note: Planned = {
            tick: o.tick,
            dur: o.dur,
            midi,
            velocity: dyn(Math.min(118, Math.max(40, Math.round(velocity))), ctx.plan.energy),
            bar: barOf(ctx, o.tick),
        };
        const long = o.dur >= STEP * 6;
        const pc = mod12(midi - o.chord.root);
        // A guitarist bends into the notes a string wants to reach: the major 3rd from the blue
        // third (a half step), the root from the b7 and the 5th from the 4th (whole steps). A
        // passing sixteenth is never bent; a whole-step bend needs a note long enough to arrive.
        if (ctx.lead.bends && o.dur >= STEP * 2) {
            const fifth = o.chord.fifth ?? 7;
            if (pc === 4 && o.chord.third === 4 && rng.chance(book.bends.blue)) {
                note.bendIn = 1;
            } else if (
                (pc === 0 || (pc === fifth && fifth === 7)) &&
                o.dur >= STEP * 4 &&
                rng.chance(book.bends.root)
            ) {
                note.bendIn = 2;
            }
        } else if (!ctx.lead.bends && long && rng.chance(book.scoop)) {
            note.bendIn = 1;
        }
        // Vibrato on a long note; on a horn a scooped note already moves, so it stays plain.
        if (long && (ctx.lead.bends || !note.bendIn)) {
            note.vibrato = true;
        }
        return note;
    });
    return { notes, motif: plan.motif ?? memory.motif, rested: false };
}

export function leadIdiom(book: LeadBook): PitchedIdiom {
    return {
        name: book.name,
        init: (): LeadMemory => ({ slot: '', notes: [], last: null, motif: null, rested: false }),
        play(ctx: BarContext, memory: LeadMemory) {
            const { bar } = ctx;
            const slotStart = bar.index - bar.phrase.bar;
            const slot = `${ctx.pass}:${slotStart}`;
            let next = memory;
            if (memory.slot !== slot) {
                const role = leadRole(ctx.timeline.bars[slotStart], ctx.pass);
                const planned = planSlot(ctx, book, slotStart, role, memory);
                next = {
                    ...memory,
                    slot,
                    notes: planned.notes,
                    motif: planned.motif,
                    rested: planned.rested,
                };
            }
            const events: PitchedNote[] = next.notes
                .filter((n) => n.bar === bar.index)
                .map((n) => ({
                    lane: 'lead',
                    tick: n.tick,
                    dur: n.dur,
                    midi: n.midi,
                    velocity: n.velocity,
                    offsetMs: 0,
                    bar: n.bar,
                    ...(n.bendIn ? { bendIn: n.bendIn } : {}),
                    ...(n.vibrato ? { vibrato: true } : {}),
                }));
            const last = events.at(-1)?.midi ?? next.last;
            return { events, memory: { ...next, last } };
        },
    };
}
