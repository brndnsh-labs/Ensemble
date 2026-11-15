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

import { PPQ } from "../../chart/types.ts";
import { swing } from "../../perform/feel.ts";
import { cells, STEP } from "../../perform/grid.ts";
import type { Rng } from "../../rng.ts";
import type { ToneRole } from "../../theory/chord.ts";
import { pitchClass } from "../../theory/pitch.ts";
import { climb, EIGHTH, isChordTone, landing, onlyPasses } from "./harmony.ts";
import type { LineBar, Spot } from "./line.ts";
import { contourOf, settled, spotsOf, writeBends, writeLine } from "./line.ts";
import type { Slot, World } from "./slots.ts";
import type { Cell, Contour, Idea, Role, Way } from "./style.ts";
import { CONTOURS } from "./style.ts";

/** What a bar of a phrase is: a line bar, an end bar, a rest, or the final note of the take. */
export type Part = "L" | "E" | "R" | "F";

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
    const high =
      lift === 0 ? slot.high : Math.min(slot.top - solo.arc.peak.clear, slot.high + lift);
    const low = lift === 0 ? slot.low : Math.min(slot.low + lift, high - 12);
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
    return { kind, slot, bars: written, line, pickup: [], fresh };
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
    const at = solo.levels.indexOf(slot.level);
    const roomier = !slot.peak && at > 0 && draw.fork("room").chance(solo.space.roomier);
    const shapes = slot.peak
      ? [{ weight: 1, bars: peak.shape }]
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
      const cell: Cell =
        first && opening ? opening : before === null ? a : riff ? before : before === a ? b : a;
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
  const outgrown =
    motif !== null &&
    (solo.levels.indexOf(slot.level) - solo.levels.indexOf(motif.slot.level) >= levels ||
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
  const fallback =
    phrases.length > 0
      ? phrases
      : [statement({ name: "statement", make: "new", oneRhythm: true }, 9)];
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
  const { perRank, reach } = solo.landing;
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
    // Its last note may be the line's own approach: the half step under the first note,
    // short and off the beat (SO-36).
    const leans = habit.approach && draw.fork("approach").chance(solo.habits.chromatic);
    const walk = (direction: number): Placed[] => leadingOn(walked(direction));
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
          (other) => other >= slot.low && other <= slot.high,
        );
        return { ...note, pitch };
      });
    const walked = (direction: number): Placed[] =>
      spots.map((spot, i) => {
        const pitch = climb(spot.pool, first, direction * (spots.length - i));
        const further = climb(spot.pool, first, direction * (spots.length - i + 1));
        const beat = (spot.tick - spot.bar.start) % PPQ === 0;
        if (leans && i === spots.length - 1 && !beat && spot.hold <= EIGHTH && !spot.lands) {
          return { spot, pitch: first - 1, lead: true };
        }
        // On a change it is a chord tone like any other note; on a beat it would rather be.
        if (spot.lands && !isChordTone(spot.pool, pitch)) {
          const tone = landing(
            spot.pool,
            pitch,
            solo.arrive,
            perRank,
            pitch - reach,
            pitch + reach,
            [first],
          );
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

/** The tones a tune comes home to, in the order a style rests on them: its root, 3rd and 5th. */
const HOME: readonly ToneRole[] = ["third", "root", "fifth"];
function home(settle: readonly ToneRole[]): readonly ToneRole[] {
  const kept = settle.filter((role) => HOME.includes(role));
  return kept.length > 0 ? kept : HOME;
}
