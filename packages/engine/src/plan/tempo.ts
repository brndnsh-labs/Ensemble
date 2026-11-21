// The tempo as it breathes: a band asked to (`PlanOptions.breathe`) pushes a
// little as the jam builds and settles as it comes down. Each bar has one
// tempo, decided from the arc of the bars up to and including it and nothing
// after, so an open jam made longer and a jam told to finish keep the time of
// what was played. Without the option every bar is at the tempo as set.

import type { Meter } from "../chart/types.ts";
import { tempoRange } from "../style/meters.ts";
import type { StylePack } from "../style/types.ts";

/** The most any style breathes, either way, as a share of the tempo as set. */
export const BREATHE_MOST = 0.02;

/** The most the tempo moves from one bar to the next, as a share of the tempo as set. */
export const TEMPO_STEP = 0.0025;

/** A rise in the arc this big over where the band has settled asks for the whole of a style's amount. */
const FULL_RISE = 0.1;

/**
 * How quickly the band gets used to where the arc has taken it: the share of the way it
 * settles each bar. A band pushes while it builds, not for as long as it stays built, so a
 * jam that holds a level comes back to the tempo as set, and over a take the tempo keeps
 * close to it.
 */
const SETTLE = 1 / 4;

/**
 * How far a style breathes at a tempo, as a share of it: the style's amount, held inside the
 * style's limits for the meter. A band set near the top of its range has no push left and one
 * near the floor nothing to settle into, so the amount is the smaller of the two room it has,
 * both ways alike, and nothing at a limit or past one.
 */
export function breatheAmount(style: StylePack, meter: Meter, tempo: number): number {
  const { min, max } = tempoRange(style, meter);
  const room = Math.min(max / tempo - 1, 1 - min / tempo);
  return Math.max(0, Math.min(style.feel.breathe, BREATHE_MOST, room));
}

/**
 * Each bar's tempo as a share above (or below) the tempo as set, in the order the bars are
 * played, from the arc's offset for each bar (the energy the arc adds, after its depth). A
 * bar's tempo asks for the arc's rise over where the band had settled, scaled to the amount,
 * and the tempo walks toward that at no more than `TEMPO_STEP` a bar. The first bar is the
 * tempo as set, and so is every bar of a flat arc.
 */
export function breaths(arc: readonly number[], amount: number): number[] {
  const out: number[] = [];
  let settled = arc[0] ?? 0;
  let now = 0;
  for (const level of arc) {
    const rise = level - settled;
    settled += rise * SETTLE;
    const wanted = amount * Math.max(-1, Math.min(1, rise / FULL_RISE));
    now += Math.max(-TEMPO_STEP, Math.min(TEMPO_STEP, wanted - now));
    out.push(now);
  }
  return out;
}

/**
 * Quarter notes a minute for a bar a share off the tempo as set. A bar at the tempo as set
 * is that exactly; any other is held to a whole microsecond a quarter note, which is what a
 * MIDI file can say, so the exported file's tempo map is the one that was played.
 */
export function barQuarters(quarters: number, share: number): number {
  if (share === 0) return quarters;
  return 60_000_000 / Math.round(60_000_000 / (quarters * (1 + share)));
}
