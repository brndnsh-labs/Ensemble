// The phrases a soloist might play in a slot. What the slot is for comes from
// the chorus's form: state an idea, say it again, say it changed, answer it.
// Each of those can be done several ways, and each way is one candidate,
// written whole. Fresh material is rare on purpose: a statement is new, and
// everything else in its chorus is made out of it.
//
// What is remembered from one phrase to the next is what a soloist carries:
// the idea being worked on (its rhythm, bar by bar, and its pitches), the
// first idea of the solo, the note the last phrase came to rest on, and
// whether it ended with a bar of air.

import { PPQ } from "../../chart/types.ts";
import { cells, STEP } from "../../perform/grid.ts";
import type { Rng } from "../../rng.ts";
import type { ToneRole } from "../../theory/chord.ts";
import { pitchClass } from "../../theory/pitch.ts";
import { climb, EIGHTH, isChordTone, landing, onlyPasses } from "./harmony.ts";
import type { LineBar, Spot } from "./line.ts";
import { contourOf, spotsOf, writeLine } from "./line.ts";
import type { Slot, World } from "./slots.ts";
import type { Cell, Contour } from "./style.ts";
import { CONTOURS } from "./style.ts";

/** What a bar of a phrase is: a line bar, an end bar, a rest, or the final note of the take. */
export type Part = "L" | "E" | "R" | "F";

export interface PhraseBar {
  readonly part: Part;
  readonly cell: Cell;
  /** Plays the bar before it again, moved along the line. */
  readonly again: boolean;
  /** A pitch for each attack of the cell, in order. */
  readonly pitches: readonly number[];
}

/** A phrase written whole: one candidate for a slot. */
export interface Phrase {
  /** How it was made, in a word, for anyone reading the choice. */
  readonly kind: string;
  readonly slot: Slot;
  readonly bars: readonly PhraseBar[];
  /** Every note of it in order: where it is struck and what it is. */
  readonly line: readonly Placed[];
  /** Notes that lead into it from the last beat of the bar before (SO-36). */
  readonly pickup: readonly Placed[];
}

export interface Placed {
  readonly spot: Spot;
  readonly pitch: number;
  /** A note of a pickup: it leads into the line, and is not part of the idea. */
  readonly lead?: boolean;
}

/** What a phrase is asked to be. */
export type Role = "s" | "r" | "v" | "a";

export interface Memory {
  /** The idea being worked on: the last statement played. */
  readonly motif: Phrase | null;
  /** The first idea of the solo. */
  readonly theme: Phrase | null;
  /** The last pitch played, where the phrase before came to rest. */
  readonly rest: number | null;
  /** The highest note of the solo so far. */
  readonly highest: number;
  /** Where the last note stops sounding. */
  readonly restEnds: number;
  /** The phrase before ended on an empty bar. */
  readonly endedEmpty: boolean;
}

type BarPlan = Omit<PhraseBar, "pitches">;
const REST: BarPlan = { part: "R", cell: "", again: false };
const playing = (bar: { part: Part }) => bar.part !== "R";

/** A four-bar shape on a phrase of another length: line bars added at the front, or bars cut from it (SO-09). */
function fitShape(shape: string, length: number): Part[] {
  let letters = cells(shape) as Part[];
  while (letters.length < length) {
    letters = length - letters.length >= 2 ? ["L", "E", ...letters] : ["L", ...letters];
  }
  letters = letters.slice(letters.length - length);
  if (!letters.includes("E")) letters[letters.length - 1] = "E";
  return letters;
}

/** The spots of a phrase's bars in a slot, bar by bar. */
function lineBars(world: World, slot: Slot, bars: readonly BarPlan[]): LineBar[] {
  return slot.bars.map((bar, i) => {
    const plan = bars[i] ?? REST;
    if (plan.part === "R") return { spots: [], again: false };
    if (plan.part === "F") {
      // The last bar of a take that ends: one note where the final chord lands (SO-19, SO-59).
      const tick = bar.start + (bar.ending?.at ?? 0);
      const hold = bar.ending?.ring ?? bar.ticks;
      const pool = world.poolOf(world.arrivalAt(tick));
      return {
        spots: pool ? [{ bar, tick, hold, onset: 0, pool, lands: true }] : [],
        again: false,
      };
    }
    return { spots: spotsOf(world, bar, plan.cell), again: plan.again };
  });
}

interface Ask {
  readonly contour: (through: number) => number;
  readonly ending: readonly ToneRole[];
  /** A remembered pitch for a spot of a bar, where the phrase keeps one. */
  readonly given?: (bar: number, spot: Spot) => number | undefined;
}

export function phrasesFor(
  world: World,
  slot: Slot,
  role: Role,
  memory: Memory,
  rng: Rng,
): Phrase[] {
  const { solo, instrument } = world;
  const length = slot.bars.length;
  const final = slot.bars[length - 1]!.ending !== null;
  const barSeconds = slot.bars[0]!.ticks / world.ticksPerSecond;
  // How many line bars in a row before a phrase has to land. A phrase is as long as the
  // style has patience for, in seconds, so at a slow tempo it is fewer bars (KF-B-12); and
  // a horn has to get the line and the bar it lands in out of one breath.
  const patient = Math.floor((solo.space.patience + solo.space.breath) / barSeconds);
  const air = instrument.breath
    ? Math.floor((instrument.breath.lungs + instrument.breath.takes) / barSeconds - 1)
    : length;
  const lungs = Math.max(1, Math.min(patient, air));

  const compose = (kind: string, plans: readonly BarPlan[], ask: Ask): Phrase => {
    const bars = slot.bars.map((_, i) => plans[i] ?? REST);
    if (final) bars[length - 1] = { part: "F", cell: "", again: false };
    const lines = lineBars(world, slot, bars);
    const given = new Map<number, number>();
    let at = 0;
    lines.forEach((line, b) => {
      for (const spot of line.spots) {
        const pitch = ask.given?.(b, spot);
        if (pitch !== undefined) given.set(at, pitch);
        at++;
      }
    });
    const pitches = writeLine(world, lines, {
      low: slot.low,
      high: slot.high,
      contour: ask.contour,
      // The last note of the take rests, whatever the phrase was for.
      ending: final ? solo.settle : ask.ending,
      final,
      from: memory.rest,
      notOn: memory.rest,
      // The climb ends on the solo's one top note (SO-05), unless its last note is the
      // tune's: a tune comes to rest, it does not stop on the top.
      climbsTo: slot.peak && !final ? { to: slot.top, above: memory.highest } : null,
      given,
      rng: rng.fork("habits"),
    });
    at = 0;
    const written = bars.map((bar, b) => ({
      ...bar,
      pitches: lines[b]!.spots.map(() => pitches[at++]!),
    }));
    const line = lines.flatMap((bar) => bar.spots).map((spot, i) => ({ spot, pitch: pitches[i]! }));
    return { kind, slot, bars: written, line, pickup: [] };
  };

  const ending = role === "a" || slot.last ? solo.settle : solo.hang;
  const span = slot.level.span;
  const shaped = (kind: Contour) =>
    slot.peak
      ? contourOf("climb", slot.top - 3 - span / 2, span)
      : contourOf(slot.last ? "fall" : kind, slot.centre, span);
  const endCell = (draw: Rng, not?: Cell) => {
    const others = solo.endings.filter((cell) => cell !== not);
    return draw.pick(others.length > 0 ? others : solo.endings);
  };

  /** A shape for this slot that leaves no more air than the style allows (SO-10). */
  const drawShape = (draw: Rng, lines = 1): Part[] => {
    const at = solo.levels.indexOf(slot.level);
    const roomier = !slot.peak && at > 0 && draw.fork("room").chance(solo.space.roomier);
    const shapes = slot.peak
      ? [{ weight: 1, bars: "L L L E" }]
      : solo.levels[roomier ? at - 1 : at]!.shapes;
    const allowed = (letters: readonly Part[]) => {
      const empty = letters.filter((letter) => letter === "R").length;
      const run = Math.max(
        ...letters
          .join("")
          .split(/[^L]/)
          .map((line) => line.length),
      );
      return (
        empty <= solo.space.emptyBars + (slot.first ? 1 : 0) &&
        !(memory.endedEmpty && letters[0] === "R") &&
        run <= lungs &&
        (!final || letters[length - 1] === "E")
      );
    };
    const fitted = shapes
      .map((shape) => ({ weight: shape.weight, letters: fitShape(shape.bars, length) }))
      .filter((shape) => shape.weight > 0 && allowed(shape.letters));
    // An idea being opened out wants more than one bar of line to open out into.
    const roomy = fitted.filter(
      (shape) => shape.letters.filter((letter) => letter === "L").length >= lines,
    );
    const options = roomy.length > 0 ? roomy : fitted;
    if (options.length > 0) return draw.fork("shape").weighted(options, (s) => s.weight).letters;
    // Nothing fits: as many line bars as one breath carries and an end bar, over and over.
    const unit = Math.min(lungs, Math.max(1, length - 1)) + 1;
    return slot.bars.map((_, i): Part => ((length - 1 - i) % unit === 0 ? "E" : "L"));
  };

  /**
   * A shape's bars with their rhythms: one cell for the line, coming back as a riff or
   * giving way to a second. An `opening` is an older idea's first bar: the phrase starts
   * with it and then runs on in this slot's own rhythms.
   */
  const withCells = (
    letters: readonly Part[],
    draw: Rng,
    opening?: Cell,
    end?: Cell,
    oneRhythm = false,
  ): BarPlan[] => {
    const a = draw.fork("cell").pick(slot.level.cells);
    const others = slot.level.cells.filter((cell) => cell !== a);
    const b = others.length > 0 ? draw.fork("other").pick(others) : a;
    const last = slot.peak ? solo.arc.peak.ending : (end ?? endCell(draw.fork("end")));
    let before: Cell | null = null;
    let lines = 0;
    return letters.map((part, i): BarPlan => {
      if (part !== "L") {
        before = null;
        return { part, cell: part === "E" ? last : "", again: false };
      }
      const first = lines++ === 0;
      // The climb to the top note is one bar in a rising sequence (SO-05).
      const riff =
        before !== null &&
        (slot.peak || oneRhythm || draw.fork("riff", i).chance(solo.habits.riff));
      const cell: Cell =
        first && opening ? opening : before === null ? a : riff ? before : before === a ? b : a;
      const plan = { part, cell, again: riff };
      before = cell;
      return plan;
    });
  };

  // ── the ways of making a phrase ──────────────────────────────────────────
  const statement = (n: number): Phrase => {
    const draw = rng.fork("statement", n);
    const contour = draw.fork("contour").weighted(CONTOURS, (kind) => solo.contours[kind]);
    // Every other one keeps to one rhythm all along the line; the rest riff as often as the
    // style's habit says, and the critic hears the difference.
    const plans = withCells(drawShape(draw), draw, undefined, undefined, n % 2 === 1);
    return compose("statement", plans, { contour: shaped(contour), ending });
  };

  /**
   * Which of an idea's bars is played in each bar of this slot. Mostly its own, bar for
   * bar; but a phrase starts on its first bar after a bar of air, and leaves no more air
   * than the style allows (SO-10), so an idea with too much room in it comes in at once
   * and says its ending again in the last empty bar.
   */
  const layout = (idea: Phrase): number[] => {
    let from = slot.bars.map((_, i) => (idea.bars[i] && idea.bars[i]!.part !== "F" ? i : -1));
    const rests = (i: number) => i < 0 || idea.bars[i]!.part === "R";
    if (memory.endedEmpty && rests(from[0]!)) from = [...from.slice(1), -1];
    const echo = idea.bars.findLastIndex((bar) => bar.part === "E");
    const allowed = solo.space.emptyBars + (slot.first ? 1 : 0);
    while (echo >= 0 && from.filter(rests).length > allowed) from[from.findLastIndex(rests)] = echo;
    return from;
  };
  const barsOf = (idea: Phrase, from: readonly number[]): BarPlan[] =>
    from.map((i) => (i < 0 ? REST : idea.bars[i]!));
  const remembered =
    (
      idea: Phrase,
      from: readonly number[],
      move: (pitch: number, spot: Spot) => number,
      upTo = from.length,
    ) =>
    (b: number, spot: Spot) => {
      const pitch = b < upTo ? idea.bars[from[b] ?? -1]?.pitches[spot.onset] : undefined;
      return pitch === undefined ? undefined : move(pitch, spot);
    };

  /** The idea again, each note where it was or moved by `move`. */
  const again = (
    kind: string,
    idea: Phrase,
    move: (pitch: number, spot: Spot) => number,
  ): Phrase => {
    const from = layout(idea);
    return compose(kind, barsOf(idea, from), {
      contour: shaped("arch"),
      ending,
      given: remembered(idea, from, move),
    });
  };

  /** The idea with a new last bar, coming to rest above or below where it did. */
  const tail = (idea: Phrase, direction: 1 | -1): Phrase | null => {
    const from = layout(idea);
    const bars = barsOf(idea, from);
    const at = bars.findLastIndex(playing);
    const kept = from.slice(0, at).flatMap((i) => idea.bars[i]?.pitches ?? []);
    const anchor = kept.at(-1) ?? idea.bars[from[at] ?? -1]?.pitches[0];
    if (at < 0 || anchor === undefined) return null;
    const draw = rng.fork("tail", direction);
    bars[at] = { part: "E", cell: endCell(draw, bars[at]!.cell), again: false };
    return compose(direction > 0 ? "new ending, up" : "new ending, down", bars, {
      contour: () => anchor + (direction * span) / 2,
      ending,
      given: remembered(idea, from, (pitch) => pitch, at),
    });
  };

  /**
   * The idea grown into this slot's own shape, for when the arc has moved on from where
   * the idea was stated. It opens with the idea's first bar; after that it either keeps
   * that bar's rhythm all along (`riff`) or runs on at this slot's own pace.
   */
  const grown = (
    kind: string,
    idea: Phrase,
    contour: Contour,
    keepOpening: boolean,
    riff = false,
  ): Phrase | null => {
    const first =
      idea.bars.find((bar) => bar.part === "L") ?? idea.bars.find((bar) => bar.part === "E");
    if (!first) return null;
    const end = idea.bars.find((bar) => bar.part === "E")?.cell;
    const draw = rng.fork("grown", kind);
    const letters = drawShape(draw, 2);
    const plans =
      first.part === "L"
        ? withCells(letters, draw, first.cell, end, riff)
        : withCells(letters, draw);
    const starts = plans.findIndex((plan) => plan.part === "L");
    // Moved bodily to where this slot sits, so it is the same shape higher or lower.
    const lift = Math.round((slot.centre - idea.slot.centre) / 2);
    return compose(kind, plans, {
      contour: shaped(contour),
      ending,
      ...(keepOpening && first.part === "L"
        ? {
            given: (b: number, spot: Spot) => {
              const pitch = b === starts ? first.pitches[spot.onset] : undefined;
              return pitch === undefined ? undefined : climb(spot.pool, pitch, lift);
            },
          }
        : {}),
    });
  };

  const motif = memory.motif;
  const made: (Phrase | null)[] = [];
  if (slot.peak) {
    // The climb to the top note: the idea in a rising sequence if there is one (SO-05).
    if (motif) made.push(grown("the idea, climbing", motif, "climb", false));
    made.push(statement(0), statement(1));
  } else if (role === "s" || !motif) {
    made.push(statement(0), statement(1), statement(2));
    made.push(
      memory.theme && !slot.first
        ? grown("the first idea back", memory.theme, "arch", true)
        : statement(3),
    );
  } else if (role === "r") {
    made.push(again("again", motif, (pitch) => pitch));
    // With the chord: the whole idea moved as far as the root moved, the short way (SO-33).
    const rootAt = (s: Slot) => {
      const chord = world.arrivalAt(s.bars[0]!.start)?.chord;
      return chord ? pitchClass(chord.root) : null;
    };
    const [was, now] = [rootAt(motif.slot), rootAt(slot)];
    if (was !== null && now !== null && was !== now) {
      let by = ((now - was + 17) % 12) - 5;
      const middle = (slot.low + slot.high) / 2;
      const notes = motif.bars.flatMap((bar) => bar.pitches);
      const mean = notes.reduce((sum, pitch) => sum + pitch, 0) / Math.max(1, notes.length);
      if (Math.abs(mean + by - middle) > Math.abs(mean + by - 12 - middle)) by -= 12;
      made.push(again("again, moved with the chord", motif, (pitch) => pitch + by));
    }
    made.push(tail(motif, 1));
    made.push(grown("the idea, as a riff", motif, "arch", true, true));
  } else if (role === "v") {
    const up = slot.centre >= motif.slot.centre ? 1 : -1;
    made.push(tail(motif, 1), tail(motif, -1));
    made.push(again("a step along", motif, (pitch, spot) => climb(spot.pool, pitch, up)));
    made.push(again("two steps along", motif, (pitch, spot) => climb(spot.pool, pitch, 2 * up)));
    made.push(grown("the idea, as a riff", motif, "arch", true, true));
    made.push(grown("the idea, opened out", motif, "arch", true));
  } else {
    // An answer keeps the question's rhythm and turns its line the other way (AU-36).
    const notes = motif.bars.flatMap((bar) => bar.pitches);
    const rose = (notes.at(-1) ?? 0) >= (notes[0] ?? 0);
    const turn = (kind: Contour) =>
      compose(`answer, ${kind}`, barsOf(motif, layout(motif)), { contour: shaped(kind), ending });
    made.push(turn(rose ? "fall" : "climb"), turn("arch"), turn(rose ? "wave" : "fall"));
    made.push(grown("answer, as a riff", motif, "fall", false, true));
    made.push(grown("answer, opened out", motif, "fall", false));
  }

  // And something new, whatever the form asked for, when the idea is too thin for where
  // the arc has got to (two levels busier than it was stated at): a new one at this
  // slot's own pace is better than the old one starved.
  const outgrown =
    motif !== null && solo.levels.indexOf(slot.level) - solo.levels.indexOf(motif.slot.level) >= 2;
  if (!slot.peak && role !== "s" && outgrown) made.push(statement(0), statement(1));

  // The same phrase reached two ways is one candidate.
  const seen = new Set<string>();
  const phrases = made.filter((phrase): phrase is Phrase => {
    if (!phrase?.bars.some((bar) => bar.pitches.length > 0)) return false;
    const key = phrase.bars.map((bar) => `${bar.cell}:${bar.pitches.join(",")}`).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const fallback = phrases.length > 0 ? phrases : [statement(9)];
  return fallback.map((phrase) => withPickup(world, phrase, memory, rng));
}

/**
 * A line that starts on a downbeat after a breath may be led in from the beat
 * before (SO-36). Whether it is, and with which figure, is one decision for
 * that bar of the slot. Into the phrase's first bar it needs an eighth of
 * silence after the phrase before, and it never crosses into a chorus from
 * outside it (SO-37).
 */
/** A note that says another chord, where it would be heard as more than passing: on a beat or held. */
const wrong = (spot: Spot, pitch: number): boolean =>
  ((spot.tick - spot.bar.start) % PPQ === 0 || spot.hold > EIGHTH) && onlyPasses(spot.pool, pitch);

function withPickup(world: World, phrase: Phrase, memory: Memory, rng: Rng): Phrase {
  const { solo, plan } = world;
  const habit = solo.habits.pickup;
  if (habit.figures.length === 0) return phrase;
  // An eighth of silence after the phrase before (SO-37), and never less than the breath
  // every phrase is owed (Q-47): at a fast tempo an eighth is no air at all, and a pickup
  // that fills the breath runs two phrases together. A horn needs its own breath too.
  const breath =
    Math.max(solo.space.breath, world.instrument.breath?.takes ?? 0) * world.ticksPerSecond;
  const { slot } = phrase;
  const leads: Placed[] = [];

  phrase.bars.forEach((opening, at) => {
    const bar = slot.bars[at]!;
    const first = opening.pitches[0];
    const afterBreath = at === 0 || phrase.bars[at - 1]!.part === "R";
    if (!afterBreath || first === undefined || cells(opening.cell)[0] !== "x") return;
    const draw = rng.fork("pickup", at);
    if (!draw.chance(habit.chance)) return;
    const before = at === 0 ? plan.bars[bar.index - 1] : slot.bars[at - 1];
    if (before?.kind !== "music" || before.solo?.chorus !== bar.solo?.chorus) return;

    const figure = draw.fork("figure").weighted(habit.figures, (f) => f.weight);
    const steps = Math.round(before.ticks / STEP);
    const cell = ".".repeat(Math.max(0, steps - cells(figure.beat).length)) + figure.beat;
    const spots = spotsOf(world, before, cell);
    if (spots.length === 0) return;
    if (at === 0 && spots[0]!.tick - memory.restEnds < Math.max(EIGHTH, breath)) return;
    // Walked in by the ladder from one side, the last note a rung away (SO-36).
    const side = draw.fork("side").chance(habit.rising) ? -1 : 1;
    const walk = (direction: number): Placed[] =>
      spots.map((spot, i) => {
        const pitch = climb(spot.pool, first, direction * (spots.length - i));
        const further = climb(spot.pool, first, direction * (spots.length - i + 1));
        const beat = (spot.tick - spot.bar.start) % PPQ === 0;
        // On a change it is a chord tone like any other note; on a beat it would rather be.
        if (spot.lands && !isChordTone(spot.pool, pitch)) {
          const tone = landing(spot.pool, pitch, solo.arrive, pitch - 4, pitch + 4, [first]);
          return { spot, pitch: tone, lead: true };
        }
        const better =
          (beat && !isChordTone(spot.pool, pitch) && isChordTone(spot.pool, further)) ||
          (wrong(spot, pitch) && !wrong(spot, further));
        return { spot, pitch: better ? further : pitch, lead: true };
      });
    const inside = (notes: readonly Placed[]) =>
      notes.every(
        (note) =>
          note.pitch >= slot.low &&
          note.pitch <= slot.high &&
          note.pitch !== first &&
          !wrong(note.spot, note.pitch),
      );
    const pickup = inside(walk(side)) ? walk(side) : walk(-side);
    if (inside(pickup)) leads.push(...pickup);
  });
  if (leads.length === 0) return phrase;
  const start = slot.bars[0]!.start;
  return {
    ...phrase,
    pickup: leads.filter((note) => note.spot.tick < start),
    line: [...phrase.line, ...leads.filter((note) => note.spot.tick >= start)].sort(
      (a, b) => a.spot.tick - b.spot.tick,
    ),
  };
}
