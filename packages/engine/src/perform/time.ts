// A performance in clock time. Players write in ticks on a grid; anything that
// makes sound needs seconds. The tempo is the plan's, so the conversion is here
// and nothing downstream needs to know what a tick is.

import { PPQ } from "../chart/types.ts";
import type { Plan } from "../plan/types.ts";
import type { Seat } from "../style/types.ts";
import type { PerformanceEvent } from "./notes.ts";

/** A note as a sound: when it starts, how long it lasts, and what plays it. */
export interface TimedNote {
  readonly seat: Seat;
  /** The drum piece, the articulation, or the soloist's instrument, when the note names one. */
  readonly voice?: string;
  readonly pitch: number;
  /** 1 to 127, as played. */
  readonly velocity: number;
  /** Seconds from the start of the performance, feel included. */
  readonly at: number;
  /** Seconds it sounds for. */
  readonly length: number;
}

/** Seconds from the start of the performance to a tick. */
export function secondsAt(plan: Plan, tick: number): number {
  return (tick / PPQ) * (60 / plan.tempo);
}

/** Every note of a performance in clock time, in the order they start. */
export function timedNotes(plan: Plan, events: readonly PerformanceEvent[]): TimedNote[] {
  const notes: TimedNote[] = [];
  for (const event of events) {
    if (event.kind !== "note") continue;
    notes.push({
      seat: event.seat,
      ...(event.voice === undefined ? {} : { voice: event.voice }),
      pitch: event.pitch,
      velocity: event.velocity,
      // A note leaning ahead of the first beat cannot start before the performance does.
      at: Math.max(0, secondsAt(plan, event.tick + event.offset)),
      length: secondsAt(plan, event.duration),
    });
  }
  return notes.sort((a, b) => a.at - b.at);
}
