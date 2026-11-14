// The chart's harmony as the rhythm section meets it: a line of arrivals, each
// a chord being struck somewhere, with what comes before and after.

import type { ChartChord } from "../chart/types.ts";
import type { Plan } from "../plan/types.ts";
import { sameQuality } from "../theory/chord.ts";
import type { Key } from "../theory/pitch.ts";
import { sameNote } from "../theory/pitch.ts";
import type { HarmonicContext } from "../theory/scale.ts";

export interface Arrival {
  /** Position in the list. */
  readonly index: number;
  /** Null is "no chord": pitched players rest. */
  readonly chord: ChartChord | null;
  /** Absolute tick where the chord is written. */
  readonly tick: number;
  /** Ticks until the next arrival, with tied spans folded in. */
  readonly duration: number;
  /** Index of the plan bar the arrival falls in. */
  readonly bar: number;
  readonly key: Key;
  /**
   * False when the chart merely restates the chord already sounding (the same
   * chord written again in the next bar). A pattern may continue through that.
   */
  readonly changed: boolean;
  /** How many arrivals in a row have been this same chord before this one. */
  readonly restated: number;
}

/**
 * Every arrival in the plan in order, look-ahead included (so the last played
 * bar can see what it leads into). Tail bars and count-in bars add nothing.
 */
export function arrivals(plan: Plan): Arrival[] {
  const list: Arrival[] = [];
  for (const bar of [...plan.bars, ...plan.lookahead]) {
    if (bar.kind !== "music") continue;
    for (const span of bar.spans) {
      const previous = list[list.length - 1];
      if (span.tied && previous) continue;
      const same = previous !== undefined && sameChord(previous.chord, span.chord);
      list.push({
        index: list.length,
        chord: span.chord,
        tick: bar.start + span.start,
        duration: 0,
        bar: bar.index,
        key: bar.key,
        changed: !same,
        restated: same ? previous.restated + 1 : 0,
      });
    }
  }
  const end = plan.lookahead.at(-1) ?? plan.bars.findLast((bar) => bar.kind === "music");
  const endTick = end ? end.start + end.ticks : 0;
  return list.map((arrival, i) => ({
    ...arrival,
    duration: (list[i + 1]?.tick ?? endTick) - arrival.tick,
  }));
}

export function sameChord(a: ChartChord | null, b: ChartChord | null): boolean {
  if (a === null || b === null) return a === b;
  const sameBass =
    a.bass === null || b.bass === null ? a.bass === b.bass : sameNote(a.bass, b.bass);
  return sameNote(a.root, b.root) && sameQuality(a.quality, b.quality) && sameBass;
}

/** The arrival sounding at a tick, or undefined before the first. */
export function arrivalAt(list: readonly Arrival[], tick: number): Arrival | undefined {
  let found: Arrival | undefined;
  for (const arrival of list) {
    if (arrival.tick > tick) break;
    found = arrival;
  }
  return found;
}

/** The next arrival that is a different chord (skipping restatements and rests), if any. */
export function nextChange(list: readonly Arrival[], from: Arrival): Arrival | undefined {
  for (let i = from.index + 1; i < list.length; i++) {
    const arrival = list[i]!;
    if (arrival.chord !== null && !sameChord(arrival.chord, from.chord)) return arrival;
  }
  return undefined;
}

/** What a chord scale needs to know about an arrival's surroundings. */
export function contextOf(list: readonly Arrival[], arrival: Arrival): HarmonicContext {
  let previous: ChartChord | null = null;
  for (let i = arrival.index - 1; i >= 0; i--) {
    const chord = list[i]!.chord;
    if (chord !== null && !sameChord(chord, arrival.chord)) {
      previous = chord;
      break;
    }
  }
  return { key: arrival.key, next: nextChange(list, arrival)?.chord ?? null, previous };
}
