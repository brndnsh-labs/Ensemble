// The pattern notation style packs are written in: one character per sixteenth,
// sixteen to a bar of 4/4, beat 1 first. Spaces are ignored, so a line can be
// grouped by beat for reading: "x.o. x.o. x.o. x.o."

import { PPQ } from "../chart/types.ts";

/** Ticks in one grid step (a sixteenth note). */
export const STEP = PPQ / 4;

/** The four written stroke levels, before energy scales them. */
export const LEVELS = { X: 118, x: 96, o: 72, g: 36 } as const;
export type LevelSymbol = keyof typeof LEVELS;

/** The symbols of a line, one per step, with spaces removed. */
export function cells(line: string): string[] {
  return [...line.replace(/\s+/g, "")];
}

export interface Stroke {
  /** Sixteenths from the start of the line. */
  readonly step: number;
  /** Written velocity. */
  readonly level: number;
}

/** The strokes of a line written in X, x, o, g and rests. Any other symbol is a rest. */
export function strokes(line: string): Stroke[] {
  const result: Stroke[] = [];
  cells(line).forEach((symbol, step) => {
    if (symbol in LEVELS) result.push({ step, level: LEVELS[symbol as LevelSymbol] });
  });
  return result;
}
