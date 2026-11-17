// Reading the name a style files a meter's parts under.

import type { Meter } from "../chart/types.ts";

/**
 * The meter a style has written parts for, from its name ("12/8"). Null for
 * anything a chart could not write, and for 4/4, which is the style itself.
 */
export function readMeter(name: string): Meter | null {
  const match = /^(\d{1,2})\/(2|4|8)$/.exec(name);
  if (!match) return null;
  const beats = Number(match[1]);
  const unit = Number(match[2]) as 2 | 4 | 8;
  if (beats < 1 || beats > 32 || (beats === 4 && unit === 4)) return null;
  return { beats, unit };
}
