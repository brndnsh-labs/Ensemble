/**
 * The lead idiom: a style's lead book (its rhythm vocabulary and note palette) played through
 * one shared phrase planner. Each four-bar phrase slot of the timeline is planned whole at its
 * first bar and kept in memory, so the lead can resume at any barline; the rest of the slot's
 * bars just play what was planned. A slot's pickup (#2164) is planned whole with it too, and
 * played a bar early by the slot before, which plans it from the same inputs (`pickupAhead`).
 */
import { isIntroLabel } from '../../../core/songbook/score-form.js';
import type { LeadRole } from '../../arrange/cycle.js';
import { energyTier } from '../../arrange/plan.js';
import type { Rng } from '../../core/random.js';
import { type PitchedNote, PPQ } from '../../core/types.js';
import {
    type Bar,
    chordAt,
    chorusBars,
    sectionKey,
    spanIndexAt,
    type Timeline,
} from '../../form/timeline.js';
import type { BarContext, PitchedIdiom } from '../../styles/types.js';
import { type ChordFacts, chordPcs } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import { at, BUTTON_LIFT, barSteps, dyn, ENDING_SHORT, endingStrikes, STEP } from '../grid.js';
import { type Density, soloArc, tradeArc } from './form.js';
import { DEFAULT_GUIDE, type GuideRhythm } from './guide-figures.js';
import { type GuideNote, guidePitchClasses, guideToneLine, headForm } from './guide-tones.js';
import type { LeadProfile } from './instruments.js';
import {
    type Contour,
    type LinePalette,
    nearestRanked,
    type Onset,
    targetsOf,
    voiceLine,
} from './line.js';
import { chordScale } from './palette.js';

/** Where a stab's repeated notes fall in the bar (`STAB_STEPS`). */
type StabGrid = 'any' | 'eighths' | 'upbeats';

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
        /**
         * The rhythm a known standard's guide-tone head is sung in (#2111, `GuideRhythm`): its
         * figures, turns, phrase endings and section close. Unset: the shared straight-eighth
         * figures (`DEFAULT_GUIDE`, #2122).
         */
        guide?: GuideRhythm;
    };
    /** Chance a solo bar plays the bar before it again (a riff) rather than moving on. */
    riff: number;
    /**
     * Repeated notes as a riff (#2024, `stabFigures`): the `chance` a solo phrase's figure (one
     * of its line cells) is played as a stab — a run of its notes on the `on` grid said on one
     * pitch, then the line moves — and the `head` chance for a head's figures (two at most a
     * section). Decided per figure, so every bar that plays the figure stabs it alike: a horn
     * riff, not a stutter. Unset: never.
     */
    repeat?: { chance: number; head: number; on: StabGrid };
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
    /**
     * A horn's fall-off (#2120, `PitchedNote.fall`): the chance a phrase's last note — an
     * eighth or longer, a beat of breath after it — drops off its pitch. Horns only (a guitar
     * lets a bend down instead). Unset: never.
     */
    fall?: number;
    /**
     * A guitarist's bend-and-release (#2120, `PitchedNote.release`): the chance a bent note
     * inside a phrase (a quarter or longer, another note after it) is let back down. Unset: never.
     */
    release?: number;
    /**
     * A guitarist's slide into a landing (#2120, `PitchedNote.slideIn`): the chance a landing
     * that is not bent is slid into from a few frets away. Unset: never.
     */
    slide?: number;
    /**
     * Pickups (#2164, `pickupInto`): a phrase that enters on a downbeat after a breath may be
     * led into from the last beat of the bar before — the `chance` a solo phrase is, `head` a
     * head phrase (drawn once per phrase, keyed as the tune is, so it comes back with it). Each
     * figure is that last beat in sixteenths, ending on its "and" an eighth before the barline.
     * The pickup belongs to the phrase it leads into, and takes only the breath the phrase before
     * it left (`PICKUP_AIR`). Unset: a phrase starts on its bar.
     */
    pickup?: { chance: number; head: number; figures: readonly string[] };
    /**
     * Pushed arrivals (#2164, `pushArrivals`): a note struck on a bar's last eighth that runs into
     * the next bar's downbeat is tied over the barline as one note, the downbeat's — the line
     * arrives an eighth early. Unset: every bar's downbeat is struck.
     */
    pushes?: boolean;
}

/** A planned note, with the bar it sounds in. */
interface Planned {
    tick: number;
    dur: number;
    midi: number;
    velocity: number;
    bar: number;
    bendIn?: number;
    release?: boolean;
    fall?: PitchedNote['fall'];
    slideIn?: { from: number; ticks: number };
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
     * The latest solo phrase at each slot of the form (by its first bar's place in the chorus,
     * `placeOf`): a looped hook comes back at the same place in the chord loop, as a sample
     * does — on a loop's next lap, or a counted chart's next chorus.
     */
    phrases: Record<number, PhraseMemory>;
    /** Whether the last phrase end fell off (#2120): a solo seldom falls twice running. */
    fell: boolean;
}

/**
 * Bar `index`'s place in the form: its bar within its chorus. A counted chart's timeline holds
 * every chorus (#1475); keyed by place, its chorus k recalls and seeds what lap k of a loop
 * does. An uncounted chart's one chorus is the timeline, so this is the bar index.
 */
function placeOf(ctx: BarContext, index: number): number {
    return index - chorusBars(ctx.timeline, index).first;
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
    /** The bar that plays the developed motif's rhythm (the first after a rest), so its intervals land there too. */
    developsBar: number;
    /** A head phrase that restates the section's opening phrase (its melody, not only its rhythm). */
    restates: number | null;
    /** A solo phrase that plays the last one again, whole (a looping book's hook). */
    loops: PhraseMemory | null;
    peak: boolean;
    /**
     * Beats (the meter's pulses) left silent at the end of the slot's last bar, by shortening
     * what sounds into them (`takeBreath`): the breath a head takes between its phrases (#2024).
     * Unset: the phrase plays to the barline.
     */
    breath?: number;
}

/**
 * Where a book sits on an instrument: its `home` (the instrument's, lifted by the book's
 * `register`, kept inside the range) and its `top`, the note its solo's peak climbs to (the
 * instrument's top, or the book's `peak` over home). A guide-tone head is sung inside the same
 * reach (#2123): the head never out-climbs the solo's climax.
 */
function bookReach(lead: LeadProfile, book: LeadBook): { home: number; top: number } {
    const [lo, hi] = lead.range;
    const home = Math.min(hi - 7, Math.max(lo + 5, lead.home + (book.register ?? 0)));
    return { home, top: book.peak === undefined ? hi - 1 : Math.min(hi - 1, home + book.peak) };
}

/** The lead's home register (`bookReach`). */
function homeOf(ctx: BarContext, book: LeadBook): number {
    return bookReach(ctx.lead, book).home;
}

/** A section's tune is keyed on its letter, so a written-out A2 or last A plays the first A's tune. */
function headKey(bar: Bar): string {
    return `head:${sectionKey(bar.visit)}`;
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
        developsBar: 0,
        restates,
        loops: null,
        peak: false,
        // The tune breathes at its phrase ends, out of the arrival's held note (`phraseBreath`);
        // a blues call's last bar is already the band's.
        breath: phraseBreath(ctx, slotStart),
    };
}

function soloPlan(
    ctx: BarContext,
    book: LeadBook,
    slotStart: number,
    role: Extract<LeadRole, { kind: 'solo' | 'trade' }>,
    memory: LeadMemory,
): SlotPlan {
    const { bars } = ctx.timeline;
    const first = bars[slotStart];
    const rng = ctx.rng(`solo:${ctx.pass}:${placeOf(ctx, slotStart)}`, 'song');
    const tier = energyTier(ctx.plan.energy);
    const trade = role.kind === 'trade';
    // A trade's turn sets its length; a solo phrase is the form's.
    const length = role.kind === 'trade' ? role.bars : first.phrase.length;
    const arc =
        role.kind === 'trade'
            ? tradeArc(tier, book.space)
            : soloArc(role.chorus, ctx.timeline, slotStart, tier);
    const [lo, hi] = ctx.lead.range;
    // The peak's top note: the instrument's top, or the book's reach above home.
    const { home, top } = bookReach(ctx.lead, book);
    // A looping book plays its last phrase again, whole — the hook comes round.
    // The same place in the form from an earlier chorus first (a sample comes round with the
    // chords), else the phrase just played.
    const atThisSlot = memory.phrases[placeOf(ctx, slotStart)];
    const previousPhrase =
        atThisSlot && atThisSlot.kinds.length === length ? atThisSlot : memory.phrase;
    if (
        previousPhrase &&
        !trade &&
        !arc.peak &&
        !arc.windDown &&
        previousPhrase.kinds.length === length &&
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
            developsBar: 0,
            restates: null,
            loops: previousPhrase,
            peak: false,
        };
    }
    // The solo's opening statement may leave two bars of room after it; nothing else does.
    // It opens at the top of its chorus (a counted chart's solo starts a chorus in), or
    // straight after an intro.
    const opensSolo =
        role.kind === 'solo' &&
        role.chorus === 1 &&
        (placeOf(ctx, slotStart) === 0 || isIntroLabel(bars[slotStart - 1].visit.label));
    // Now and then (the book's `space`) a phrase takes a roomier shape than its density — but
    // the two-bar breath stays the opening statement's, and a phrase after an empty bar comes
    // straight in.
    const roomier =
        !trade && !arc.peak && !arc.windDown && arc.density !== 'sparse' && rng.chance(book.space);
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
    // The peak climbs through its whole slot.
    // A trade is phrases of four, each played through to an arrival: eights are two phrases
    // with the arrival between them as the breath, twos a line and its arrival.
    const shape = trade
        ? Array.from(
              { length },
              (_, k): BarKind => (k % 4 === 3 || k === length - 1 ? 'end' : 'line'),
          )
        : arc.peak
          ? (['line', 'line', 'line', 'end'] as BarKind[])
          : rng.weighted(choices.length ? choices : SOLO_SHAPES.mid);
    const kinds = fitShape(shape, length);
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
    // The bar that plays the opening cell first: where a developed motif's intervals belong.
    let developsBar = -1;
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
            const opens = i === 0 || kinds[i - 1] === 'rest';
            if (opens && developsBar < 0) {
                developsBar = i;
            }
            cell = opens ? opening : rng.pick(book.cells[arc.density]);
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
        develops: developsBar < 0 ? null : develops,
        // The opening cell goes to bar 0, or to the first bar after a rest when the phrase starts
        // on one: the motif's intervals must go to that same bar.
        developsBar: Math.max(0, developsBar),
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

/**
 * How long a head breathes at the end of the phrase starting at `slotStart`, in beats (#2024).
 * why: a tune is sung, and a singer breathes where its phrases end: a beat at the end of a
 * four-bar phrase that hands on to its answer (the half-cadence catch-breath), two at the end of
 * an eight-bar period or a section (the full cadence, the real breath). Never the 2–6 bar gaps
 * Brandon heard as dead air in the solos.
 */
function phraseBreath(ctx: BarContext, slotStart: number): number {
    const { bars } = ctx.timeline;
    const first = bars[slotStart];
    const p = first.phrase.index;
    const phrases = bars[first.visit.firstBar + first.visit.barCount - 1].phrase.index + 1;
    return p % 2 === 1 || p === phrases - 1 ? 2 : 1;
}

/**
 * Take a phrase's breath in its last bar (`barIndex`): `beats` of the bar's closing pulses are
 * left silent by shortening whatever sounds into them. No note is ever left out: a struck note
 * is the tune. Where the phrase's last note is struck inside the breath (an ending's beat-3
 * resolution), the breath shrinks to the beats after it — one at least — and where it is struck
 * in the last beat itself it sounds for an eighth and the rest of the bar breathes. A bar of two
 * pulses (6/8) breathes on its last one at most, so the arrival still sounds. The last bar of a
 * performance that ends holds its final note instead. In place on `onsets` (in order).
 */
function takeBreath(
    ctx: BarContext,
    barIndex: number,
    onsets: { tick: number; dur: number }[],
    beats: number,
): void {
    const { bars } = ctx.timeline;
    const bar = bars[barIndex];
    const last = onsets.at(-1);
    if (!bar || !last || (!ctx.looping && barIndex === bars.length - 1)) {
        return;
    }
    const pulses = bar.meter.pulses;
    const end = bar.start + bar.meter.barTicks;
    let n = Math.min(beats, Math.max(1, Math.floor(pulses.length / 2)));
    let cut = bar.start + pulses[pulses.length - n];
    while (n > 1 && last.tick >= cut) {
        n--;
        cut = bar.start + pulses[pulses.length - n];
    }
    if (last.tick >= cut) {
        cut = Math.min(end, last.tick + STEP * 2);
    }
    for (const o of onsets) {
        if (o.tick < cut && o.tick + o.dur > cut) {
            o.dur = cut - o.tick;
        }
    }
}

function onsetsFor(
    ctx: BarContext,
    slotStart: number,
    plan: SlotPlan,
    pushes = false,
): SlotOnset[] {
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
            const span = spanIndexAt(ctx.timeline, tick);
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
    if (pushes) {
        pushArrivals(ctx, slotStart, plan, onsets);
    }
    // The breath at a phrase end (`SlotPlan.breath`), out of the held note; a rest bar already is one.
    const last = plan.kinds.length - 1;
    if (plan.breath && slotStart + last === lastBar.index && plan.kinds[last] !== 'rest') {
        takeBreath(ctx, lastBar.index, onsets, plan.breath);
    }
    // A note held into a chord change is heard against the new chord. Struck within an eighth
    // of the change it *is* the new chord, early — an anticipation, voiced for that chord and
    // a target of it. Struck earlier, it stops at the change rather than rub against it.
    for (const onset of onsets) {
        const end = onset.tick + onset.dur;
        // The first later span, starting inside the note, with another chord (spans are in
        // order of their starts, so the search ends at the note's end).
        let into = -1;
        for (let i = onset.span + 1; i < spans.length && spans[i].start < end; i++) {
            const s = spans[i];
            if (s.start > onset.tick && s.chord?.symbol !== onset.chord.symbol) {
                into = i;
                break;
            }
        }
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
    markChanges(onsets, spans);
    return onsets;
}

/**
 * Pushed arrivals (#2164, `LeadBook.pushes`), the push-tie `guideOnsets` sings brought to every
 * phrase: a note struck in a bar's last eighth that runs straight into the next bar's downbeat
 * is tied over the barline into it, one note — the downbeat's, struck an eighth early. It takes
 * the downbeat's chord (so a change there makes it an anticipation, voiced for the new chord)
 * and rings for as long as the downbeat would have. why: a bebop or blues line leans over the
 * barline on the "and" of 4 rather than restriking the one, and a bossa melody's arrival is
 * pushed ahead of the beat; a line that restrikes every downbeat is the barline as a wall.
 * Inside the slot only (a phrase's own bars); never into a riff bar, which plays the bar before
 * it again attack for attack, nor into the bar a pass ends on, whose held chord the line lands
 * on with the band. In place on `onsets` (in order, capped to one voice).
 */
function pushArrivals(
    ctx: BarContext,
    slotStart: number,
    plan: SlotPlan,
    onsets: SlotOnset[],
): void {
    const { bars } = ctx.timeline;
    // The bar a pass ends on is struck on its barline, with the band's held chord.
    const ends = (index: number) =>
        index === ctx.ending?.index || (!ctx.looping && index === bars.length - 1);
    for (let i = 0; i + 1 < onsets.length; i++) {
        const [a, b] = [onsets[i], onsets[i + 1]];
        const bar = bars[slotStart + a.bar];
        const barEnd = bar.start + bar.meter.barTicks;
        if (
            b.bar === a.bar + 1 &&
            !ends(slotStart + b.bar) &&
            b.step === 0 &&
            !plan.riffs[b.bar] &&
            a.tick >= barEnd - STEP * 2 &&
            a.tick + a.dur === b.tick
        ) {
            a.dur += b.dur;
            a.chord = b.chord;
            a.key = b.key;
            a.span = b.span;
            onsets.splice(i + 1, 1);
        }
    }
}

/** A change is any different chord between a note and the phrase's previous one. */
function markChanges(onsets: SlotOnset[], spans: Timeline['spans']): void {
    for (let i = 1; i < onsets.length; i++) {
        const before = onsets[i - 1];
        for (let s = before.span + 1; s <= onsets[i].span; s++) {
            if (spans[s].chord && spans[s].chord?.symbol !== before.chord.symbol) {
                onsets[i].change = true;
                break;
            }
        }
    }
}

/** The bar `tick` falls in (the first bar for a tick before it): a binary search. */
function barOf(ctx: BarContext, tick: number): number {
    const bars = ctx.timeline.bars;
    let lo = 0;
    let hi = bars.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (bars[mid].start <= tick) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    return lo;
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
        : ctx.rng(`solo:${ctx.pass}:${placeOf(ctx, slotStart)}:line`, 'song');
}

/**
 * The guide-tone line over a head slot's chorus (`guideToneLine`). A pass that ends on a held
 * chord (`ctx.ending`): a guide tone held into the ending bar is struck again on its barline, so
 * the held-ending settle lands it on a tone of the chord the band holds, rather than a common
 * tone of the chart's chord ringing over it.
 */
function headGuideLine(ctx: BarContext, book: LeadBook, slotStart: number): GuideNote[] {
    const first = ctx.timeline.bars[slotStart];
    // The head is sung between the instrument's floor and the solo's top (`bookReach`).
    const { home, top } = bookReach(ctx.lead, book);
    const written = guideToneLine(ctx.timeline, first, home, [ctx.lead.range[0], top]);
    const split = ctx.ending?.start;
    return split === undefined
        ? written
        : written.flatMap((n) =>
              n.tick < split && n.tick + n.dur > split
                  ? [
                        { ...n, dur: split - n.tick },
                        {
                            ...n,
                            tick: split,
                            dur: n.tick + n.dur - split,
                            chord: chordAt(ctx.timeline, split) ?? n.chord,
                        },
                    ]
                  : [n],
          );
}

/** Which part of a sung guide-tone head a phrase is (#2111). */
type GuidePart = 'statement' | 'contrast' | 'home';

/**
 * The lead's level in each part of a sung guide-tone head (#2111). why: an A section is stated
 * under the band (74, ten under the invented head's 84: the line is the harmony's skeleton, not
 * a show tune); the contrast speaks up (82), as a bridge does; the last A comes home between
 * the two (78), an arrival rather than the first statement again.
 */
const GUIDE_VELOCITY: Record<GuidePart, number> = { statement: 74, contrast: 82, home: 78 };

/**
 * A sung guide-tone head's phrase plan (#2111): which cell, turn or ending each bar plays. The
 * rhythm is the chorus's, drawn once (`head:guide:motif`, never the pass or the section), so the
 * out-head restates the in-head and every A takes the same rhythm — an A section, played again,
 * is the tune coming back.
 *
 * - An A section is a four-bar statement and a four-bar answer. The statement is a two-bar idea
 *   (a figure `a` and a turn that moves on) and a second figure `b` into the phrase's one long
 *   arrival (the statement's ending). The answer says the figure again an eighth late (or as
 *   it was, if it already starts late), turns another way and closes on the whole note.
 *   Sixteen bars of one section alternate the two. A section in another letter that isn't the
 *   contrast (Stella's B, an A B A C's B) answers the A with its figures swapped, and keeps that
 *   order when it comes back last (Night and Day's last B).
 * - The contrast (the bridge, or with none an A B tune's B, an A B A C's C: `headForm`) takes
 *   figures and a turn the A didn't use, and its own ending; its last phrase hands back to the
 *   last A with a turn, or closes when it ends the chorus.
 * - A blues (`aab`): the statement as the call, the call again over the IV, then the contrast's
 *   figures as the answer, closed on the long turnaround note.
 *
 * Only a phrase's last bar holds a note three beats or more: a turn is a half note at most.
 */
function guidePlan(
    ctx: BarContext,
    guide: GuideRhythm,
    slotStart: number,
): { plan: SlotPlan; part: GuidePart; handsOn: boolean } {
    const { bars } = ctx.timeline;
    const first = bars[slotStart];
    const length = first.phrase.length;
    const form = headForm(ctx.timeline, slotStart);
    const rng = ctx.rng('head:guide:motif', 'song');
    const [c1, c2] = twoCells(rng, guide.cells);
    const [t1, t2] = twoCells(rng, guide.turns);
    const statementEnd = rng.pick(guide.endings);
    const unused = guide.cells.filter((c) => c !== c1 && c !== c2);
    const [k1, k2] = twoCells(rng, unused.length >= 2 ? unused : guide.cells);
    const otherTurns = guide.turns.filter((t) => t !== t1 && t !== t2);
    const kt = otherTurns.length ? rng.pick(otherTurns) : t2;
    const otherEnds = guide.endings.filter((e) => e !== statementEnd);
    const contrastEnd = otherEnds.length ? rng.pick(otherEnds) : statementEnd;
    // The answer's figure: the statement's an eighth late, as a singer varies a line coming
    // round, unless it already starts late (then as it was).
    const late = (cell: string) => (cell.startsWith('x') ? displace(cell, 2) : cell);
    const p = first.phrase.index;
    const phrasesInVisit = bars[first.visit.firstBar + first.visit.barCount - 1].phrase.index + 1;
    const lastPhrase = p === phrasesInVisit - 1;
    const ordinal = first.visit.ordinal;
    const statement = (a: string, b: string, closing: boolean) =>
        closing || p % 2 === 1
            ? [late(a), t2, b, closing ? guide.close : statementEnd]
            : [a, t1, b, statementEnd];
    let part: GuidePart;
    let four: string[];
    if (form.form === 'aab') {
        // The chorus's phrase, counted from the form's top: a blues may be written as one
        // twelve-bar section or as three fours.
        const answer = Math.floor((slotStart - form.firstBar) / 4) % 3 === 2;
        part = answer ? 'home' : 'statement';
        four = answer ? [k1, kt, k2, guide.close] : [c1, t1, c2, statementEnd];
    } else {
        // A chorus with no contrast section (one long A) takes its contrast in its third phrase
        // of four, as an invented head's period does.
        const inner = form.contrast === null && phrasesInVisit >= 4 && p % 4 === 2;
        part =
            ordinal === form.contrast || inner
                ? 'contrast'
                : ordinal === form.home
                  ? 'home'
                  : 'statement';
        if (part === 'contrast') {
            const closing = lastPhrase && !inner;
            four = closing
                ? [late(k1), kt, k2, ordinal === form.last ? guide.close : t1]
                : [k1, kt, k2, contrastEnd];
        } else {
            const answers = sectionKey(first.visit) !== sectionKey(bars[form.firstBar].visit);
            const [a, b] = answers ? [c2, c1] : [c1, c2];
            four = statement(a, b, lastPhrase);
        }
    }
    // A phrase of another length keeps its ending bars: a longer one opens with more figures.
    const cells =
        length >= 4
            ? [...Array.from({ length: length - 4 }, () => four[0]), ...four]
            : four.slice(4 - length);
    const kinds: BarKind[] = cells.map((_, i) => (i === cells.length - 1 ? 'end' : 'line'));
    const plan: SlotPlan = {
        kinds,
        cells,
        contour: 'arch',
        // Set from the line's pitches once they are placed (`voiceGuideTones`).
        centre: 0,
        span: 0,
        velocity: GUIDE_VELOCITY[part],
        from: null,
        riffs: kinds.map(() => false),
        develops: null,
        developsBar: 0,
        restates: null,
        loops: null,
        peak: false,
    };
    // A phrase that ends on a turn rather than an arrival (the contrast handing back to the
    // last A) leads into the next phrase: its last note is no arrival of its own.
    const last = cells.at(-1) ?? '';
    const handsOn = last !== guide.close && !guide.endings.includes(last);
    return { plan, part, handsOn };
}

/**
 * A sung guide-tone head's onsets: its cells' (`onsetsFor`, whose anticipation already turns a
 * note pushed within an eighth of a change into the new chord's), with two more rules a tune's
 * rhythm over changes needs. A push on the last eighth of a bar is tied over the barline into
 * the next bar's downbeat, as one note: the pushed arrival. And every chord change is sung —
 * struck on it, held into it or struck within an eighth after it. A change the cells don't
 * strike is held into when the line holds a common tone through it (the guide tone already
 * sounding is the new chord's too), and otherwise gets a note of its own there, as long as the
 * cell sounds at that point (a quarter where it rests).
 */
function guideOnsets(
    ctx: BarContext,
    slotStart: number,
    plan: SlotPlan,
    lineAt: (tick: number) => GuideNote | undefined,
): SlotOnset[] {
    const { bars, spans } = ctx.timeline;
    const onsets = onsetsFor(ctx, slotStart, plan);
    const lastBar = bars[Math.min(bars.length, slotStart + plan.kinds.length) - 1];
    const slotEnd = lastBar.start + lastBar.meter.barTicks;
    // How long a cell holds the note it strikes at `step` of slot bar `k`, in steps.
    const written = (k: number, step: number) => {
        const bar = bars[slotStart + k];
        const cell = fitCell(plan.cells[k] ?? '', barSteps(bar));
        let steps = 1;
        while (cell[step + steps] === '-') {
            steps++;
        }
        return { cell, steps };
    };
    for (let i = 0; i + 1 < onsets.length; i++) {
        const [a, b] = [onsets[i], onsets[i + 1]];
        if (b.step === 0 && a.tick + a.dur === b.tick && b.tick - a.tick <= STEP * 2) {
            a.dur += b.dur;
            a.chord = b.chord;
            a.key = b.key;
            a.span = b.span;
            onsets.splice(i + 1, 1);
        }
    }
    const from = bars[slotStart].start;
    // Where the line's note a struck onset sings starts: the chord it lands on.
    const sings = (o: SlotOnset) => lineAt(Math.max(o.tick, spans[o.span].start));
    for (let s = spanIndexAt(ctx.timeline, from) + 1; s < spans.length; s++) {
        const span = spans[s];
        if (span.start >= slotEnd) {
            break;
        }
        if (!span.chord || span.start <= from || spans[s - 1].chord?.symbol === span.chord.symbol) {
            continue;
        }
        const t = span.start;
        const sung = onsets.some(
            (o) => (o.tick <= t && o.tick + o.dur > t) || (o.tick >= t && o.tick <= t + STEP * 2),
        );
        if (sung) {
            continue;
        }
        const nextIndex = onsets.findIndex((o) => o.tick > t);
        const next = nextIndex < 0 ? slotEnd : onsets[nextIndex].tick;
        // The note cut off at the change (`onsetsFor` stops a note there).
        const cut = [...onsets].reverse().find((o) => o.tick < t && o.tick + o.dur === t);
        const struck = cut && (cut === onsets[0] || cut.change);
        if (cut && struck && sings(cut) === lineAt(t)) {
            const { steps } = written(cut.bar, cut.step);
            cut.dur = Math.max(cut.dur, Math.min(steps * STEP, next - cut.tick));
            if (cut.tick + cut.dur > t) {
                continue;
            }
        }
        const index = barOf(ctx, t);
        const bar = bars[index];
        const step = Math.round((t - bar.start) / STEP);
        const { cell, steps } = written(index - slotStart, step);
        onsets.splice(nextIndex < 0 ? onsets.length : nextIndex, 0, {
            tick: t,
            dur: Math.min((cell[step] === '-' ? steps : 4) * STEP, next - t),
            step,
            chord: span.chord,
            key: bar.key,
            change: true,
            span: s,
            bar: index - slotStart,
        });
    }
    // The changes again, now the notes have moved: a note struck before its chord's span is an
    // anticipation of it.
    for (const o of onsets) {
        o.change = o.tick < spans[o.span].start;
    }
    markChanges(onsets, spans);
    return onsets;
}

/**
 * Semitone cost of one move of a sung guide-tone head's walk (#2111). why: a tune sung over its
 * guide tones moves by step — a half or whole step is free, a minor 3rd costs a little (a
 * skip a singer makes now and then), a major 3rd more, and anything wider is a leap the walk
 * takes only when nothing else reaches.
 */
function moveCost(semitones: number): number {
    const d = Math.abs(semitones);
    return d === 0 ? 50 : d <= 2 ? 0 : d === 3 ? 1 : d === 4 ? 3 : 10;
}

/**
 * Cost of a trill in a sung guide-tone head's walk: four notes running a-b-a-b, counted across
 * the guide tones either side (#2122). why: with two guide tones a step apart and a sparse figure,
 * every free path was the two notes shaken back and forth (G-F-G-F), which is a horn's trill,
 * not a tune. A neighbour note (a-b-a) stays cheap (0.6: a singer turns round a note); the
 * trill costs more than a major 3rd's skip (3), so the walk skips a 3rd or turns the other way
 * first, but less than a leap (10), which it still takes only when nothing else reaches.
 */
const TRILL = 4;

/** Longest walk searched note by note; a longer one is walked in two halves. */
const WALK_SEARCH = 7;

/**
 * The notes between two guide tones (#2111): a walk from guide tone `from` toward the next one,
 * `to`, its last note beside `to` (never on it), so a singer steps onto each arrival. Each note
 * comes from its own pool (`pools`: a held or strong-beat note's is its chord's tones, a short
 * weak one's the chord scale). Chosen whole, the cheapest by `moveCost`: steps where it can, a
 * repeated pitch never, a note two back again avoided, a trill (`TRILL`, counted from `prior`,
 * the line's note before `from`, through the arrival `to`) all but never, and with more notes
 * than the distance needs it turns — `dir` first (up over the line, or down under it) and back.
 */
function walkBetween(
    from: number,
    to: number,
    pools: readonly (readonly number[])[],
    dir: 1 | -1,
    [lo, hi]: readonly [number, number],
    prior: number | null = null,
): number[] {
    const count = pools.length;
    if (count <= 0) {
        return [];
    }
    const floor = Math.max(lo, Math.min(from, to) - 9);
    const ceiling = Math.min(hi, Math.max(from, to) + 9);
    const ladders = pools.map((pool) => {
        const ladder: number[] = [];
        for (let m = floor; m <= ceiling; m++) {
            if (pool.includes(mod12(m))) {
                ladder.push(m);
            }
        }
        return ladder;
    });
    if (count > WALK_SEARCH) {
        // A long walk: out to the far end of the turn and back, in two searched halves.
        const half = Math.ceil(count / 2);
        const peak = from + dir * Math.min(7, half);
        const first = walkBetween(from, peak, pools.slice(0, half), dir, [lo, hi], prior);
        const last = first.at(-1) ?? from;
        const before = first.at(-2) ?? from;
        return [
            ...first,
            ...walkBetween(last, to, pools.slice(half), -dir as 1 | -1, [lo, hi], before),
        ];
    }
    let best: number[] = [];
    let bestCost = Number.POSITIVE_INFINITY;
    const path: number[] = [];
    // The line as sung so far, counted back from its newest note: `prior`, `from`, the path.
    const back = (k: number, extra: number | null): number | null => {
        const line = extra === null ? path.length : path.length + 1;
        const i = line - 1 - k;
        if (extra !== null && k === 0) {
            return extra;
        }
        return i >= 0 ? path[i] : i === -1 ? from : i === -2 ? prior : null;
    };
    // Whether the newest four notes (with `extra` after the path, the arrival) are a-b-a-b.
    const trills = (extra: number | null = null) => {
        const [d, c, b, a] = [0, 1, 2, 3].map((k) => back(k, extra));
        return a !== null && a === c && b === d && a !== b;
    };
    const search = (prev: number, cost: number) => {
        if (cost >= bestCost) {
            return;
        }
        if (path.length === count) {
            const end = cost + (prev === to ? 50 : moveCost(to - prev)) + (trills(to) ? TRILL : 0);
            if (end < bestCost) {
                bestCost = end;
                best = [...path];
            }
            return;
        }
        for (const m of ladders[path.length]) {
            if (Math.abs(m - prev) > 5) {
                continue;
            }
            const before =
                path.length >= 2 ? path[path.length - 2] : path.length === 1 ? from : null;
            const turn = path.length === 0 && Math.sign(m - from) !== dir ? 0.5 : 0;
            // why: the walk keeps to its side of the guide tone it left (over it going up,
            // under it going down), a quarter of a step's cost a semitone across — enough that
            // a free step the wrong way loses to a 3rd the right way, never to a leap.
            const side = 0.25 * Math.max(0, dir > 0 ? from - m : m - from);
            path.push(m);
            // The trill's cost goes on the move's whole cost, after every other term: a step's
            // is 0, so only an added cost (never a scale on one term) can outweigh it.
            const trill = trills() ? TRILL : 0;
            search(m, cost + moveCost(m - prev) + (before === m ? 0.6 : 0) + turn + side + trill);
            path.pop();
        }
    };
    search(from, 0);
    return best.length === count ? best : pools.map(() => from);
}

/**
 * The pitches a sung guide-tone head's note between guide tones may take (#2111). why: a note
 * held a beat or more, or struck on 1 or 3, is heard against its chord — it is one of the
 * chord's tones, never an avoid note (a natural 4th held over a major chord, a b9 over a
 * minor one, a b2 over a half-diminished one). Under a half note its natural 9th may stand in
 * for the root (a 9th is colour, not a rub: a guide tone a half step from the next one would
 * otherwise have only a 4th's skip to a chord tone). A scale step is a passing note: only a
 * short one (an eighth or less) off the strong beats.
 */
function walkPool(o: SlotOnset): number[] {
    if (o.dur <= STEP * 2 && o.step % 8 !== 0) {
        return chordScale(o.chord);
    }
    const ninth = o.dur < STEP * 8 && o.chord.scale.includes(2) ? [mod12(o.chord.root + 2)] : [];
    // A triad's tones are its 3rd and 7th as the line hears them too (`guidePitchClasses`: the
    // tonic's major 7th, a dominant's b7), so a triad's walk isn't left only 4ths and 3rds.
    return [...new Set([...chordPcs(o.chord), ...guidePitchClasses(o.chord, o.key), ...ninth])];
}

/**
 * A known standard's head phrase (`BarContext.guideToneHead`), sung (#2111): its guide-tone
 * line (`guideToneLine`) in a tune's rhythm (`guidePlan`, `guideOnsets`). Every chord change,
 * the first note and the last is the line's voice-led 3rd or 7th; between them the line walks
 * toward the next guide tone (`walkBetween`, `walkPool`): no chromatic approach, no enclosure —
 * a tune over the changes, not a solo. The design read (#2111) had `voiceLine` fill between the
 * guide tones; its fill reaches a target from a chord tone a 3rd or 4th away when the step
 * beside it is the note it left (a guide-tone line moves a half step a chord, so that was most
 * of them: 18% of moves inside a phrase over a minor 3rd), so the head walks its own notes.
 *
 * A guide tone that is the next chord's too is never struck twice running: the note before it
 * gives its last eighth to a passing step (a quarter or longer), or is tied into it.
 * Every style sings it (#2122): a book with no guide-tone rhythm of its own takes the shared
 * figures (`DEFAULT_GUIDE`).
 */
function voiceGuideTones(ctx: BarContext, book: LeadBook, slotStart: number): Voiced {
    const { plan, part, handsOn } = guidePlan(ctx, book.head.guide ?? DEFAULT_GUIDE, slotStart);
    const line = headGuideLine(ctx, book, slotStart);
    // The line's note sounding at a tick: the last struck at or before it.
    const lineAt = (tick: number) =>
        line.reduce<GuideNote | undefined>((at, n) => (n.tick <= tick ? n : at), line[0]);
    const onsets = guideOnsets(ctx, slotStart, plan, lineAt);
    const { spans, bars } = ctx.timeline;
    // The walk keeps to the line's own reach, under the solo's top (`bookReach`, #2123):
    // walking over the line in a bridge, it ran on to the range's top, over a book's peak.
    const range = [ctx.lead.range[0], bookReach(ctx.lead, book).top] as const;
    const lastBar = bars[Math.min(bars.length, slotStart + plan.kinds.length) - 1];
    // A phrase that hands on (`handsOn`) aims its last notes at the next phrase's first guide
    // tone, struck beside it: a turn leads in. why: pinned to the guide tone still sounding, a
    // turn's last note was that tone again, struck twice over one chord across the turn's rest
    // (the bridge's hand-back, the beat before the last A: G4 … G4 over Ebmaj7).
    const next = handsOn ? lineAt(lastBar.start + lastBar.meter.barTicks)?.midi : undefined;
    const pitches: (number | null)[] = onsets.map((o, i) =>
        i === 0 || o.change || (i === onsets.length - 1 && next === undefined)
            ? (lineAt(Math.max(o.tick, spans[o.span].start))?.midi ?? null)
            : null,
    );
    // A guide tone struck twice running (a common tone across a change, or the last note on
    // the chord's own guide tone): the first gives up its last eighth to a passing note, or,
    // too short for that, is tied into the second.
    for (let i = 1; i < onsets.length; i++) {
        const [o, before] = [onsets[i], onsets[i - 1]];
        if (
            pitches[i] === null ||
            pitches[i] !== pitches[i - 1] ||
            before.tick + before.dur !== o.tick
        ) {
            continue;
        }
        if (before.dur >= STEP * 4) {
            before.dur -= STEP * 2;
            const tick = before.tick + before.dur;
            const bar = barOf(ctx, tick);
            onsets.splice(i, 0, {
                ...before,
                tick,
                dur: STEP * 2,
                step: Math.round((tick - ctx.timeline.bars[bar].start) / STEP),
                change: false,
                bar: bar - slotStart,
            });
            pitches.splice(i, 0, null);
            i++;
        } else {
            before.dur += o.dur;
            onsets.splice(i, 1);
            pitches.splice(i, 1);
            i--;
        }
    }
    const n = onsets.length;
    // The next phrase's guide tone stands after the last onset as the walk's last target.
    const aims = next === undefined ? pitches : [...pitches, next];
    let a = 0;
    for (let b = 1; b < aims.length; b++) {
        if (aims[b] === null) {
            continue;
        }
        if (b - a > 1 && pitches[a] !== null) {
            // why: the walk goes over the line in a contrast (a bridge climbs), and in an A
            // section arches — over the line in the phrase's first half, under it after.
            const dir: 1 | -1 = part === 'contrast' || (a + b) / 2 < n / 2 ? 1 : -1;
            const walk = walkBetween(
                pitches[a] as number,
                aims[b] as number,
                onsets.slice(a + 1, b).map(walkPool),
                dir,
                range,
                // The note sung before this guide tone: a trill may start there.
                a > 0 ? pitches[a - 1] : null,
            );
            walk.forEach((m, k) => {
                pitches[a + 1 + k] = m;
            });
        }
        a = b;
    }
    // The sung line breathes at every phrase end, off its last held guide tone (`takeBreath`).
    // why: a beat, never two — the book's endings and close are its one long arrival, three
    // beats or more (#2111: a turn is a half note at most, so a two-beat breath would leave the
    // arrival no longer than a turn). Its own endings breathed an eighth to a beat; now each
    // phrase end has the beat a singer takes, the section close included.
    takeBreath(ctx, lastBar.index, onsets, 1);
    const sung = pitches.map((m) => m ?? homeOf(ctx, book));
    const top = Math.max(...sung);
    const bottom = Math.min(...sung);
    plan.centre = (top + bottom) / 2;
    plan.span = top - bottom;
    return { onsets, pitches: sung, plan };
}

/**
 * The most notes a stab says on its one pitch before the line moves on. why: four is a horn
 * riff's punch ("bap-bap-bap-bap", then the turn); more is one note hammered.
 */
const STAB_NOTES = 4;

/**
 * Where a stab's repeated notes fall in the bar (`LeadBook.repeat.on`), by sixteenth step: the
 * grid every note of the run sits on (`on`), and where the run may start and end (`edge`).
 * - `any`: the figure's own rhythm — funk's sixteenth push (beat 1 and its "a"), hip hop's
 *   one-note hook.
 * - `eighths`: disco's pump, on the eighth-note grid, never two sixteenths running.
 * - `upbeats`: ska's stab, on the eighths but starting and ending on an "and", so its accents
 *   land with the skank (and-of-1, 2, and-of-2: the upbeats punched, the beat between tongued).
 */
const STAB_STEPS: Record<
    StabGrid,
    { on: (step: number) => boolean; edge: (step: number) => boolean }
> = {
    any: { on: () => true, edge: () => true },
    eighths: { on: (step) => step % 2 === 0, edge: (step) => step % 2 === 0 },
    upbeats: { on: (step) => step % 2 === 0, edge: (step) => step % 4 === 2 },
};

/**
 * The figures a phrase stabs (`LeadBook.repeat`): each of `cells`, in order, by `chance`, up
 * to `most` of them. Drawn once per figure, never per note or per bar (a per-step
 * coin is arrhythmic).
 */
function stabCells(
    rng: Rng,
    chance: number,
    cells: readonly (string | null)[],
    most = Number.POSITIVE_INFINITY,
): Set<string> {
    const out = new Set<string>();
    for (const cell of new Set(cells)) {
        if (cell !== null && out.size < most && rng.chance(chance)) {
            out.add(cell);
        }
    }
    return out;
}

/**
 * Repeated notes as a rhythmic figure (#2024): in each line bar playing a stabbed figure, a run
 * of the figure's notes on the book's grid (`STAB_STEPS`) says one pitch — the first of them,
 * which must be a chord tone, so every beat the run falls on stays on the harmony — and then
 * the line moves on to where it was going. The run starts at the figure's first note on the
 * grid's edge with the next note on the grid too, takes the notes after it while they stay on
 * it, up to `STAB_NOTES`, stops at a chord change or any target (an arrival keeps the pitch the
 * line chose), and is trimmed back to end on the grid's edge. It never takes the bar's last
 * note, and it ends a note sooner where the line already put the pedal on the note after it:
 * the figure goes somewhere. In place on `pitches`; applied last, after a riff or a
 * restatement has copied its notes, so a riff bar stabs exactly as the bar it repeats.
 */
function stabFigures(
    voiced: Voiced,
    book: LeadBook,
    stabbing: ReadonlySet<string>,
    targets: readonly boolean[],
): void {
    const { onsets, pitches, plan } = voiced;
    if (!stabbing.size || !book.repeat) {
        return;
    }
    const grid = STAB_STEPS[book.repeat.on];
    plan.kinds.forEach((kind, k) => {
        const cell = plan.cells[k];
        // A developed motif's bar already says the last phrase's opening, stab and all: its
        // shape is the motif's, not this phrase's.
        const developed = plan.develops !== null && k === plan.developsBar;
        if (kind !== 'line' || !cell || !stabbing.has(cell) || developed) {
            return;
        }
        const here = onsets.map((o, i) => (o.bar === k ? i : -1)).filter((i) => i >= 0);
        // The run from the bar's `n`th note: the notes after it on the grid, up to
        // `STAB_NOTES`, never the bar's last, trimmed back to end on the grid's edge.
        const runFrom = (n: number): number[] => {
            const run = [here[n]];
            for (let m = n + 1; m < Math.min(n + STAB_NOTES, here.length - 1); m++) {
                const i = here[m];
                const before = onsets[i - 1];
                if (
                    !grid.on(onsets[i].step) ||
                    onsets[i].change ||
                    targets[i] ||
                    onsets[i].dur > STEP * 4 ||
                    onsets[i].tick - (before.tick + before.dur) >= STEP * 4
                ) {
                    break;
                }
                run.push(i);
            }
            while (run.length && !grid.edge(onsets[run[run.length - 1]].step)) {
                run.pop();
            }
            return run;
        };
        // The first run of two notes or more that starts on the grid's edge (a ska figure's
        // first upbeat may stand alone, its next two make the stab).
        let run: number[] = [];
        for (let n = 0; n + 1 < here.length - 1 && run.length < 2; n++) {
            const i = here[n];
            run = grid.edge(onsets[i].step) && grid.on(onsets[i].step) ? runFrom(n) : [];
        }
        const pedal = pitches[run[0]];
        // The note after the run moves: where the line already put the pedal there, the run
        // ends a note sooner (never five on one pitch, a hammer rather than a stab).
        while (run.length >= 2 && pitches[run[run.length - 1] + 1] === pedal) {
            run.pop();
            while (run.length && !grid.edge(onsets[run[run.length - 1]].step)) {
                run.pop();
            }
        }
        if (run.length < 2) {
            return;
        }
        if (!chordPcs(onsets[run[0]].chord).includes(mod12(pedal))) {
            return;
        }
        for (const i of run) {
            pitches[i] = pedal;
        }
    });
}

/** A head phrase, voiced — the restatement of an opening needs the opening's own notes. */
function voiceHead(ctx: BarContext, book: LeadBook, slotStart: number): Voiced {
    const plan = headPlan(ctx, book, slotStart);
    const onsets = onsetsFor(ctx, slotStart, plan, book.pushes);
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
    const voiced = { onsets, pitches, plan };
    // Keyed on the section, as the tune is: a stabbed figure stabs every time the head plays it.
    // why: two figures at most — a tune's hook punches, and the rest of it sings.
    const stabRng = ctx.rng(`${headKey(ctx.timeline.bars[slotStart])}:stab`, 'song');
    const hook = stabCells(stabRng, book.repeat?.head ?? 0, book.head.cells, 2);
    stabFigures(voiced, book, hook, targetsOf(onsets));
    return voiced;
}

function voiceSolo(
    ctx: BarContext,
    book: LeadBook,
    slotStart: number,
    plan: SlotPlan,
    role: LeadRole,
): Voiced {
    const onsets = onsetsFor(ctx, slotStart, plan, book.pushes);
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
        const opening = inBar(plan.developsBar);
        const base = pitches[opening[0]];
        opening.forEach((i, n) => {
            if (n > 0 && n < (plan.develops as Motif).intervals.length + 1) {
                const { intervals } = plan.develops as Motif;
                const want = base + intervals[n - 1];
                // A stabbed motif's repeated note is said again on its one pitch: the stab is
                // what the motif is (`stabFigures`), and `adapt` would step off the note before.
                if (intervals[n - 1] === (n > 1 ? intervals[n - 2] : 0) && !onsets[i].change) {
                    pitches[i] = pitches[i - 1];
                    return;
                }
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
    const voiced = { onsets, pitches, plan };
    // A looped hook comes round whole: its notes, stabs and all, are the source phrase's
    // (`transpose`), so it takes no stabs of its own.
    if (loops) {
        return voiced;
    }
    const stabRng = ctx.rng(`solo:${ctx.pass}:${placeOf(ctx, slotStart)}:stab`, 'song');
    const lines = plan.cells.filter((_, k) => plan.kinds[k] === 'line');
    stabFigures(voiced, book, stabCells(stabRng, book.repeat?.chance ?? 0, lines), targets);
    return voiced;
}

/**
 * In a last bar that gets home itself (`| G7 C |`, `ctx.ending`), the line is sung as written
 * over the V, and a note struck before a change stops at it: a line that ends there leaves the
 * melody on the V's leading tone, 7th or 13th, silent under the band's held I. why: the soloist
 * resolves with the band — the note over the V is kept, and the line lands where the I
 * arrives, on the tonic's resting tone nearest its last note (`settle`, ranked as any
 * phrase's last note is: B→C, F→E), held to the bar's end or its written stop. A last note
 * that is already that tone and rings up to the change holds on through it (a sus4 → I
 * resolving under it). Only a lead that sings in the bar lands; one resting there stays out.
 * In place on `notes`; `lineVelocity` is the line's planned level.
 */
function landOnHeld(ctx: BarContext, book: LeadBook, notes: Planned[], lineVelocity: number): void {
    const final = ctx.ending;
    const held = final?.spans.filter((span) => span.chord).at(-1);
    if (!final || !held?.chord || held.start <= final.start) {
        return;
    }
    const inBar = notes.filter((n) => n.bar === final.index);
    const last = inBar.at(-1);
    if (!last || inBar.some((n) => n.tick >= held.start)) {
        return;
    }
    const midi = nearestRanked(book.settle(held.chord, final.key), last.midi, ctx.lead.range);
    const length = held.end - held.start;
    if (midi === last.midi && last.tick + last.dur >= held.start - 1) {
        last.dur = held.end - last.tick;
        last.vibrato = last.vibrato || last.dur >= STEP * book.vibrato;
        return;
    }
    last.dur = Math.min(last.dur, held.start - last.tick);
    // why: the landing is an arrival with the band, never a passing note. The last note over
    // the V may be ghosted (a valley in a run plays 10 softer) or a low one; the landing takes
    // its level but no less than the line's own (`lineVelocity`, as the notes read it).
    const floor = dyn(Math.min(118, Math.max(40, Math.round(lineVelocity))), ctx.plan.energy);
    notes.splice(notes.indexOf(last) + 1, 0, {
        tick: held.start,
        dur: length,
        midi,
        velocity: Math.max(last.velocity, floor),
        bar: final.index,
        ...(length >= STEP * book.vibrato ? { vibrato: true } : {}),
    });
}

/**
 * Whether a horn's phrase end falls off (#2120), and the stream its shape is drawn from (null:
 * it doesn't). why: a horn chart places its falls by the form — where a phrase lets go, and
 * most where a section or a chorus does (its last two bars: 1.5× the book's chance, 0.7×
 * elsewhere, a final-stage multiplier) — and a soloist doesn't fall off phrase after phrase:
 * straight after a fall a solo falls at a third of the chance (`fell`). A head is a written
 * tune: its one draw is keyed by the section and the figure the phrase ends on, so a statement
 * and its restatement fall alike, as the arrangement wrote it, and it isn't damped: a horn
 * chart may end riff after riff with a fall (ska's does), so the head branch never reads
 * `fell` (#2167).
 */
function fallDraw(
    ctx: BarContext,
    chance: number,
    role: LeadRole,
    plan: SlotPlan,
    o: SlotOnset,
    fell: boolean,
    fallRng: Rng,
): Rng | null {
    const bar = ctx.timeline.bars[barOf(ctx, o.tick)];
    const sectionEnd = bar.index >= bar.visit.firstBar + bar.visit.barCount - 2;
    const place = sectionEnd ? 1.5 : 0.7;
    if (role.kind === 'head') {
        const figure = ctx.rng(`${headKey(bar)}:fall:${plan.cells[o.bar] ?? ''}`, 'song');
        return figure.chance(Math.min(1, chance * place)) ? figure : null;
    }
    return fallRng.chance(Math.min(1, chance * place * (fell ? 1 / 3 : 1))) ? fallRng : null;
}

/**
 * How a phrase end falls (#2120). why: a note held a half or longer takes the section's long
 * fall — it sounds its full length, then drops 5–7 semitones into the rest after it, over about
 * a quarter (a sixteenth short of the next note, which a phrase end leaves a beat away at
 * least). A shorter note drops 3–4 within its own tail, over an eighth (the host keeps it to the
 * note's last 40%); a 2-semitone drop that short reads as a flat note, not a fall.
 */
function fallShape(rng: Rng, dur: number, gap: number): NonNullable<Planned['fall']> {
    if (dur >= STEP * 8) {
        return {
            semitones: rng.weighted<number>([
                [5, 1],
                [6, 1],
                [7, 1],
            ]),
            ticks: Math.min(PPQ, gap - STEP),
            into: true,
        };
    }
    return {
        semitones: rng.weighted<number>([
            [3, 2],
            [4, 1],
        ]),
        ticks: STEP * 2,
    };
}

/**
 * Where a guitarist's slide into a landing may start (#2139), as `[semitones from the landing,
 * weight]`: a neighbouring note of the box, mostly below the landing and sometimes above it,
 * or a chord tone a position shift away, by what the landing is to its chord. A landing that is
 * none of these (a tension, a 6th) is not slid into. The caller keeps only the starts the
 * style's scale holds at the chord (`LinePalette.pool`), so a slide never starts on a chromatic
 * note picked by distance (#2120's table gave b2 → 3 and b6 → b7).
 */
function slideStarts(chord: ChordFacts, pc: number): [number, number][] {
    const starts: [number, number][] = [];
    if (pc === 4 && chord.third === 4) {
        // why: b3 → 3, one fret: the blues player's blue third slid up to the major third —
        // the same cry as the half-step bend (`bends.blue`), the finger moving instead of the
        // string pushed. The one one-fret slide, by decision (#2139).
        starts.push([-1, 1]);
        // why: 2 → 3, two frets: the major pentatonic's neighbours, the country and Southern
        // rock slide into the third (where the style's scale holds the 2, a rock major key's),
        // as often as the b3 where both are held.
        starts.push([-2, 1]);
    }
    if (pc === 3 && chord.third === 3) {
        // why: R → b3, three frets: the minor pentatonic's neighbours on one string (A → C on
        // the G string in A minor), the minor chord's third reached from its root.
        starts.push([-3, 3]);
        // why: 4 → b3, two frets down: the minor pentatonic's slide back onto the third.
        starts.push([2, 1]);
    }
    if (pc === 0) {
        if (chord.seventh !== 11) {
            // why: b7 → R, two frets: the minor pentatonic's neighbour below the root — most of a
            // blues or rock player's slides into a root. Not over a maj7, where the b7 is the
            // wrong 7th (as a release never rests on it there, `restsOn`).
            starts.push([-2, 3]);
        }
        // why: 6 → R, three frets: the major pentatonic's neighbour below the root.
        starts.push([-3, 2]);
        if (chord.fifth === 7) {
            // why: 5 → R, five frets: a position shift up the string onto the root, now and then
            // (only from a perfect 5th, not an augmented chord's #5).
            starts.push([-5, 1]);
        }
        // why: 2 → R, two frets down: the slide onto the root from the note above it.
        starts.push([2, 1]);
    }
    if (pc === 7 && chord.fifth === 7) {
        // why: 4 → 5, two frets: the pentatonic box's neighbours, the commoner way into a 5th.
        starts.push([-2, 2]);
        if (chord.third !== null) {
            // why: 3 → 5 (b3 → 5 on a minor chord, four frets): a position shift from the third
            // to the fifth, the chord's own tones, less often.
            starts.push([chord.third - 7, 1]);
        }
        // why: 6 → 5, two frets down: the major pentatonic's slide back onto the fifth, a rock
        // and country move.
        starts.push([2, 1]);
    }
    if (pc === 10 && chord.seventh === 10) {
        // why: 5 → b7, three frets: the minor pentatonic's neighbours on one string (E → G on
        // the D string in A), the dominant's b7 reached from its fifth.
        starts.push([-3, 1]);
        // why: R → b7, two frets down: the blues slide down onto a dominant's or minor 7th's
        // b7 from the root above it (A → G on the high string in A), the box's other neighbour
        // (#2167: every other landing had a start from above; the b7 had none).
        starts.push([2, 1]);
    }
    return starts;
}

/**
 * A position shift (a start four or five frets away) is a choice a player makes when the box
 * offers the near slide too; it is never the only way in. why: over a maj7 in the blues the
 * pool holds neither the 2 nor the 6 and the b7 is the wrong 7th, so the five-fret 5 → R shift
 * was the one root slide left and came round every time the head did (#2167). A landing whose
 * only start is the shift isn't slid into.
 */
function shiftNeedsNeighbour(starts: [number, number][]): [number, number][] {
    return starts.some(([from]) => Math.abs(from) <= 3) ? starts : [];
}

/** One phrase opening's pickup (#2164): its figure, and whether it comes up from below. */
interface PickupDraw {
    figure: string;
    below: boolean;
}

/** Whether a role plays a line a pickup may lead into or out of: a solo, or an invented head. */
function takesPickups(ctx: BarContext, role: LeadRole): boolean {
    // A known standard's guide-tone head sings its own rhythm, turns and lead-ins (#2111); a
    // trade's turn is the player's or the drummer's to start, so nothing crosses into or out
    // of one.
    return role.kind === 'solo' || (role.kind === 'head' && !ctx.guideToneHead);
}

/**
 * A slot's pickup draws (`LeadBook.pickup`), one per bar in order, whether or not the bar opens
 * a phrase, so what one bar draws never moves another's. A head's are keyed as its tune is (the
 * section and the phrase), so a head phrase comes back with its pickup; a solo's by the pass and
 * the slot's place in the form, as its phrase is.
 */
function pickupDraws(
    ctx: BarContext,
    book: LeadBook,
    slotStart: number,
    role: LeadRole,
    count: number,
): (PickupDraw | null)[] {
    const pickup = book.pickup;
    if (!pickup) {
        return [];
    }
    const first = ctx.timeline.bars[slotStart];
    const key =
        role.kind === 'head'
            ? `${headKey(first)}:${first.phrase.index}:pickup`
            : `solo:${ctx.pass}:${placeOf(ctx, slotStart)}:pickup`;
    const rng = ctx.rng(key, 'song');
    const chance = role.kind === 'head' ? pickup.head : pickup.chance;
    return Array.from({ length: count }, () => {
        const takes = rng.chance(chance);
        const figure = rng.pick(pickup.figures);
        // why: a pickup more often climbs into the note it leads to (the "and" of 4 stepping up
        // onto the one) than falls onto it from above, 0.6 to 0.4.
        const below = rng.chance(0.6);
        return takes ? { figure, below } : null;
    });
}

/**
 * A pickup's pitches (#2164), struck at `ticks` (in order, in the last beat of a bar), leading
 * into `arrival`, the first note of the phrase. Each is the next tone of its pool past the note
 * after it, so the pickup runs into the arrival from one side and its last note is a step or a
 * 3rd from it (a 4th at most between the pickup's own notes): the style's scale at the chord
 * it sounds over (`LinePalette.pool`), or that chord's tones where it falls on a beat or a
 * change — the beat is the harmony's. Never a chromatic smear: a pickup is the scale walked
 * into the phrase. From below (`below`) or above, the other side where the instrument runs
 * out; null where neither fits, or where a pickup note would be held into another chord.
 */
function pickupPitches(
    ctx: BarContext,
    book: LeadBook,
    ticks: readonly number[],
    end: number,
    arrival: number,
    below: boolean,
): number[] | null {
    const { timeline } = ctx;
    const [lo, hi] = ctx.lead.range;
    for (const dir of below ? [-1, 1] : [1, -1]) {
        const out: number[] = [];
        let after = arrival;
        for (let j = ticks.length - 1; j >= 0; j--) {
            const tick = ticks[j];
            const span = spanIndexAt(timeline, tick);
            const chord = timeline.spans[span]?.chord;
            const until = ticks[j + 1] ?? end;
            if (!chord || chordAt(timeline, until - 1)?.symbol !== chord.symbol) {
                return null;
            }
            const bar = timeline.bars[barOf(ctx, tick)];
            const strong =
                bar.meter.pulses.includes(tick - bar.start) ||
                (timeline.spans[span].start === tick &&
                    timeline.spans[span - 1]?.chord?.symbol !== chord.symbol);
            const pcs = strong ? chordPcs(chord) : book.pool(chord, bar.key);
            let m = after - dir;
            while (m >= lo && m <= hi && !pcs.includes(mod12(m))) {
                m -= dir;
            }
            if (m < lo || m > hi || Math.abs(m - after) > (j === ticks.length - 1 ? 4 : 5)) {
                break;
            }
            out.unshift(m);
            after = m;
        }
        if (out.length === ticks.length) {
            return out;
        }
    }
    return null;
}

/**
 * The silence a pickup leaves after the line before it, at least (#2164). why: an eighth — the
 * catch-breath a singer or a horn takes before the "and" of 4 when the phrase before held its
 * arrival to beat 4. The breath beat is the pickup's only home, so the arrival is never cut for
 * it; where the line before sounds into the last eighth there is no pickup.
 */
const PICKUP_AIR = STEP * 2;

/**
 * The pickup into bar `k` of a slot (#2164, `LeadBook.pickup`): the drawn figure in the last
 * beat of the bar before, leading into `arrival`, the phrase's first note, on that bar's
 * downbeat. why: a phrase need not start on its bar — a bebop line enters on the "and" of 4, a
 * blues lick starts on 4 (a triplet there, on the shuffle), a bossa melody comes in a little
 * early. It plays only in the breath the line before it left: its notes `PICKUP_AIR` or more
 * after `room` (where that line falls silent), so the phrase before keeps its arrival whole —
 * where the room is short of the whole figure, the "and" of 4 alone. A lead-in, a little under
 * the line it leads to (6 lighter). None where the bar before is shorter than a beat at its
 * end, or has no chord.
 */
function pickupInto(
    ctx: BarContext,
    book: LeadBook,
    plan: SlotPlan,
    barIndex: number,
    draw: PickupDraw,
    arrival: number,
    room: number,
): Planned[] {
    const bar = ctx.timeline.bars[barIndex];
    if (!bar) {
        return [];
    }
    const { pulses, barTicks } = bar.meter;
    const end = bar.start + barTicks;
    const from = end - STEP * draw.figure.length;
    if (from < bar.start + pulses[pulses.length - 1]) {
        return [];
    }
    const ticks = [...draw.figure].flatMap((c, j) => (c === 'x' ? [from + j * STEP] : []));
    const midis = pickupPitches(ctx, book, ticks, end, arrival, draw.below);
    if (!midis) {
        return [];
    }
    const home = homeOf(ctx, book);
    return ticks.flatMap((tick, j): Planned[] =>
        tick < room + PICKUP_AIR
            ? []
            : [
                  {
                      tick,
                      dur: (ticks[j + 1] ?? end) - tick,
                      midi: midis[j],
                      velocity: dyn(
                          Math.min(
                              118,
                              Math.max(40, Math.round(plan.velocity - 6 + (midis[j] - home) * 0.8)),
                          ),
                          ctx.plan.energy,
                      ),
                      bar: bar.index,
                  },
              ],
    );
}

/**
 * A slot's pickups (#2164): into each bar that opens a phrase on its downbeat — the slot's
 * first note, or one after a breath inside it — by the bar's draw (`pickupDraws`). The one into
 * the slot's first bar sounds in the bar before it, the last slot's: it is planned here whole,
 * and played (in the room that slot left) only by that bar's look ahead (`pickupAhead`), so a
 * band resuming on this slot's barline drops it rather than doubling it. None into a pass's
 * first bar, whose bar before belongs to no pass (a looping song's wrap is not looked across),
 * and none played across a counted chorus's seam either (`pickupAhead`).
 */
function slotPickups(
    ctx: BarContext,
    book: LeadBook,
    slotStart: number,
    role: LeadRole,
    plan: SlotPlan,
    onsets: readonly SlotOnset[],
    sung: readonly number[],
): Planned[][] {
    if (!book.pickup || !takesPickups(ctx, role)) {
        return [];
    }
    const { bars } = ctx.timeline;
    const draws = pickupDraws(ctx, book, slotStart, role, plan.kinds.length);
    return draws
        .map((draw, k) => {
            const i = onsets.findIndex((o) => o.bar === k);
            if (!draw || i < 0 || onsets[i].step !== 0 || (k === 0 && slotStart === 0)) {
                return [];
            }
            const before = onsets[i - 1];
            const room =
                k === 0
                    ? Number.NEGATIVE_INFINITY
                    : before
                      ? before.tick + before.dur
                      : bars[slotStart].start;
            return pickupInto(ctx, book, plan, slotStart + k - 1, draw, sung[i], room);
        })
        .filter((figure) => figure.length > 0);
}

/**
 * The pickup the next slot opens with (#2164), when this bar is the last of its slot: planned
 * by that slot, from its own inputs — the next bar's context (`ctx.next`) and the memory this
 * bar leaves, `memory` — so its plan here is the one it makes on its own barline, and played
 * here only in the breath this slot left (`PICKUP_AIR` after its last note). Nothing here moves
 * the memory: the next slot plans itself again on its barline, from the same memory, and a
 * band resuming there never plays this bar.
 */
function pickupAhead(
    ctx: BarContext,
    book: LeadBook,
    role: LeadRole,
    memory: LeadMemory,
): Planned[] {
    const ahead = ctx.next;
    const { bar } = ctx;
    if (
        !book.pickup ||
        !ahead ||
        ahead.wraps ||
        ahead.bar.index !== bar.index + 1 ||
        // A chorus's seam, counted or a loop's wrap: each time through the form starts on its
        // bar, so chorus k of a counted chart plays what lap k of a loop does.
        ahead.bar.visit.chorus !== bar.visit.chorus ||
        ahead.bar.phrase.bar !== 0 ||
        !takesPickups(ctx, role) ||
        !takesPickups(ctx, ahead.plan.lead)
    ) {
        return [];
    }
    // Where this slot's line falls silent. Every figure ends on the last beat's "and".
    const last = memory.notes.reduce<Planned | null>(
        (at, n) => (!at || n.tick > at.tick ? n : at),
        null,
    );
    // why: a phrase that falls off (a horn, #2120) or lets its bend back down (a guitar) has
    // let go — that is what the gesture says — so the next one comes in on its bar.
    if (last?.fall || last?.release) {
        return [];
    }
    const room = last ? last.tick + last.dur : Number.NEGATIVE_INFINITY;
    if (room + PICKUP_AIR > bar.start + bar.meter.barTicks - STEP * 2) {
        return [];
    }
    const nextCtx: BarContext = {
        ...ctx,
        bar: ahead.bar,
        plan: ahead.plan,
        rng: ahead.rng,
        next: null,
        heard: { drums: [], bass: [], lead: [] },
    };
    const slotStart = ahead.bar.index;
    const nextRole = ahead.plan.lead;
    if (!pickupDraws(nextCtx, book, slotStart, nextRole, 1)[0]) {
        return [];
    }
    const planned = planSlot(nextCtx, book, slotStart, nextRole, memory);
    return planned.notes.filter((n) => n.bar === bar.index && n.tick >= room + PICKUP_AIR);
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
    fell: boolean;
} {
    // The player's turn, or trading with the drummer (the player is the soloist): no lead.
    if (
        role.kind === 'rest' ||
        (role.kind === 'trade' && (role.with === 'drums' || role.turn === 'you'))
    ) {
        return {
            notes: [],
            motif: memory.motif,
            trailing: memory.trailing,
            phrase: memory.phrase,
            phrases: memory.phrases,
            // A slot of silence ends any run of falls.
            fell: false,
        };
    }
    let voiced: Voiced;
    if (role.kind === 'head') {
        voiced = ctx.guideToneHead
            ? voiceGuideTones(ctx, book, slotStart)
            : voiceHead(ctx, book, slotStart);
    } else {
        const plan = soloPlan(ctx, book, slotStart, role, memory);
        voiced = voiceSolo(ctx, book, slotStart, plan, role);
    }
    const { onsets, pitches, plan } = voiced;
    const guideTones = role.kind === 'head' && ctx.guideToneHead;
    // Keyed like the line: a head's articulation returns with it.
    const first = ctx.timeline.bars[slotStart];
    const articulationKey =
        role.kind === 'head'
            ? `${headKey(first)}:${first.phrase.index}:articulation`
            : `solo:${ctx.pass}:${placeOf(ctx, slotStart)}:articulation`;
    const rng = ctx.rng(articulationKey, 'song');
    // Fall-offs, releases and slides (#2120) each draw from a stream of their own, so adding
    // them reshuffles none of the bends, scoops or vibrato the slot already chose.
    const fallRng = ctx.rng(`${articulationKey}:fall`, 'song');
    const releaseRng = ctx.rng(`${articulationKey}:release`, 'song');
    const slideRng = ctx.rng(`${articulationKey}:slide`, 'song');
    const { bars } = ctx.timeline;
    const lastBar = bars[bars.length - 1];
    const slotEnd =
        bars[slotStart + plan.kinds.length]?.start ?? lastBar.start + lastBar.meter.barTicks;
    const targets = targetsOf(onsets);
    // Whether the last phrase end fell (#2120): a fall right after a fall is a tic.
    let fell = memory.fell;
    // The held ending (`arrange/ending.ts`): where the pass resolves its final turnaround to
    // the tonic, the lead's note in that bar is sung against the tonic. It moves to the
    // nearest of the tonic's resting tones (`settle`, ranked as any phrase's last note is), so
    // the line into it stays the one the chart's chord drew — a step or so from where it was
    // aimed — and the note it lands on is home. Only that bar's notes change; a neighbour's
    // dynamics still read the pitch the line wrote.
    // In a bar that gets home itself (`| G7 C |`), only what is sung over the held I settles;
    // the line over the V struck before it is sung as written (#1502).
    const final = ctx.ending;
    const held = final?.spans.filter((span) => span.chord).at(-1);
    const resolved = onsets.map((o) =>
        held?.chord && barOf(ctx, o.tick) === final?.index && o.tick >= held.start
            ? held.chord
            : null,
    );
    const sung = pitches.map((m, i) => {
        const chord = resolved[i];
        return chord ? nearestRanked(book.settle(chord, onsets[i].key), m, ctx.lead.range) : m;
    });
    const top = Math.max(...sung);
    // The phrase's pickups (#2164), in the bar before each phrase they lead into: the line's own
    // notes, though nothing the next phrase remembers (its motif, its loop) is one of them. A
    // note before one sounds into a breath that ends at it.
    const figures = slotPickups(ctx, book, slotStart, role, plan, onsets, sung);
    const pickups = figures.flat();
    const notes = onsets.map((onset, i): Planned => {
        const o = resolved[i] ? { ...onset, chord: resolved[i] } : onset;
        const midi = sung[i];
        const prev = pitches[i - 1];
        const next = pitches[i + 1];
        // A higher note is played a little harder (0.8 of a velocity step per semitone).
        let velocity = plan.velocity + (midi - homeOf(ctx, book)) * 0.8;
        // Upbeats inside a line lift a little; a note in a valley of a run is ghosted. Not a
        // guide-tone head's guide tones: each is a chord's arrival, never a passing tone (its
        // steps between them are, #2111).
        const arrival = guideTones && targets[i];
        if (!arrival && o.step % 4 === 2 && o.dur <= STEP * 2) {
            velocity += 5;
        }
        if (!arrival && prev !== undefined && next !== undefined && midi < prev && midi < next) {
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
        } else if (
            !ctx.lead.bends &&
            o.dur >= STEP * 4 &&
            // A guide-tone head scoops half as often: the pitch is what the line is there to state.
            rng.chance(guideTones ? book.scoop / 2 : book.scoop)
        ) {
            note.bendIn = 1;
        }
        // Vibrato on a note long enough for this player to sing it; on a horn a scooped note
        // already moves, so it stays plain.
        if (o.dur >= STEP * book.vibrato && (ctx.lead.bends || !note.bendIn)) {
            note.vibrato = true;
        }
        // The pitch moves of #2120. Never in the bar the pass ends on: the held ending is an
        // arrival with the band, sung on its pitch.
        if (note.bar !== final?.index) {
            const next = onsets[i + 1];
            const end = o.tick + o.dur;
            // The next note: the slot's next onset, or a pickup (#2164) struck before it.
            const pickup = pickups.find((p) => p.tick >= end && (!next || p.tick < next.tick));
            const nextTick = pickup ? pickup.tick : next ? next.tick : slotEnd;
            // A phrase end: a beat or more of silence after it before the slot's next note
            // (the head's breath, a solo's rest), or before the slot ends.
            const ends = nextTick - end >= STEP * 4;
            const sameChord = chordAt(ctx.timeline, end - 1)?.symbol === o.chord.symbol;
            // why: a horn player falls off the last note of a phrase — the funk and disco
            // section's drop at the end of a riff, a blues horn's sigh — never a note inside the
            // line, where the next note needs the pitch. An eighth or longer, so there is a tail
            // to fall from, and never a note that scooped in: the scoop is its way in, and a
            // short arrival that scoops and falls has no pitch of its own left to hear.
            const candidate =
                ctx.lead.family === 'horn' &&
                !!book.fall &&
                ends &&
                o.dur >= STEP * 2 &&
                !note.bendIn &&
                // A head falls only where its phrase lets go: its last note, into the breath.
                (role.kind !== 'head' || i === onsets.length - 1);
            const shapeRng =
                candidate && book.fall
                    ? fallDraw(ctx, book.fall, role, plan, o, fell, fallRng)
                    : null;
            if (shapeRng) {
                note.fall = fallShape(shapeRng, o.dur, nextTick - end);
            }
            if (ends) {
                // A phrase end that didn't fall breaks a run of falls as one that did starts it.
                fell = note.fall !== undefined;
            }
            // why: the blues and rock guitarist's bend-and-release — bend up into the note,
            // hold it, let it back down onto the fretted note it started from (3 → b3,
            // root → b7, 5 → 4). Inside a phrase the next note moves on from the let-down one,
            // so any bend may release. A phrase's arrival (a beat of breath after it, or held to
            // the slot's end) is left on the let-down note, so it releases only onto a note a
            // blues or rock player rests on: the blue third over a chord with no major 7th
            // (Albert King's cry), the b7 over a dominant or a plain triad (the mixolydian
            // rock ending) — never the 4. A guitar only (a horn's scoop is not a bend it can let
            // go), a quarter or longer so the bend, the hold and the release are each heard, and
            // over one chord, so the let-down note is heard against the chord it was bent over.
            // The slot's last note held to its end runs on into the next phrase, whose first
            // note this slot can't see: it neither rests nor knows where the line goes, so it
            // holds its bend.
            const arrival = ends;
            const letDown = mod12(midi - (note.bendIn ?? 0) - o.chord.root);
            const restsOn =
                (letDown === 3 && o.chord.seventh !== 11) ||
                (letDown === 10 &&
                    (o.chord.seventh === 10 || (o.chord.seventh === null && !o.chord.sixth)));
            // Inside a phrase the line goes on from the let-down note: only to a note below the
            // bent pitch (3 → b3 → 2, root → b7 → 5). A line that climbs on keeps the bend held
            // rather than going up, down and up again.
            const nextMidi = pickup ? pickup.midi : sung[i + 1];
            const goesDown =
                (pickup || next) !== undefined && nextMidi !== undefined && nextMidi < midi;
            if (
                ctx.lead.bends &&
                note.bendIn &&
                book.release &&
                o.dur >= STEP * 4 &&
                sameChord &&
                (arrival ? restsOn : goesDown) &&
                releaseRng.chance(book.release)
            ) {
                note.release = true;
            }
            // why: a guitarist slides into a landing where a horn would tongue it, along the
            // string from a neighbouring note of the box, mostly below and sometimes above, or a
            // position shift away (`slideStarts`): a scale tone of the style at this chord and
            // key (`LinePalette.pool`), so the slide is two notes of the scale joined, never a
            // chromatic smear (#2139). A landing with no such start isn't slid into. Only a
            // landing — a note struck on a chord change, the arrival the slide aims at — not
            // already bent (the bend is that note's articulation), an eighth or longer so the
            // slide arrives with time to ring. A one- or two-fret slide takes a thirty-second, a
            // longer one a sixteenth: the hand moves at about a fret every 20–30 ms at a medium
            // tempo.
            const span = ctx.timeline.spans[o.span];
            const landing =
                !!span?.chord &&
                Math.abs(o.tick - span.start) < 1 &&
                ctx.timeline.spans[o.span - 1]?.chord?.symbol !== span.chord.symbol;
            if (
                ctx.lead.family === 'guitar' &&
                book.slide &&
                landing &&
                !note.bendIn &&
                o.dur >= STEP * 2
            ) {
                const scale = book.pool(o.chord, o.key);
                const starts = shiftNeedsNeighbour(
                    slideStarts(o.chord, pc).filter(([from]) => scale.includes(mod12(midi + from))),
                );
                if (starts.length && slideRng.chance(book.slide)) {
                    const from = slideRng.weighted<number>(starts);
                    note.slideIn = { from, ticks: Math.abs(from) <= 2 ? STEP / 2 : STEP };
                }
            }
        }
        return note;
    });
    landOnHeld(ctx, book, notes, plan.velocity);
    // A phrase that fell off or let its bend down at its end (a beat of breath after it) has
    // let go: the next comes in on its bar, as `pickupAhead` rules for the slot's first phrase.
    // A bend let down inside the line goes on down into the pickup.
    const kept = figures.filter((figure) => {
        const before = notes.filter((n) => n.tick < figure[0].tick).at(-1);
        const breath = before ? figure[0].tick - (before.tick + before.dur) : 0;
        return !before?.fall && !(before?.release && breath >= STEP * 4);
    });
    if (kept.length) {
        notes.push(...kept.flat());
        notes.sort((a, b) => a.tick - b.tick);
    }
    // What the next phrase may develop: this one's opening bar.
    const opening = onsets
        .map((o, i) => (o.bar === plan.developsBar ? pitches[i] : null))
        .filter((m) => m !== null);
    const motif =
        role.kind !== 'head' && plan.cells[plan.developsBar] && opening.length
            ? {
                  cell: plan.cells[plan.developsBar] as string,
                  contour: plan.contour,
                  intervals: opening.slice(1).map((m) => m - opening[0]),
              }
            : memory.motif;
    // Two empty bars at the end of a slot are a rest already: the next slot plays.
    const trailing = plan.kinds.length - 1 - plan.kinds.map((k) => k !== 'rest').lastIndexOf(true);
    const phrase: PhraseMemory | null =
        role.kind !== 'head'
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
        role.kind !== 'head' && phrase
            ? { ...memory.phrases, [placeOf(ctx, slotStart)]: phrase }
            : memory.phrases;
    return { notes, motif, trailing, phrase, phrases, fell };
}

/**
 * The lead's notes in the ending bar, let go with the band's gesture (#2017). A held or soft
 * ending is the lead's long last note as planned (`landOnHeld`). In a stop or the hits the
 * band falls silent after each strike, and a lead holding on over that silence is the one
 * player who didn't stop: each note lets go where the band's strike it sounds under lets go
 * (`| G7:2 C:2 |`'s V too, not only home), a note struck in a silence between strikes is a
 * pickup of an eighth at most into the next, and none starts after the band's last strike. A
 * note that was held up to the band's last strike lets go with its own and is struck again
 * with the last (home's eighth in a stop, the ringing last hit). In a button, a lead still
 * sounding there plays it with the band, short and accented (`BUTTON_LIFT`); one that has
 * already let go stays out (the soloist's choice: the band's button is enough). A re-strike
 * of a note first struck before home (held from over the V) is sung on the home chord's
 * resting tone nearest it (`settle`), as the landing is: never the V's leading tone against
 * the I.
 * @internal a test seam: the re-strike's pitch, which no chart reaches today.
 */
export function endWithTheBand(
    ctx: BarContext,
    events: PitchedNote[],
    book: LeadBook,
): PitchedNote[] {
    const gesture = ctx.plan.ending;
    if (!gesture || gesture.kind === 'hold' || gesture.kind === 'soft' || !events.length) {
        return events;
    }
    const strikes = endingStrikes(ctx);
    const last = strikes.at(-1);
    if (!last) {
        return events;
    }
    const tick = (step: number) => at(ctx.bar, step);
    // Where home is struck: a note from before it is the V's.
    const home = tick(strikes.find((s) => s.span === last.span)!.from);
    const cut = (n: PitchedNote, end: number): PitchedNote => {
        const dur = Math.max(STEP / 2, Math.min(n.dur, end - n.tick));
        const { vibrato: _held, ...rest } = n;
        return dur >= STEP * book.vibrato && n.vibrato
            ? { ...rest, dur, vibrato: true }
            : { ...rest, dur };
    };
    const again = (n: PitchedNote, from: number, to: number, lift: number): PitchedNote => ({
        lane: 'lead',
        tick: from,
        dur: to - from,
        midi:
            n.tick < home - 1 && last.span.chord
                ? nearestRanked(book.settle(last.span.chord, ctx.bar.key), n.midi, ctx.lead.range)
                : n.midi,
        velocity: Math.min(127, n.velocity + lift),
        offsetMs: 0,
        bar: n.bar,
    });
    if (gesture.kind === 'button') {
        const button = strikes.find((s) => s.accent);
        if (!button) {
            return events;
        }
        const struck = tick(button.from);
        const kept = events.filter((n) => n.tick < struck - 1);
        const final = kept.at(-1);
        if (!final || final.tick + final.dur < struck - 1) {
            return kept;
        }
        return [
            ...kept.slice(0, -1),
            cut(final, struck),
            again(final, struck, tick(button.to), BUTTON_LIFT),
        ];
    }
    // stop, hits: each note lets go with the strike it sounds under; nothing after the last.
    const silence = tick(last.to);
    const sounding = events.filter((n) => n.tick < silence - 1);
    const kept = sounding.map((n) => {
        const under = strikes.filter((s) => tick(s.from) <= n.tick + 1).at(-1);
        const next = strikes.find((s) => tick(s.from) > n.tick + 1);
        const end =
            under && n.tick < tick(under.to) - 1
                ? tick(under.to)
                : Math.min(n.tick + ENDING_SHORT * STEP, next ? tick(next.from) : silence);
        return cut(n, end);
    });
    const original = sounding.at(-1);
    // The band's strikes after the one the lead's last note sounds under.
    const later = original ? strikes.filter((s) => tick(s.from) > original.tick + 1) : [];
    const into = later[0];
    if (original && into && original.tick + original.dur >= tick(into.from) - 1) {
        // Held into the band's next strike: the player is in on the hits, so the note is struck
        // again with every one of them (short with a short one, ringing with the last), not
        // only the last. why: unison stabs are the one place everyone hits every note; a horn
        // that hit 1 and 3 but not 2 would be the one player who missed the arrival.
        return [...kept, ...later.map((s) => again(original, tick(s.from), tick(s.to), 0))];
    }
    return kept;
}

/**
 * A lead book's idiom, with where it sits on an instrument (`bookReach`): its home, and the top
 * note its solo peaks on and its head never passes.
 */
export interface LeadIdiom extends PitchedIdiom {
    register(lead: LeadProfile): { home: number; top: number };
}

export function leadIdiom(book: LeadBook): LeadIdiom {
    return {
        name: book.name,
        register: (lead) => bookReach(lead, book),
        init: (): LeadMemory => ({
            slot: '',
            notes: [],
            last: null,
            motif: null,
            trailing: 0,
            phrase: null,
            phrases: {},
            fell: false,
        }),
        play(ctx: BarContext, memory: LeadMemory) {
            const { bar } = ctx;
            // A trade's slot is its turn; otherwise a phrase of the form.
            const role = ctx.plan.lead;
            const slotStart = role.kind === 'trade' ? role.from : bar.index - bar.phrase.bar;
            // A trade's turn is keyed by its shape too, so changing the trade mid-turn replans
            // it rather than keeping a plan made for another length (or for a solo chorus).
            // And a pass that ends on a resolved tonic keys its slots by that chord: a phrase
            // planned under another style's ending is replanned against the chord the band now
            // holds, not kept against the old one.
            // Keyed by where the held chord arrives too: `G7 C` and `G7:3 C:1` hold the same C
            // from different beats, and a plan landing on one is not the other's.
            const held = ctx.ending?.spans.filter((span) => span.chord).at(-1);
            const resolved = held?.chord
                ? `${held.chord.symbol}@${held.start - ctx.ending!.start}`
                : null;
            const slot =
                (role.kind === 'trade'
                    ? `${ctx.pass}:t${role.from}:${role.bars}:${role.turn}:${role.with}`
                    : `${ctx.pass}:${slotStart}`) + (resolved ? `:end:${resolved}` : '');
            let next = memory;
            if (memory.slot !== slot) {
                // The arrangement decided the slot's job; every bar of a slot has the same one.
                const planned = planSlot(ctx, book, slotStart, role, memory);
                next = {
                    ...memory,
                    slot,
                    notes: planned.notes,
                    motif: planned.motif,
                    trailing: planned.trailing,
                    phrase: planned.phrase,
                    phrases: planned.phrases,
                    fell: planned.fell,
                };
            }
            const toEvent = (n: Planned): PitchedNote => ({
                lane: 'lead',
                tick: n.tick,
                dur: n.dur,
                midi: n.midi,
                velocity: n.velocity,
                offsetMs: 0,
                bar: n.bar,
                ...(n.bendIn ? { bendIn: n.bendIn } : {}),
                ...(n.release ? { release: true } : {}),
                ...(n.fall ? { fall: n.fall } : {}),
                ...(n.slideIn ? { slideIn: n.slideIn } : {}),
                ...(n.vibrato ? { vibrato: true } : {}),
            });
            const events = endWithTheBand(
                ctx,
                next.notes.filter((n) => n.bar === bar.index).map(toEvent),
                book,
            );
            // The last pitch this slot played: a pickup into the next slot (below) is that
            // slot's, planned from this memory, so it never moves it.
            const last = events.at(-1)?.midi ?? next.last;
            const after = { ...next, last };
            const pickup = pickupAhead(ctx, book, role, after).map(toEvent);
            return { events: pickup.length ? [...events, ...pickup] : events, memory: after };
        },
    };
}
