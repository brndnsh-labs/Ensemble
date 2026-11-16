// The players alive: each player's block is inked solid when that player plays
// a note, and fades. The notes are the ones the take was made into, read off
// the clock the band plays to, so a block lights with the sound and not with a
// guess at it. Nothing here goes through React: a frame reads where the band
// is and writes each block's opacity, and nothing on the page is laid out
// again for it.

import type { Sound } from "@ensemble/audio";
import type { Plan, Seat } from "@ensemble/engine";
import { secondsAt } from "@ensemble/engine";
import { useEffect, useRef } from "react";

/** When each seat's notes start, in seconds from the top of the take, in order. */
export type Onsets = ReadonlyMap<string, readonly number[]>;

/** Where the band is, as heard, and the notes it is playing. */
export interface Following {
  /** Seconds into the take, as heard: the player's position less the output's latency. */
  readonly heard: number;
  readonly onsets: Onsets;
}

/**
 * A take's notes, each seat's apart. The count-in is not the band: nothing
 * before the first bar of music lights a block.
 */
export function onsetsOf(sounds: readonly Sound[], plan: Plan): Map<string, number[]> {
  const first = plan.bars.find((bar) => bar.kind === "music");
  const from = first ? secondsAt(plan, first.start) - 0.001 : 0;
  const onsets = new Map<string, number[]>();
  for (const sound of sounds) {
    if (sound.at < from) continue;
    // A sound's pack is named for the chair it sits in: its seat, then its instrument.
    const seat = sound.pack.slice(0, sound.pack.indexOf(":"));
    let times = onsets.get(seat);
    if (!times) {
      times = [];
      onsets.set(seat, times);
    }
    // A chord is several notes at once: one lamp.
    if (times.at(-1) !== sound.at) times.push(sound.at);
  }
  return onsets;
}

/**
 * The notes after a take is replaced under the band from a second on, as the
 * player replaces its sounds: what was to be played before then, and the new
 * take's from then.
 */
export function replaced(was: Onsets, now: Onsets, from: number): Map<string, number[]> {
  const joined = new Map<string, number[]>();
  for (const seat of new Set([...was.keys(), ...now.keys()])) {
    const before = (was.get(seat) ?? []).filter((at) => at < from);
    const after = (now.get(seat) ?? []).filter((at) => at >= from);
    joined.set(seat, [...before, ...after]);
  }
  return joined;
}

/** The last time in a sorted list at or before a moment. */
function lastBy(times: readonly number[], moment: number): number | undefined {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle]! <= moment) low = middle + 1;
    else high = middle;
  }
  return low > 0 ? times[low - 1] : undefined;
}

/** How long a block stays inked at full strength, and how long until it has faded, in seconds. */
const HOLD = 0.0375;
const GONE = 0.15;

/** How inked a block is, a moment after its last note: full, then fading to nothing in 150 ms. */
function strength(since: number): number {
  if (since < 0 || since >= GONE) return 0;
  if (since <= HOLD) return 1;
  // Easing out: quick at first, as a struck note dies.
  const left = 1 - (since - HOLD) / (GONE - HOLD);
  return Math.round(left * left * 100) / 100;
}

/**
 * Light the players' blocks while the band plays. `lamps` holds each seat's
 * lamp, the element inked over its block; `heard` says whether a seat is in
 * the take and not silenced (a silenced seat does not light). Runs only while
 * `playing`, and not at all where the device asks for less movement.
 */
export function useLamps(
  playing: boolean,
  follow: () => Following | undefined,
  lamps: { readonly current: ReadonlyMap<Seat, HTMLElement> },
  heard: (seat: Seat) => boolean,
): void {
  const lit = useRef(heard);
  lit.current = heard;
  useEffect(() => {
    if (!playing) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const shown = new Map<HTMLElement, number>();
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const now = follow();
      for (const [seat, lamp] of lamps.current) {
        let level = 0;
        if (now && lit.current(seat)) {
          const last = lastBy(now.onsets.get(seat) ?? [], now.heard);
          if (last !== undefined) level = strength(now.heard - last);
        }
        if (shown.get(lamp) === level) continue;
        shown.set(lamp, level);
        lamp.style.opacity = level === 0 ? "" : String(level);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      for (const lamp of shown.keys()) lamp.style.opacity = "";
    };
  }, [playing, follow, lamps]);
}
