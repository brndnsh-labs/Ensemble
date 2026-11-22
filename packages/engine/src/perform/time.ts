// A performance in clock time. Players write in ticks on a grid; anything that
// makes sound needs seconds. The tempo is the plan's, each bar's own where a take
// breathes, so the conversion is here and nothing downstream needs to know what a
// tick is.

import { PPQ } from "../chart/types.ts";
import type { Plan } from "../plan/types.ts";
import type { Seat } from "../style/types.ts";
import type { PerformanceEvent } from "./notes.ts";
import { asStruck, CURVE_STEP, pitchCurve } from "./pitch.ts";

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

/** Where the tempo changes: from `tick` on, `quarters` a minute, `seconds` into the performance. */
interface Stretch {
  readonly tick: number;
  readonly seconds: number;
  readonly quarters: number;
}

const maps = new WeakMap<Plan, readonly Stretch[]>();

/**
 * The plan's tempo map: one stretch for a take at the tempo as set, and one more wherever a
 * bar of a take that breathes changes it. The look-ahead is read too, so a tick past the end
 * of an open jam is timed as the next pass will be.
 */
function tempoMap(plan: Plan): readonly Stretch[] {
  let map = maps.get(plan);
  if (map) return map;
  const first = plan.bars[0]?.quarters ?? plan.quarters;
  const stretches: Stretch[] = [{ tick: 0, seconds: 0, quarters: first }];
  for (const bar of [...plan.bars, ...plan.lookahead]) {
    const last = stretches[stretches.length - 1]!;
    if (bar.quarters === last.quarters) continue;
    stretches.push({
      tick: bar.start,
      seconds: last.seconds + ((bar.start - last.tick) / PPQ) * (60 / last.quarters),
      quarters: bar.quarters,
    });
  }
  map = stretches;
  maps.set(plan, map);
  return map;
}

/** The stretch of the tempo map a tick is in. A tick before the first bar is timed as the first. */
function stretchAt(map: readonly Stretch[], tick: number): Stretch {
  let low = 0;
  let high = map.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (map[middle]!.tick <= tick) low = middle;
    else high = middle - 1;
  }
  return map[low]!;
}

/** Quarter notes a minute where a tick falls: the bar's own tempo. */
export function quartersAt(plan: Plan, tick: number): number {
  return stretchAt(tempoMap(plan), tick).quarters;
}

/** Seconds from the start of the performance to a tick. */
export function secondsAt(plan: Plan, tick: number): number {
  const at = stretchAt(tempoMap(plan), tick);
  return at.seconds + ((tick - at.tick) / PPQ) * (60 / at.quarters);
}

/** The tick a second of the performance falls on: `secondsAt` the other way. */
export function tickAt(plan: Plan, seconds: number): number {
  const map = tempoMap(plan);
  let low = 0;
  let high = map.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (map[middle]!.seconds <= seconds) low = middle;
    else high = middle - 1;
  }
  const at = map[low]!;
  return at.tick + ((seconds - at.seconds) * at.quarters * PPQ) / 60;
}

/** Seconds that `ticks` from `from` last: across a change of tempo, as each bar is timed. */
export function secondsFor(plan: Plan, from: number, ticks: number): number {
  const map = tempoMap(plan);
  if (map.length === 1) return (ticks / PPQ) * (60 / map[0]!.quarters);
  return secondsAt(plan, from + ticks) - secondsAt(plan, from);
}

/** Seconds a tick lasts where a tick falls. */
const secondsPerTickAt = (plan: Plan, tick: number): number =>
  (1 / PPQ) * (60 / quartersAt(plan, tick));

/** Every note of a performance in clock time, in the order they start. */
export function timedNotes(plan: Plan, events: readonly PerformanceEvent[]): TimedNote[] {
  const notes: TimedNote[] = [];
  // A note not struck is heard as part of the note before it.
  for (const event of asStruck(events, (tick) => secondsPerTickAt(plan, tick))) {
    if (event.kind !== "note") continue;
    const start = event.tick + event.offset;
    // A note that dies away past its end sounds until it has.
    const length = secondsFor(plan, start, event.duration + (event.fade ?? 0));
    notes.push({
      seat: event.seat,
      ...(event.voice === undefined ? {} : { voice: event.voice }),
      pitch: event.pitch,
      velocity: event.velocity,
      // A note leaning ahead of the first beat cannot start before the performance does.
      at: Math.max(0, secondsAt(plan, start)),
      length,
      ...(event.move === undefined
        ? {}
        : {
            bend: {
              step: CURVE_STEP,
              cents: pitchCurve(event.move, secondsPerTickAt(plan, start), length),
            },
          }),
      ...(event.fade === undefined
        ? {}
        : { fade: secondsFor(plan, start + event.duration, event.fade) }),
    });
  }
  return notes.sort((a, b) => a.at - b.at);
}
