// The built-in charts: the repo's `library/` folder, bundled as text. They are
// ordinary charts in the format anyone can type.

import type { Chart } from "@ensemble/engine";
import { expand, parse } from "@ensemble/engine";

export interface LibraryChart {
  /** The file name without `.chart`: stable, and what the address bar shows. */
  readonly id: string;
  readonly text: string;
  readonly chart: Chart;
  /** Bars in one time through the form. */
  readonly bars: number;
}

const files = import.meta.glob<string>("../../../library/*.chart", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const LIBRARY: readonly LibraryChart[] = Object.entries(files)
  .map(([path, text]) => {
    const { chart } = parse(text);
    return {
      id: path.slice(path.lastIndexOf("/") + 1).replace(/\.chart$/, ""),
      text,
      chart,
      bars: expand(chart).song.length,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

export function libraryChart(id: string): LibraryChart | undefined {
  return LIBRARY.find((entry) => entry.id === id);
}
