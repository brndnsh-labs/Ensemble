// A part a seat wrote for one meter, made into its part for a meter it did not
// write (#2244; docs/decisions/meters.md, "every style in every meter: the
// design", section 3): which written beat each pulse of the new bar takes, how
// a pulse of another length is made from it, and the rules that keep a note
// with its length. Every seat's derived part (`players/*/derive.ts`) is built
// on this.

import type { Meter } from "../chart/types.ts";
import { PPQ } from "../chart/types.ts";
import { STEP } from "../perform/grid.ts";
import type { MeterName } from "../perform/meter.ts";
import {
  barMarks,
  meterName,
  middlePulses,
  pulseGroups,
  pulseStarts,
  pulseTicks,
  shapeToTell,
} from "../perform/meter.ts";

/**
 * How a pulse of the new bar is made from a written beat:
 * - `copy`: the pulse is as long as the beat was written;
 * - `long`: a dotted pulse among quarters, from a quarter's cell: its first eighth, an eighth
 *   put in, its second eighth. The eighth stays steady and nothing lopes;
 * - `lope`: a dotted pulse in a bar of them, from a quarter's cell (a seat with no part for a
 *   dotted pulse): the downbeat stays and the "and" goes to the pulse's last eighth.
 */
export type Make = "copy" | "long" | "lope";

export interface CutPulse {
  /** Which beat of the written bar this pulse takes, from 0: the downbeat, the backbeat, the strong pulse, the last. */
  readonly from: 0 | 1 | 2 | 3;
  readonly make: Make;
  /** Sixteenths from the new bar's line to this pulse, and how many it has. */
  readonly start: number;
  readonly steps: number;
  /** The last pulse of the bar that takes this beat: where a turn written in it is laid (a turn is taken once). */
  readonly turn: boolean;
  /**
   * The middle pulse of a group of three in a bar whose shape is told (`Cut.tells`): the drums
   * keep time there and play neither the kick nor the backbeat, and the chords strike nothing
   * new (one backbeat a group).
   */
  readonly weak: boolean;
}

export interface Cut {
  readonly meter: Meter;
  /** The name the derived part is filed under: the meter's, grouping included. */
  readonly name: MeterName;
  /** The written part the new one is made from: the 12/8 where every pulse is dotted and the seat wrote one, else the 4/4. */
  readonly source: "4/4" | "12/8";
  /** Sixteenths in a beat of the source: 4, or 6 from the twelve. */
  readonly cell: number;
  readonly pulses: readonly CutPulse[];
  /** Sixteenths in the new bar. */
  readonly steps: number;
  /** The written beats no pulse of the new bar takes (beat 3, in a bar of one group). */
  readonly untaken: readonly number[];
  /**
   * The pulse a line plays on when its every stroke was in a beat the bar does not take
   * ("nothing a line plays is lost whole", DR-57): the first backbeat pulse, or the last pulse.
   */
  readonly refuge: number;
  /** The new bar's length over a bar of the source's: what a count of notes a bar is scaled by. */
  readonly scale: number;
  /**
   * Whether the band has to say the bar's shape (`shapeToTell`). Then the rules of "telling
   * the shape" hold of the derived part: one backbeat a group, the bass on the marks, the
   * downbeat kept, and held. A bar of one group of even pulses (9/8, 2/4) is left as the cut
   * makes it.
   */
  readonly tells: boolean;
  /** Where the bar's shape is marked (`barMarks`), in sixteenths from the barline. */
  readonly marks: readonly number[];
}

/**
 * The meters whose missing parts are not derived yet: the band plays its fit in them, as it has
 * been heard to (the design's section 5: three, then 6/4 and the dotted bars, a seat at a time).
 * 4/4 is the style itself.
 */
const FITTED: ReadonlySet<string> = new Set(["4/4", "3/4", "6/8", "12/8", "6/4"]);

/** Whether a seat that has written nothing for a meter plays a part derived for it. */
export function derives(meter: Meter): boolean {
  return !FITTED.has(meterName(meter));
}

/** The cut for a meter. `twelve`: the seat has a part written for 12/8. */
function cutOf(meter: Meter, twelve: boolean): Cut {
  const ticks = pulseTicks(meter);
  const dotted = ticks.map((length) => length === PPQ * 1.5);
  const allDotted = dotted.every(Boolean);
  const source = allDotted && twelve ? "12/8" : "4/4";
  const cell = source === "12/8" ? 6 : 4;
  const tells = shapeToTell(meter);
  const middles = tells ? middlePulses(meter) : [];
  const starts = pulseStarts(meter);

  const roles: (0 | 1 | 2 | 3)[] = [];
  for (const size of pulseGroups(meter)) {
    for (let i = 0; i < size; i++) {
      const strong = i === 0 || (size === 4 && i === 2);
      roles.push(roles.length === 0 ? 0 : strong ? 2 : 1);
    }
  }
  if (roles.length > 1) roles[roles.length - 1] = 3;
  const weak = starts.map((tick) => middles.includes(tick));

  let start = 0;
  const pulses: CutPulse[] = roles.map((from, index) => {
    const steps = Math.round(ticks[index]! / STEP);
    const make: Make =
      steps === cell ? "copy" : allDotted ? "lope" : dotted[index] ? "long" : "copy";
    const pulse = {
      from,
      make,
      start,
      steps,
      turn: roles.lastIndexOf(from) === index,
      weak: weak[index]!,
    };
    start += steps;
    return pulse;
  });
  const untaken = [0, 1, 2, 3].filter((beat) => !roles.includes(beat as 0));
  // With one backbeat a group, the middle of a three is no backbeat: the refuge is the first
  // pulse that still is one.
  const backbeat = roles.findIndex((role, index) => role === 1 && !weak[index]);
  return {
    meter,
    name: meterName(meter),
    source,
    cell,
    pulses,
    steps: start,
    untaken,
    refuge: backbeat >= 0 ? backbeat : roles.length - 1,
    scale: start / (cell * 4),
    tells,
    marks: barMarks(meter).map((tick) => Math.round(tick / STEP)),
  };
}

/**
 * A seat's part for a meter: the one it wrote, else the one made from what it wrote (`make`,
 * asked once for a seat and a shape and kept), else nothing, where the meter is one the band
 * still fits or nothing could be derived.
 */
export function partIn<Seat extends object, Part>(
  seat: Seat,
  meters: Readonly<Partial<Record<MeterName, Part>>> | undefined,
  meter: Meter,
  make: (cut: Cut) => Part | undefined,
): Part | undefined {
  const name = meterName(meter);
  const written = meters?.[name];
  if (written || !derives(meter)) return written;
  let kept = DERIVED.get(seat) as Map<MeterName, Part | null> | undefined;
  if (!kept) {
    kept = new Map();
    DERIVED.set(seat, kept);
  }
  let part = kept.get(name);
  if (part === undefined) {
    part = make(cutOf(meter, meters?.["12/8"] !== undefined)) ?? null;
    kept.set(name, part);
  }
  return part ?? undefined;
}

const DERIVED = new WeakMap<object, Map<MeterName, unknown>>();

/** What a seat's grid symbols mean to the cut. */
export interface Symbols {
  /** A note struck here. In the drums a stroke taken off ("-") counts as one. */
  readonly strike: (symbol: string) => boolean;
  /** The note before goes on sounding here. Never, for a seat whose notes have no length. */
  readonly hold: (symbol: string) => boolean;
  /** What a rest and a hold are written as. */
  readonly rest: string;
  readonly held: string;
}

export interface CutLine {
  /** The new bar, a symbol a sixteenth. */
  readonly line: readonly string[];
  /** For each sixteenth of the new bar, the sixteenth of the written bar its symbol came from; -1 where none did. */
  readonly from: readonly number[];
  /** The line was moved whole to the refuge pulse, since the bar takes none of the beats it played in. */
  readonly moved: boolean;
}

/** One pulse made from one written beat: the symbols, and where in the beat each came from (-1: put in). */
function make(
  beat: readonly string[],
  pulse: CutPulse,
  symbols: Symbols,
): { readonly line: string[]; readonly from: number[] } {
  if (pulse.make === "copy" || beat.length !== 4 || pulse.steps !== 6) {
    // A pulse shorter than its beat keeps the front of it; a longer one rests after it.
    const line = beat.slice(0, pulse.steps);
    const from = line.map((_, i) => i);
    while (line.length < pulse.steps) {
      line.push(symbols.rest);
      from.push(-1);
    }
    return { line, from };
  }
  const [a, b, c, d] = beat as [string, string, string, string];
  if (pulse.make === "lope") {
    const between =
      symbols.hold(b) && (symbols.hold(c) || symbols.strike(c)) ? symbols.held : symbols.rest;
    return { line: [a, b, between, between, c, d], from: [0, 1, -1, -1, 2, 3] };
  }
  // The long beat: the eighth put in holds where the second eighth holds, is the second eighth
  // again where the beat strikes on both its eighths, and rests otherwise.
  if (symbols.hold(c))
    return { line: [a, b, symbols.held, symbols.held, c, d], from: [0, 1, -1, -1, 2, 3] };
  if (symbols.strike(a) && symbols.strike(c))
    return { line: [a, b, c, d, c, d], from: [0, 1, 2, 3, 2, 3] };
  // A note held from before the beat right up to a note on its "and" is held up to it still.
  if (symbols.hold(a) && symbols.hold(b) && symbols.strike(c))
    return { line: [a, b, symbols.held, symbols.held, c, d], from: [0, 1, -1, -1, 2, 3] };
  return { line: [a, b, symbols.rest, symbols.rest, c, d], from: [0, 1, -1, -1, 2, 3] };
}

/**
 * A written bar cut by the beat (section 3a): each pulse of the new bar takes its beat of the
 * written one, made to the pulse's length. With the rules over it: a hold belongs to its note,
 * and nothing a line plays is lost whole. `turn`: the line is a turn, laid only in the last
 * pulse that takes each of its beats.
 *
 * `written` is the bar's symbols, a sixteenth each, as long as the source's bar (`cut.cell * 4`).
 */
export function cutLine(
  written: readonly string[],
  cut: Cut,
  symbols: Symbols,
  options: { readonly turn?: boolean } = {},
): CutLine {
  const beats = [0, 1, 2, 3].map((beat) => written.slice(beat * cut.cell, (beat + 1) * cut.cell));
  const struck = (beat: number) => beats[beat]!.some(symbols.strike);
  // Nothing is lost whole: a line that plays only in beats the bar does not take plays the
  // first of them on the refuge pulse.
  const played = [0, 1, 2, 3].filter(struck);
  const lost = played.length > 0 && played.every((beat) => cut.untaken.includes(beat));

  // The note sounding at the end of each written beat: the sixteenth it was struck on, or -1.
  const soundingAfter: number[] = [];
  let sounding = -1;
  written.forEach((symbol, step) => {
    if (symbols.strike(symbol)) sounding = step;
    else if (!symbols.hold(symbol)) sounding = -1;
    if (step % cut.cell === cut.cell - 1) soundingAfter.push(sounding);
  });

  const line: string[] = [];
  const from: number[] = [];
  let carried = -1; // the written sixteenth of the note sounding at the end of the new bar so far
  cut.pulses.forEach((pulse, index) => {
    let beat: number = lost ? (index === cut.refuge ? played[0]! : -1) : pulse.from;
    const silent = beat < 0 || (options.turn === true && !lost && !pulse.turn);
    if (silent) {
      for (let i = 0; i < pulse.steps; i++) {
        line.push(symbols.rest);
        from.push(-1);
      }
      carried = -1;
      return;
    }
    // A hold belongs to its note: the holds a beat opens with stand only where the note they
    // were written to hold is the one sounding now.
    let before = beat === 0 ? -1 : soundingAfter[beat - 1]!;
    let keeps = index > 0 && before >= 0 && carried === before;
    // A held note is its note: a beat that only holds a note the new
    // bar has not just played would be silence, so the pulse takes the beat the note was struck
    // in. The note is kept and shortened, where it and its hold were both lost.
    if (!keeps && before >= 0 && !struck(beat) && symbols.hold(beats[beat]![0]!)) {
      beat = Math.floor(before / cut.cell);
      before = beat === 0 ? -1 : soundingAfter[beat - 1]!;
      keeps = index > 0 && before >= 0 && carried === before;
    }
    const made = make(beats[beat]!, pulse, symbols);
    let opening = true;
    made.line.forEach((symbol, i) => {
      const source = made.from[i]! < 0 ? -1 : beat * cut.cell + made.from[i]!;
      if (symbols.strike(symbol)) {
        opening = false;
        carried = source;
      } else if (symbols.hold(symbol)) {
        if (opening && !keeps) {
          line.push(symbols.rest);
          from.push(-1);
          carried = -1;
          return;
        }
      } else {
        opening = false;
        carried = -1;
      }
      line.push(symbol);
      from.push(source);
    });
  });
  return { line, from, moved: lost };
}

/** A new bar's symbols as a grid, a pulse to a group. */
export function gridOf(line: readonly string[], cut: Cut): string {
  return cut.pulses
    .map((pulse) => line.slice(pulse.start, pulse.start + pulse.steps).join(""))
    .join(" ");
}

/**
 * What is written against the barline (section 3b): a fill, a turn or a pickup of so many
 * sixteenths before the barline, as the sixteenths it has in the new bar. An eighth or less
 * stays what it is; a beat is the bar's last pulse, two beats its last two, each made as its
 * pulse is made. Null where the new bar has too few pulses for it.
 *
 * `written` is the figure's symbols, ending at the barline. The result is the same figure made
 * to the new bar's last pulses, with where each symbol came from in `written` (-1: put in).
 */
export function cutTail(
  written: readonly string[],
  cut: Cut,
  symbols: Symbols,
): { readonly line: readonly string[]; readonly from: readonly number[] } | null {
  const length = written.length;
  if (length <= cut.cell / 2) return { line: [...written], from: written.map((_, i) => i) };
  const beats = Math.ceil(length / cut.cell);
  if (beats > cut.pulses.length) return null;
  // The figure's beats from the barline back; its first may be a part of a beat, kept against its pulse's end.
  const line: string[] = [];
  const from: number[] = [];
  const pulses = cut.pulses.slice(cut.pulses.length - beats);
  const lead = beats * cut.cell - length; // sixteenths of the first beat the figure does not write
  pulses.forEach((pulse, index) => {
    const start = index * cut.cell - lead;
    const beat: string[] = [];
    for (let i = 0; i < cut.cell; i++)
      beat.push(start + i < 0 ? symbols.rest : written[start + i]!);
    const made = make(beat, pulse, symbols);
    made.line.forEach((symbol, i) => {
      line.push(symbol);
      from.push(made.from[i]! < 0 || start + made.from[i]! < 0 ? -1 : start + made.from[i]!);
    });
  });
  // A figure that began partway through a beat begins partway through its pulse: drop the rests put before it.
  const first = from.findIndex((source) => source >= 0);
  const drop = lead > 0 && first > 0 ? Math.min(first, lead + (pulses[0]!.steps - cut.cell)) : 0;
  return { line: line.slice(drop), from: from.slice(drop) };
}

/**
 * What comes to rest (section 3c): an ending, the bar a top note is held in. The written beats
 * up to the one its last note is struck in, in order from the new bar's first pulse; the last
 * note held as long as it was written (to the barline at most); silence after it. Null where
 * the last note would fall in the bar's last pulse, or the bar has no note: it does not fit.
 */
export function cutHead(
  written: readonly string[],
  cut: Cut,
  symbols: Symbols,
): readonly string[] | null {
  let last = -1;
  written.forEach((symbol, step) => {
    if (symbols.strike(symbol)) last = step;
  });
  if (last < 0) return null;
  const beat = Math.floor(last / cut.cell);
  if (beat >= cut.pulses.length - 1) return null;
  let length = 1;
  while (last + length < written.length && symbols.hold(written[last + length]!)) length++;

  const line: string[] = [];
  for (let i = 0; i <= beat; i++) {
    const made = make(written.slice(i * cut.cell, (i + 1) * cut.cell), cut.pulses[i]!, symbols);
    line.push(...made.line);
  }
  let at = line.length - 1;
  while (at >= 0 && !symbols.strike(line[at]!)) at--;
  const result = line.slice(0, at + 1);
  while (result.length < cut.steps) {
    result.push(result.length - at < length ? symbols.held : symbols.rest);
  }
  return result;
}
