// The phrases a soloist might play in a slot. What the slot is for comes from
// the chorus's form: state an idea, say it again, say it changed, answer it,
// set something else beside it, bring it back. Each of those can be done
// several ways, and each way is one candidate, written whole. Which ways are
// offered for which is the style's book; how each is made is here.
//
// What is remembered from one phrase to the next is what a soloist carries:
// the idea being worked on (its rhythm, bar by bar, and its pitches), the
// first idea of the solo, the idea this chorus opened on, the note the last
// phrase came to rest on, and whether it ended with a bar of air.

import { swing } from "../../perform/feel.ts";
import { cells, STEP } from "../../perform/grid.ts";
import { isCompound, lastPulse, onPulse } from "../../perform/meter.ts";
import type { Plan, PlanBar } from "../../plan/types.ts";
import type { Rng } from "../../rng.ts";
import type { ToneRole } from "../../theory/chord.ts";
import { pitchClass } from "../../theory/pitch.ts";
import { climb, EIGHTH, isChordTone, landing, onlyPasses } from "./harmony.ts";
import type { LineBar, Spot } from "./line.ts";
import { contourOf, settled, spotsOf, writeBends, writeLine } from "./line.ts";
import type { Part, Slot, World } from "./slots.ts";
import { breathed, fitShape, levelIndex, lungsOf, soloIn } from "./slots.ts";
import type { Cell, Contour, Idea, Role, Way } from "./style.ts";
import { CONTOURS } from "./style.ts";

export type { Part } from "./slots.ts";

export interface PhraseBar {
  readonly part: Part;
  readonly cell: Cell;
  /** Plays the bar before it again: moved along the line, or note for note. */
  readonly again: boolean;
  /** Says its first note several times before the line moves on (SO-35). */
  readonly stab: boolean;
  /**
   * Its downbeat is not struck: the last eighth of the bar before is held over
   * the barline into it (SO-38).
   */
  readonly tied: boolean;
  /** A pitch for each attack of the cell, in order: for a tied bar, the first is the note held into it. */
  readonly pitches: readonly number[];
  /** For each of those, the semitones under it a string was pushed up from, or 0 for a note played plain. */
  readonly bends: readonly number[];
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
  /** New material: made from nothing remembered. */
  readonly fresh: boolean;
  /** A phrase the hand gets lyrical in (KF-B-10): it may bend, and slide. */
  readonly lyrical: boolean;
}

export interface Placed {
  readonly spot: Spot;
  readonly pitch: number;
  /** A note of a pickup: it leads into the line, and is not part of the idea. */
  readonly lead?: boolean;
  /** Semitones under the note that a string is struck at and pushed up from (SO-53). */
  readonly bend?: number;
}

export interface Memory {
  /** The idea being worked on: the last statement played. */
  readonly motif: Phrase | null;
  /** The first idea of the solo. */
  readonly theme: Phrase | null;
  /** The phrase this chorus opened on. */
  readonly opening: Phrase | null;
  /** The last pitch played, where the phrase before came to rest. */
  readonly rest: number | null;
  /** The highest note of the solo so far. */
  readonly highest: number;
  /** Where the last note stops sounding. */
  readonly restEnds: number;
  /** The phrase before ended on an empty bar. */
  readonly endedEmpty: boolean;
}

type BarPlan = Omit<PhraseBar, "pitches" | "bends">;
const PLAIN = { again: false, stab: false, tied: false };
const REST: BarPlan = { part: "R", cell: "", ...PLAIN };
const playing = (bar: { part: Part }) => bar.part !== "R";

/** A bar's spots, and whether the bar before was in fact tied into it. */
interface LaidBar extends LineBar {
  readonly tied: boolean;
}

/** The spots of a phrase's bars in a slot, bar by bar. */
function lineBars(world: World, slot: Slot, bars: readonly BarPlan[]): LaidBar[] {
  const breath = Math.ceil(
    Math.max(world.solo.space.breath, world.instrument.breath?.takes ?? 0) * world.ticksPerSecond,
  );
  const laid = slot.bars.map((bar, i): LaidBar => {
    const plan = bars[i] ?? REST;
    if (plan.part === "R") return { spots: [], ...PLAIN };
    if (plan.part === "F") {
      // The last bar of a take that ends: one note where the final chord lands (SO-19, SO-59).
      const tick = bar.start + (bar.ending?.at ?? 0);
      const hold = bar.ending?.ring ?? bar.ticks;
      const pool = world.poolOf(world.arrivalAt(tick));
      return {
        spots: pool ? [{ bar, tick, hold, onset: 0, pool, lands: true }] : [],
        ...PLAIN,
      };
    }
    const spots = spotsOf(world, bar, plan.cell);
    // An end bar lands with room for an eighth and the breath after it. Where the bar is
    // shorter than the rhythm was written for (three in a bar), or the tempo makes the
    // breath most of a bar, its later notes are not struck: the one before is the landing.
    // The room is judged as heard: swing carries the end of an eighth on the beat later.
    if (plan.part === "E") {
      const bend = (at: number) => (bar.meter.unit === 4 ? swing(at, world.feel) : at);
      const room = (spot: Spot) => bend(bar.ticks) - bend(spot.tick - bar.start + EIGHTH);
      while (spots.length > 1 && room(spots.at(-1)!) < breath) spots.pop();
      // A bar of dotted pulses shorter than the rhythm (a 4/4 ending in six-eight) would strike
      // in its last pulse, which belongs to the next phrase where the phrase ends with the bar,
      // as a written ending never does.
      const last = bar.ticks - lastPulse(bar.meter);
      if (isCompound(bar.meter) && i === slot.bars.length - 1)
        while (spots.length > 1 && spots.at(-1)!.tick - bar.start >= last) spots.pop();
    }
    return { spots, again: plan.again, stab: plan.stab, tied: false };
  });
  // A tie over the barline: the last eighth of one bar and the downbeat of the next are
  // one note, struck early and belonging to the downbeat's chord (SO-38, X-B-07). It
  // needs both notes to be there; an idea come back in another place may have lost one.
  bars.forEach((plan, b) => {
    const [before, here, bar] = [laid[b - 1], laid[b], slot.bars[b - 1]];
    if (!plan.tied || !before || !here || !bar) return;
    const [from, into] = [before.spots.at(-1), here.spots[0]];
    if (!from || from.tick !== bar.start + bar.ticks - EIGHTH || from.hold < EIGHTH) return;
    if (into?.onset !== 0 || into.tick !== bar.start + bar.ticks) return;
    const hold = from.hold + into.hold;
    const pool = world.poolFor(from.tick, hold).pool ?? from.pool;
    laid[b - 1] = {
      ...before,
      spots: [...before.spots.slice(0, -1), { ...from, hold, pool, lands: true }],
    };
    laid[b] = { ...here, spots: here.spots.slice(1), tied: true };
  });
  return laid;
}

interface Ask {
  readonly contour: (through: number) => number;
  readonly ending: readonly ToneRole[];
  /** Semitones the phrase's room is raised with its contour. */
  readonly lift?: number;
  /** A remembered pitch for a spot of a bar, where the phrase keeps one. */
  readonly given?: (bar: number, spot: Spot) => number | undefined;
  /** Whether that note was bent into when it was last said: it is said the same way again. */
  readonly bent?: (bar: number, spot: Spot) => boolean | undefined;
}

export function phrasesFor(
  world: World,
  slot: Slot,
  role: Role,
  memory: Memory,
  rng: Rng,
  /** The note a pickup made by the pass before leads to: the phrase opens on it, on the one. */
  led: number | null = null,
): Phrase[] {
  const { instrument } = world;
  // The rhythms are those written for the phrase's meter, where the style has written any.
  const solo = soloIn(world.solo, slot.bars[0]!.meter);
  const length = slot.bars.length;
  const final = slot.bars[length - 1]!.ending !== null;
  const lungs = lungsOf(solo, instrument, slot, world.ticksPerSecond);
  // The empty bars a phrase may leave; the first of a solo one more, unless the soloist
  // has been asked to give up a tenth of its room or more (SO-10): two empty bars are
  // seven seconds at a slow tempo, and the solo has hardly begun.
  const emptyAllowed = solo.space.emptyBars + (slot.first && slot.room < 0.1 ? 1 : 0);

  // Where the hand gets lyrical, and bends: the phrase that climbs to the top note and the
  // ones beside it, always; any other phrase as often as the style says. The rest are the
  // space around those (KF-B-10). One decision for the phrase, whichever way it is made.
  // How far the top note's phrase is comes from where this phrase stands in its solo, not
  // from looking for it: a jam told to finish early has played the same notes up to then.
  const { around, elsewhere } = solo.habits.bend;
  const peakIndex = Math.max(0, slot.count - 1 - solo.arc.peak.fromEnd);
  const fromPeak = (slot.of - 1 - slot.chorus) * slot.count + peakIndex - slot.index;
  const lyrical = Math.abs(fromPeak) <= around || rng.fork("lyrical").chance(elsewhere);

  const compose = (kind: string, plans: readonly BarPlan[], ask: Ask, fresh = false): Phrase => {
    const bars = slot.bars.map((_, i) => plans[i] ?? REST);
    if (final) bars[length - 1] = { part: "F", cell: "", ...PLAIN };
    const lines = lineBars(world, slot, bars);
    // A lifted phrase takes its room with it, and still leaves the top note alone.
    const lift = ask.lift ?? 0;
    const raised =
      lift === 0 ? slot.high : Math.min(slot.top - solo.arc.peak.clear, slot.high + lift);
    const lowered = lift === 0 ? slot.low : Math.min(slot.low + lift, raised - 12);
    // Led into, the phrase reaches the note it was led to.
    const high = led === null ? raised : Math.max(raised, led);
    const low = led === null ? lowered : Math.min(lowered, led);
    const given = new Map<number, number>();
    const bent = new Map<number, boolean>();
    let at = 0;
    lines.forEach((line, b) => {
      for (const spot of line.spots) {
        const pitch = ask.given?.(b, spot);
        if (pitch !== undefined) given.set(at, pitch);
        const was = ask.bent?.(b, spot);
        if (was !== undefined) bent.set(at, was);
        at++;
      }
    });
    if (led !== null && lines[0]?.spots[0]?.tick === slot.bars[0]!.start) given.set(0, led);
    const pitches = writeLine(world, lines, {
      low,
      high,
      contour: ask.contour,
      // The last note of the take rests, whatever the phrase was for, and comes home: a
      // phrase may float on a colour (ST-neosoul-29), the tune ends on its root, 3rd or 5th.
      ending: final ? home(solo.settle) : ask.ending,
      final,
      from: memory.rest,
      notOn: memory.rest,
      // The climb ends on the solo's one top note (SO-05), unless its last note is the
      // tune's: a tune comes to rest, it does not stop on the top.
      climbsTo: slot.peak && !final ? { to: slot.top, above: memory.highest } : null,
      given,
      // The way up to the top note moves, whatever the style's riffs do.
      riffs: slot.peak ? "sequence" : solo.habits.riffIs,
      rng: rng.fork("habits"),
    });
    const bends = writeBends(world, lines, pitches, {
      lyrical,
      top: slot.peak && !final,
      given: bent,
      rng: rng.fork("habits"),
    });
    at = 0;
    const struck = lines.map((bar) => bar.spots.map(() => at++));
    // A bar tied into keeps the note held into it as its first: the idea come back
    // without the tie strikes that note on the downbeat.
    const attacks = (b: number) =>
      lines[b]!.tied ? [struck[b - 1]!.at(-1)!, ...struck[b]!] : struck[b]!;
    const written = bars.map((bar, b) => ({
      ...bar,
      tied: lines[b]!.tied,
      pitches: attacks(b).map((i) => pitches[i]!),
      bends: attacks(b).map((i) => bends[i]!),
    }));
    const line = lines
      .flatMap((bar) => bar.spots)
      .map(
        (spot, i): Placed => ({
          spot,
          pitch: pitches[i]!,
          ...(bends[i]! > 0 ? { bend: bends[i]! } : {}),
        }),
      );
    return { kind, slot, bars: written, line, pickup: [], fresh, lyrical };
  };

  // An answer comes to rest, and so does the last phrase of a solo; anything else is
  // left open for what follows.
  const ending = role === "a" || slot.last ? solo.settle : solo.hang;
  const span = slot.level.span;
  const { peak, windDown } = solo.arc;
  // The way up to the top note; but a solo of one phrase that is also where the tune ends
  // comes to rest instead, as a last phrase does.
  const shaped = (kind: Contour, lift = 0) =>
    slot.peak && !final
      ? contourOf(peak.contour, slot.top - peak.clear - span / 2, span)
      : contourOf(slot.last || slot.peak ? windDown.contour : kind, slot.centre + lift, span);
  const endCell = (draw: Rng, not?: Cell) => {
    const others = solo.endings.filter((cell) => cell !== not);
    return draw.pick(others.length > 0 ? others : solo.endings);
  };

  /** A shape for this slot that leaves no more air than the style allows (SO-10). */
  const drawShape = (draw: Rng, lines = 1): Part[] => {
    const at = levelIndex(solo, slot.level);
    // A soloist asked to be busier gives up some of its room: a roomier shape less
    // often, and a shape with bars of rest or a landing inside it less often for each.
    const roomier =
      !slot.peak && at > 0 && draw.fork("room").chance(solo.space.roomier * (1 - slot.room));
    const shapes = slot.peak
      ? [{ weight: 1, bars: peak.shape }]
      : solo.levels[roomier ? at - 1 : at]!.shapes;
    const count = (bars: string, part: Part) =>
      cells(bars).filter((letter) => letter === part).length;
    const allowed = (letters: readonly Part[]) => {
      const empty = letters.filter((letter) => letter === "R").length;
      const run = Math.max(
        ...letters
          .join("")
          .split(/[^L]/)
          .map((line) => line.length),
      );
      return (
        empty <= emptyAllowed &&
        !(memory.endedEmpty && letters[0] === "R") &&
        // Led into from the pass before, it opens with a line on the one.
        (led === null || letters[0] === "L") &&
        run <= lungs &&
        (!final || letters[length - 1] === "E")
      );
    };
    const fitted = shapes
      .map((shape) => ({
        // Less room: fewer bars of rest, and fewer landings inside the phrase (a call and
        // its answer is two phrases' worth of ending in one), at half the rate.
        weight:
          shape.weight *
          (1 - slot.room) ** count(shape.bars, "R") *
          (1 - slot.room / 2) ** Math.max(0, count(shape.bars, "E") - 1),
        letters: fitShape(shape.bars, length),
      }))
      .filter((shape) => shape.weight > 0 && allowed(shape.letters));
    // An idea being opened out wants more than one bar of line to open out into.
    const roomy = fitted.filter(
      (shape) => shape.letters.filter((letter) => letter === "L").length >= lines,
    );
    const options = roomy.length > 0 ? roomy : fitted;
    if (options.length > 0) return draw.fork("shape").weighted(options, (s) => s.weight).letters;
    // Nothing fits: as many line bars as one breath carries and an end bar, over and over.
    return breathed(length, lungs);
  };

  /**
   * A shape's bars with their rhythms: one cell for the line, coming back as a riff or
   * giving way to a second. An `opening` is an older idea's first bar: the phrase starts
   * with it and then runs on in this slot's own rhythms. Cells in `apart` are passed
   * over while the level has others: something else is in another rhythm.
   */
  const withCells = (
    letters: readonly Part[],
    draw: Rng,
    opening?: Cell,
    end?: Cell,
    oneRhythm = false,
    apart: readonly Cell[] = [],
  ): BarPlan[] => {
    const unused = slot.level.cells.filter((cell) => !apart.includes(cell));
    const own = unused.length > 0 ? unused : slot.level.cells;
    const a = draw.fork("cell").pick(own);
    const others = own.filter((cell) => cell !== a);
    const b = others.length > 0 ? draw.fork("other").pick(others) : a;
    const last = slot.peak ? peak.ending : (end ?? endCell(draw.fork("end")));
    const { stab, tie } = solo.habits;
    let before: Cell | null = null;
    let lines = 0;
    const plans = letters.map((part, i): BarPlan => {
      if (part !== "L") {
        before = null;
        return { part, cell: part === "E" ? last : "", ...PLAIN };
      }
      const first = lines++ === 0;
      // The way up to the top note may be one bar in a rising sequence (SO-05).
      const riff =
        before !== null &&
        ((slot.peak && peak.sequence) ||
          oneRhythm ||
          draw.fork("riff", i).chance(solo.habits.riff));
      // Led into from the pass before, its first bar opens on the one.
      const opensOnOne = own.filter((cell) => cells(cell)[0] === "x");
      const cell: Cell =
        led !== null && i === 0 && opensOnOne.length > 0 && cells(a)[0] !== "x"
          ? draw.fork("opens").pick(opensOnOne)
          : first && opening
            ? opening
            : before === null
              ? a
              : riff
                ? before
                : before === a
                  ? b
                  : a;
      // Stabbed or not is decided once for a figure, so every bar that plays it agrees.
      const plan = {
        part,
        cell,
        again: riff,
        stab: stab > 0 && draw.fork("stab", cell).chance(stab),
        tied: false,
      };
      before = cell;
      return plan;
    });
    // A line bar whose last eighth runs straight into a struck downbeat may be tied over
    // the barline: never into a riff bar, which says its own downbeat (SO-38).
    return plans.map((plan, i) => {
      const from = plans[i - 1];
      const steps = Math.round((slot.bars[i - 1]?.ticks ?? 0) / STEP);
      const run = cells(from?.cell ?? "");
      const ties =
        tie > 0 &&
        from?.part === "L" &&
        (plan.part === "L" || plan.part === "E") &&
        !plan.again &&
        cells(plan.cell)[0] === "x" &&
        run[steps - 2] === "x" &&
        run[steps - 1] === "-" &&
        draw.fork("tie", i).chance(tie);
      return ties ? { ...plan, tied: true } : plan;
    });
  };

  // ── the ways of making a phrase ──────────────────────────────────────────
  const motif = memory.motif;
  /** Something new. Each new statement in a list has its own draws, by its number there. */
  const statement = (way: Extract<Way, { make: "new" }>, n: number): Phrase => {
    const draw = rng.fork("statement", n);
    const contour = draw.fork("contour").weighted(CONTOURS, (kind) => solo.contours[kind]);
    const apart = way.apart && motif ? motif.bars.map((bar) => bar.cell) : [];
    // One that keeps to one rhythm all along its line is a riff or a sequence; the others
    // riff as often as the style's habit says, and the critic hears the difference.
    const plans = withCells(drawShape(draw), draw, undefined, undefined, way.oneRhythm, apart);
    const lift = way.lift ?? 0;
    return compose(way.name, plans, { contour: shaped(contour, lift), ending, lift }, true);
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
    while (echo >= 0 && from.filter(rests).length > emptyAllowed)
      from[from.findLastIndex(rests)] = echo;
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

  /** Whether each note of an idea was bent into, for the same bars of it. */
  const rememberedBends =
    (idea: Phrase, from: readonly number[], upTo = from.length) =>
    (b: number, spot: Spot) => {
      const bend = b < upTo ? idea.bars[from[b] ?? -1]?.bends[spot.onset] : undefined;
      return bend === undefined ? undefined : bend > 0;
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
      bent: rememberedBends(idea, from),
    });
  };

  /** The idea with a new last bar, coming to rest above or below where it did. */
  const tail = (kind: string, idea: Phrase, direction: 1 | -1): Phrase | null => {
    const from = layout(idea);
    const bars = barsOf(idea, from);
    const at = bars.findLastIndex(playing);
    const kept = from.slice(0, at).flatMap((i) => idea.bars[i]?.pitches ?? []);
    const anchor = kept.at(-1) ?? idea.bars[from[at] ?? -1]?.pitches[0];
    if (at < 0 || anchor === undefined) return null;
    const draw = rng.fork("tail", direction);
    bars[at] = { part: "E", cell: endCell(draw, bars[at]!.cell), ...PLAIN };
    return compose(kind, bars, {
      contour: () => anchor + (direction * span) / 2,
      ending,
      given: remembered(idea, from, (pitch) => pitch, at),
      bent: rememberedBends(idea, from, at),
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
            bent: (b: number, spot: Spot) => {
              const bend = b === starts ? first.bends[spot.onset] : undefined;
              return bend === undefined ? undefined : bend > 0;
            },
          }
        : {}),
    });
  };

  const ideaOf = (which: Idea | undefined): Phrase | null =>
    which === "first" ? memory.theme : which === "opening" ? memory.opening : motif;

  /** One way from the style's book, as a phrase. Null where it cannot be made here. */
  const made = (way: Way, n: number): Phrase | null => {
    if (way.make === "new") return statement(way, n);
    const idea = ideaOf(way.of);
    if (!idea) return null;
    switch (way.make) {
      case "again": {
        if (way.by === 0) return again(way.name, idea, (pitch) => pitch);
        if (way.by !== "chord") {
          // Along the way the arc is going: up while the solo is climbing.
          const rungs = way.by * (slot.centre >= idea.slot.centre ? 1 : -1);
          return again(way.name, idea, (pitch, spot) => climb(spot.pool, pitch, rungs));
        }
        // With the chord: the whole idea moved as far as the root moved, the short way (SO-33).
        const rootAt = (s: Slot) => {
          const chord = world.arrivalAt(s.bars[0]!.start)?.chord;
          return chord ? pitchClass(chord.root) : null;
        };
        const [was, now] = [rootAt(idea.slot), rootAt(slot)];
        if (was === null || now === null || was === now) return null;
        let by = ((now - was + 17) % 12) - 5;
        const middle = (slot.low + slot.high) / 2;
        const notes = idea.bars.flatMap((bar) => bar.pitches);
        const mean = notes.reduce((sum, pitch) => sum + pitch, 0) / Math.max(1, notes.length);
        if (Math.abs(mean + by - middle) > Math.abs(mean + by - 12 - middle)) by -= 12;
        return again(way.name, idea, (pitch) => pitch + by);
      }
      case "ending":
        return tail(way.name, idea, way.direction);
      case "grown":
        return grown(way.name, idea, way.contour, way.keepOpening, way.oneRhythm);
      case "turned": {
        // The idea's rhythm, with its line turned by where the idea went (AU-36).
        const notes = idea.bars.flatMap((bar) => bar.pitches);
        const rose = (notes.at(-1) ?? 0) >= (notes[0] ?? 0);
        const kind =
          typeof way.contour === "string" ? way.contour : way.contour[rose ? "rose" : "fell"];
        const plans = barsOf(idea, layout(idea));
        return compose(`${way.name}, ${kind}`, plans, { contour: shaped(kind), ending });
      }
    }
  };
  const offer = (ways: readonly Way[]): (Phrase | null)[] => {
    let fresh = 0;
    return ways.map((way) => made(way, way.make === "new" ? fresh++ : 0));
  };

  // The top note's phrase has its own ways, whatever the form asked for; a solo's first
  // phrase has nothing to work on yet; anything else is what the form's letter offers.
  // With no idea in hand (a solo that opened on its top note), the next phrase states one.
  const { book } = solo;
  const ways = slot.peak
    ? book.peak
    : memory.theme === null
      ? book.opening
      : (book.roles[motif ? role : "s"] ?? []);
  const all = offer(ways);
  // And something new, whatever the form asked for, when the idea is too thin for where
  // the arc has got to: a new one at this slot's own pace is better than the old one starved.
  const { levels, thin } = book.outgrown;
  const played = motif ? motif.line.length / motif.slot.bars.length : 0;
  // How far behind is read against what the arc asked where the idea was stated, before any
  // lift: an idea from a phrase lifted to be busier is still outgrown where the arc has moved
  // on as far from where it was; and a phrase lifted has outgrown an idea from any sparser
  // level, since what it was lifted for is not to be spent at the old pace.
  const at = levelIndex(solo, slot.level);
  const behind = motif ? at - levelIndex(solo, motif.slot.asked) : 0;
  const lifted = at > levelIndex(solo, slot.asked);
  const outgrown =
    motif !== null &&
    (behind >= levels ||
      (lifted && at > levelIndex(solo, motif.slot.level)) ||
      (thin !== undefined && played < thin * slot.level.notesPerBar));
  if (!slot.peak && outgrown && !ways.some((way) => way.make === "new")) {
    all.push(...offer(book.outgrown.ways));
  }

  // The same phrase reached two ways is one candidate.
  const seen = new Set<string>();
  const phrases = all.filter((phrase): phrase is Phrase => {
    if (!phrase?.bars.some((bar) => bar.pitches.length > 0)) return false;
    const key = phrase.bars
      .map((bar) => `${bar.tied ? "~" : ""}${bar.cell}:${bar.pitches.join(",")}`)
      .join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Led into from the pass before, only a phrase that opens on the note it was led to will do.
  const honours = (phrase: Phrase) =>
    led === null ||
    (phrase.line[0]?.spot.tick === slot.bars[0]!.start && phrase.line[0]?.pitch === led);
  const kept = phrases.filter(honours);
  const fallback =
    kept.length > 0 ? kept : [statement({ name: "statement", make: "new", oneRhythm: true }, 9)];
  return fallback.map((phrase) =>
    withPickup(world, phrase, memory, rng, opensPass(world.plan, slot.bars[0]!)),
  );
}

/** A note that says another chord, where it would be heard as more than passing: on a beat or held. */
const wrong = (spot: Spot, pitch: number): boolean =>
  (onPulse(spot.bar.meter, spot.tick - spot.bar.start) || spot.hold > EIGHTH) &&
  onlyPasses(spot.pool, pitch);

/** A note heard as part of the harmony: on a beat, held, or struck where a chord arrives. */
const heard = (spot: Spot): boolean =>
  onPulse(spot.bar.meter, spot.tick - spot.bar.start) || spot.hold > EIGHTH || spot.lands;

/** Where a tick on the straight grid is heard, once the band's swing has bent its bar. */
function heardAt(world: World, tick: number): number {
  const bar = world.plan.bars.findLast((candidate) => candidate.start <= tick);
  if (bar?.meter.unit !== 4 || tick >= bar.start + bar.ticks) return tick;
  return bar.start + swing(tick - bar.start, world.feel);
}

/** Whether the band plays a bar: music, not the ending, and some seat besides the soloist in it. */
const bandPlays = (bar: PlanBar | undefined): bar is PlanBar =>
  bar?.kind === "music" &&
  bar.ending === null &&
  Object.entries(bar.seats).some(([seat, level]) => seat !== "solo" && level !== null);

/** The air a pickup leaves after the phrase before, in ticks: SO-37's eighth, and never less than the breath every phrase is owed (Q-47); a horn needs its own breath too. */
function breathOf(world: World): number {
  return Math.max(
    EIGHTH,
    Math.max(world.solo.space.breath, world.instrument.breath?.takes ?? 0) * world.ticksPerSecond,
  );
}

/** Where a pickup goes into a bar, and what it has to work with. */
interface Into {
  /** The bar the line is led into, and the bar the pickup is played in. */
  readonly bar: PlanBar;
  readonly before: PlanBar;
  /** The line's first note, on the bar's downbeat. */
  readonly first: number;
  /** Where the last note before the pickup stops sounding. */
  readonly air: number;
  /** The register it keeps to. */
  readonly low: number;
  readonly high: number;
  /** The level the line is at, for the figures written for one. */
  readonly level: string | null;
}

/**
 * Notes led into a bar's first note from the end of the bar before (SO-36), or
 * null where none is drawn or none will go. The figure is drawn from those
 * written for the level that fit in half the bar before; where it will not go
 * (too little air after the phrase before, a chord it cannot spell, the
 * instrument's reach) each shorter one is tried, longest first, before none.
 */
function leadIn(world: World, into: Into, draw: Rng): Placed[] | null {
  const { bar, before, first } = into;
  if (!bandPlays(before) || before.start + before.ticks !== bar.start) return null;
  // The figures are the ones written for the bar the pickup is played in.
  const solo = soloIn(world.solo, before.meter);
  const habit = solo.habits.pickup;
  const { perRank, reach } = solo.landing;
  const steps = Math.round(before.ticks / STEP);
  const length = (cell: string) => cells(cell).length;
  const figures = habit.figures.filter(
    (figure) =>
      (figure.levels === undefined ||
        (into.level !== null && figure.levels.includes(into.level))) &&
      length(figure.cell) * 2 <= steps,
  );
  if (figures.length === 0 || !draw.chance(habit.chance)) return null;
  const drawn = draw.fork("figure").weighted(figures, (f) => f.weight);
  // The one drawn, then each shorter, longest first.
  const tries = [
    drawn,
    ...figures
      .filter((figure) => length(figure.cell) < length(drawn.cell))
      .sort((a, b) => length(b.cell) - length(a.cell)),
  ];
  // Walked in by the ladder from one side, the last note a rung away (SO-36).
  const side = draw.fork("side").chance(habit.rising) ? -1 : 1;
  // Its last note may be the line's own approach: the half step under the first note,
  // short and off the beat (SO-36).
  const leans = habit.approach && draw.fork("approach").chance(solo.habits.chromatic);
  const breath = breathOf(world);
  const within = (pitch: number) => pitch >= into.low && pitch <= into.high;

  for (const figure of tries) {
    const cell = ".".repeat(steps - length(figure.cell)) + figure.cell;
    const spots = spotsOf(world, before, cell);
    // Every note of it is struck, or none: a figure with a hole under N.C. is not the figure.
    if (spots.length === 0 || spots.length !== cells(cell).filter((c) => c === "x").length) {
      continue;
    }
    // It lives in the air the phrase before left, and leaves that air its breath, as heard:
    // swing carries a note's end on an "and" later, and a breath on paper may not be one.
    if (heardAt(world, spots[0]!.tick) - heardAt(world, into.air) < breath) continue;
    // A tone from outside the chord's scale leads to the note a half step on, here as in
    // the line: the phrase's first note, for the last of the pickup.
    const leadingOn = (notes: readonly Placed[]): Placed[] =>
      notes.map((note, i) => {
        const next = notes[i + 1];
        const pitch = settled(
          note.spot,
          note.pitch,
          notes[i - 1]?.pitch,
          next ? { tick: next.spot.tick, pitch: next.pitch } : { tick: bar.start, pitch: first },
          within,
        );
        return { ...note, pitch };
      });
    // Walked back from the first note, a rung at a time, each note a rung on from the one
    // after it: from one side, its last note a rung from the first (SO-36).
    const walked = (direction: number): Placed[] => {
      const notes: Placed[] = [];
      let from = first;
      for (let i = spots.length - 1; i >= 0; i--) {
        const spot = spots[i]!;
        const beat = onPulse(spot.bar.meter, spot.tick - spot.bar.start);
        let pitch = climb(spot.pool, from, direction);
        if (leans && i === spots.length - 1 && !beat && spot.hold <= EIGHTH && !spot.lands) {
          pitch = first - 1;
        } else if (heard(spot) && !isChordTone(spot.pool, pitch)) {
          // A note heard as harmony (on a beat, held, or on a change) is a tone of the chord
          // it is played over, which is the bar before's: the next rung out where that is
          // one, or the nearest tone of the chord.
          const further = climb(spot.pool, from, 2 * direction);
          pitch = isChordTone(spot.pool, further)
            ? further
            : landing(spot.pool, pitch, solo.arrive, perRank, pitch - reach, pitch + reach, [
                first,
                from,
              ]);
        } else if (wrong(spot, pitch)) {
          const further = climb(spot.pool, from, 2 * direction);
          if (!wrong(spot, further)) pitch = further;
        }
        notes.unshift({ spot, pitch, lead: true });
        from = pitch;
      }
      return notes;
    };
    const walk = (direction: number): Placed[] => leadingOn(walked(direction));
    const inside = (notes: readonly Placed[]) =>
      notes.every(
        (note) =>
          within(note.pitch) &&
          note.pitch !== first &&
          !wrong(note.spot, note.pitch) &&
          (!heard(note.spot) || isChordTone(note.spot.pool, note.pitch)),
      ) &&
      // Into the line from one side: its last note a step or a third from the first.
      Math.abs(notes.at(-1)!.pitch - first) <= 4;
    const there = walk(side);
    const pickup = inside(there) ? there : walk(-side);
    if (inside(pickup)) return pickup;
  }
  return null;
}

/**
 * A line that starts on a downbeat after a breath may be led in from the bar
 * before (SO-36). Whether it is is one decision for that bar of the slot.
 *
 * Where it may live (SO-37, restated): only in the breath the phrase before
 * left, never shortening it; inside a solo, in a bar of rest; into a chorus's
 * first phrase or the solo's own, in the bar before it wherever the band is
 * playing it (the band's own last bar, the soloist's chorus before, the
 * turnaround). Never in a count-in, a bar the whole band rests, or an ending.
 * Into the first bar of a pass from the pass before, the pickup is that pass's
 * to play and is made before the phrase it leads into (`passPickup`): here it
 * is not drawn again.
 */
function withPickup(world: World, phrase: Phrase, memory: Memory, rng: Rng, led: boolean): Phrase {
  const { plan } = world;
  const { slot } = phrase;
  const leads: Placed[] = [];
  phrase.bars.forEach((opening, at) => {
    if (at === 0 && led) return;
    const bar = slot.bars[at]!;
    const first = opening.pitches[0];
    const afterBreath = at === 0 || phrase.bars[at - 1]!.part === "R";
    if (!afterBreath || first === undefined || cells(opening.cell)[0] !== "x") return;
    const before = at === 0 ? plan.bars[bar.index - 1] : slot.bars[at - 1];
    if (!before) return;
    const pickup = leadIn(
      world,
      {
        bar,
        before,
        first,
        air: at === 0 ? memory.restEnds : before.start,
        low: slot.low,
        high: slot.high,
        level: slot.level.name,
      },
      rng.fork("pickup", at),
    );
    if (pickup) leads.push(...pickup);
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

/** A pickup into the first bar of a pass, made by the pass before it, and the note it leads to. */
export interface PassPickup {
  readonly notes: readonly Placed[];
  /** The note the phrase it leads into opens on, on its downbeat. */
  readonly first: number;
}

/**
 * Whether a bar opens a pass the soloist leads into from the pass before. What
 * a pass plays may not hang on the pass after it: a jam made longer, or told
 * to finish there, plays the same up to it (the band's own rule). So a pickup
 * into the top of a pass is made from what the pass before knows: the bar it
 * is played in, the chord it leads into, where the soloist last stopped and
 * the register it was in; and the phrase that follows opens on the note it
 * leads to.
 */
export function opensPass(plan: Plan, bar: PlanBar): boolean {
  const before = plan.bars[bar.index - 1];
  return before !== undefined && before.pass !== bar.pass;
}

/**
 * The pickup into the top of a pass (`opensPass`), or null. `bar` is the
 * pass's first bar, in the plan or in its look-ahead; `previous` is the solo's
 * phrase before it, where the soloist was already playing.
 */
export function passPickup(
  world: World,
  bar: PlanBar,
  memory: Memory,
  previous: Slot | null,
  rng: Rng,
): PassPickup | null {
  const before = world.plan.bars[bar.index - 1];
  if (!before || bar.solo === null || bar.seats.solo === null || bar.ending !== null) return null;
  // The line it leads into must be able to open on the one, at whatever level it is played.
  const solo = soloIn(world.solo, bar.meter);
  const opens = solo.levels.every((level) => level.cells.some((cell) => cells(cell)[0] === "x"));
  const pool = world.poolFor(bar.start, EIGHTH).pool;
  if (!opens || !pool) return null;
  // The register of the phrase before, where the soloist was playing; otherwise a little
  // way round where a solo opens, well under its top note.
  const going = previous !== null && before.solo !== null;
  const home = world.instrument.home + world.solo.lift;
  const opening = home + (world.solo.arc.stages[0]?.register ?? 0);
  const low = going ? previous.low : Math.max(world.instrument.range[0], opening - 5);
  const high = going ? previous.high : Math.min(world.instrument.range[1], opening + 4);
  // The line opens on a tone of the chord, where a change lands, near where the soloist was.
  const near = memory.rest ?? opening;
  // The phrase it leads into opens on the one because it is led in, so a pickup is drawn as
  // often as a phrase at that level would open on the one by itself and be led into: the
  // style's chance, times the share of the level's rhythms that open on the one. A line that
  // would have started late mostly still does.
  const named = going ? previous.level.name : world.solo.arc.stages[0]?.density;
  const level = solo.levels.find((one) => one.name === named) ?? solo.levels[0]!;
  const onTheOne = level.cells.filter((cell) => cells(cell)[0] === "x").length / level.cells.length;
  if (!rng.fork("opens").chance(onTheOne)) return null;
  const { perRank } = solo.landing;
  const first = landing(pool, near, solo.arrive, perRank, low, high);
  const notes = leadIn(
    world,
    {
      bar,
      before,
      first,
      air: memory.restEnds,
      low,
      high,
      level: going ? previous.level.name : null,
    },
    rng,
  );
  return notes ? { notes, first } : null;
}

/** The tones a tune comes home to, in the order a style rests on them: its root, 3rd and 5th. */
const HOME: readonly ToneRole[] = ["third", "root", "fifth"];
function home(settle: readonly ToneRole[]): readonly ToneRole[] {
  const kept = settle.filter((role) => HOME.includes(role));
  return kept.length > 0 ? kept : HOME;
}
