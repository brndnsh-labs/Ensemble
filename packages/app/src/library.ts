// The built-in charts: the repo's `library/` folder, bundled as text. They are
// ordinary charts in the format anyone can type. The player's own charts are
// kept in the browser (`charts.ts`) and come to the screens in the same shape.

import type { Chart } from "@ensemble/engine";
import { expand, parse } from "@ensemble/engine";

export interface LibraryChart {
  /** A built-in's file name without `.chart`, or `my-` and a few letters for the player's own: what the address bar shows. */
  readonly id: string;
  readonly text: string;
  readonly chart: Chart;
  /** Bars in one time through the form. */
  readonly bars: number;
  /** The player's own chart, which they may change; a built-in is changed by editing a copy. */
  readonly own: boolean;
}

/** A chart as the screens need it. Everything shown about it is read from its text. */
export function entryOf(id: string, text: string, own: boolean): LibraryChart {
  const { chart } = parse(text);
  return { id, text, chart, bars: expand(chart).song.length, own };
}

const files = import.meta.glob<string>("../../../library/*.chart", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const LIBRARY: readonly LibraryChart[] = Object.entries(files)
  .map(([path, text]) =>
    entryOf(path.slice(path.lastIndexOf("/") + 1).replace(/\.chart$/, ""), text, false),
  )
  .sort((a, b) => a.id.localeCompare(b.id));
