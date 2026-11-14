// What it means for two charts to be the same chart. Source ranges and each
// chord's text as typed say where and how something was written, not what the
// chart is, so they are set aside. Everything else counts, including how the
// chart is laid out: repeats, comments, names versus numerals.

import type { Chart } from "./model.ts";

/**
 * A plain copy of a chart without source ranges or chords' typed text.
 * Two charts are the same when these copies are deeply equal.
 */
export function chartContent(chart: Chart): unknown {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (typeof value !== "object" || value === null) return value;
    // A chord is the one node whose `text` is how it was typed rather than what it is.
    const isChord = "written" in value;
    const kept = Object.entries(value).filter(
      ([name]) => name !== "range" && !(isChord && name === "text"),
    );
    return Object.fromEntries(kept.map(([name, inner]) => [name, strip(inner)]));
  };
  return strip(chart);
}

/** Round trip: `sameChart(parse(print(chart)).chart, chart)` holds for every chart `parse` returns. */
export function sameChart(a: Chart, b: Chart): boolean {
  return JSON.stringify(chartContent(a)) === JSON.stringify(chartContent(b));
}
