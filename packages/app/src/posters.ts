// What the app prints about a style that the style's own pack does not say:
// who is in its band, in a line, and a line about how it sounds. A style's
// colour is in the stylesheet (`--ink-<id>`, with one for a style it has not
// been told about), so a ninth style needs nothing here to work.

import type { StylePack } from "@ensemble/engine";
import { SOLO_INSTRUMENTS } from "@ensemble/engine";
import { styleById } from "@ensemble/styles";
import type { LibraryChart } from "./library.ts";

/** Each instrument pack's own name, read from its description where the packs are kept. */
const PACK_NAMES = import.meta.glob<string>("../../../assets/packs/*/pack.json", {
  import: "name",
  eager: true,
});

/** What an instrument is called: its pack's name, or its id read as words when the pack is not here. */
function instrument(pack: string): string {
  const named = PACK_NAMES[`../../../assets/packs/${pack}/pack.json`];
  if (named) return named;
  const words = pack.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A style's band in a line, the way a bill names it: "Upright bass, grand piano; alto sax out front". */
export function lineUp(style: StylePack): string {
  const { bass, chords } = style.sound.packs;
  const solo = SOLO_INSTRUMENTS[style.solo.instrument]?.name ?? instrument(style.solo.instrument);
  return `${instrument(bass)}, ${instrument(chords).toLowerCase()}; ${solo.toLowerCase()} out front`;
}

/** A line about how each style sounds, shortened from the opening comment of its pack. A style not here has none. */
const SAYS: Readonly<Record<string, string>> = {
  blues: "A Chicago shuffle, the band a hair behind the drums.",
  funk: "Sixteenth-note funk that pushes on the One.",
  jazz: "Medium swing: the ride, a walking bass, a piano comping.",
  rock: "A straight-eighth backbeat band.",
  disco: "Four on the floor that never lets up.",
  neosoul: "A soft loop, the bass and the Rhodes far behind it.",
  reggae: "Roots reggae: the one drop, and nothing on the One.",
  acoustic: "The singer-songwriter’s band, restraint around a guitar.",
};

export const saysOf = (style: StylePack): string | undefined => SAYS[style.id];

/** The style a chart was written for: the one its text names, if this version has it. */
export const writtenFor = (entry: LibraryChart): StylePack | undefined =>
  styleById(entry.chart.styleId ?? "");

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** A small number as a word, to start a heading with: "Eight styles". */
export const spelled = (n: number): string => WORDS[n] ?? String(n);

/** "1 chart", "8 charts". */
export const count = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** By title, the way a person reads one: "8-Bar Blues" before "12-Bar Blues", capitals aside. */
export const byTitle = (a: LibraryChart, b: LibraryChart): number =>
  a.chart.title.localeCompare(b.chart.title, undefined, { numeric: true, sensitivity: "base" }) ||
  a.id.localeCompare(b.id);
