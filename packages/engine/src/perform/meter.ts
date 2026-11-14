// How a bar is felt: its pulses. Drums and bass both build odd-meter bars
// from them, and the ending's button sits on the "and" of the last one.

import type { Meter } from "../chart/types.ts";
import { barTicks, PPQ } from "../chart/types.ts";

/**
 * A bar's pulses as lengths in ticks. Quarter notes wherever the meter counts
 * them; in eighth-note meters dotted quarters when the eighths group in threes
 * (6/8, 12/8), otherwise quarters with the odd eighth joining the last one
 * (7/8 is 2+2+3).
 */
export function pulseTicks(meter: Meter): number[] {
  const { beats, unit } = meter;
  if (unit !== 8) {
    return new Array<number>(Math.max(1, Math.round((beats * 4) / unit))).fill(PPQ);
  }
  if (beats % 3 === 0) return new Array<number>(beats / 3).fill(PPQ * 1.5);
  if (beats < 2) return [barTicks(meter)];
  const result = new Array<number>(Math.floor(beats / 2)).fill(PPQ);
  if (beats % 2 === 1) result[result.length - 1]! += PPQ / 2;
  return result;
}
