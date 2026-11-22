// The chart's harmony as the rhythm section meets it: a line of arrivals, each
// a chord being struck somewhere, with what comes before and after.

import type { ChartChord, ChordSpan } from "../chart/types.ts";
import type { Plan, PlanBar } from "../plan/types.ts";
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

/** Where a seat is in a chord, at one stretch of a bar under one chord. */
export interface Held {
  /**
   * The stretch only carries on the piece before it: the same chord written again in the same
   * bar, outside the ending bar. It is one with that piece, and nothing below is counted.
   */
  readonly merged: boolean;
  /**
   * The chord is stated here: a new chord, the top of a section, the first chord after the
   * seat's rest, or any chord of the ending bar. Where the chart only carries the same chord on
   * into the next bar, a line continues instead (X-A-22).
   */
  readonly struck: boolean;
  /**
   * Whole bars the chart has already spent on this chord before this bar, counted from where
   * it was struck (BA-97): 0 in the bar it is struck in, 1 the next, and so on. A chord that
   * arrives partway through a bar starts counting at the next barline; a stretch that starts
   * inside the bar reads 0.
   */
  readonly cycle: number;
}

/**
 * The count of bars a chord has held, as one seat reads the plan: one call for each stretch
 * of each bar the seat plays through, in order, with the chord the seat hears there (null
 * where it rests). It is the one count every reader of "the bar the chord was struck in, and
 * the bars it holds after" shares: the bass's line going up and coming down (BA-97), a
 * waltz's root and fifth bar by bar (BA-56), and a picking thumb's alternate bass.
 */
export function heldCount(): (bar: PlanBar, span: ChordSpan, chord: ChartChord | null) => Held {
  let previous: { readonly chord: ChartChord | null; readonly bar: PlanBar } | undefined;
  let bars = 0;
  return (bar, span, chord) => {
    const carried = previous !== undefined && sameChord(previous.chord, chord);
    // One chord written twice in a bar is one piece: the line continues through it. The ending
    // bar is kept as written, because the band strikes each of its chords.
    if (carried && previous!.bar === bar && !bar.ending)
      return { merged: true, struck: false, cycle: 0 };
    const atBarline = span.start === 0;
    const top = atBarline && bar.barInSection === 0;
    const struck = chord !== null && (!carried || top || bar.ending !== null);
    if (struck) bars = 0;
    const cycle = atBarline ? bars : 0;
    if (atBarline && chord !== null) bars++;
    previous = { chord, bar };
    return { merged: false, struck, cycle };
  };
}
