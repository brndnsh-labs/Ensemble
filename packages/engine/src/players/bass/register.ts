// Where a root sits on the instrument.

import { heldRng } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { Rng } from "../../rng.ts";
import { mod12 } from "../../theory/pitch.ts";
import type { RegisterPolicy } from "./style.ts";
import { HIGHEST_ROOT, LOW_E } from "./tones.ts";

/** The lowest note of a pitch class on the instrument: E1 to D#2. The ending's note (EN-27). */
export function lowestRoot(pitchClass: number): number {
  return LOW_E + mod12(pitchClass - LOW_E);
}

/** The register's home for this bar's section (or song, or pass: whatever the style holds it for). */
export function anchorOf(register: RegisterPolicy, rng: Rng, bar: PlanBar): number {
  const { from, to, hold } = register.anchor;
  return heldRng(rng, "anchor", hold, bar).between(Math.min(from, to), Math.max(from, to));
}

/**
 * Place a root: nearest the line's previous note, pulled toward the anchor
 * (BA-33). When two octaves are equally near, the lower one wins (X-A-03).
 * `previous` is null when the bass has not played yet.
 */
export function placeRoot(
  pitchClass: number,
  register: RegisterPolicy,
  anchor: number,
  previous: number | null,
): number {
  const aim = previous === null ? anchor : previous + register.pull * (anchor - previous);
  let best = lowestRoot(pitchClass);
  for (let pitch = best; pitch <= Math.min(register.highest, HIGHEST_ROOT); pitch += 12) {
    if (pitch < register.lowest) continue;
    const better = Math.abs(pitch - aim) < Math.abs(best - aim);
    if (best < register.lowest || better) best = pitch;
  }
  return best;
}
