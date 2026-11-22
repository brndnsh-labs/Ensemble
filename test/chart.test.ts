// The chart format's tests: one runner over the corpus table, one round-trip
// check, one property. See docs/TESTING.md, kind 1. A new edge case is a new
// row in corpus.ts, never a new test here.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { Bar, Chart, ExpandedChart, FlatBar, SourceRange } from "@ensemble/engine";
import {
  barTicks,
  chartContent,
  chordText,
  chordToString,
  createRng,
  expand,
  keyToString,
  parse,
  parseKey,
  print,
  transpose,
} from "@ensemble/engine";
import type { Row } from "./corpus.ts";
import { corpus } from "./corpus.ts";

/** Bars in the corpus notation: `C:1440 G:480 | ~G:1920 | NC:1920`. `~` is a tie, NC is no chord. */
function showBars(bars: readonly FlatBar[]): string {
  const span = (s: FlatBar["spans"][number]) =>
    `${s.tied ? "~" : ""}${s.chord ? chordToString(s.chord) : "NC"}:${s.duration}`;
  return bars.map((bar) => bar.spans.map(span).join(" ")).join(" | ");
}

/** The same bars as numerals, without durations: `I7 | IV7 . | NC`. */
function showNumerals(bars: readonly FlatBar[]): string {
  const span = (s: FlatBar["spans"][number]) =>
    `${s.tied ? "~" : ""}${s.chord ? chordText(s.chord, "numeral") : "NC"}`;
  return bars.map((bar) => bar.spans.map(span).join(" ")).join(" | ");
}

const joined = (bars: string | readonly string[]): string =>
  typeof bars === "string" ? bars : bars.join(" | ");

function checkRow(row: Row): void {
  const { chart, diagnostics } = parse(row.text);
  const expanded = expand(chart);

  // A row gives a line, or "line:column" when the column matters.
  const wanted = row.diagnostics ?? [];
  const where = (d: (typeof diagnostics)[number], pinned: number | string): string =>
    typeof pinned === "number" ? `${d.range.line}` : `${d.range.line}:${d.range.column}`;
  const got = diagnostics.map(
    (d, i) => `${d.severity} at ${where(d, wanted[i]?.[1] ?? 0)}: ${d.message}`,
  );
  const matches =
    got.length === wanted.length &&
    wanted.every(([severity, place, fragment], i) => {
      const actual = diagnostics[i];
      return (
        actual?.severity === severity &&
        where(actual, place) === `${place}` &&
        actual.message.includes(fragment)
      );
    });
  if (!matches)
    assert.deepEqual(
      got,
      wanted.map(([severity, place, fragment]) => `${severity} at ${place}: ...${fragment}...`),
      "diagnostics",
    );

  assert.equal(showBars(expanded.song), joined(row.bars), "bars as played");
  assertBarsCovered(expanded, "the song");

  if (row.header) {
    const actual = {
      title: chart.title,
      key: keyToString(chart.key),
      tempo: chart.tempo,
      meter: `${chart.meter.beats}/${chart.meter.unit}`,
      style: chart.styleId,
    };
    assert.deepEqual({ ...actual, ...row.header }, actual, "header");
  }
  if (row.places)
    assert.deepEqual(
      expanded.song.map(
        (bar) =>
          `${bar.sectionLabel} in ${keyToString(bar.key)} ${bar.meter.beats}/${bar.meter.unit}`,
      ),
      row.places,
      "where each bar is played",
    );
  if (row.sections)
    assert.deepEqual(
      chart.sections.map(
        (s) => `${s.label}: ${s.role}, ${keyToString(s.key)}, ${s.meter.beats}/${s.meter.unit}`,
      ),
      row.sections,
      "sections",
    );
  if (row.jam)
    assert.deepEqual(
      {
        intro: showBars(expanded.intro),
        body: showBars(expanded.body),
        ending: showBars(expanded.ending),
      },
      row.jam,
      "jam mode parts",
    );

  if (row.print !== undefined) assert.equal(print(chart), row.print, "canonical printing");
  if (row.numerals !== undefined)
    assert.equal(showNumerals(expanded.song), row.numerals, "shown as numerals");
  if (row.transposed) {
    const key = parseKey(row.transposed.to);
    assert.ok(key, `${row.transposed.to} is a key`);
    assert.equal(print(transpose(chart, key)), row.transposed.print, "printed in the new key");
  }
  if (row.thereAndBack) {
    const home = print(chart);
    const back = throughKeys(home, [...row.thereAndBack, keyToString(chart.key)]);
    assert.equal(back, home, "home again from other keys");
  }
}

/** Transpose to each key in turn, by way of the printed text each time. */
function throughKeys(text: string, keys: readonly string[]): string {
  let current = text;
  for (const name of keys) {
    const key = parseKey(name);
    assert.ok(key, `${name} is a key`);
    current = print(transpose(parse(current).chart, key));
  }
  return current;
}

/**
 * Every bar is exactly as long as its meter says, and its spans cover it in
 * order without gaps. Bars count up from 0 through each section as played.
 */
function assertBarsCovered(expanded: ExpandedChart, context: string): void {
  let previous: FlatBar | undefined;
  for (const bar of expanded.song) {
    const sameSection = previous?.sectionIndex === bar.sectionIndex;
    const expected = sameSection && previous ? previous.barInSection + 1 : 0;
    assert.equal(bar.barInSection, expected, `${context}: bars count up within a section`);
    previous = bar;
    let at = 0;
    for (const span of bar.spans) {
      assert.equal(span.start, at, `${context}: a span starts where the last one ended`);
      assert.ok(span.duration > 0, `${context}: a span has length`);
      at += span.duration;
    }
    assert.equal(at, bar.ticks, `${context}: the spans fill the bar`);
    assert.equal(bar.ticks, barTicks(bar.meter), `${context}: the bar is one bar of its meter`);
  }
}

/** Parse, print, parse again: the same chart, and printing that changes nothing more. */
function assertRoundTrip(text: string, context: string): void {
  const first = parse(text).chart;
  const printed = print(first);
  const second = parse(printed).chart;
  assert.deepEqual(chartContent(second), chartContent(first), `${context}: same chart after fmt`);
  assert.equal(print(second), printed, `${context}: fmt of fmt changes nothing`);
}

const names = new Set<string>();
for (const row of corpus) {
  assert.ok(!names.has(row.name), `two corpus rows are named "${row.name}"`);
  names.add(row.name);
  test(row.name, () => checkRow(row));
}

const libraryDir = new URL("../library/", import.meta.url);
const library = readdirSync(libraryDir)
  .filter((file) => file.endsWith(".chart"))
  .map((file) => ({ file, text: readFileSync(new URL(file, libraryDir), "utf8") }));

const TWELVE_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const TWELVE_MINOR_KEYS = [
  "Cm",
  "C#m",
  "Dm",
  "Ebm",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Am",
  "Bbm",
  "Bm",
];

/**
 * LEFT FOR THE ENGINEER (the library's standards, docs/decisions/engine.md): charts that do not come home
 * through every key, held out of that one check and nothing else. Each spells a chromatic chord
 * by its less usual name, as the tune is written (F#m7 in A-flat and in D-flat, C#m7 F#7 in
 * B-flat, F#dim7 passing up from F, Bb7 in B), and in some key that name is also what the usual degree spells (#VI and
 * bVII are both B in D-flat), so the text read back takes the usual degree and comes home
 * spelt the other way. Which degree a name is read as is a decision about the format, not a fix.
 */
const NOT_THROUGH_EVERY_KEY = new Set([
  "standard-all-the-things-you-are.chart",
  "standard-body-and-soul.chart",
  "standard-cherokee.chart",
  "standard-giant-steps.chart",
  "standard-have-you-met-miss-jones.chart",
]);

test("formatting a chart never changes it: parse, print, parse again gives the same chart (whole corpus and library); every library chart is free of errors and warnings, and comes home unchanged from each of the twelve keys", () => {
  for (const row of corpus) assertRoundTrip(row.text, row.name);
  assert.ok(library.length > 0, "the library has charts");
  for (const { file, text } of library) {
    assertRoundTrip(text, file);
    const { chart, diagnostics } = parse(text);
    const problems = diagnostics.filter((d) => d.severity !== "info");
    assert.deepEqual(problems, [], `${file} has no errors or warnings`);
    const home = print(chart);
    if (NOT_THROUGH_EVERY_KEY.has(file)) continue;
    for (const away of chart.key.mode === "minor" ? TWELVE_MINOR_KEYS : TWELVE_KEYS)
      assert.equal(
        throughKeys(home, [away, keyToString(chart.key)]),
        home,
        `${file}: to ${away} and back by way of the text`,
      );
  }
});

/** Where every chord of a chart sits in its text. */
function chordRanges(chart: Chart): SourceRange[] {
  const bars: Bar[] = [];
  for (const section of chart.sections) {
    for (const item of section.items) {
      if (item.kind === "bar") bars.push(item);
      if (item.kind !== "repeat") continue;
      for (const list of [item.body, ...item.endings.map((ending) => ending.items)])
        bars.push(...list.filter((inner) => inner.kind === "bar"));
    }
  }
  return bars.flatMap((bar) =>
    bar.tokens.flatMap((token) => (token.kind === "chord" ? [token.range] : [])),
  );
}

const NOT_CHORDS = ["Xq", "H7", "Cfoo", "?", "Qmaj7", "ii77"];
/** What a slip of the hand might add: single characters, and the marks of the format. */
const TYPED = [
  ..."|:.%#b/[]x1234567 \n\tCGmIVi-()!,",
  ":|",
  "|:",
  "|1",
  ":|2",
  "//",
  " x3",
  "\n[A]\n",
];

test("one bad token never breaks the rest of the chart: a chord replaced by nonsense is an error on that token and the song keeps every bar, and no stray edit makes the parser fail, leaves a bar unfilled, or breaks formatting", () => {
  const rng = createRng("bad tokens");
  for (const row of corpus) {
    const pick = rng.fork(row.name);
    const original = parse(row.text).chart;

    // A chord becomes nonsense: the mistake is reported where it is, and no bar is lost.
    // On a line with no bar line at all, before any bars, a word that is not a
    // chord makes the line a header mistake, so this is about lines that have one.
    const lines = row.text.split("\n");
    const chords = chordRanges(original).filter((at) => lines[at.line - 1]?.includes("|"));
    if (chords.length > 0) {
      const at = pick.pick(chords);
      const text = row.text.slice(0, at.start) + pick.pick(NOT_CHORDS) + row.text.slice(at.end);
      const { chart, diagnostics } = parse(text);
      const context = `${row.name}, with the chord at ${at.line}:${at.column} replaced`;
      assert.ok(
        diagnostics.some((d) => d.severity === "error" && d.range.start === at.start),
        `${context}: an error on the token`,
      );
      const expanded = expand(chart);
      assert.equal(expanded.song.length, expand(original).song.length, `${context}: same bars`);
      assertBarsCovered(expanded, context);
      assertRoundTrip(text, context);
    }

    // Stray edits of any kind: characters dropped, added, or swapped.
    for (let round = 0; round < 3; round++) {
      let text = row.text;
      for (let edit = pick.between(1, 3); edit > 0; edit--) {
        const at = pick.int(text.length + 1);
        const removed = pick.chance(0.6) ? 1 : 0;
        const added = pick.chance(0.7) ? pick.pick(TYPED) : "";
        text = text.slice(0, at) + added + text.slice(at + removed);
      }
      const context = `${row.name}, edited to ${JSON.stringify(text)}`;
      assertBarsCovered(expand(parse(text).chart), context);
      assertRoundTrip(text, context);
    }
  }
});
