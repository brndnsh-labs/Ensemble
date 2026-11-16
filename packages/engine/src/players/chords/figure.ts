// Reading a written figure: where in the bar the hand comes down, how hard,
// and how long each chord would ring if nothing cut it short.

import { cells, STEP } from "../../perform/grid.ts";
import type { CompFigure, PickPlace, RhythmBook, RhythmTier } from "./style.ts";

/** Sixteenths in a figure's grid: one bar of 4/4. */
export const FIGURE_STEPS = 16;

/** The symbol for "still held". */
export const HELD = "-";

/** One time the figure brings the hand down. */
export interface FigureStroke {
  /** Ticks from the barline. */
  readonly at: number;
  /** Written level. */
  readonly level: number;
  /** Ticks it rings when nothing cuts it short: a held run breathes, a stab is the articulation's length. */
  readonly length: number;
  /** A deadened stroke: a scratch. */
  readonly muted?: true;
  /** A plucked stroke: the places of the grip that sound. */
  readonly pluck?: readonly PickPlace[];
}

export function strokesOf(figure: CompFigure, tier: RhythmTier, book: RhythmBook): FigureStroke[] {
  const articulation = figure.articulation ?? tier.articulation;
  const symbols = cells(figure.grid);
  const strokes: FigureStroke[] = [];
  symbols.forEach((symbol, step) => {
    const stroke = articulation[symbol];
    if (!stroke) return;
    let run = 1;
    while (symbols[step + run] === HELD) run++;
    const steps = run > 1 ? run * book.hold : stroke.steps;
    strokes.push({
      at: step * STEP,
      level: stroke.level,
      length: Math.round(steps * STEP),
      ...(stroke.muted ? { muted: true as const } : {}),
      ...(stroke.pluck ? { pluck: stroke.pluck } : {}),
    });
  });
  return strokes;
}
