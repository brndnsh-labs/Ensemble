// The player's own charts, kept in the browser as the text they typed
// (`stored.ts`). A browser that refuses to keep them still works: the charts
// then last as long as the visit, and the editor says so.

import type { LibraryChart } from "./library.ts";
import { entryOf, LIBRARY } from "./library.ts";
import { askToKeep, storedList } from "./stored.ts";

interface Stored {
  readonly id: string;
  readonly text: string;
  /** When the text last changed, in milliseconds since 1970: the shelf shows the latest first. */
  readonly modified: number;
}

const KEY = "ensemble.charts.1";

/** What a new chart starts as: enough to see the format, and to type over. */
export const STARTER = `title: New chart
key: C

[A]
| C | Am | F | G |
`;

/** A text file bigger than this is not a chart someone typed. */
const LARGEST = 64 * 1024;

const isStored = (item: unknown): item is Stored => {
  const it = item as Partial<Stored> | null;
  return (
    typeof it?.id === "string" && typeof it.text === "string" && typeof it.modified === "number"
  );
};

/** Each chart as the screens see it, made again only when its text changes. */
const made = new Map<string, LibraryChart>();
let shelf: readonly LibraryChart[] = [];

const charts = storedList(KEY, isStored, (stored) => {
  shelf = [...stored]
    .sort((a, b) => b.modified - a.modified)
    .map((item) => {
      const known = made.get(item.id);
      if (known?.text === item.text) return known;
      const entry = entryOf(item.id, item.text, true);
      made.set(item.id, entry);
      return entry;
    });
});

export const subscribeCharts = charts.subscribe;

/** The player's charts, the one changed last first. The same list until one changes. */
export const ownCharts = (): readonly LibraryChart[] => shelf;

/** False when the browser would not keep the last change: the charts last for this visit only. */
export const keptOnDevice = charts.kept;

/** A chart of the player's or a built-in, by the id in the address. */
export function findChart(id: string): LibraryChart | undefined {
  return shelf.find((entry) => entry.id === id) ?? LIBRARY.find((entry) => entry.id === id);
}

/** Make a new chart of the player's from a text, and say its id. */
export function addChart(text: string): string {
  const id = charts.newId("my-");
  charts.write([...charts.items(), { id, text, modified: Date.now() }]);
  askToKeep();
  return id;
}

/**
 * The player's copy of a text to edit: the copy they already have, if they
 * made one and have not changed it, or a new one. Asking twice does not leave
 * two.
 */
export function copyOf(text: string): string {
  return charts.items().find((chart) => chart.text === text)?.id ?? addChart(text);
}

export function saveChart(id: string, text: string): void {
  const item = charts.items().find((chart) => chart.id === id);
  if (!item || item.text === text) return;
  charts.write(
    charts.items().map((chart) => (chart === item ? { id, text, modified: Date.now() } : chart)),
  );
}

export function deleteChart(id: string): void {
  made.delete(id);
  charts.write(charts.items().filter((chart) => chart.id !== id));
}

/**
 * A chart file as the editor can hold it: its line breaks made plain, since a
 * text box reads every kind as one and the places of the problems found in it
 * are counted in its letters. Undefined for a file too big to be a chart.
 */
export async function readChartFile(file: File): Promise<string | undefined> {
  if (file.size > LARGEST) return undefined;
  return (await file.text()).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}
