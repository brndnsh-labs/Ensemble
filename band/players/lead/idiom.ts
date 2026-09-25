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
import { type ChordFacts, chordPcs } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import { barSteps, dyn, STEP } from '../grid.js';
import { type Density, type LeadRole, leadRole, soloArc } from './form.js';
import { type Contour, type LinePalette, type Onset, targetsOf, voiceLine } from './line.js';

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
    /** Chance a solo bar plays the bar before it again (a riff) rather than moving on. */
    riff: number;
    /**
     * Chance a solo phrase plays the phrase before it again, whole, moved onto its chords — a
     * looped hook (hip hop's sampled lick) rather than a line that keeps moving. Unset: never.
     */
    loop?: number;
    /**
     * Semitones the lead's home sits above the instrument's own: a lead that plays over the
     * comp's register (a second acoustic guitar over the strum, a sax over the chuck) rather
     * than inside it. Unset: the instrument's home.
     */
    register?: number;
    /**
     * How high the peak climbs, in semitones above the lead's home. Unset: to the top
     * of the instrument (a jazz or rock climax); a sampled hook or a roots horn stays nearer.
     */
    peak?: number;
    /**
     * Chance a solo phrase takes a roomier shape than its density asks for (the sparse shapes'
     * call-and-answer, a late entry). Room is a breath, never a gap: no shape leaves more than
     * one empty bar after the sparse first chorus, and no phrase slot rests whole.
     */
    space: number;
    /**
     * Guitar bends into a phrase's landing notes from below: the major 3rd from the blue third
     * (`blue`, a half step), the root from the b7 and the 5th from the 4th (`root`, whole steps).
     */
    bends: { blue: number; root: number };
    /** A horn's scoop into a long note. */
    scoop: number;
    /**
     * The shortest note that sings with vibrato, in sixteenths. A guitarist or a pop sax shakes
     * every held note; a bebop alto plays mostly straight tone and saves it for long ones.
     */
    vibrato: number;
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
    /** The opening bar's intervals from its first note: what makes it this motif. */
    intervals: number[];
}

export interface LeadMemory {
    /** Which slot (pass and first bar) `notes` belong to. */
    slot: string;
    notes: Planned[];
    /** The last pitch the lead played, so the next phrase connects to it. */
    last: number | null;
    /** The last solo phrase's opening cell, contour and intervals: the next may develop it. */
    motif: Motif | null;
    /** Empty bars the last solo phrase ended with: the next phrase comes straight in after one. */
    trailing: number;
    /** The last solo phrase, whole: a looping book may play it again. */
    phrase: PhraseMemory | null;
    /**
     * The latest solo phrase at each slot of the form (by first bar): a looped hook comes back
     * at the same place in the chord loop, as a sample does.
     */
    phrases: Record<number, PhraseMemory>;
}

interface PhraseMemory {
    kinds: BarKind[];
    cells: (string | null)[];
    notes: { bar: number; step: number; midi: number; chord: ChordFacts }[];
}

/**
 * How far a phrase's contour travels, by density: a sparse phrase stays within a 5th or so,
 * a busy line ranges an octave.
 */
const SPAN: Record<Density, number> = { sparse: 6, mid: 9, busy: 12 };

/**
 * A slot's shapes by density, weighted. A soloist breathes for a beat to a bar between ideas,
 * and a band with nobody answering (the comp doesn't fill yet) turns a longer silence into dead
 * air — Brandon's ear on the first audition. So a phrase leaves at most one empty bar; only the
 * solo's opening statement may leave two (a call with room after it). Mid plays two or
 * three bars, busy three or four; a call-and-answer shape breathes in the middle instead.
 */
const SOLO_SHAPES: Record<Density, readonly (readonly [BarKind[], number])[]> = {
    sparse: [
        [['line', 'end', 'rest', 'rest'], 3],
        [['rest', 'line', 'end', 'rest'], 3],
        [['end', 'rest', 'line', 'end'], 3],
        [['line', 'line', 'end', 'rest'], 2],
    ],
    mid: [
        [['line', 'line', 'end', 'rest'], 5],
        [['end', 'rest', 'line', 'end'], 3],
        [['line', 'end', 'line', 'end'], 2],
    ],
    busy: [
        [['line', 'line', 'line', 'end'], 4],
        [['line', 'line', 'end', 'rest'], 4],
        [['line', 'end', 'line', 'end'], 2],
    ],
};

const DENSITY_ORDER: readonly Density[] = ['sparse', 'mid', 'busy'];

/** The peak's last bar: the cycle's one top note, held. */
const PEAK_ENDING = 'x-----------....';

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
    /** Bars that play the bar before them again, pitches and all (a riff). */
    riffs: boolean[];
    /** The motif this phrase develops (its opening bar carries the motif's intervals). */
    develops: Motif | null;
    /** A head phrase that restates the section's opening phrase (its melody, not only its rhythm). */
    restates: number | null;
    /** A solo phrase that plays the last one again, whole (a looping book's hook). */
    loops: PhraseMemory | null;
    peak: boolean;
}

/** The lead's home register: the instrument's, lifted by the book, kept inside its range. */
function homeOf(ctx: BarContext, book: LeadBook): number {
    const [lo, hi] = ctx.lead.range;
    return Math.min(hi - 7, Math.max(lo + 5, ctx.lead.home + (book.register ?? 0)));
}

/** A section's tune is keyed on its label, so a written-out last A plays the first A's tune. */
function headKey(bar: Bar): string {
    return `head:${bar.visit.label.trim().toLowerCase() || bar.visit.sectionIndex}`;
}

function headPlan(ctx: BarContext, book: LeadBook, slotStart: number): SlotPlan {
    const { bars } = ctx.timeline;
    const first = bars[slotStart];
    const length = first.phrase.length;
    // Keyed on the section, never the pass: the head is the same tune every time.
    const key = headKey(first);
    const motifRng = ctx.rng(`${key}:motif`, 'song');
    const statement = twoCells(motifRng, book.head.cells);
    const statementEnd = motifRng.pick(book.head.endings);
    const contour = pickContour(motifRng);
    const contrastRng = ctx.rng(`${key}:contrast`, 'song');
    // The contrast opens with a figure the statement didn't use, where there is one.
    const unused = book.head.cells.filter((c) => !statement.includes(c));
    const contrast = twoCells(contrastRng, unused.length >= 2 ? unused : book.head.cells);
    const contrastEnd = contrastRng.pick(book.head.endings);
    const answerEnd =
        book.head.endings[(book.head.endings.indexOf(statementEnd) + 1) % book.head.endings.length];
    const p = first.phrase.index;
    // An eight-bar section has two phrases: a blues-form head there is a call and its answer
    // (AB), or the answer would never come.
    const phrasesInVisit = bars[first.visit.firstBar + first.visit.barCount - 1].phrase.index + 1;
    // Which part of the tune this phrase is.
    const part: 'statement' | 'answer' | 'contrast' =
        book.head.form === 'aab'
            ? p % 3 === 2 || (phrasesInVisit === 2 && p === 1)
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
            ? ['line', 'line', 'end', 'rest']
            : ['line', 'line', 'line', 'end'],
        length,
    );
    let line = 0;
    const cells = kinds.map((k) =>
        k === 'end' ? end : k === 'line' ? lines[line++ % lines.length] : null,
    );
    // A statement again, or its answer, restates the section's opening phrase: the melody
    // comes back (adapted to its chords), not only the rhythm.
    const opening = first.visit.firstBar;
    const restates = part !== 'contrast' && slotStart !== opening ? opening : null;
    return {
        kinds,
        cells,
        contour: part === 'contrast' ? 'arch' : contour,
        // A tune spans most of an octave across its sections, and its contrast lifts by a 4th.
        centre: homeOf(ctx, book) + (part === 'contrast' ? 5 : 0),
        span: 11,
        velocity: 84,
        from: null,
        riffs: kinds.map(() => false),
        develops: null,
        restates,
        loops: null,
        peak: false,
    };
}

function soloPlan(
    ctx: BarContext,
    book: LeadBook,
    slotStart: number,
    chorus: 1 | 2 | 3,
    memory: LeadMemory,
): SlotPlan {
    const { bars } = ctx.timeline;
    const first = bars[slotStart];
    const rng = ctx.rng(`solo:${ctx.pass}:${slotStart}`, 'song');
    const arc = soloArc(chorus, ctx.timeline, slotStart, energyTier(ctx.plan.energy));
    const [lo, hi] = ctx.lead.range;
    // The peak's top note: the instrument's top, or the book's reach above home.
    const home = homeOf(ctx, book);
    const top = book.peak === undefined ? hi - 1 : Math.min(hi - 1, home + book.peak);
    // A looping book plays its last phrase again, whole — the hook comes round.
    // The same place in the form from an earlier chorus first (a sample comes round with the
    // chords), else the phrase just played.
    const atThisSlot = memory.phrases[slotStart];
    const previousPhrase =
        atThisSlot && atThisSlot.kinds.length === first.phrase.length ? atThisSlot : memory.phrase;
    if (
        previousPhrase &&
        !arc.peak &&
        !arc.windDown &&
        previousPhrase.kinds.length === first.phrase.length &&
        rng.chance(book.loop ?? 0)
    ) {
        return {
            kinds: [...previousPhrase.kinds],
            cells: [...previousPhrase.cells],
            contour: 'arch',
            centre: Math.min(top - 6, home + arc.register),
            span: SPAN[arc.density],
            velocity: 88,
            from: memory.last,
            riffs: previousPhrase.kinds.map(() => false),
            develops: null,
            restates: null,
            loops: previousPhrase,
            peak: false,
        };
    }
    // The solo's opening statement may leave two bars of room after it; nothing else does.
    const opensSolo =
        chorus === 1 && (slotStart === 0 || /^intro/i.test(bars[slotStart - 1].visit.label));
    // Now and then (the book's `space`) a phrase takes a roomier shape than its density — but
    // the two-bar breath stays the opening statement's, and a phrase after an empty bar comes
    // straight in.
    const roomier =
        !arc.peak && !arc.windDown && arc.density !== 'sparse' && rng.chance(book.space);
    const density = roomier ? DENSITY_ORDER[DENSITY_ORDER.indexOf(arc.density) - 1] : arc.density;
    // The book's `space` weights the shapes both ways: each empty bar a shape leaves counts
    // (space / 0.25) times over, so a relentless book (metal, 0.12) all but never breathes a
    // whole bar and a spacious one (neo-soul, reggae, 0.45) prefers call and answer.
    const room = book.space / 0.25;
    const choices = SOLO_SHAPES[density]
        .filter(
            ([s]) =>
                (memory.trailing === 0 || s[0] !== 'rest') &&
                (opensSolo || s.slice(-2).join() !== 'rest,rest'),
        )
        .map(([s, w]) => [s, w * room ** s.filter((k) => k === 'rest').length] as const);
    const shape = arc.peak
        ? (['line', 'line', 'line', 'end'] as BarKind[])
        : rng.weighted(choices.length ? choices : SOLO_SHAPES.mid);
    const kinds = fitShape(shape, first.phrase.length);
    // The opening cell: develop the last phrase's motif (its rhythm and its intervals, moved
    // onto the new chord), or say something new.
    let opening = rng.pick(book.cells[arc.density]);
    let contour: Contour = arc.windDown ? 'fall' : arc.peak ? 'climb' : pickContour(rng);
    let develops: Motif | null = null;
    if (memory.motif && !arc.peak && !arc.windDown && rng.chance(0.4)) {
        // Displaced by an eighth now and then (0.3): the same idea, a beat-space later.
        const displaced = rng.chance(0.3);
        opening = displaced ? displace(memory.motif.cell, 2) : memory.motif.cell;
        contour = memory.motif.contour;
        develops = displaced ? null : memory.motif;
    }
    let previous: string | null = null;
    const riffs = kinds.map(() => false);
    const cells = kinds.map((kind, i) => {
        if (kind === 'rest') {
            previous = null;
            return null;
        }
        if (kind === 'end') {
            return arc.peak ? PEAK_ENDING : rng.pick(book.endings);
        }
        let cell: string;
        if (previous === null) {
            cell = i === 0 || kinds[i - 1] === 'rest' ? opening : rng.pick(book.cells[arc.density]);
        } else if (rng.chance(book.riff)) {
            cell = previous;
            riffs[i] = true;
        } else {
            cell = rng.pick(book.cells[arc.density]);
        }
        previous = cell;
        return cell;
    });
    const span = SPAN[arc.density];
    // The peak climbs to its top; the busy phrases around it stay a 3rd or more below, so the
    // peak is the top.
    const centre = arc.peak ? top - span / 2 : Math.min(home + arc.register, top - span / 2 - 6);
    return {
        kinds,
        cells,
        contour,
        centre: Math.min(hi - 2, Math.max(lo + 2, centre)),
        span,
        velocity: 88 + (arc.peak ? 8 : 0),
        from: memory.last,
        riffs,
        develops,
        restates: null,
        loops: null,
        peak: arc.peak,
    };
}

interface SlotOnset extends Onset {
    /** Index of the timeline span it plays over. */
    span: number;
    /** Which bar of the slot it sits in. */
    bar: number;
}

function onsetsFor(ctx: BarContext, slotStart: number, plan: SlotPlan): SlotOnset[] {
    const { bars, spans } = ctx.timeline;
    const onsets: SlotOnset[] = [];
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
            const span = spans.findIndex((s) => s.start <= tick && tick < s.end);
            onsets.push({
                tick,
                dur: steps * STEP,
                step,
                chord,
                key: bar.key,
                change: false,
                span,
                bar: k,
            });
        }
    });
    // A note never outlasts the next one (the lead is one voice) or the slot.
    const lastBar = bars[Math.min(bars.length, slotStart + plan.kinds.length) - 1];
    const slotEnd = lastBar.start + lastBar.meter.barTicks;
    for (let i = 0; i < onsets.length; i++) {
        const limit = onsets[i + 1]?.tick ?? slotEnd;
        onsets[i].dur = Math.max(STEP / 2, Math.min(onsets[i].dur, limit - onsets[i].tick));
    }
    // A note held into a chord change is heard against the new chord. Struck within an eighth
    // of the change it *is* the new chord, early — an anticipation, voiced for that chord and
    // a target of it. Struck earlier, it stops at the change rather than rub against it.
    for (const onset of onsets) {
        const end = onset.tick + onset.dur;
        const into = spans.findIndex(
            (s, i) =>
                i > onset.span &&
                s.start > onset.tick &&
                s.start < end &&
                s.chord?.symbol !== onset.chord.symbol,
        );
        if (into < 0) {
            continue;
        }
        const incoming = spans[into];
        if (incoming.chord && incoming.start - onset.tick <= STEP * 2) {
            onset.chord = incoming.chord;
            onset.span = into;
            onset.change = true;
        } else {
            onset.dur = Math.max(STEP / 2, incoming.start - onset.tick);
        }
    }
    // A change is any different chord between this note and the phrase's previous one.
    for (let i = 1; i < onsets.length; i++) {
        const before = onsets[i - 1];
        for (let s = before.span + 1; s <= onsets[i].span; s++) {
            if (spans[s].chord && spans[s].chord?.symbol !== before.chord.symbol) {
                onsets[i].change = true;
                break;
            }
        }
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

function nearestOf(pcs: readonly number[], m: number, avoid: number | null = null): number {
    for (let d = 0; d <= 6; d++) {
        if (pcs.includes(mod12(m - d)) && m - d !== avoid) {
            return m - d;
        }
        if (pcs.includes(mod12(m + d)) && m + d !== avoid) {
            return m + d;
        }
    }
    return m;
}

/**
 * A phrase's register: its contour's reach and a step either side, inside the instrument —
 * the same window the line writer keeps (`registerOf` in line.ts). A replayed note folds into
 * it, so a riff moved with its chord can't climb past the peak.
 */
function planRegister(ctx: BarContext, plan: SlotPlan): readonly [number, number] {
    const [lo, hi] = ctx.lead.range;
    return [
        Math.max(lo, Math.floor(plan.centre - plan.span / 2 - 3)),
        Math.min(hi, Math.ceil(plan.centre + plan.span / 2 + 3)),
    ];
}

/** Semitones from one root to another, the short way (−5…6). */
function rootMotion(from: ChordFacts, to: ChordFacts): number {
    const shift = mod12(to.root - from.root);
    return shift > 6 ? shift - 12 : shift;
}

function foldInto(m: number, [lo, hi]: readonly [number, number]): number {
    let out = m;
    while (out < lo) {
        out += 12;
    }
    while (out > hi) {
        out -= 12;
    }
    return out;
}

/** The rules a replayed note keeps, as a freshly voiced one does. */
function replayRules(onset: Onset, target: boolean) {
    const tones = chordPcs(onset.chord);
    const held = onset.dur > STEP * 2;
    return {
        tones,
        // A target and a note on the beat are chord tones: the beat is the harmony's.
        chordOnly: target || onset.step % 4 === 0,
        // A held note is no non-chord tone a half step from a chord tone.
        rub: (m: number) =>
            held &&
            !tones.includes(mod12(m)) &&
            (tones.includes(mod12(m - 1)) || tones.includes(mod12(m + 1))),
        held,
    };
}

/**
 * A remembered pitch played again over `onset`'s chord: as it was where it still belongs
 * (the blues scale sits over the I and the IV alike), otherwise moved with the chord's root;
 * a target or a beat is always one of its chord's tones, and a replayed run never collapses
 * two notes onto one pitch (`previous`, the note replayed before it).
 */
function adapt(
    source: number,
    sourceChord: ChordFacts,
    onset: Onset,
    target: boolean,
    palette: LinePalette,
    range: readonly [number, number],
    previous: number | null = null,
): number {
    const pool = palette.pool(onset.chord, onset.key);
    const { tones, chordOnly, rub, held } = replayRules(onset, target);
    const fits = (m: number) =>
        (chordOnly ? tones.includes(mod12(m)) : pool.includes(mod12(m)) && !rub(m)) &&
        m !== previous;
    let m = source;
    if (!fits(m)) {
        m = source + rootMotion(sourceChord, onset.chord);
        if (!fits(m)) {
            m = nearestOf(chordOnly || held ? tones : pool, m, previous);
        }
    }
    return foldInto(m, range);
}

/**
 * A looped note: the whole phrase moved by one root motion, so the hook keeps its intervals;
 * only a target or a beat that lands off its chord, or a held rub, is nudged to a chord tone.
 */
function transpose(
    source: number,
    shift: number,
    onset: Onset,
    target: boolean,
    range: readonly [number, number],
): number {
    const { tones, chordOnly, rub } = replayRules(onset, target);
    let m = source + shift;
    if ((chordOnly && !tones.includes(mod12(m))) || rub(m)) {
        m = nearestOf(tones, m);
    }
    return foldInto(m, range);
}

interface Voiced {
    onsets: SlotOnset[];
    pitches: number[];
    plan: SlotPlan;
}

function lineRng(ctx: BarContext, role: LeadRole, slotStart: number): Rng {
    const first = ctx.timeline.bars[slotStart];
    return role.kind === 'head'
        ? ctx.rng(`${headKey(first)}:${first.phrase.index}:line`, 'song')
        : ctx.rng(`solo:${ctx.pass}:${slotStart}:line`, 'song');
}

/** A head phrase, voiced — the restatement of an opening needs the opening's own notes. */
function voiceHead(ctx: BarContext, book: LeadBook, slotStart: number): Voiced {
    const plan = headPlan(ctx, book, slotStart);
    const onsets = onsetsFor(ctx, slotStart, plan);
    // A head is a tune: it steps into its chords, and leaves the half-step approaches and
    // enclosures to the solos (0.3 of the book's chance).
    const palette = { ...book, chromatic: book.chromatic * 0.3, enclosure: 0 };
    const carried: (number | null)[] = onsets.map(() => null);
    if (plan.restates !== null) {
        const source = voiceHead(ctx, book, plan.restates);
        const targets = targetsOf(onsets);
        onsets.forEach((o, i) => {
            // The same note of the same figure in the same bar of the phrase.
            if (plan.cells[o.bar] !== source.plan.cells[o.bar]) {
                return;
            }
            const j = source.onsets.findIndex((s) => s.bar === o.bar && s.step === o.step);
            if (j >= 0) {
                carried[i] = adapt(
                    source.pitches[j],
                    source.onsets[j].chord,
                    o,
                    targets[i],
                    palette,
                    planRegister(ctx, plan),
                    carried[i - 1] ?? null,
                );
            }
        });
    }
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
        lineRng(ctx, { kind: 'head' }, slotStart),
        carried,
    );
    return { onsets, pitches, plan };
}

function voiceSolo(
    ctx: BarContext,
    book: LeadBook,
    slotStart: number,
    plan: SlotPlan,
    role: LeadRole,
): Voiced {
    const onsets = onsetsFor(ctx, slotStart, plan);
    const targets = targetsOf(onsets);
    // A looped phrase is the hook again, whole: moved by the root motion from where it was
    // first played to here (none, at the same place in the form), intervals intact.
    const loops = plan.loops;
    const firstSource = loops?.notes[0];
    const motion =
        loops && firstSource && onsets[0] ? rootMotion(firstSource.chord, onsets[0].chord) : 0;
    // The whole hook moves by one amount: the root motion, or it an octave either way —
    // whichever keeps most of it inside this phrase's register — so no single note is folded
    // an octave away from its neighbours.
    const [regLo, regHi] = planRegister(ctx, plan);
    const inside = (by: number) =>
        (loops?.notes ?? []).filter((n) => n.midi + by >= regLo && n.midi + by <= regHi).length;
    const shift = [motion, motion - 12, motion + 12].reduce((best, by) =>
        inside(by) > inside(best) ? by : best,
    );
    const carried: (number | null)[] = onsets.map((o, i) => {
        const source = loops?.notes.find((n) => n.bar === o.bar && n.step === o.step);
        return source ? transpose(source.midi, shift, o, targets[i], ctx.lead.range) : null;
    });
    const pitches = voiceLine(
        onsets,
        book,
        {
            contour: plan.contour,
            centre: plan.centre,
            span: plan.span,
            range: ctx.lead.range,
            from: plan.from,
        },
        lineRng(ctx, role, slotStart),
        carried,
    );
    const inBar = (k: number) => onsets.map((o, i) => (o.bar === k ? i : -1)).filter((i) => i >= 0);
    // A developed motif keeps its intervals: the opening bar's first note lands where the line
    // put it, and the rest follow the motif's shape from there, moved onto this chord.
    if (plan.develops) {
        const opening = inBar(0);
        const base = pitches[opening[0]];
        opening.forEach((i, n) => {
            if (n > 0 && n < (plan.develops as Motif).intervals.length + 1) {
                const want = base + (plan.develops as Motif).intervals[n - 1];
                pitches[i] = adapt(
                    want,
                    onsets[i].chord,
                    onsets[i],
                    targets[i],
                    book,
                    planRegister(ctx, plan),
                    pitches[i - 1] ?? null,
                );
            }
        });
    }
    // A riff bar plays the bar before it again: the same notes, moved only where the chord
    // under them moved.
    plan.riffs.forEach((riff, k) => {
        if (!riff) {
            return;
        }
        const here = inBar(k);
        const before = inBar(k - 1);
        here.forEach((i, n) => {
            const j = before[n];
            if (j !== undefined) {
                pitches[i] = adapt(
                    pitches[j],
                    onsets[j].chord,
                    onsets[i],
                    targets[i],
                    book,
                    planRegister(ctx, plan),
                    pitches[i - 1] ?? null,
                );
            }
        });
    });
    return { onsets, pitches, plan };
}

function planSlot(
    ctx: BarContext,
    book: LeadBook,
    slotStart: number,
    role: LeadRole,
    memory: LeadMemory,
): {
    notes: Planned[];
    motif: Motif | null;
    trailing: number;
    phrase: PhraseMemory | null;
    phrases: Record<number, PhraseMemory>;
} {
    if (role.kind === 'rest') {
        return {
            notes: [],
            motif: memory.motif,
            trailing: memory.trailing,
            phrase: memory.phrase,
            phrases: memory.phrases,
        };
    }
    let voiced: Voiced;
    if (role.kind === 'head') {
        voiced = voiceHead(ctx, book, slotStart);
    } else {
        const plan = soloPlan(ctx, book, slotStart, role.chorus, memory);
        voiced = voiceSolo(ctx, book, slotStart, plan, role);
    }
    const { onsets, pitches, plan } = voiced;
    // Keyed like the line: a head's articulation returns with it.
    const first = ctx.timeline.bars[slotStart];
    const rng =
        role.kind === 'head'
            ? ctx.rng(`${headKey(first)}:${first.phrase.index}:articulation`, 'song')
            : ctx.rng(`solo:${ctx.pass}:${slotStart}:articulation`, 'song');
    const targets = targetsOf(onsets);
    const top = Math.max(...pitches);
    const notes = onsets.map((o, i): Planned => {
        const midi = pitches[i];
        const prev = pitches[i - 1];
        const next = pitches[i + 1];
        // A higher note is played a little harder (0.8 of a velocity step per semitone).
        let velocity = plan.velocity + (midi - homeOf(ctx, book)) * 0.8;
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
        const pc = mod12(midi - o.chord.root);
        // The peak's top note is the one to lean on.
        const apex = plan.peak && midi === top && i === onsets.length - 1;
        // A guitarist bends into the notes a phrase lands on — its arrivals, its changes, its
        // peak — never a passing note: the major 3rd from the blue third (a half step), the
        // root from the b7 and the 5th from the 4th (whole steps, on a note long enough to
        // arrive).
        if (ctx.lead.bends && (targets[i] || apex) && o.dur >= STEP * 2) {
            const fifth = o.chord.fifth ?? 7;
            // The peak's top note is bent if this player bends at all.
            if (
                pc === 4 &&
                o.chord.third === 4 &&
                ((apex && book.bends.blue > 0) || rng.chance(book.bends.blue))
            ) {
                note.bendIn = 1;
            } else if (
                (pc === 0 || (pc === fifth && fifth === 7)) &&
                o.dur >= STEP * 4 &&
                ((apex && book.bends.root > 0) || rng.chance(book.bends.root))
            ) {
                note.bendIn = 2;
            }
        } else if (!ctx.lead.bends && o.dur >= STEP * 4 && rng.chance(book.scoop)) {
            note.bendIn = 1;
        }
        // Vibrato on a note long enough for this player to sing it; on a horn a scooped note
        // already moves, so it stays plain.
        if (o.dur >= STEP * book.vibrato && (ctx.lead.bends || !note.bendIn)) {
            note.vibrato = true;
        }
        return note;
    });
    // What the next phrase may develop: this one's opening bar.
    const opening = onsets
        .map((o, i) => (o.bar === 0 ? pitches[i] : null))
        .filter((m) => m !== null);
    const motif =
        role.kind === 'solo' && plan.cells[0] && opening.length
            ? {
                  cell: plan.cells[0],
                  contour: plan.contour,
                  intervals: opening.slice(1).map((m) => m - opening[0]),
              }
            : memory.motif;
    // Two empty bars at the end of a slot are a rest already: the next slot plays.
    const trailing = plan.kinds.length - 1 - plan.kinds.map((k) => k !== 'rest').lastIndexOf(true);
    const phrase: PhraseMemory | null =
        role.kind === 'solo'
            ? {
                  kinds: plan.kinds,
                  cells: plan.cells,
                  notes: onsets.map((o, i) => ({
                      bar: o.bar,
                      step: o.step,
                      midi: pitches[i],
                      chord: o.chord,
                  })),
              }
            : memory.phrase;
    const phrases =
        role.kind === 'solo' && phrase
            ? { ...memory.phrases, [slotStart]: phrase }
            : memory.phrases;
    return { notes, motif, trailing, phrase, phrases };
}

export function leadIdiom(book: LeadBook): PitchedIdiom {
    return {
        name: book.name,
        init: (): LeadMemory => ({
            slot: '',
            notes: [],
            last: null,
            motif: null,
            trailing: 0,
            phrase: null,
            phrases: {},
        }),
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
                    trailing: planned.trailing,
                    phrase: planned.phrase,
                    phrases: planned.phrases,
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
