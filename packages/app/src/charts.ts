// The player's own charts, kept in the browser as the text they typed. A chart
// is a few hundred bytes, so they all live under one key in `localStorage`. A
// browser that refuses to keep them (private browsing, a full disk) still
// works: the charts then last as long as the visit, and the editor says so.

import type { LibraryChart } from "./library.ts";
import { entryOf, LIBRARY } from "./library.ts";

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

function load(): Stored[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(
      (item): item is Stored =>
        typeof item?.id === "string" &&
        typeof item.text === "string" &&
        typeof item.modified === "number",
    );
  } catch {
    return [];
  }
}

let stored = load();
/** Whether the last change reached the browser's storage. */
let keeping = true;
/** Each chart as the screens see it, made again only when its text changes. */
const made = new Map<string, LibraryChart>();
let shelf: readonly LibraryChart[] = [];
const listeners = new Set<() => void>();

function changed(): void {
  shelf = [...stored]
    .sort((a, b) => b.modified - a.modified)
    .map((item) => {
      const known = made.get(item.id);
      if (known?.text === item.text) return known;
      const entry = entryOf(item.id, item.text, true);
      made.set(item.id, entry);
      return entry;
    });
  for (const listener of listeners) listener();
}
changed();

function write(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
    keeping = true;
  } catch {
    keeping = false;
  }
  changed();
}

// Another tab of the app changed them.
addEventListener("storage", (event) => {
  if (event.key !== KEY) return;
  stored = load();
  changed();
});

export function subscribeCharts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The player's charts, the one changed last first. The same list until one changes. */
export const ownCharts = (): readonly LibraryChart[] => shelf;

/** False when the browser would not keep the last change: the charts last for this visit only. */
export const keptOnDevice = (): boolean => keeping;

/** A chart of the player's or a built-in, by the id in the address. */
export function findChart(id: string): LibraryChart | undefined {
  return shelf.find((entry) => entry.id === id) ?? LIBRARY.find((entry) => entry.id === id);
}

/** Make a new chart of the player's from a text, and say its id. */
export function addChart(text: string): string {
  // Not `crypto.randomUUID`: that is missing where the app is served over plain HTTP on a home network.
  let id: string;
  do id = `my-${crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)}`;
  while (stored.some((chart) => chart.id === id));
  stored = [...stored, { id, text, modified: Date.now() }];
  write();
  // Ask the browser not to clear the site's storage when it runs short of room. Its answer changes nothing here.
  void navigator.storage?.persist?.().catch(() => {});
  return id;
}

/**
 * The player's copy of a text to edit: the copy they already have, if they
 * made one and have not changed it, or a new one. Asking twice does not leave
 * two.
 */
export function copyOf(text: string): string {
  return stored.find((chart) => chart.text === text)?.id ?? addChart(text);
}

export function saveChart(id: string, text: string): void {
  const item = stored.find((chart) => chart.id === id);
  if (!item || item.text === text) return;
  stored = stored.map((chart) => (chart === item ? { id, text, modified: Date.now() } : chart));
  write();
}

export function deleteChart(id: string): void {
  stored = stored.filter((chart) => chart.id !== id);
  made.delete(id);
  write();
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
