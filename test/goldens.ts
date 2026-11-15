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
  // Funk: a vamp with a solo over it (the riff, the guitar, the sixteenths).
  {
    file: "funk-two-chord-dm-solo.mid",
    chart: "funk-two-chord-dm.chart",
    style: "funk",
    options: { mode: "jam", passes: 4, seed: 1, solo: true },
  },
  // Funk: sections, an intro and a written ending, in song mode.
  {
    file: "funk-intro-outro-c.mid",
    chart: "funk-intro-outro-c.chart",
    style: "funk",
    options: { mode: "song", seed: 2 },
  },
  // Jazz: the head, the walk, a solo, and the ending, on a tune with two chords to the bar.
  {
    file: "jazz-rhythm-changes-bb-solo.mid",
    chart: "jazz-rhythm-changes-bb.chart",
    style: "jazz",
    options: { mode: "jam", passes: 4, seed: 1, solo: true },
  },
  // Jazz: a timed jam in three, where the piano and the bass leave their 4/4 books.
  {
    file: "jazz-waltz-f.mid",
    chart: "jazz-waltz-f.chart",
    style: "jazz",
    options: { mode: "jam", minutes: 2, seed: 2 },
  },
  // Rock: I V vi IV with a solo over it (the backbeat, eighth-note roots, the piano's three tiers).
  {
    file: "rock-four-chord-g-solo.mid",
    chart: "rock-four-chord-g.chart",
    style: "rock",
    options: { mode: "jam", passes: 4, seed: 1, solo: true },
  },
  // Rock: the library's arranged song, in song mode (an intro without the bass, a bridge).
  {
    file: "rock-song-a.mid",
    chart: "rock-song-a.chart",
    style: "rock",
    options: { mode: "song", seed: 2 },
  },
  // Disco: a four-chord loop with a solo over it (the floor, the pump, the chuck at all three tiers).
  {
    file: "disco-four-chord-c-solo.mid",
    chart: "disco-four-chord-c.chart",
    style: "disco",
    options: { mode: "jam", passes: 4, seed: 1, solo: true },
  },
  // Disco: the arranged song, in song mode (a break where the band drops out and comes back).
  {
    file: "disco-song-f.mid",
    chart: "disco-song-f.chart",
    style: "disco",
    options: { mode: "song", seed: 2 },
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
