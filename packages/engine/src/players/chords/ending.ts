// The ending bar: whatever is written before the final chord is struck
// plainly, then the final chord once, where it lands, in the style's gesture
// with the rest of the band (CH-74, EN-14 to EN-18). It is never pushed (EN-21):
// the rhythm that pushes never writes into this bar.

import { PPQ } from "../../chart/types.ts";
import type { Arrival } from "../../perform/harmony.ts";
import { pulseTicks } from "../../perform/meter.ts";
import type { PlanBar } from "../../plan/types.ts";
import { tierOf } from "../../style/types.ts";
import { pitchClass } from "../../theory/pitch.ts";
import { pulseStarts, stretches } from "./plain.ts";
import type { Strike } from "./strike.ts";
import type { ChordStyle } from "./style.ts";

const EIGHTH = PPQ / 2;

export function endingStrikes(
  bar: PlanBar,
  harmony: readonly Arrival[],
  chords: ChordStyle,
): Strike[] {
  const ending = bar.ending;
  const energy = bar.seats.chords;
  if (!ending || energy === null || bar.kind !== "music") return [];
  const kind = chords.voicing[tierOf(energy)];
  const from = bar.start + ending.at;
  const until = from + ending.ring;
  const first = harmony.findLastIndex((arrival) => arrival.tick <= bar.start);
  const own = stretches(bar, harmony, Math.max(0, first));
  const final = own.find((stretch) => stretch.start === from && stretch.chord !== null);
  const strikes: Strike[] = [];
  const strike = (
    tick: number,
    duration: number,
    velocity: number,
    arrival: Arrival,
    again = false,
    pullOff?: number,
  ) =>
    strikes.push({
      bar: bar.index,
      tick,
      duration: Math.max(1, duration),
      velocity,
      arrival,
      kind,
      // The final chord is a downstroke on a guitar, wherever it lands (CH-74).
      down: true,
      ...(again ? { again: true as const } : {}),
      // The final chord leaves nothing out (`Strike.whole`).
      ...(arrival === final?.arrival ? { whole: true as const } : {}),
      ...(pullOff !== undefined ? { pullOff } : {}),
    });

  // A chord on the way to the final one (the V of a last bar that gets home itself).
  const beats = pulseStarts(bar);
  for (const stretch of own) {
    if (stretch.start >= from || stretch.chord === null) continue;
    const level = beats.has(stretch.start - bar.start)
      ? chords.plain.velocity.beat
      : chords.plain.velocity.offbeat;
    const length = Math.round((Math.min(stretch.end, from) - stretch.start) * chords.plain.length);
    strike(stretch.start, length, level, stretch.arrival);
  }
  if (!final) return strikes;

  const arrival = final.arrival;
  const level = ending.gesture.kind === "soft" ? chords.ending.soft : chords.ending.velocity;
  const barEnd = bar.start + bar.ticks;
  switch (ending.gesture.kind) {
    case "hold":
    case "soft": {
      // The stinger, on the final tonic only, where it rings past the eighth it is pulled off on
      // (EN-49). Whether the grip has one is the guitar's to say.
      const chord = arrival.chord;
      const tonic = chord !== null && pitchClass(chord.root) === pitchClass(bar.key.tonic);
      const pullOff =
        chords.ending.pullOff && tonic && until - from > EIGHTH * 2
          ? chords.ending.pullOff.level
          : undefined;
      strike(from, until - from, level, arrival, false, pullOff);
      break;
    }
    case "stop":
      strike(from, Math.min(EIGHTH, until - from), level, arrival);
      break;
    case "button": {
      // Held to the "and" of the bar's last pulse, then one short hit harder (EN-17).
      const pulses = pulseTicks(bar.meter);
      const lastPulse = pulses[pulses.length - 1]!;
      const button = barEnd - (lastPulse > PPQ ? EIGHTH : lastPulse / 2);
      if (button - from < EIGHTH || button >= until) {
        strike(from, until - from, level, arrival);
        break;
      }
      strike(from, button - from, level, arrival);
      strike(button, Math.min(EIGHTH, until - button), level + chords.ending.accent, arrival, true);
      break;
    }
    case "hits": {
      // Short stabs on the listed pulses after the chord lands; the last one rings (EN-18).
      const starts = [...beats].sort((a, b) => a - b).map((tick) => bar.start + tick);
      const wanted = ending.gesture.beats
        .map((beat) => starts[beat - 1])
        .filter((tick): tick is number => tick !== undefined && tick >= from && tick < until);
      const ticks = wanted.length > 0 ? [...new Set(wanted)].sort((a, b) => a - b) : [from];
      ticks.forEach((tick, i) => {
        const next = ticks[i + 1];
        strike(
          tick,
          next === undefined ? until - tick : Math.min(EIGHTH, next - tick),
          level,
          arrival,
        );
      });
      break;
    }
  }
  return strikes;
}
