// The plain rhythm: a pad. One strike where each chord arrives, held most of
// the way to the next strike, so what is heard is the voicing and how it
// moves, with no rhythm in the way. It is what any meter but 4/4 plays
// (CH-54), and what a style with no rhythm book plays everywhere.

import type { ChartChord } from "../../chart/types.ts";
import type { Arrival } from "../../perform/harmony.ts";
import { sameChord } from "../../perform/harmony.ts";
import { pulseTicks } from "../../perform/meter.ts";
import type { Plan, PlanBar } from "../../plan/types.ts";
import { tierOf } from "../../style/types.ts";
import type { Strike } from "./strike.ts";
import type { ChordStyle } from "./style.ts";

/** A stretch of one bar under one chord, as written: where the hand could come down. */
export interface Stretch {
  readonly bar: PlanBar;
  /** Absolute ticks. A stretch never crosses a barline. */
  readonly start: number;
  readonly end: number;
  /** Null under N.C. */
  readonly chord: ChartChord | null;
  /** The arrival sounding where the stretch starts. */
  readonly arrival: Arrival;
}

/**
 * A bar's harmony as stretches of one chord each. The same chord written
 * twice in a bar is one stretch: the pad holds through it.
 */
export function stretches(bar: PlanBar, harmony: readonly Arrival[], from: number): Stretch[] {
  const result: Stretch[] = [];
  let at = from;
  for (const span of bar.spans) {
    const start = bar.start + span.start;
    while ((harmony[at + 1]?.tick ?? Infinity) <= start) at++;
    const arrival = harmony[at];
    if (!arrival) continue;
    const last = result[result.length - 1];
    if (last && sameChord(last.chord, span.chord)) {
      result[result.length - 1] = { ...last, end: start + span.duration };
      continue;
    }
    result.push({ bar, start, end: start + span.duration, chord: span.chord, arrival });
  }
  return result;
}

/**
 * Strikes for every bar the seat plays that is not comped (`comped` says
 * which are) and is not the ending bar, which has its own gesture. A chord
 * carried over a barline is struck again softly at the
 * barline, the way a pianist keeps a pad alive on an instrument that dies away
 * (CH-48), since nothing rings past a barline (CH-35). Nothing under N.C.
 * (X-B-18), in the count-in or the tail, or in a bar the seat sits out.
 */
export function plainStrikes(
  plan: Plan,
  harmony: readonly Arrival[],
  chords: ChordStyle,
  comped: (bar: PlanBar) => boolean,
): Strike[] {
  const strikes: Strike[] = [];
  const { length, velocity, top } = chords.plain;
  // The chord the pad was still holding at the last barline, if it was playing.
  let holding: ChartChord | null = null;
  let at = -1;
  for (const bar of plan.bars) {
    const energy = bar.seats.chords;
    if (bar.kind !== "music" || energy === null || bar.ending || comped(bar)) {
      holding = null;
      continue;
    }
    const kind = chords.voicing[tierOf(energy)];
    const beats = pulseStarts(bar);
    const own = stretches(bar, harmony, Math.max(0, at));
    for (const stretch of own) {
      if (stretch.chord === null) continue;
      const carried = stretch.start === bar.start && sameChord(holding, stretch.chord);
      // Where the hand comes down: where the chord arrives, and for a strummed or chopped
      // part on every pulse it lasts through (CH-54).
      const at = [stretch.start];
      if (chords.plain.pulse) {
        for (const beat of beats) {
          const tick = bar.start + beat;
          if (tick > stretch.start && tick < stretch.end) at.push(tick);
        }
        at.sort((a, b) => a - b);
        // An offbeat part leaves the bar's first pulse alone, where it has another to chop on.
        if (chords.plain.pulse === "offbeats" && at[0] === bar.start && at.length > 1) at.shift();
      }
      at.forEach((tick, i) => {
        const arrives = tick === stretch.start;
        const onBeat = beats.has(tick - bar.start);
        strikes.push({
          bar: bar.index,
          tick,
          duration: Math.max(1, Math.round(((at[i + 1] ?? stretch.end) - tick) * length)),
          velocity:
            arrives && carried ? velocity.restrike : onBeat ? velocity.beat : velocity.offbeat,
          arrival: stretch.arrival,
          kind,
          down: true,
          ...(top !== undefined && bar.seats.bass !== null ? { top } : {}),
        });
      });
    }
    const last = own[own.length - 1];
    holding = last && last.end === bar.start + bar.ticks ? last.chord : null;
    at = last ? last.arrival.index : at;
  }
  return strikes;
}

/** Ticks from the barline where the bar's pulses fall. */
export function pulseStarts(bar: PlanBar): Set<number> {
  const starts = new Set<number>();
  let tick = 0;
  for (const pulse of pulseTicks(bar.meter)) {
    starts.add(tick);
    tick += pulse;
  }
  return starts;
}
