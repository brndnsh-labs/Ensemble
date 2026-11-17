// The time: one bar of the style's groove at the bar's tier, with every held
// choice made (which kick, which cymbal), fitted to the bar's meter.

import type { Meter } from "../../chart/types.ts";
import { cells, LEVELS, STEP } from "../../perform/grid.ts";
import { arrivals } from "../../perform/harmony.ts";
import { barSteps, pulseTicks, writtenFor } from "../../perform/meter.ts";
import type { PlayerContext } from "../../perform/notes.ts";
import { heldRng } from "../../perform/notes.ts";
import type { Plan, PlanBar } from "../../plan/types.ts";
import { tierOf } from "../../style/types.ts";
import type { DrumVoice } from "./kit.ts";
import type { DrumStyle, DrumTime, GrooveOption, Lines, When } from "./style.ts";

/** One bar of the kit: for each piece, its written level at every sixteenth (0 is a rest). */
export type BarPart = Partial<Record<DrumVoice, number[]>>;

/** Sixteenths in a beat, and in the 4/4 bar every groove is written as. */
const BEAT = 4;
const GROOVE_STEPS = 16;

/** In a groove line, the stick taken off: a stroke from the layers above is taken away. */
export const TAKEN = "-";

/** What the drummer reads of the chart in a bar, as the pianist would (DR-89). */
export interface BarHarmony {
  /** The harmony moves inside the bar: two chords or more. */
  readonly changeInBar: boolean;
  /** The next bar brings a new chord on its downbeat. */
  readonly changeAhead: boolean;
}

/** What a layer's conditions read besides the plan bar: its harmony, and whether a fill ends it. */
export interface BarReading extends BarHarmony {
  readonly filled: boolean;
}

/** Each bar's harmony, by plan bar index, read through the look-ahead so the last bar sees what comes. */
export function harmonyByBar(plan: Plan): Map<number, BarHarmony> {
  const inBar = new Set<number>();
  const ahead = new Set<number>();
  const starts = new Map([...plan.bars, ...plan.lookahead].map((bar) => [bar.index, bar.start]));
  for (const arrival of arrivals(plan)) {
    if (!arrival.changed) continue;
    // A new chord on a downbeat is a change at the barline for the bar before it.
    if (arrival.tick === starts.get(arrival.bar)) ahead.add(arrival.bar - 1);
    else inBar.add(arrival.bar);
  }
  return new Map(
    plan.bars.map((bar) => [
      bar.index,
      { changeInBar: inBar.has(bar.index), changeAhead: ahead.has(bar.index) },
    ]),
  );
}

/** A line's written level at each step: 0 where it rests. */
export function levels(line: string): number[] {
  return cells(line).map((symbol) =>
    symbol in LEVELS ? LEVELS[symbol as keyof typeof LEVELS] : 0,
  );
}

/** A piece's line in a bar, started empty if the piece has not played yet. */
export function lineOf(part: BarPart, voice: DrumVoice, steps: number): number[] {
  let line = part[voice];
  if (!line) {
    line = new Array<number>(steps).fill(0);
    part[voice] = line;
  }
  return line;
}

/**
 * Lay written lines over a bar from a step on. A stroke replaces what was
 * there, a rest leaves it, and "-" takes it away.
 */
export function overlay(part: BarPart, lines: Lines, from: number, steps: number): void {
  for (const [voice, text] of Object.entries(lines) as [DrumVoice, string][]) {
    const line = lineOf(part, voice, steps);
    const written = levels(text);
    cells(text).forEach((symbol, i) => {
      if (from + i >= steps) return;
      if (symbol === TAKEN) line[from + i] = 0;
      else if (written[i]! > 0) line[from + i] = written[i]!;
    });
  }
}

/** Whether laying these lines over the bar would change a stroke of it. */
function changes(part: BarPart, lines: Lines): boolean {
  return (Object.entries(lines) as [DrumVoice, string][]).some(([voice, text]) => {
    const line = part[voice];
    const written = levels(text);
    return cells(text).some((symbol, i) => {
      const now = line?.[i] ?? 0;
      if (symbol === TAKEN) return now > 0;
      return written[i]! > 0 && written[i] !== now;
    });
  });
}

/** A bar's pulses, each a length in sixteenths. */
export function pulses(meter: Meter): number[] {
  return pulseTicks(meter).map((ticks) => ticks / STEP);
}

/** What the drummer has for a bar: the part written for its meter, or the 4/4 one to be fitted. */
export function timeOf(drums: DrumStyle, bar: PlanBar): DrumTime {
  return writtenFor(drums.meters, bar.meter) ?? drums;
}

/** The bar of time the drummer plays under this bar, before any fill or crash. */
export function grooveBar(
  drums: DrumStyle,
  bar: PlanBar,
  energy: number,
  reading: BarReading,
  rng: PlayerContext["rng"],
): BarPart {
  const part: BarPart = {};
  // A part written for the bar's meter is the bar; the 4/4 part is fitted to it.
  const written = writtenFor(drums.meters, bar.meter);
  const time = written ?? drums;
  const steps = written ? barSteps(bar.meter) : GROOVE_STEPS;
  const dotted = pulses(bar.meter).some((pulse) => pulse > BEAT);
  for (const layer of time.grooves[tierOf(energy)]) {
    if (!applies(layer.when, bar, energy, reading, part)) continue;
    // One draw per decision per span: the section's kick is the same kick every bar (X-A-29).
    const options = layer.options.filter((option) => option.weight > 0);
    if (options.length === 0) continue;
    const held = heldRng(rng, `groove:${layer.id}`, layer.hold, bar);
    let choice: GrooveOption = held.weighted(options, (option) => option.weight);
    if (layer.audible) {
      // The next one in the written list that would be heard, from the one drawn, round to it.
      const list = layer.options;
      const at = list.indexOf(choice);
      for (let i = 0; i < list.length; i++) {
        const next = list[(at + i) % list.length]!;
        if (next.weight > 0 && changes(part, next.lines)) {
          choice = next;
          break;
        }
      }
    }
    overlay(part, written || !dotted ? choice.lines : onThePulse(choice.lines), 0, steps);
  }

  // One hand, one cymbal (DR-03): the stick that opens the hat is not also closing it.
  const open = part.openHat;
  const closed = part.closedHat;
  if (open && closed) {
    open.forEach((level, step) => {
      if (level > 0) closed[step] = 0;
    });
  }

  for (const touch of time.touches) {
    for (const voice of touch.voices) {
      const line = part[voice];
      if (!line) continue;
      for (const step of touch.steps ?? line.keys()) {
        if (line[step]) line[step] = Math.max(1, Math.round(line[step] * touch.scale));
      }
    }
  }

  return written ? part : fitMeter(part, pulses(bar.meter));
}

/**
 * A 4/4 line as a bar of dotted pulses fits it: a stroke taken off the beat
 * and played a sixteenth late (`-X`, a displaced backbeat) is played on the
 * beat. A pulse of three eighths has no sixteenth to be late by, and the fit
 * keeps only a beat's downbeat and its "and", so the stroke would be lost and
 * the beat with it (HI-38: a rule that only takes strokes away cannot put
 * one back).
 */
function onThePulse(lines: Lines): Lines {
  const moved: Record<string, string> = {};
  for (const [voice, text] of Object.entries(lines)) {
    const symbols = cells(text);
    for (let beat = 0; beat + 1 < symbols.length; beat += BEAT) {
      const late = symbols[beat + 1]!;
      if (symbols[beat] === TAKEN && late in LEVELS) {
        symbols[beat] = late;
        symbols[beat + 1] = ".";
      }
    }
    moved[voice] = symbols.join("");
  }
  return moved as Lines;
}

function applies(
  when: When | undefined,
  bar: PlanBar,
  energy: number,
  reading: BarReading,
  part: BarPart,
): boolean {
  if (!when) return true;
  if (when.phraseBars && !when.phraseBars.includes(bar.phrase.bar + 1)) return false;
  if (when.energyFrom !== undefined && energy < when.energyFrom) return false;
  if (when.energyBelow !== undefined && energy >= when.energyBelow) return false;
  if (when.playing && !part[when.playing]?.some((level) => level > 0)) return false;
  const last = bar.phrase.bar === bar.phrase.length - 1;
  if (when.phraseEnd !== undefined && when.phraseEnd !== last) return false;
  if (when.fill !== undefined && when.fill !== reading.filled) return false;
  if (when.changeInBar !== undefined && when.changeInBar !== reading.changeInBar) return false;
  if (when.changeAhead !== undefined && when.changeAhead !== reading.changeAhead) return false;
  return true;
}

/**
 * In 4/4 the groove is the bar. In any other meter the bar is built from the
 * groove's beats, one per pulse (DR-10): beat 1 on the downbeat, beat 2 on the
 * backbeat pulses (every second pulse), beat 3 on the strong pulses between
 * them, and beat 4, with whatever the groove does to turn the bar round, on
 * the last pulse. So 3/4 is beats 1, 2, 4 and 5/4 is 1, 2, 3, 2, 4.
 *
 * A dotted pulse keeps the beat's downbeat and moves its "and" to the pulse's
 * last eighth, so 6/8 lopes like a slow shuffle. A lone eighth keeps only the downbeat.
 */
function fitMeter(groove: BarPart, bar: readonly number[]): BarPart {
  if (bar.length === 4 && bar.every((pulse) => pulse === BEAT)) return groove;
  const steps = bar.reduce((sum, pulse) => sum + pulse, 0);
  const part: BarPart = {};
  let start = 0;
  bar.forEach((pulse, i) => {
    const beat = i === 0 ? 0 : i === bar.length - 1 ? 3 : i % 2 === 1 ? 1 : 2;
    for (const [voice, written] of Object.entries(groove) as [DrumVoice, number[]][]) {
      const line = lineOf(part, voice, steps);
      for (let s = 0; s < BEAT; s++) {
        const level = written[beat * BEAT + s]!;
        if (level === 0) continue;
        if (pulse === BEAT) line[start + s] = level;
        else if (s === 0) line[start] = level;
        else if (s === 2 && pulse > BEAT) line[start + pulse - 2] = level;
      }
    }
    start += pulse;
  });
  return part;
}
