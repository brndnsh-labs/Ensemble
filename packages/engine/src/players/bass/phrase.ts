// Playing the bass by the phrase. A bassist does not choose a line bar by
// bar: the section has its line, the one he comes back to every time round
// (X-B-14), and each phrase is a plan made on it: where to answer that line
// with another way of playing the chord, and how to end it, walking into the
// next line, turning the riff round, leading in with one note, or none of
// them. A walked line is a plan in itself: each plan walks the phrase its own
// way. Several plans are drawn, each is played out into the first note of
// the next phrase, and the critic picks one.
//
// What is carried forward is what a bassist carries: the last note played,
// the phrase before, and what he played at this place the last time through.
// Every draw is keyed by its place in the form (X-A-29 to X-A-31).

import { PPQ } from "../../chart/types.ts";
import { heldRng } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { Rng } from "../../rng.ts";
import { mod12 } from "../../theory/pitch.ts";
import type { BassCandidate, BassPick, WalkPlace } from "./critique.ts";
import type { Piece } from "./form.ts";
import { tierAt } from "./form.ts";
import { leadInChance } from "./leadin.ts";
import type { LineNote, ShapeChoice } from "./line.ts";
import type { BassStyle, Figure, LineShape, ToneSequence, Walk } from "./style.ts";
import { aboveBass, bassPitchClass, inHarmony, playable, sequenceFor, shapesIn } from "./tones.ts";

/** What a bassist carries from note to note. */
export interface Carried {
  /** Where the line last was, before any lead-in reshaped it. Null before the first note. */
  readonly line: number | null;
  /** Where the bass note of the chord he is on sits. */
  readonly root: number;
}

/**
 * How the line goes into a change: walked, with this generator choosing the
 * walk, or led in by one note, with the style's coin (null) or a decision
 * already made (0: not led in where the line does not already; 1: led in).
 */
export interface Into {
  readonly walk: Rng | null;
  readonly chance: number | null;
  /** The generator of the plan being weighed, for a walked line: its roots' octaves and its notes. */
  readonly walked?: Rng | null;
}

/** What a plan asks of a piece beyond its shape. */
export interface How {
  /** The plan's generator for a walked line. */
  readonly walked?: Rng | null;
  /** The plan turns the figure round in this bar. */
  readonly turn?: boolean;
}

/** Into a change as the style's lead-ins have it, with no walk. */
export const AS_IT_FALLS: Into = { walk: null, chance: null };

/** The two steps of playing a piece: arriving on its chord, then playing it. */
export interface Performer {
  /**
   * Place the root of piece `i` and reshape the piece before it to lead in:
   * a walk, a lead-in, or nothing. Says which walk, if it walked.
   */
  arrive(
    i: number,
    state: Carried,
    parts: LineNote[][],
    into: Into,
  ): { state: Carried; walked: Walk | null };
  /** Write piece `i`'s notes, on the shape `choose` picks. */
  play(i: number, state: Carried, parts: LineNote[][], choose?: ShapeChoice, how?: How): Carried;
  /** The turn piece `i`'s bar would play if a plan turned it, or null where its line has none. */
  turn(i: number): Figure | null;
}

/** A plan for a phrase, before it is played out. */
interface Plan {
  /** For each stay on a chord in the phrase, whether it plays the answer. The first never does. */
  readonly answers: readonly boolean[];
  /** Into the next phrase's first chord. */
  readonly ending: Into;
  /** A walk into a change inside the phrase: the piece it walks into. */
  readonly inside: { readonly at: number; readonly walk: Rng } | null;
  /**
   * Whether the line leads into each change inside the phrase where it does not
   * already (0 or 1), by piece. A change not listed has the style's coin.
   */
  readonly leads: ReadonlyMap<number, number>;
  /** This plan's own generator for a walked line. */
  readonly walked: Rng;
  /** Whether the phrase's last bar turns its figure round. */
  readonly turn: boolean;
}

interface Played {
  readonly candidate: BassCandidate;
  readonly parts: readonly (readonly [number, LineNote[]])[];
  readonly state: Carried;
  /** Nothing in it but the home shape, and no walk. */
  readonly plain: boolean;
}

/** How many of the changes just played the bassist keeps in mind when he weighs how chromatic to be: about a chorus. */
const RECENT = 8;

/** Every piece's notes, phrase by phrase in the order they are played. */
export function playPhrases(
  form: readonly Piece[],
  bass: BassStyle,
  rng: Rng,
  player: Performer,
  pick: BassPick,
): LineNote[][] {
  const parts: LineNote[][] = form.map(() => []);
  if (form.length === 0) return parts;
  const book = shapeBook(form, rng);
  let state = player.arrive(0, { line: null, root: 0 }, parts, AS_IT_FALLS).state;

  const policy = bass.phrase;
  const varies = [bass.lines.low, bass.lines.mid, bass.lines.high].some((line) =>
    line.tones.some((sequence) => (sequence.others?.length ?? 0) > 0),
  );
  const walks = bass.walks;
  const walking =
    walks !== undefined &&
    Object.values(walks.kinds).some((list) => list.length > 0) &&
    [...Object.values(walks.offer.end), ...Object.values(walks.offer.inside)].some(
      (chance) => chance > 0,
    );
  // A walked line is a new line every time it is drawn, and a riff may turn: both are choices.
  const lines = [bass.lines.low, bass.lines.mid, bass.lines.high];
  const walked = lines.some((line) => line.walked !== undefined);
  const turning = lines.some(
    (line) => (line.turns?.offer ?? 0) > 0 && line.turns!.options.some((turn) => turn.weight > 0),
  );
  if (!policy || policy.candidates < 1 || !(varies || walking || walked || turning)) {
    // Nothing to choose: one line, piece by piece, its lead-ins as they fall.
    form.forEach((_, i) => {
      if (i > 0) state = player.arrive(i, state, parts, AS_IT_FALLS).state;
      state = player.play(i, state, parts);
    });
    return parts;
  }

  let before: readonly string[] | null = null;
  let recent: boolean[] = [];
  const lastTime = new Map<string, readonly string[]>();
  const lastTimeTops = new Map<string, readonly (number | null)[]>();
  let occurrence = -1;
  let plainSoFar = true;
  for (const phrase of phrasesOf(form)) {
    const first = form[phrase[0]!]!;
    const bars = [...new Set(phrase.map((i) => form[i]!.bar))];
    if (first.bar.section.occurrence !== occurrence) plainSoFar = true;
    occurrence = first.bar.section.occurrence;
    const place = `${first.bar.section.identity}/${first.bar.phrase.index}`;
    const last = phrase[phrase.length - 1]!;
    const next = form[last + 1];
    const closes = next === undefined || next.bar.section.occurrence !== occurrence;

    // The plans, each played out from the same place; a plan that plays the same notes as
    // one already played out is the same plan.
    const stay = staysOf(form, phrase);
    // The last pitch before the phrase, if the line was not resting.
    const leading = form[phrase[0]! - 1]?.chord ? parts[phrase[0]! - 1]!.at(-1) : undefined;
    const lastBar = bars[bars.length - 1]!;
    const played: Played[] = [];
    const heard = new Set<number>();
    for (const plan of plansFor(form, bass, rng, phrase, stay)) {
      if (played.length >= policy.candidates) break;
      // Every plan is played into the same parts: it writes only the phrase's own pieces.
      const trial = parts;
      for (const i of phrase) trial[i] = [];
      let carried = state;
      const walked: WalkPlace[] = [];
      const answered = new Set<number>();
      const plays = new Map<number, string>();
      const walkedAs = (piece: Piece, walk: Walk) =>
        plays.set(piece.bar.index, `walk ${walk.name ?? ""}`.trim());
      phrase.forEach((i, k) => {
        if (k > 0) {
          const into = {
            walk: plan.inside?.at === i ? plan.inside.walk : null,
            chance: plan.leads.get(i) ?? null,
            walked: plan.walked,
          };
          const arrival = player.arrive(i, carried, trial, into);
          carried = arrival.state;
          if (arrival.walked) {
            walked.push("inside");
            walkedAs(form[i - 1]!, arrival.walked);
          }
        }
        const answer = plan.answers[stay[k]!] === true;
        carried = player.play(i, carried, trial, book.choice(form[i]!, answer, answered, plays), {
          walked: plan.walked,
          turn: plan.turn && form[i]!.bar === lastBar,
        });
      });
      // A turn is the riff's way of ending a line, as a walk is the box's.
      const turned = plan.turn ? player.turn(last) : null;
      let joins: number | null = null;
      let intoTop = false;
      let landing: number | null = null;
      if (next) {
        const arrival = player.arrive(last + 1, carried, trial, {
          ...plan.ending,
          walked: plan.walked,
        });
        intoTop = next.start === next.bar.start && next.bar.barInSection === 0;
        if (next.struck && next.chord) landing = arrival.state.root;
        if (arrival.walked) {
          walked.push(intoTop ? "top" : "line");
          walkedAs(form[last]!, arrival.walked);
        }
        const end = trial[last]!.at(-1);
        const leaving = form[last]!.chord;
        if (end && next.struck && next.chord && leaving)
          if (bassPitchClass(next.chord) !== bassPitchClass(leaving))
            joins = Math.abs(end.pitch - arrival.state.root);
        carried = arrival.state;
      }
      if (turned) {
        walked.push(intoTop ? "top" : "line");
        plays.set(lastBar.index, `turn ${turned.name ?? ""}`.trim());
      }
      const notes = phrase.flatMap((i) => trial[i]!);
      // How each change the phrase makes is arrived at: the pitch played in the beat before
      // it, against the pitch it lands on.
      const arrivals: (readonly [number | null, number])[] = [];
      const arriving = [...phrase.slice(1), ...(next ? [last + 1] : [])];
      for (const i of arriving) {
        const piece = form[i]!;
        const leaving = form[i - 1]!;
        if (!piece.struck || !piece.chord || !leaving.chord) continue;
        if (bassPitchClass(piece.chord) === bassPitchClass(leaving.chord)) continue;
        const landing = i === last + 1 ? carried.root : trial[i]![0]?.pitch;
        const before = trial[i - 1]!.findLast((note) => note.tick >= piece.start - PPQ);
        if (landing !== undefined) arrivals.push([before?.pitch ?? null, landing]);
      }
      // A hash of the notes: two plans that sound the same are one candidate.
      let key = notes.length;
      for (const note of notes)
        key = (Math.imul(key, 31) + note.tick * 2 + Number(note.echo)) ^ note.pitch;
      if (heard.has(key)) continue;
      heard.add(key);
      const plain = answered.size === 0 && walked.length === 0;
      const lastPiece = form[last]!;
      const shapes = shapesOf(notes, bars);
      played.push({
        candidate: {
          bars,
          notes,
          shapes: shapes.shapes,
          tops: shapes.tops,
          leading: leading?.pitch ?? null,
          landing,
          lastTimeTops: lastTimeTops.get(place) ?? null,
          plays: bars.map((bar) => plays.get(bar.index) ?? ""),
          answered: answered.size / bars.length,
          walks: walked,
          joins,
          arrivals,
          recent,
          chromatic: policy.halfSteps,
          intoTop,
          loop: closes && plainSoFar && plain,
          energy: lastPiece.bar.seats.bass ?? lastPiece.bar.energy,
          before,
          lastTime: lastTime.get(place) ?? null,
        },
        parts: phrase.map((i) => [i, trial[i]!] as const),
        state: carried,
        plain,
      });
    }

    const chosen = pick(played.map((option) => option.candidate));
    const commit = played.find((option) => option.candidate === chosen)!;
    for (const [i, notes] of commit.parts) parts[i] = notes;
    state = commit.state;
    before = chosen.shapes;
    lastTimeTops.set(place, chosen.tops);
    for (const [from, landing] of chosen.arrivals) {
      recent.push(from !== null && Math.abs(from - landing) === 1);
    }
    recent = recent.slice(-RECENT);
    lastTime.set(place, chosen.shapes);
    plainSoFar = plainSoFar && commit.plain;
  }
  return parts;
}

/** The pieces of each phrase, in order: a phrase is the plan's, each time through a section. */
function phrasesOf(form: readonly Piece[]): number[][] {
  const phrases: number[][] = [];
  let at = "";
  form.forEach((piece, i) => {
    const here = `${piece.lookahead}/${piece.bar.section.occurrence}/${piece.bar.phrase.index}`;
    if (here !== at) phrases.push([]);
    at = here;
    phrases[phrases.length - 1]!.push(i);
  });
  return phrases;
}

/**
 * For each piece of a phrase, which stay on a chord it belongs to: a new one
 * wherever a chord is struck, and every two bars of a long one, where the box
 * starts up again. Four bars on the I are two boxes, and the second may answer
 * the first.
 */
function staysOf(form: readonly Piece[], phrase: readonly number[]): number[] {
  let stay = 0;
  return phrase.map((i, k) => {
    const piece = form[i]!;
    const again = piece.start === piece.bar.start && piece.cycle > 0 && piece.cycle % 2 === 0;
    if (k > 0 && (piece.struck || again)) stay++;
    return stay;
  });
}

/**
 * The plans weighed for a phrase, drawn by position. The first is the line as
 * it comes: its lead-ins by the style's own coin. The others decide theirs.
 */
function plansFor(
  form: readonly Piece[],
  bass: BassStyle,
  rng: Rng,
  phrase: readonly number[],
  stay: readonly number[],
): Plan[] {
  const policy = bass.phrase!;
  const walks = bass.walks;
  const first = form[phrase[0]!]!;
  const last = form[phrase[phrase.length - 1]!]!;
  const next = form[phrase[phrase.length - 1]! + 1];
  const stays = (stay[stay.length - 1] ?? 0) + 1;
  // A stay can answer only where its chord has more than one shape.
  const answerable = new Array<boolean>(stays).fill(false);
  phrase.forEach((i, k) => {
    const { chord, scale } = form[i]!;
    if (!chord || !scale) return;
    const sequence = sequenceFor(bass.lines[tierAt(form[i]!)].tones, chord, scale);
    if ((sequence.others?.length ?? 0) > 0) answerable[stay[k]!] = true;
  });
  // Changes inside the phrase a walk could go into.
  const inner = phrase.filter((i, k) => k > 0 && form[i]!.struck && form[i]!.chord !== null);
  const held = heldRng(rng, "bass-plans", "phrase", first.bar);
  // Every plan walks a walked line its own way, so no two of them are one plan.
  const strides = phrase.some((i) => bass.lines[tierAt(form[i]!)].walked !== undefined);
  const turns = bass.lines[tierAt(last)].turns;
  const plans: Plan[] = [];
  const seen = new Set<string>();
  // More are drawn than are weighed, since two plans often play the same notes.
  for (let k = 0; k < policy.candidates + 2; k++) {
    const draw = held.fork(k);
    const answers = Array.from(
      { length: stays },
      (_, s) => s > 0 && answerable[s]! && draw.fork("answer", s).chance(policy.answers),
    );
    const walk = walks !== undefined && draw.fork("walk").chance(walks.offer.end[tierAt(last)]);
    const ending: Into = walk
      ? { walk: draw.fork("which"), chance: null }
      : k === 0 || next === undefined
        ? AS_IT_FALLS
        : { walk: null, chance: draw.fork("lead").chance(leadInChance(bass, last, next)) ? 1 : 0 };
    const inside =
      walks !== undefined &&
      inner.length > 0 &&
      draw.fork("inside").chance(walks.offer.inside[tierAt(last)])
        ? { at: inner[draw.fork("where").int(inner.length)]!, walk: draw.fork("inside-which") }
        : null;
    // The first plan is the line as it comes; the others decide each lead-in for themselves,
    // as likely to as the style's coin is.
    const leads = new Map<number, number>();
    if (k > 0) {
      for (const i of inner) {
        // A walk approaches every change itself: there is no lead-in to decide.
        if (bass.lines[tierAt(form[i - 1]!)].walked) continue;
        const chance = leadInChance(bass, form[i - 1]!, form[i]!);
        leads.set(i, draw.fork("lead", i).chance(chance) ? 1 : 0);
      }
    }
    const turn = turns !== undefined && draw.fork("turn").chance(turns.offer);
    // Two plans that decide the same things are one plan. A walk's own choice is the plan's.
    const signature = [
      answers.map(Number).join(""),
      ending.walk ? `w${k}` : ending.chance,
      inside ? `${inside.at}w${k}` : "",
      [...leads.values()].join(""),
      strides ? k : "",
      turn ? "t" : "",
    ].join("/");
    if (seen.has(signature)) continue;
    seen.add(signature);
    plans.push({ answers, ending, inside, leads, walked: draw.fork("walked"), turn });
  }
  return plans;
}

/**
 * The section's home shape for each kind of chord at each level, the same
 * every time the section comes round, and the answer for each time through.
 */
function shapeBook(form: readonly Piece[], rng: Rng) {
  const after = new Map(form.map((piece, i) => [piece, form[i + 1]]));
  const nextOf = (piece: Piece) => after.get(piece);
  const home = (sequence: ToneSequence, index: number, piece: Piece): LineShape => {
    const shapes = shapesIn(sequence);
    const weight = (shape: LineShape) => shape.home ?? 1;
    if (!shapes.some((shape) => weight(shape) > 0)) return sequence;
    return heldRng(rng, `shape:${tierAt(piece)}:${index}`, "section", piece.bar).weighted(
      shapes,
      weight,
    );
  };
  const answer = (
    sequence: ToneSequence,
    index: number,
    piece: Piece,
    own: LineShape,
  ): LineShape => {
    const pool = shapesIn(sequence).filter((shape) => shape !== own && (shape.answer ?? 1) > 0);
    if (pool.length === 0) return own;
    return heldRng(rng, `answer:${tierAt(piece)}:${index}`, "pass", piece.bar).weighted(
      pool,
      (shape) => shape.answer ?? 1,
    );
  };
  const known = new Map<number, { shape: LineShape; answers: boolean }>();
  const decide = (sequence: ToneSequence, index: number, piece: Piece, answering: boolean) => {
    const fits = (shape: LineShape) =>
      playable(shape, piece.chord!, piece.scale!) && resolves(shape, piece, nextOf(piece));
    const own = home(sequence, index, piece);
    const shape = answering ? answer(sequence, index, piece, own) : own;
    if (shape !== own && fits(shape)) return { shape, answers: true };
    return { shape: fits(own) ? own : sequence, answers: false };
  };
  /** The shape a piece plays: the home, or the answer where the plan says so and it fits the chord. */
  const shapeFor = (sequence: ToneSequence, index: number, piece: Piece, answering: boolean) => {
    if (!sequence.others?.length || !piece.chord || !piece.scale) {
      return { shape: sequence as LineShape, answers: false };
    }
    const key = (piece.start * 64 + index) * 2 + Number(answering);
    let decided = known.get(key);
    if (!decided) {
      decided = decide(sequence, index, piece, answering);
      known.set(key, decided);
    }
    return decided;
  };
  return {
    /**
     * The choice of shape for a piece, as the line asks it. What was played is
     * noted down: which bars answered, and each bar's shape by name.
     */
    choice(
      piece: Piece,
      answering: boolean,
      answered: Set<number>,
      plays: Map<number, string>,
    ): ShapeChoice {
      return (sequence, index) => {
        const { shape, answers } = shapeFor(sequence, index, piece, answering);
        if (answers) answered.add(piece.bar.index);
        if (!plays.has(piece.bar.index)) plays.set(piece.bar.index, shape.name ?? "");
        return shape;
      };
    },
  };
}

/**
 * Whether a shape's bar can end where this piece does. A chromatic note
 * passes on to the shape's next note; where anything else follows it (a new
 * chord, the chord struck again, a new box or a new phrase, which may play
 * another shape), it must be the half step onto the bass note that comes, or
 * it would be left hanging (X-A-26).
 */
function resolves(shape: LineShape, piece: Piece, next: Piece | undefined): boolean {
  if (!next || piece.end !== next.start) return true;
  // The same shape carries on into the next bar of its box: the note passes on as written.
  const samePhrase =
    next.bar.section.occurrence === piece.bar.section.occurrence &&
    next.bar.phrase.index === piece.bar.phrase.index;
  if (!next.struck && next.chord && samePhrase && piece.cycle % 2 === 0) return true;
  const tones = shape.bars[piece.cycle % shape.bars.length] ?? [];
  const last = tones[tones.length - 1];
  if (!last) return true;
  const pitch = bassPitchClass(piece.chord!) + aboveBass(last, piece.chord!, piece.scale!);
  if (inHarmony(piece.chord!, piece.scale!, pitch)) return true;
  if (!next.chord) return false;
  const apart = mod12(pitch - bassPitchClass(next.chord));
  return apart === 1 || apart === 11;
}

/**
 * Each bar of the line as a shape, its notes' places in the bar and their
 * pitches above its first, and that first pitch: together, the bar note for note.
 */
function shapesOf(
  notes: readonly LineNote[],
  bars: readonly PlanBar[],
): { shapes: string[]; tops: (number | null)[] } {
  const tops: (number | null)[] = [];
  const shapes = bars.map((bar) => {
    let shape = "";
    let first: number | null = null;
    for (const note of notes) {
      if (note.tick < bar.start || note.tick >= bar.start + bar.ticks) continue;
      first ??= note.pitch;
      shape += `${note.tick - bar.start}:${note.pitch - first} `;
    }
    tops.push(first);
    return first === null ? "rest" : shape;
  });
  return { shapes, tops };
}
