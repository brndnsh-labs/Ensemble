// The plain rhythm: a pad. One strike where each chord arrives, held most of
// the way to the next strike, so what is heard is the voicing and how it
// moves, with no rhythm in the way. It is also what any meter but 4/4 plays.

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
 * Strikes for every bar the seat plays, except the ending bar, which has its
 * own gesture. A chord carried over a barline is struck again softly at the
 * barline, the way a pianist keeps a pad alive on an instrument that dies away
 * (CH-48), since nothing rings past a barline (CH-35). Nothing under N.C.
 * (X-B-18), in the count-in or the tail, or in a bar the seat sits out.
 */
export function plainStrikes(
  plan: Plan,
  harmony: readonly Arrival[],
  chords: ChordStyle,
): Strike[] {
  const strikes: Strike[] = [];
  const { length, velocity } = chords.plain;
  // The chord the pad was still holding at the last barline, if it was playing.
  let holding: ChartChord | null = null;
  let at = -1;
  for (const bar of plan.bars) {
    const energy = bar.seats.chords;
    if (bar.kind !== "music" || energy === null || bar.ending) {
      holding = null;
      continue;
    }
    const kind = chords.voicing[tierOf(energy)];
    const beats = pulseStarts(bar);
    const own = stretches(bar, harmony, Math.max(0, at));
    for (const stretch of own) {
      if (stretch.chord === null) continue;
      const carried = stretch.start === bar.start && sameChord(holding, stretch.chord);
      const onBeat = beats.has(stretch.start - bar.start);
      strikes.push({
        bar: bar.index,
        tick: stretch.start,
        duration: Math.max(1, Math.round((stretch.end - stretch.start) * length)),
        velocity: carried ? velocity.restrike : onBeat ? velocity.beat : velocity.offbeat,
        arrival: stretch.arrival,
        kind,
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
