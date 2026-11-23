// What the property files share: tolerances and readers of a take that more than one of
// band.test.ts, soloist.test.ts, and piano.test.ts needs. Not a test file.

import type { Take } from "@ensemble/engine";
import {
  arrivals,
  chordScale,
  chordToString,
  contextOf,
  MUTED,
  PICKED,
  PPQ,
} from "@ensemble/engine";
import { type Jam, notesOf, written } from "./takes.ts";

/** Ticks of slack for where a note sounds: the largest lean plus human placement. */
export const POCKET = 40;

export const blues = (jam: Pick<Jam, "style" | "chart">) =>
  jam.style.id === "blues" && jam.chart.meter === "4/4";

/** The blues wherever it plays from its own parts: in four, and in twelve. */
export const bluesWritten = (jam: Pick<Jam, "style" | "chart">) =>
  jam.style.id === "blues" && written(jam);

export interface Strike {
  readonly tick: number;
  readonly pitches: number[];
  readonly sounds: number;
  readonly ends: number;
}

/**
 * The comp's notes grouped into the times the hand sounds a chord. A deadened stroke (a
 * guitar's scratch) is rhythm, not a chord: `scratches` reads those instead. A plucked
 * string is one note of the shape a picking hand holds, not a strike of it: `pluckedOf`
 * reads those. A note pulled off or hammered on is not struck (`slur`, a guitar's stinger):
 * it is no strike either.
 */
export function strikesOf(take: Take, scratches = false): Strike[] {
  const strikes: Strike[] = [];
  for (const note of notesOf(take, "chords")) {
    if (note.slur || note.voice === PICKED || (note.voice === MUTED) !== scratches) continue;
    const last = strikes.at(-1);
    if (last && last.tick === note.tick) {
      last.pitches.push(note.pitch);
    } else {
      strikes.push({
        tick: note.tick,
        pitches: [note.pitch],
        sounds: note.tick + note.offset,
        ends: note.tick + note.offset + note.duration,
      });
    }
  }
  for (const strike of strikes) strike.pitches.sort((a, b) => a - b);
  return strikes;
}

/**
 * The strings a picking hand plucks, each as a strike of one note: a string rings on by
 * itself, so two plucked together are two of these.
 */
export function pluckedOf(take: Take): Strike[] {
  return notesOf(take, "chords")
    .filter((note) => note.voice === PICKED)
    .map((note) => ({
      tick: note.tick,
      pitches: [note.pitch],
      sounds: note.tick + note.offset,
      ends: note.tick + note.offset + note.duration,
    }));
}

const harmonies = new WeakMap<Take, ReturnType<typeof arrivals>>();

/** A take's chord arrivals, worked out once. */
export function harmonyOf(take: Take) {
  let harmony = harmonies.get(take);
  if (!harmony) {
    harmony = arrivals(take.plan);
    harmonies.set(take, harmony);
  }
  return harmony;
}

/**
 * The chords a strike may be playing: the one written under it, and, when it is struck within
 * an eighth before a change and rings into it, the one coming (X-B-07).
 */
export function chordsUnder(take: Take, strike: Strike) {
  const harmony = harmonyOf(take);
  const at = harmony.findLastIndex((arrival) => arrival.tick <= strike.tick);
  const under = [harmony[at]];
  const next = harmony[at + 1];
  if (next && next.tick - strike.tick <= PPQ / 2 && strike.ends >= next.tick - POCKET) {
    under.push(next);
  }
  return under.flatMap((arrival) =>
    arrival?.chord
      ? [{ chord: arrival.chord, scale: chordScale(arrival.chord, contextOf(harmony, arrival)) }]
      : [],
  );
}

/**
 * For each bar a seat plays whose first chord is at the barline, the whole bars that chord has
 * held before it, counted from where it was struck (BA-97): 0 in the bar of a new chord, at the
 * top of a section, after the seat's rest, in the ending bar, and in the first bar after a
 * chord arrives inside the bar the count goes on from there.
 */
export function barsOnChord(take: Take, seat: "bass" | "chords"): Map<number, number> {
  const result = new Map<number, number>();
  let previous: { name: string | null; bar: number } | null = null;
  let held = 0;
  for (const bar of take.plan.bars) {
    if (bar.kind !== "music") continue;
    for (const span of bar.spans) {
      const name = bar.seats[seat] === null || !span.chord ? null : chordToString(span.chord);
      const carried = previous !== null && previous.name === name;
      if (carried && previous!.bar === bar.index && !bar.ending) continue;
      const atBarline = span.start === 0;
      const struck =
        name !== null && (!carried || (atBarline && bar.barInSection === 0) || Boolean(bar.ending));
      if (struck) held = 0;
      if (atBarline && name !== null) result.set(bar.index, held);
      if (atBarline && name !== null) held++;
      previous = { name, bar: bar.index };
    }
  }
  return result;
}

/**
 * The last of a take's bars (in order) to start at or before a tick: what
 * `bars.findLast((bar) => bar.start <= tick)` finds, found by halves.
 */
export function barAt<B extends { readonly start: number }>(
  bars: readonly B[],
  tick: number,
): B | undefined {
  let [low, high] = [0, bars.length];
  while (low < high) {
    const mid = (low + high) >> 1;
    if (bars[mid]!.start <= tick) low = mid + 1;
    else high = mid;
  }
  return bars[low - 1];
}
