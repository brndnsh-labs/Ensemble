// Reading the name a style files a meter's parts under, and the tempo a style
// is played at in a meter.

import type { Meter } from "../chart/types.ts";
import { grouped, isCompound, writtenFor } from "../perform/meter.ts";
import { derives } from "./cut.ts";
import type { StylePack, TempoRange } from "./types.ts";

/**
 * The meter a style has written parts for, from its name ("12/8", "7/8 (3+2+2)"). Null for
 * anything a chart could not write, for 4/4, which is the style itself, and for a meter named
 * with its usual grouping, which is filed under the meter alone.
 */
export function readMeter(name: string): Meter | null {
  const match = /^(\d{1,2})\/(2|4|8)(?: \((\d(?:\+\d)*)\))?$/.exec(name);
  if (!match) return null;
  const beats = Number(match[1]);
  const unit = Number(match[2]) as 2 | 4 | 8;
  if (beats < 1 || beats > 32 || (beats === 4 && unit === 4)) return null;
  if (match[3] === undefined) return { beats, unit };
  const meter = grouped({ beats, unit }, match[3].split("+").map(Number));
  return meter?.groups ? meter : null;
}

/**
 * A style's usual tempo and limits in a meter, in that meter's pulses a minute:
 * what the style says for the meter, else its own range. Where the pulse is a
 * dotted quarter and the style has said nothing: its twelve's range in a meter
 * the band makes its part for (9/8), else two thirds of its range, which keeps
 * the eighth notes at the speed of its 4/4: rock's 120 is 80 in 12/8.
 */
export function tempoRange(style: StylePack, meter: Meter): TempoRange {
  const written = writtenFor(style.tempo.meters, meter);
  if (written) return written;
  if (!isCompound(meter)) return style.tempo;
  // A bar of dotted pulses the band makes its part for is made from the twelve, and is played
  // at the speeds the style wrote for its twelve, where it wrote them.
  const twelve = style.tempo.meters?.["12/8"];
  if (twelve && derives(meter)) return twelve;
  const slower = (bpm: number) => Math.round((bpm * 2) / 3);
  return {
    default: slower(style.tempo.default),
    min: slower(style.tempo.min),
    max: slower(style.tempo.max),
  };
}
