// The time: one bar of the style's groove at the bar's tier, with every held
// choice made (which kick, which cymbal), fitted to the bar's meter.

import type { Meter } from "../../chart/types.ts";
import { cells, LEVELS } from "../../perform/grid.ts";
import type { PlayerContext } from "../../perform/notes.ts";
import { heldRng } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import { tierOf } from "../../style/types.ts";
import type { DrumVoice } from "./kit.ts";
import type { DrumStyle, Lines, When } from "./style.ts";

/** One bar of the kit: for each piece, its written level at every sixteenth (0 is a rest). */
export type BarPart = Partial<Record<DrumVoice, number[]>>;

/** Sixteenths in a beat, and in the 4/4 bar every groove is written as. */
const BEAT = 4;
const GROOVE_STEPS = 16;

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

/** Lay written lines over a bar from a step on. A stroke replaces what was there; a rest leaves it. */
export function overlay(part: BarPart, lines: Lines, from: number, steps: number): void {
  for (const [voice, text] of Object.entries(lines) as [DrumVoice, string][]) {
    const line = lineOf(part, voice, steps);
    levels(text).forEach((level, i) => {
      if (level > 0 && from + i < steps) line[from + i] = level;
    });
  }
}

/**
 * A bar's pulses, each a length in sixteenths. Quarter notes wherever the
 * meter counts them; in eighth-note meters dotted quarters when the eighths
 * group in threes (6/8, 12/8), otherwise quarters with the odd eighth joining
 * the last one (7/8 is 2+2+3).
 */
export function pulses(meter: Meter): number[] {
  if (meter.unit !== 8) return new Array<number>((meter.beats * 4) / meter.unit).fill(BEAT);
  if (meter.beats % 3 === 0) return new Array<number>(meter.beats / 3).fill(6);
  if (meter.beats < 2) return [2];
  const result = new Array<number>(Math.floor(meter.beats / 2)).fill(BEAT);
  if (meter.beats % 2 === 1) result[result.length - 1]! += 2;
  return result;
}

/** The bar of time the drummer plays under this bar, before any fill or crash. */
export function grooveBar(
  drums: DrumStyle,
  bar: PlanBar,
  energy: number,
  rng: PlayerContext["rng"],
): BarPart {
  const part: BarPart = {};
  for (const layer of drums.grooves[tierOf(energy)]) {
    if (!applies(layer.when, bar, energy, part)) continue;
    // One draw per decision per span: the section's kick is the same kick every bar (X-A-29).
    const options = layer.options.filter((option) => option.weight > 0);
    if (options.length === 0) continue;
    const held = heldRng(rng, `groove:${layer.id}`, layer.hold, bar);
    overlay(part, held.weighted(options, (option) => option.weight).lines, 0, GROOVE_STEPS);
  }

  // One hand, one cymbal (DR-03): the stick that opens the hat is not also closing it.
  const open = part.openHat;
  const closed = part.closedHat;
  if (open && closed) {
    open.forEach((level, step) => {
      if (level > 0) closed[step] = 0;
    });
  }

  for (const touch of drums.touches) {
    for (const voice of touch.voices) {
      const line = part[voice];
      if (!line) continue;
      for (const step of touch.steps ?? line.keys()) {
        if (line[step]) line[step] = Math.max(1, Math.round(line[step] * touch.scale));
      }
    }
  }

  return fitMeter(part, pulses(bar.meter));
}

function applies(when: When | undefined, bar: PlanBar, energy: number, part: BarPart): boolean {
  if (!when) return true;
  if (when.phraseBars && !when.phraseBars.includes(bar.phrase.bar + 1)) return false;
  if (when.energyFrom !== undefined && energy < when.energyFrom) return false;
  if (when.energyBelow !== undefined && energy >= when.energyBelow) return false;
  if (when.playing && !part[when.playing]?.some((level) => level > 0)) return false;
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
