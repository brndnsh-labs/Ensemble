// Changing a chart's arrangement: what the grid in the app does to the text.
// Reading and printing the block itself is in arrangement.ts.

import { printArrangement } from "./arrangement.ts";
import { expand, runsOf } from "./expand.ts";
import type { ArrangementLine, Chart } from "./model.ts";
import { parse } from "./parse.ts";
import type { SourceRange } from "./types.ts";

const NOWHERE: SourceRange = { start: 0, end: 0, line: 1, column: 1 };

/** A section as the style would play it by itself, the soloist in only where the section is a `Solo`. */
const plainLine = (label: string): ArrangementLine => ({
  label,
  energy: null,
  seats: {
    drums: null,
    bass: null,
    chords: null,
    solo: label.trim().toLowerCase().startsWith("solo") ? null : "out",
  },
  leading: [],
  comment: null,
  range: NOWHERE,
});

/**
 * An arrangement for the song as it now is: one line for each section it
 * plays. Where the chart's block has a line for a section it is kept (the
 * second line labelled `Chorus` is for the second time a chorus is played,
 * wherever that now falls); a section the block does not know is plain. So a
 * chart with no block gets a plain arrangement, and a block the song has
 * outgrown is lined up with it again.
 */
export function arrangedLines(chart: Chart): ArrangementLine[] {
  const key = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase();
  const written = new Map<string, ArrangementLine[]>();
  for (const line of chart.arrangement?.lines ?? []) {
    written.set(key(line.label), [...(written.get(key(line.label)) ?? []), line]);
  }
  return runsOf(expand(chart).song).map((run) => {
    const label = run[0]!.sectionLabel;
    const line = written.get(key(label))?.shift();
    return line ? { ...line, label } : plainLine(label);
  });
}

/**
 * The chart's text with its arrangement set to these lines: everything above
 * the block is left as typed, and the block is written in its canonical form.
 */
export function withArrangement(text: string, lines: readonly ArrangementLine[]): string {
  const { arrangement } = parse(text).chart;
  const above = (arrangement ? text.slice(0, arrangement.range.start) : text).trimEnd();
  const block = printArrangement({
    lines,
    closing: arrangement?.lines ? arrangement.closing : [],
    typed: null,
    fits: true,
    range: NOWHERE,
  });
  return `${above}${above === "" ? "" : "\n\n"}${block.join("\n")}\n`;
}

/** The chart's text with its arrangement taken out: the song goes back to the style's own. */
export function withoutArrangement(text: string): string {
  const { arrangement } = parse(text).chart;
  return arrangement ? `${text.slice(0, arrangement.range.start).trimEnd()}\n` : text;
}
