// What the property files share: tolerances and readers of a take that more than one of
// band.test.ts, soloist.test.ts, and piano.test.ts needs. Not a test file.

import type { Take } from "@ensemble/engine";
import { arrivals, chordScale, contextOf, MUTED, PICKED, PPQ } from "@ensemble/engine";
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
 * reads those.
 */
export function strikesOf(take: Take, scratches = false): Strike[] {
  const strikes: Strike[] = [];
  for (const note of notesOf(take, "chords")) {
    if (note.voice === PICKED || (note.voice === MUTED) !== scratches) continue;
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
