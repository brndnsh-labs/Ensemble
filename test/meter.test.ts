// A chart played in another meter (#2298): read as if its header said that meter, its text
// left as it is. Musical properties (docs/TESTING.md, kind 2) of the reading, which is the
// chart's and not a style's: they run once. That the band's own properties hold on a chart so
// read is asked of every style by the takes it is handed (`REMETERED` in takes.ts).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { Chart, FlatBar, Meter } from "@ensemble/engine";
import {
  BAND_METERS,
  barTicks,
  chordToString,
  expand,
  fits,
  meterName,
  onPulse,
  parse,
  plan,
  remeter,
  render,
  sameMeter,
  toMidi,
} from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import { GOLDENS, goldenUrl } from "./goldens.ts";
import { LIBRARY } from "./takes.ts";

interface Source {
  readonly name: string;
  readonly text: string;
}

const chartsDir = new URL("./charts/", import.meta.url);

/**
 * What is read in each meter: the library, the charts written to reach what it cannot, and a
 * few bars no chart in the library has: a chord a beat, a change a pulse late, a bar held from
 * the one before, a waltz's two kinds of bar, a change written off the beat, and a section in
 * a meter of its own.
 */
const SOURCES: readonly Source[] = [
  ...LIBRARY.map((chart) => ({ name: chart.file, text: chart.text })),
  ...readdirSync(chartsDir)
    .filter((file) => file.endsWith(".chart"))
    .sort()
    .map((file) => ({ name: file, text: readFileSync(new URL(file, chartsDir), "utf8") })),
  {
    name: "a chord a beat",
    text: "title: A chord a beat\nkey: C\n\n| C . F G | C G F C | Am . . G | . F |\n| C NC | G . C . | C . . G | C |\n",
  },
  {
    name: "a waltz",
    text: "title: A waltz\nkey: F\nmeter: 3/4\n\n| F . C7 | Bb | . C7 . | F C7 . |\n| Gm C7 F | F |\n",
  },
  {
    name: "a twelve",
    text: "title: A twelve\nkey: G\nmeter: 12/8\n\n| G C | G . D . | C G D G | G |\n",
  },
  { name: "off the beat", text: "title: Off the beat\nkey: C\n\n| F . . . . . . G | C |\n" },
  {
    name: "a section of its own",
    text: "title: Its own\nkey: C\n\n[A]\n| C | G7 |\n\n[B]\nmeter: 3/4\n| F | C |\n",
  },
];

const PARSED = SOURCES.map((source) => ({ ...source, chart: parse(source.text).chart }));

/** The harmony of a bar as a player reads it: each stretch's chord, and whether it is held from the bar before. */
const harmony = (bar: FlatBar): string[] =>
  bar.spans.map(
    (span) => `${span.tied ? "~" : ""}${span.chord ? chordToString(span.chord) : "NC"}`,
  );

/** The style a chart is planned in where any will do: its own, or the first. */
const styleFor = (chart: Chart) => styleById(chart.styleId ?? "") ?? STYLES[0]!;

test("a chart read in another meter keeps its chords in order, bar for bar; each bar is a bar of that meter and every change of chord lands on one of its pulses; a bar of two chords that moves puts the long part first", () => {
  let read = 0;
  let moved = 0;
  for (const { name, chart } of PARSED) {
    const written = expand(chart).song;
    for (const meter of BAND_METERS) {
      // In its own meter a chart is as written (the next property but one).
      if (sameMeter(meter, chart.meter) || !fits(chart, meter).ok) continue;
      const where = `${name} in ${meterName(meter)}`;
      const played = expand(remeter(chart, meter)).song;
      assert.equal(played.length, written.length, `${where}: bars`);
      played.forEach((bar, at) => {
        const was = written[at]!;
        const here = `${where}, bar ${at + 1}`;
        assert.deepEqual(bar.meter, meter, here);
        assert.equal(bar.ticks, barTicks(meter), here);
        assert.equal(bar.source.start, was.source.start, `${here}: the bar it was typed as`);
        assert.deepEqual(harmony(bar), harmony(was), `${here}: the chords, in order`);
        let tick = 0;
        for (const span of bar.spans) {
          assert.equal(span.start, tick, `${here}: the bar is covered, end to end`);
          assert.ok(span.duration > 0, `${here}: no chord is lost`);
          // The bar line itself is on a pulse; only a change of chord inside the bar is asked.
          assert.ok(onPulse(meter, span.start), `${here}: a change at ${span.start} is on a pulse`);
          tick += span.duration;
        }
        assert.equal(tick, bar.ticks, `${here}: the bar is covered, end to end`);
        read++;
        const share = (one: FlatBar) => one.spans.map((span) => span.duration / one.ticks);
        if (bar.spans.length === 2 && share(bar)[0] !== share(was)[0]) {
          moved++;
          assert.ok(
            bar.spans[0]!.duration >= bar.spans[1]!.duration,
            `${here}: a bar of two chords that moves puts the long part first`,
          );
        }
      });
    }
  }
  assert.ok(read > 5_000 && moved > 100, `only ${read} bars read, ${moved} of them moved`);
});

test("a chart that does not fit a meter is refused, by `fits` and by a plan and a take alike, with the same reason naming a bar or a section; one that fits is planned in it", () => {
  const refusedFor = new Set<string>();
  for (const { name, text, chart } of PARSED) {
    const style = styleFor(chart);
    for (const meter of [...BAND_METERS, { beats: 5, unit: 4 } as Meter]) {
      if (sameMeter(meter, chart.meter)) continue;
      const where = `${name} in ${meterName(meter)}`;
      const fit = fits(chart, meter);
      const options = { mode: "jam", passes: 1, seed: 1, meter } as const;
      if (fit.ok) {
        const roadmap = plan(chart, style, options);
        for (const bar of roadmap.bars)
          if (bar.kind === "music") assert.deepEqual(bar.meter, meter, where);
        continue;
      }
      refusedFor.add(name);
      if (meterName(meter) !== "5/4") assert.ok(fit.range !== null, `${where}: names where`);
      assert.throws(() => plan(chart, style, options), { message: fit.reason }, where);
      assert.throws(() => render(text, style, options), { message: fit.reason }, where);
      assert.throws(() => remeter(chart, meter), { message: fit.reason }, where);
    }
  }
  // The cases that are to be refused are: a section in its own meter, a change off the beat.
  for (const name of ["a section of its own", "off the beat", "standard-body-and-soul.chart"])
    assert.ok(refusedFor.has(name), `${name} is refused somewhere`);
});

test("a chart read in its own meter is the take it was: every chart fits its own meter and plans exactly as without the option, and the golden takes asked for in their own meter are their files byte for byte", () => {
  for (const { name, chart } of PARSED) {
    assert.ok(fits(chart, chart.meter).ok, name);
    const style = styleFor(chart);
    for (const options of [
      { mode: "song", seed: 1 },
      { mode: "jam", passes: 2, seed: 1 },
    ] as const)
      assert.deepEqual(
        plan(chart, style, { ...options, meter: chart.meter }),
        plan(chart, style, options),
        name,
      );
  }
  // One golden in three, the waltz among them: each a full take, made again.
  for (const golden of GOLDENS.filter(
    (one, at) => at % 3 === 0 || one.chart === "jazz-waltz-f.chart",
  )) {
    const style = styleById(golden.style)!;
    const text = readFileSync(new URL(`../library/${golden.chart}`, import.meta.url), "utf8");
    const take = render(text, style, { ...golden.options, meter: parse(text).chart.meter });
    const bytes = toMidi(take.plan, take.events, style);
    const stored = new Uint8Array(readFileSync(goldenUrl(golden)));
    assert.ok(Buffer.compare(bytes, stored) === 0, `${golden.file}, asked for in its own meter`);
  }
});
