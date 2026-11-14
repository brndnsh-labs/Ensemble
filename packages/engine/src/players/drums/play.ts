// The drum seat. For every bar of the plan: the style's time at the bar's
// tier, then the plan's marks edited into it (a fill over the end of the bar,
// a crash on an arrival), or the count-in, or the style's last bar.
//
// Everything is written on the straight grid at its written level. Swing,
// humanizing and the bar's loudness are applied afterwards, for every seat.

import { LEVELS, type LevelSymbol, STEP } from "../../perform/grid.ts";
import type { Player, WrittenNote } from "../../perform/notes.ts";
import type { EndingMark, PlanBar } from "../../plan/types.ts";
import { applyFill, chooseFills } from "./fill.ts";
import type { BarPart } from "./groove.ts";
import { grooveBar, lineOf, pulses } from "./groove.ts";
import { ARRIVAL_CRASH, ARRIVAL_KICK, type DrumVoice, KIT, voiceName } from "./kit.ts";
import type { DrumStyle } from "./style.ts";

/** A drum stroke has no length to speak of: a thirty-second note. */
const HIT = STEP / 2;
/** The pieces left to ring on the last chord for as long as the band holds it. */
const RINGS: readonly DrumVoice[] = ["crash", "ride", "rideBell", "openHat"];

export const playDrums: Player = ({ plan, style, rng }) => {
  const drums = style.drums;
  const fills = chooseFills(plan, drums, rng);
  const notes: WrittenNote[] = [];

  for (const bar of plan.bars) {
    const energy = bar.seats.drums;
    // A tail bar is the last chord ringing. A bar the drummer sits out is not played at all.
    if (bar.kind === "tail" || energy === null) continue;

    if (bar.kind === "count-in") {
      let step = 0;
      for (const pulse of pulses(bar.meter)) {
        notes.push(stroke(bar, "sticks", step * STEP, LEVELS.x));
        step += pulse;
      }
      continue;
    }

    const part = grooveBar(drums, bar, energy, rng);
    if (bar.ending) {
      notes.push(...endingBar(bar, bar.ending, drums, part.kick?.[0] || LEVELS.x));
      continue;
    }

    const steps = pulses(bar.meter).reduce((sum, pulse) => sum + pulse, 0);
    const fill = fills.get(bar.index);
    if (fill) applyFill(part, fill, steps);
    if (bar.crash) crashOnOne(part, drums, steps);

    for (const [voice, line] of Object.entries(part) as [DrumVoice, number[]][]) {
      line.forEach((level, step) => {
        if (level > 0) notes.push(stroke(bar, voice, step * STEP, level));
      });
    }
  }
  return notes;
};

/**
 * The arrival crash edits the groove, it does not sit on top of it (DR-20,
 * DR-103): the hand that crashes is the hand that was keeping time, so the
 * timekeeper's stroke on 1 goes, and a crash always has a kick under it.
 */
function crashOnOne(part: BarPart, drums: DrumStyle, steps: number): void {
  for (const voice of drums.timekeepers) {
    const line = part[voice];
    if (line) line[0] = 0;
  }
  lineOf(part, "crash", steps)[0] = ARRIVAL_CRASH;
  const kick = lineOf(part, "kick", steps);
  if (!kick[0]) kick[0] = ARRIVAL_KICK;
}

/**
 * The last bar is the style's own: its strike where the final chord lands and
 * nothing else, never the ordinary crash (EN-24). When the bar gets home
 * partway through, each chord before home is caught with a kick alone, at the
 * groove's own downbeat weight and no louder than the last hit: two crashes
 * two beats apart would end the tune twice (EN-38).
 */
function endingBar(
  bar: PlanBar,
  ending: EndingMark,
  drums: DrumStyle,
  downbeatKick: number,
): WrittenNote[] {
  const strike = Object.entries(drums.ending.strike) as [DrumVoice, LevelSymbol][];
  const lastKick = drums.ending.strike.kick;
  const catchLevel = lastKick ? Math.min(downbeatKick, LEVELS[lastKick]) : downbeatKick;

  const notes: WrittenNote[] = [];
  for (const span of bar.spans) {
    if (span.start >= ending.at) break;
    if (span.chord !== null && !span.tied) notes.push(stroke(bar, "kick", span.start, catchLevel));
  }
  for (const [voice, symbol] of strike) {
    const length = RINGS.includes(voice) ? Math.max(HIT, ending.ring) : HIT;
    notes.push(stroke(bar, voice, ending.at, LEVELS[symbol], length));
  }
  return notes;
}

function stroke(
  bar: PlanBar,
  voice: DrumVoice,
  tickInBar: number,
  level: number,
  duration = HIT,
): WrittenNote {
  return {
    seat: "drums",
    bar: bar.index,
    tick: bar.start + tickInBar,
    duration,
    pitch: KIT[voice],
    velocity: Math.min(127, Math.max(1, Math.round(level))),
    voice: voiceName(voice, level),
  };
}
