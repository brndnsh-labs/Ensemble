// Canonical printing: `fmt`. See docs/CHART_FORMAT.md section 9.
// Printing a chart and parsing the result gives the same chart.

import { chordText } from "./display.ts";
import type { Cell, Row, TextLine } from "./layout.ts";
import { flow } from "./layout.ts";
import { repeatCount, validRepeatCount } from "./lex.ts";
import type { Bar, BarToken, Chart, ChartComment, ChartField, Section } from "./model.ts";

export function print(chart: Chart): string {
  // Blocks are separated by one blank line: the header, each section, the arrangement.
  const blocks: string[][] = [linesOf(chart.header), ...chart.sections.map(printSection)];
  if (chart.arrangement) blocks.push(chart.arrangement.text.split("\n"));
  const text = blocks
    .filter((block) => block.length > 0)
    .map((block) => block.join("\n"))
    .join("\n\n");
  return text === "" ? "" : `${text}\n`;
}

const commentText = (comment: ChartComment): string =>
  comment.text === "" ? "//" : `// ${comment.text}`;

/** `name: value`. A value that starts with `//` keeps touching the colon, or it would become a comment. */
function fieldText(field: ChartField): string {
  if (field.value === "") return `${field.name}:`;
  return field.value.startsWith("//")
    ? `${field.name}:${field.value}`
    : `${field.name}: ${field.value}`;
}

function lineText(item: TextLine): string {
  if (item.kind === "field") return fieldText(item);
  return item.kind === "comment" ? commentText(item) : item.text;
}

/** Fields, comments, and unread lines, one to a line. A trailing comment joins the line before it. */
function linesOf(items: readonly TextLine[]): string[] {
  const lines: string[] = [];
  for (const item of items) {
    const last = lines.length - 1;
    if (item.kind === "comment" && item.trailing && last >= 0) lines[last] += ` ${lineText(item)}`;
    else lines.push(lineText(item));
  }
  return lines;
}

function tokenText(token: BarToken): string {
  switch (token.kind) {
    case "chord":
      return chordText(token.chord);
    case "hold":
      return ".";
    case "noChord":
      return "NC";
    case "simile":
      return "%";
    case "annotation":
      return `!${token.word}`;
    case "unknown":
    case "misplaced":
      return token.text;
  }
}

const barText = (bar: Bar): string => bar.tokens.map(tokenText).join(" ");

function printSection(section: Section): string[] {
  const lines = linesOf(section.leading);
  let items = section.items;
  if (!section.implicit) {
    // A comment on the label's own line is the section's first item.
    const first = items[0];
    const onLabel = first?.kind === "comment" && first.trailing ? first : null;
    if (onLabel) items = items.slice(1);
    lines.push(`[${section.label}]${onLabel ? ` ${commentText(onLabel)}` : ""}`);
  }
  const rows = flow(items, section.barsPerLine);
  const columns = measure(rows);
  for (const row of rows) {
    const text = row.kind === "bars" ? barsText(row.cells, columns) : lineText(row.item);
    lines.push(row.comment ? `${text} ${commentText(row.comment)}` : text);
  }
  return lines;
}

/**
 * The bar line before a cell (or after the last one), in two parts so that
 * the `|` characters align down the page: the `:` of a closing repeat hangs to
 * the left of the bar line, and everything else follows it.
 */
interface BarLine {
  readonly left: string;
  readonly right: string;
}

/** A bar that would be read as the repeat count if it came straight after `:|`. */
const looksLikeCount = (cell: Cell | undefined): boolean => {
  const first = cell?.bar.tokens[0];
  const times = first?.kind === "misplaced" ? repeatCount(first.text) : null;
  return times !== null && validRepeatCount(times);
};

function barLines(cells: readonly Cell[]): BarLine[] {
  const lines: BarLine[] = [];
  for (let i = 0; i <= cells.length; i++) {
    const closing = cells[i - 1]?.close;
    const next = cells[i];
    const open = next ? next.open : "|";
    if (!closing) {
      lines.push({ left: "", right: open });
      continue;
    }
    // Twice is the default and is not written, unless the next bar would then be read as the count.
    const { times } = closing;
    const count = times !== null && (times !== 2 || looksLikeCount(next)) ? `x${times}` : "";
    const right = count === "" ? open : next ? `| ${count} ${open}` : `| ${count}`;
    lines.push({ left: ":", right });
  }
  return lines;
}

interface Columns {
  readonly left: number[];
  readonly right: number[];
  readonly bar: number[];
}

/** The widths that make a section's bars line up in columns. */
function measure(rows: readonly Row[]): Columns {
  const columns: Columns = { left: [], right: [], bar: [] };
  const widen = (widths: number[], i: number, text: string): void => {
    widths[i] = Math.max(widths[i] ?? 0, text.length);
  };
  for (const row of rows) {
    if (row.kind !== "bars") continue;
    barLines(row.cells).forEach((line, i) => {
      widen(columns.left, i, line.left);
      widen(columns.right, i, line.right);
    });
    row.cells.forEach((cell, i) => {
      widen(columns.bar, i, barText(cell.bar));
    });
  }
  return columns;
}

function barsText(cells: readonly Cell[], columns: Columns): string {
  let text = "";
  barLines(cells).forEach((line, i) => {
    const cell = cells[i];
    text += line.left.padStart(columns.left[i] ?? 0) + line.right.padEnd(columns.right[i] ?? 0);
    if (cell) text += ` ${barText(cell.bar).padEnd(columns.bar[i] ?? 0)} `;
  });
  return text.trimEnd();
}
