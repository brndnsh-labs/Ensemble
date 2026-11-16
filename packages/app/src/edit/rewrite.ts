// Every change made by tapping the chart, as a rewrite of its text. The text is
// the chart: nothing here keeps a model of its own. A change is made where a
// person would make it (over a bar's own letters, beside a bar, under a label),
// the result is read back by the parser, and the section that was touched is
// written out the way `fmt` writes it, so its columns line up again. Everything
// outside that section is left letter for letter as it was typed.

import type { ArrangementLine, Bar, BarToken, Chart, Section, SectionItem } from "@ensemble/engine";
import {
  arrangedLines,
  chordText,
  expand,
  parse,
  print,
  runsOf,
  withArrangement,
} from "@ensemble/engine";

/** A bar on the page: the section it is drawn under, and its place among the bars written for that section. */
export interface BarPlace {
  readonly section: number;
  readonly bar: number;
}

/**
 * What a bar with nothing in it is written as. The format has no empty bar
 * (`| |` makes none, and says to write what the bar does): a bar that plays
 * nothing is a bar of no chord.
 */
export const EMPTY_BAR = "NC";

/** How many bars a new line has. */
const NEW_LINE = [EMPTY_BAR, EMPTY_BAR, EMPTY_BAR, EMPTY_BAR];

// ── reading ─────────────────────────────────────────────────────────────────

/** A section's bars in the order they are written, through its repeats and endings. */
export function barsOf(items: readonly SectionItem[]): Bar[] {
  return items.flatMap((item): Bar[] => {
    if (item.kind === "bar") return [item];
    if (item.kind !== "repeat") return [];
    return [item.body, ...item.endings.map((ending) => ending.items)].flatMap((list) =>
      list.filter((each): each is Bar => each.kind === "bar"),
    );
  });
}

function tokenText(token: BarToken): string {
  switch (token.kind) {
    case "chord":
      return chordText(token.chord);
    case "hold":
      return ".";
    case "noChord":
      return EMPTY_BAR;
    case "simile":
      return "%";
    case "annotation":
      return `!${token.word}`;
    case "unknown":
    case "misplaced":
      return token.text;
  }
}

/** A bar as the format writes it: `Dm7 . G7`, `%`, `NC`. */
export const barText = (bar: Bar): string => bar.tokens.map(tokenText).join(" ");

/** The section whose bars a section plays: itself, or the earlier one it repeats by name. */
export function sourceOf(chart: Chart, index: number): Section | undefined {
  const from = chart.sections[index]?.barsFrom;
  return from === null || from === undefined ? undefined : chart.sections[from];
}

/** Labels match as the parser matches them: without regard to case or spacing. */
const labelId = (label: string): string => label.trim().replace(/\s+/g, " ").toLowerCase();

/** A label as it can stand between the brackets: no bracket, no comment, one line. */
export const labelOf = (typed: string): string =>
  typed.replace(/[[\]]/g, " ").replace(/\/\/+/g, "/").replace(/\s+/g, " ").trim();

/** Whether a section other than those called `but` already has this label. */
export function labelTaken(chart: Chart, label: string, but?: string): boolean {
  const id = labelId(label);
  return (
    (but === undefined || labelId(but) !== id) &&
    chart.sections.some((section) => labelId(section.label) === id)
  );
}

/** The sections the song plays, by their place in the chart, in order. */
const played = (chart: Chart): number[] =>
  runsOf(expand(chart).song).map((run) => run[0]!.sectionIndex);

/** How many of the chart's sections have bars to play. */
export const playedSections = (chart: Chart): number => played(chart).length;

// ── the text of a section ───────────────────────────────────────────────────

const lineStart = (text: string, at: number): number => text.lastIndexOf("\n", at - 1) + 1;

/** Where a section's lines begin: at the comments that lead it, or at its label, or at its first bar. */
const startOf = (text: string, section: Section): number =>
  lineStart(text, (section.leading[0] ?? section).range.start);

/** Where the next thing after a section begins: the section below, the arrangement, or the end. */
function limitOf(text: string, chart: Chart, index: number): number {
  const next = chart.sections[index + 1];
  if (next) return startOf(text, next);
  return chart.arrangement ? lineStart(text, chart.arrangement.range.start) : text.length;
}

/** A section's own lines in the text, to the end of its last line, without the blank lines that follow it. */
function regionOf(text: string, chart: Chart, index: number): { start: number; end: number } {
  const start = startOf(text, chart.sections[index]!);
  const within = text.slice(start, limitOf(text, chart, index));
  const written = within.trimEnd().length;
  // Spaces left at the end of the last line belong to the line, not to the gap after it.
  const spaces = /^[ \t]*/.exec(within.slice(written))?.[0].length ?? 0;
  return { start, end: start + written + spaces };
}

/** A section as `fmt` writes it: the formatter itself, asked for one section. */
const sectionText = (chart: Chart, section: Section): string =>
  print({ ...chart, header: [], sections: [section], arrangement: null }).trimEnd();

/**
 * The text with these sections written as `fmt` writes them, and everything
 * else as it was. `widths` gives a section the line width it is to keep: the
 * formatter reads a section's width off the lines as they stand, and a line a
 * bar was just added to would otherwise be taken for the width its author
 * wanted, so a line of four would grow to five, and then to twelve.
 */
export function reprinted(
  text: string,
  sections: readonly number[],
  widths?: ReadonlyMap<number, number>,
): string {
  const { chart } = parse(text);
  let out = text;
  // From the bottom up, so that the places above stay where they were found.
  for (const index of [...new Set(sections)].sort((a, b) => b - a)) {
    const section = chart.sections[index];
    if (!section) continue;
    const { start, end } = regionOf(text, chart, index);
    const barsPerLine = widths?.get(index) ?? section.barsPerLine;
    out = out.slice(0, start) + sectionText(chart, { ...section, barsPerLine }) + out.slice(end);
  }
  // A width the formatter would not read back off the result (an ending's bars must share a
  // line, whatever the width) is given up for the one it does read: what is written is always
  // what `fmt` would leave alone.
  return widths ? reprinted(out, sections) : out;
}

/** The text after a change to one section's bars, laid out again at the width the section had. */
function relaid(text: string, chart: Chart, source: Section): string {
  const index = chart.sections.indexOf(source);
  return reprinted(text, [index], new Map([[index, source.barsPerLine]]));
}

interface Splice {
  readonly at: number;
  readonly end: number;
  readonly text: string;
}

const spliced = (text: string, splices: readonly Splice[]): string =>
  [...splices]
    .sort((a, b) => b.at - a.at || b.end - a.end)
    .reduce((out, { at, end, text: put }) => out.slice(0, at) + put + out.slice(end), text);

/** A bar line to stand in front of a bar that is the first thing on its line, so nothing typed there starts a line. */
const lead = (text: string, bar: Bar): string =>
  text.slice(lineStart(text, bar.range.start), bar.range.start).trim() === "" ? "| " : " ";

// ── a bar ───────────────────────────────────────────────────────────────────

/**
 * What was typed in a bar, as the bars it asks for: one for each stretch
 * between bar lines. Nothing typed is an empty bar. A word cannot start with
 * `//`, which would turn the rest of the line into a comment.
 */
export function piecesOf(typed: string): string[] {
  const pieces = typed
    .split("|")
    .map((piece) =>
      piece
        .split(/\s+/)
        .filter((word) => word !== "")
        .map((word) => word.replace(/^\/\/+/, "/"))
        .join(" "),
    )
    .filter((piece) => piece !== "");
  return pieces.length === 0 ? [EMPTY_BAR] : pieces;
}

/**
 * The chart with a bar typed again. Bar lines in what was typed spread it over
 * the bars that follow, replacing what they held, and past the section's last
 * bar they add bars at its end. `written` is how many bars that came to. Typing a
 * bar as it already is changes nothing at all.
 */
export function retyped(
  text: string,
  at: BarPlace,
  typed: string,
): { text: string; written: number } {
  const { chart } = parse(text);
  const source = sourceOf(chart, at.section);
  const bars = source ? barsOf(source.items) : [];
  const last = bars.at(-1);
  if (!source || !last || !bars[at.bar]) return { text, written: 1 };
  const pieces = piecesOf(typed);
  const over = bars.slice(at.bar, at.bar + pieces.length);
  if (over.length === pieces.length && over.every((bar, i) => barText(bar) === pieces[i]))
    return { text, written: pieces.length };
  const splices: Splice[] = over.map((bar, i) => ({
    at: bar.range.start,
    end: bar.range.end,
    text: `${lead(text, bar)}${pieces[i]} `,
  }));
  // Past the section's last bar the rest are new bars, on a line of their own under it: after
  // a repeat that closes there, not inside it.
  const added = pieces.slice(over.length);
  if (added.length > 0) {
    const end = text.indexOf("\n", last.range.end);
    const at = end < 0 ? text.length : end;
    splices.push({ at, end: at, text: `\n${added.map((piece) => `| ${piece} `).join("")}|` });
  }
  return { text: relaid(spliced(text, splices), chart, source), written: pieces.length };
}

/** The chart with an empty bar put in beside a bar: in the same repeat or ending, if it is in one. */
export function withBar(text: string, at: BarPlace, side: "before" | "after"): string {
  const { chart } = parse(text);
  const source = sourceOf(chart, at.section);
  const bar = source && barsOf(source.items)[at.bar];
  if (!source || !bar) return text;
  const splice: Splice =
    side === "after"
      ? { at: bar.range.end, end: bar.range.end, text: ` | ${EMPTY_BAR} ` }
      : { at: bar.range.start, end: bar.range.start, text: `${lead(text, bar)}${EMPTY_BAR} | ` };
  return relaid(spliced(text, [splice]), chart, source);
}

/** The chart without a bar. A section keeps its last bar: without one it would be another section's repeat. */
export function withoutBar(text: string, at: BarPlace): string {
  const { chart } = parse(text);
  const source = sourceOf(chart, at.section);
  const bars = source ? barsOf(source.items) : [];
  const bar = bars[at.bar];
  if (!source || !bar || bars.length < 2) return text;
  // A repeat's only bar takes the repeat's signs and its count with it: they have nothing left to repeat.
  const alone = source.items.find(
    (item) => item.kind === "repeat" && barsOf([item]).length === 1 && barsOf([item])[0] === bar,
  );
  const count = alone ? (/^[ \t]*[xX]\d+/.exec(text.slice(alone.range.end))?.[0].length ?? 0) : 0;
  const splice: Splice = alone
    ? { at: alone.range.start, end: alone.range.end + count, text: " | " }
    : { at: bar.range.start, end: bar.range.end, text: " " };
  return relaid(spliced(text, [splice]), chart, source);
}

// ── a section ───────────────────────────────────────────────────────────────

/**
 * The arrangement block carried across a change to the song's sections, so
 * that a line still stands beside the section it was written for. `from` says
 * which section of the old chart a section of the new one was, or that it is
 * new; `copy` is a section made as a copy of another, which takes that one's
 * line. A block that was not in use (a mistake in it, or already out of step
 * with the song) is left as it was typed: the grid offers to line it up.
 */
function carried(
  before: Chart,
  text: string,
  from: (index: number) => number | undefined,
  copy?: number,
): string {
  const block = before.arrangement;
  if (!block || block.lines === null || block.typed !== null || !block.fits) return text;
  const lines = arrangedLines(before);
  const old = new Map(played(before).map((index, i) => [index, lines[i]]));
  const { chart } = parse(text);
  const plain = arrangedLines({ ...chart, arrangement: null });
  const next = played(chart).map((index, i): ArrangementLine => {
    const was = from(index);
    const line = was === undefined ? undefined : old.get(was);
    const label = chart.sections[index]!.label;
    if (!line) return plain[i]!;
    return index === copy ? { ...line, label, leading: [], comment: null } : { ...line, label };
  });
  return withArrangement(text, next);
}

/** A chart of bars with no label over them has one section, called A. Its label, written out. */
function namedFirst(text: string, chart: Chart): Splice[] {
  const first = chart.sections[0];
  if (chart.sections.length !== 1 || !first?.implicit) return [];
  const at = lineStart(text, first.range.start);
  return [{ at, end: at, text: `[${first.label}]\n` }];
}

/**
 * The chart with a section under another name. A section played again by
 * name further down is the same section, so every label that says it changes
 * with it, and so do its lines in the arrangement. A name another section
 * has, or no name, changes nothing.
 */
export function renamed(text: string, index: number, typed: string): string {
  const { chart } = parse(text);
  const section = chart.sections[index];
  const label = labelOf(typed);
  if (!section || label === "" || label === section.label) return text;
  if (labelTaken(chart, label, section.label)) return text;
  const id = labelId(section.label);
  const splices = chart.sections.flatMap((each, i): Splice[] => {
    if (each.implicit) {
      // Bars with no label over them: the label is a new line above them.
      const at = lineStart(text, each.range.start);
      return i === index ? [{ at, end: at, text: `[${label}]\n` }] : [];
    }
    return i === index || (!section.implicit && labelId(each.label) === id)
      ? [{ at: each.range.start, end: each.range.end, text: `[${label}]` }]
      : [];
  });
  return carried(chart, spliced(text, splices), (i) => i);
}

/** A label for a copy: `Verse 2` for `Verse`, and the next number that is free. */
function numbered(chart: Chart, label: string): string {
  const base = label.replace(/\s+\d+$/, "") || "Section";
  for (let n = 2; ; n++) if (!labelTaken(chart, `${base} ${n}`)) return `${base} ${n}`;
}

/** A label for a new section: the next letter where the sections are lettered, and `New` where they are named. */
function fresh(chart: Chart): string {
  const labels = chart.sections.map((section) => section.label.trim().toUpperCase());
  if (labels.every((label) => /^[A-Z]?$/.test(label))) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const after = Math.max(-1, ...labels.map((label) => letters.indexOf(label))) + 1;
    const letter = [...letters.slice(after), ...letters].find((each) => !labels.includes(each));
    if (letter) return letter;
  }
  return labelTaken(chart, "New") ? numbered(chart, "New") : "New";
}

/**
 * The chart with a copy of a section under it: its own label and its own bars,
 * to be changed without changing the first. (The same label again would be the
 * same section again.) Returns the text and where the copy is.
 */
export function duplicated(text: string, index: number): { text: string; section: number } {
  const { chart } = parse(text);
  const section = chart.sections[index];
  const source = sourceOf(chart, index);
  if (!section || !source) return { text, section: index };
  const label = numbered(chart, section.label || source.label);
  const copy = sectionText(chart, { ...source, label, implicit: false, leading: [] });
  const { end } = regionOf(text, chart, index);
  const next = spliced(text, [...namedFirst(text, chart), { at: end, end, text: `\n\n${copy}` }]);
  const from = (i: number) => (i <= index ? i : i === index + 1 ? index : i - 1);
  return { text: carried(chart, next, from, index + 1), section: index + 1 };
}

/** The chart with a new section under one: a label and a line of empty bars. */
export function withSection(text: string, index: number): { text: string; section: number } {
  const { chart } = parse(text);
  if (!chart.sections[index]) return { text, section: index };
  const { end } = regionOf(text, chart, index);
  const block = `[${fresh(chart)}]\n| ${NEW_LINE.join(" | ")} |`;
  const next = spliced(text, [...namedFirst(text, chart), { at: end, end, text: `\n\n${block}` }]);
  const from = (i: number) => (i <= index ? i : i === index + 1 ? undefined : i - 1);
  return { text: carried(chart, next, from), section: index + 1 };
}

/**
 * The chart without a section. When sections further down play it again by
 * name, the first of them is given its bars, so the song loses this one place
 * and nothing else. The last section with bars cannot be taken out.
 */
export function withoutSection(text: string, index: number): string {
  const { chart } = parse(text);
  const section = chart.sections[index];
  if (!section) return text;
  const plays = section.barsFrom !== null;
  if (plays && playedSections(chart) < 2) return text;
  const heir = chart.sections.findIndex((each, i) => i > index && each.barsFrom === index);
  const splices: Splice[] = [];
  if (section.barsFrom === index && heir >= 0) {
    const taking = chart.sections[heir]!;
    const { start, end } = regionOf(text, chart, heir);
    splices.push({
      at: start,
      end,
      text: sectionText(chart, { ...section, label: taking.label, leading: taking.leading }),
    });
  }
  const { start } = regionOf(text, chart, index);
  const limit = limitOf(text, chart, index);
  let next = spliced(text, [...splices, { at: start, end: limit, text: "" }]);
  // The last thing in the chart: no blank lines are left where it was.
  if (limit === text.length) next = `${next.trimEnd()}\n`;
  return carried(chart, next, (i) => (i < index ? i : i + 1));
}
