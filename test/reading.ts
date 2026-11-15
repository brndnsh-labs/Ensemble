// What the property files share: tolerances and readers of a take that more than one of
// band.test.ts, soloist.test.ts, and piano.test.ts needs. Not a test file.

import type { Take } from "@ensemble/engine";
import { arrivals, chordScale, contextOf, PPQ } from "@ensemble/engine";
import { type Jam, notesOf } from "./takes.ts";

/** Ticks of slack for where a note sounds: the largest lean plus human placement. */
export const POCKET = 40;

export const blues = (jam: Pick<Jam, "style" | "chart">) =>
  jam.style.id === "blues" && jam.chart.meter === "4/4";

export interface Strike {
  readonly tick: number;
  readonly pitches: number[];
  readonly sounds: number;
  readonly ends: number;
}

/** The comp's notes grouped into the times the hand comes down. */
export function strikesOf(take: Take): Strike[] {
  const strikes: Strike[] = [];
  for (const note of notesOf(take, "chords")) {
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
