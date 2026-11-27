// The plan as the bassist reads it: a line of pieces, each a stretch of one
// bar under one chord, with what he needs to know to play it.

import type { ChartChord } from "../../chart/types.ts";
import { arrivals, contextOf, heldCount } from "../../perform/harmony.ts";
import { pulseTicks } from "../../perform/meter.ts";
import type { Plan, PlanBar } from "../../plan/types.ts";
import { planBar } from "../../plan/types.ts";
import type { Tier } from "../../style/types.ts";
import { tierOf } from "../../style/types.ts";
import type { ChordScale } from "../../theory/scale.ts";
import { chordScale } from "../../theory/scale.ts";
import { bassLinesIn } from "./derive.ts";
import type { BassLine, BassStyle } from "./style.ts";
import { bassPitchClass } from "./tones.ts";

export interface Piece {
  readonly bar: PlanBar;
  /** Absolute ticks. A piece never crosses a barline. */
  readonly start: number;
  readonly end: number;
  /** Null where the bass rests: under N.C. (X-A-21), or in a bar it sits out. */
  readonly chord: ChartChord | null;
  /** The chord's scale in its context: what the comp and the soloist read too (X-A-26). */
  readonly scale: ChordScale | null;
  /**
   * The chord is stated here: a new chord, the top of a section, or the first
   * chord after a rest. Where the chart only carries the same chord on into
   * the next bar, the line continues instead (X-A-22).
   */
  readonly struck: boolean;
  /**
   * Whole bars the chart has already spent on this chord before this bar,
   * which decides whether the line is going up or coming down (BA-97). A
   * chord that arrives partway through a bar starts counting at the next barline.
   */
  readonly cycle: number;
  /**
   * In the ending bar: `final` is the chord the band ends on (and any chord
   * before it over the same bass note, EN-30); `before` is a chord struck on
   * the way to it (EN-37).
   */
  readonly ending: "before" | "final" | null;
  /** Part of the pass after the last one played: read, never played. */
  readonly lookahead: boolean;
  /** Which of the style's parts the bass plays here: the bar's own tier, or the one it is stepping up to. */
  readonly tier: Tier;
}

const RANK: Readonly<Record<Tier, number>> = { low: 0, mid: 1, high: 2 };

/** The bass's tier in a bar by its energy alone. */
function ownTier(bar: PlanBar): Tier {
  return tierOf(bar.seats.bass ?? bar.energy);
}

/**
 * Every piece of the performance in order, look-ahead included. Count-in and
 * tail bars have none. With `early`, the bar before the band steps up a tier
 * is already played in the tier it is going to (BA-25).
 */
export function pieces(plan: Plan, early = false): Piece[] {
  const harmony = arrivals(plan);
  let sounding = -1;
  const held = heldCount();
  const result: Piece[] = [];

  const read = (bar: PlanBar, lookahead: boolean): void => {
    if (bar.kind !== "music") return;
    const first = result.length;
    let tier = ownTier(bar);
    const next = early ? planBar(plan, bar.index + 1) : undefined;
    if (next?.kind === "music" && next.seats.bass !== null && RANK[ownTier(next)] > RANK[tier]) {
      tier = ownTier(next);
    }
    for (const span of bar.spans) {
      const start = bar.start + span.start;
      while ((harmony[sounding + 1]?.tick ?? Infinity) <= start) sounding++;
      const chord = bar.seats.bass === null ? null : span.chord;
      const { merged, struck, cycle } = held(bar, span, chord);
      // One chord written twice in a bar is one piece: the line continues through it.
      if (merged) {
        result[result.length - 1] = { ...result[result.length - 1]!, end: start + span.duration };
        continue;
      }
      const arrival = harmony[Math.max(0, sounding)];
      result.push({
        bar,
        start,
        end: start + span.duration,
        chord,
        scale: chord && arrival ? chordScale(chord, contextOf(harmony, arrival)) : null,
        struck,
        cycle,
        ending: null,
        lookahead,
        tier,
      });
    }
    if (bar.ending) markEnding(result, first);
  };

  for (const bar of plan.bars) read(bar, false);
  for (const bar of plan.lookahead) read(bar, true);
  return result;
}

/** In the ending bar, find the final chord and the chords that share its bass note before it. */
function markEnding(result: Piece[], first: number): void {
  let last = result.length - 1;
  while (last >= first && result[last]!.chord === null) last--;
  if (last < first) return;
  const home = bassPitchClass(result[last]!.chord!);
  let from = last;
  while (from > first) {
    const before = result[from - 1]!.chord;
    if (before === null || bassPitchClass(before) !== home) break;
    from--;
  }
  for (let i = first; i <= last; i++) {
    if (result[i]!.chord === null) continue;
    result[i] = { ...result[i]!, ending: i >= from ? "final" : "before" };
  }
}

/** The part the bass plays in a piece: its bar's tier, or the one that bar steps up to. */
export function tierAt(piece: Piece): Tier {
  return piece.tier;
}

/** The line the bass plays in a piece: its tier's, as written for the bar's meter or made for it. */
export function lineAt(bass: BassStyle, piece: Piece): BassLine {
  return (bassLinesIn(bass, piece.bar.meter) ?? bass.lines)[piece.tier];
}

/**
 * Every line a performance can draw on: the 4/4 lines, and those written or
 * made for a meter it has a bar of.
 */
export function linesIn(bass: BassStyle, form: readonly Piece[]): BassLine[] {
  const lines = new Set([bass.lines.low, bass.lines.mid, bass.lines.high]);
  const seen = new Set<PlanBar["meter"]>();
  for (const piece of form) {
    if (seen.has(piece.bar.meter)) continue;
    seen.add(piece.bar.meter);
    const written = bassLinesIn(bass, piece.bar.meter);
    if (written) for (const line of [written.low, written.mid, written.high]) lines.add(line);
  }
  return [...lines];
}

/** A bar's pulses as lengths in ticks. */
export function pulses(bar: PlanBar): readonly number[] {
  return pulseTicks(bar.meter);
}
