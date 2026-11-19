// A performance in clock time. Players write in ticks on a grid; anything that
// makes sound needs seconds. The tempo is the plan's, so the conversion is here
// and nothing downstream needs to know what a tick is.

import { PPQ } from "../chart/types.ts";
import type { Plan } from "../plan/types.ts";
import type { Seat } from "../style/types.ts";
import type { PerformanceEvent } from "./notes.ts";
import { CURVE_STEP, pitchCurve } from "./pitch.ts";

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
  /**
   * Where the note's pitch moves: cents away from `pitch`, one value every
   * `step` seconds from its start. After the last, the pitch stays there.
   */
  readonly bend?: { readonly step: number; readonly cents: readonly number[] };
  /** The last seconds of `length`, over which the note dies away to nothing: a fall. */
  readonly fade?: number;
}

/** Seconds from the start of the performance to a tick. */
export function secondsAt(plan: Plan, tick: number): number {
  return (tick / PPQ) * (60 / plan.quarters);
}

/** Every note of a performance in clock time, in the order they start. */
export function timedNotes(plan: Plan, events: readonly PerformanceEvent[]): TimedNote[] {
  const notes: TimedNote[] = [];
  const secondsPerTick = secondsAt(plan, 1);
  for (const event of events) {
    if (event.kind !== "note") continue;
    // A note that dies away past its end sounds until it has.
    const length = secondsAt(plan, event.duration + (event.fade ?? 0));
    notes.push({
      seat: event.seat,
      ...(event.voice === undefined ? {} : { voice: event.voice }),
      pitch: event.pitch,
      velocity: event.velocity,
      // A note leaning ahead of the first beat cannot start before the performance does.
      at: Math.max(0, secondsAt(plan, event.tick + event.offset)),
      length,
      ...(event.move === undefined
        ? {}
        : { bend: { step: CURVE_STEP, cents: pitchCurve(event.move, secondsPerTick, length) } }),
      ...(event.fade === undefined ? {} : { fade: secondsAt(plan, event.fade) }),
    });
  }
  return notes.sort((a, b) => a.at - b.at);
}
