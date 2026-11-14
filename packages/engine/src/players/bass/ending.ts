// The ending bar: one note, the lowest root on the instrument, played in the
// style's gesture with the rest of the band (EN-02, EN-14 to EN-18, EN-27).

import { PPQ } from "../../chart/types.ts";
import type { EndingMark } from "../../plan/types.ts";
import type { Piece } from "./form.ts";
import { pulses } from "./form.ts";
import type { LineNote } from "./line.ts";
import { SHORTEST } from "./line.ts";

const EIGHTH = PPQ / 2;
/** The button is this much harder than the chord it ends (EN-17). */
const BUTTON_ACCENT = 12;
/** A soft ending is played at four fifths of the usual weight (EN-16). */
const SOFT = 0.8;

/**
 * A chord struck on the way to the final one (the V of a last bar that gets
 * home itself, EN-37): one note in the line's own octave, ringing into the
 * final chord, or an eighth long when the ending is short.
 */
export function strikeBefore(
  piece: Piece,
  ending: EndingMark,
  pitch: number,
  velocity: number,
): LineNote[] {
  const space = piece.end - piece.start;
  const short = ending.gesture.kind === "stop" || ending.gesture.kind === "hits";
  return [strike(piece.start, short ? Math.min(space, EIGHTH) : space, pitch, velocity)];
}

/**
 * The final chord, for each of its pieces in turn (several only when the chord
 * changes over one bass note, EN-30). Every strike is the same low note
 * (BA-99). In an ending that rings, the bass holds while the chord resolves
 * above; in a short one each chord is struck.
 */
export function finalNotes(
  group: readonly Piece[],
  ending: EndingMark,
  pitch: number,
  weight: number,
): LineNote[][] {
  const first = group[0]!;
  const last = group[group.length - 1]!;
  const bar = first.bar;
  const barEnd = bar.start + bar.ticks;
  const from = first.start;
  // A written rest after home is honoured: the note sounds up to it (EN-40). Otherwise it
  // rings as long as the plan lets the final chord ring, through the tail.
  const until = last.end < barEnd ? last.end : last.start + ending.ring;
  const gesture = ending.gesture;
  const result: LineNote[][] = group.map(() => []);
  const held = (velocity: number) => {
    result[0] = [strike(from, until - from, pitch, velocity)];
    return result;
  };

  switch (gesture.kind) {
    case "hold":
      return held(weight);
    case "soft":
      return held(weight * SOFT);
    case "stop":
      group.forEach((piece, i) => {
        const length = Math.min(EIGHTH, piece.end - piece.start, until - piece.start);
        result[i] = [strike(piece.start, length, pitch, weight)];
      });
      return result;
    case "button": {
      // The "and" of the bar's last pulse: its last eighth when the pulse is dotted (EN-17).
      const beats = pulses(bar);
      const lastBeat = beats[beats.length - 1]!;
      const button = barEnd - (lastBeat > PPQ ? EIGHTH : lastBeat / 2);
      // Dropped when the final chord lands too late to leave room before it (EN-39).
      if (button - last.start < EIGHTH || button >= until) return held(weight);
      const stab = strike(button, Math.min(EIGHTH, until - button), pitch, weight + BUTTON_ACCENT);
      result[0] = [strike(from, button - from, pitch, weight)];
      result[group.length - 1]!.push(stab);
      return result;
    }
    case "hits": {
      // Short stabs on the listed pulses that fall after the final chord lands; the last
      // one rings, and is always played (EN-18, EN-39).
      const starts: number[] = [];
      let tick = bar.start;
      for (const beat of pulses(bar)) {
        starts.push(tick);
        tick += beat;
      }
      const wanted = gesture.beats
        .map((beat) => starts[beat - 1])
        .filter((at): at is number => at !== undefined && at >= from && at < until);
      const ticks = wanted.length > 0 ? [...new Set(wanted)].sort((a, b) => a - b) : [from];
      ticks.forEach((at, i) => {
        const next = ticks[i + 1];
        const length = next === undefined ? until - at : Math.min(EIGHTH, next - at);
        const owner = group.findLastIndex((piece) => piece.start <= at);
        result[Math.max(0, owner)]!.push(strike(at, length, pitch, weight));
      });
      return result;
    }
  }
}

function strike(tick: number, duration: number, pitch: number, velocity: number): LineNote {
  const length = Math.max(SHORTEST, duration);
  return {
    tick,
    space: length,
    pitch,
    echo: false,
    level: "arrival",
    exact: { duration: length, velocity },
  };
}
