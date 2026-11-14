// Golden takes: a fixed chart, style, and seed that must produce exactly a
// stored MIDI file. They detect unintended change; they do not prove the music
// is good. See docs/TESTING.md, kind 3: one or two per style.

import { readFileSync } from "node:fs";
import type { TakeOptions } from "@ensemble/engine";
import { render, toMidi } from "@ensemble/engine";
import { styleById } from "@ensemble/styles";

export interface Golden {
  /** The stored file, under test/goldens/. */
  readonly file: string;
  readonly chart: string;
  readonly style: string;
  readonly options: TakeOptions;
}

export const GOLDENS: readonly Golden[] = [
  // A timed jam through the whole arc, with the ending.
  {
    file: "blues-12-bar-a.mid",
    chart: "blues-12-bar-a.chart",
    style: "blues",
    options: { mode: "jam", minutes: 2, seed: 1 },
  },
  // Mid-bar changes, an intro, and a written ending, in song mode.
  {
    file: "blues-intro-outro-d.mid",
    chart: "blues-intro-outro-d.chart",
    style: "blues",
    options: { mode: "song", seed: 2 },
  },
  // The band, then a three-chorus solo that runs into the ending.
  {
    file: "blues-12-bar-a-solo.mid",
    chart: "blues-12-bar-a.chart",
    style: "blues",
    options: { mode: "jam", passes: 4, seed: 3, solo: true },
  },
];

export const goldenUrl = (golden: Golden): URL =>
  new URL(`goldens/${golden.file}`, import.meta.url);

export function renderGolden(golden: Golden): Uint8Array {
  const style = styleById(golden.style);
  if (!style) throw new Error(`golden ${golden.file}: no style "${golden.style}"`);
  const text = readFileSync(new URL(`../library/${golden.chart}`, import.meta.url), "utf8");
  const take = render(text, style, golden.options);
  return toMidi(take.plan, take.events, style);
}
