// A chart read in another meter: as if its header said that meter, with the
// text left as it is. Each bar is read as a player reading the chart would:
// as written where its chords fall on the new meter's pulses, its one change
// moved to where the bar splits, or a chord a pulse; a bar that still does not
// fit means the chart does not fit the meter, and it is refused, not squeezed.
// See docs/decisions/engine.md, "a chart can be played in another meter".

import { onPulse, pulseStarts, tempoPulse } from "../perform/meter.ts";
import { validSlotCount } from "./expand.ts";
import { meterToString } from "./fields.ts";
import type { Bar, BarToken, Chart, ChartField, RepeatItem, Section, UnreadLine } from "./model.ts";
import type { Meter, SourceRange } from "./types.ts";
import { barTicks } from "./types.ts";

/** The meters the band plays a chart in: those a style has parts written for. */
export const BAND_METERS: readonly Meter[] = [
  { beats: 4, unit: 4 },
  { beats: 3, unit: 4 },
  { beats: 6, unit: 8 },
  { beats: 12, unit: 8 },
  { beats: 6, unit: 4 },
];

export const sameMeter = (a: Meter, b: Meter): boolean => a.beats === b.beats && a.unit === b.unit;

/** Whether a chart can be read in a meter, and if not, why: the bar that stops it, named. */
export type Fit =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string; readonly range: SourceRange | null };

type Slot = Exclude<BarToken, { kind: "annotation" | "misplaced" }>;

const slotsOf = (bar: Bar): Slot[] =>
  bar.tokens.filter(
    (token): token is Slot => token.kind !== "annotation" && token.kind !== "misplaced",
  );

/** A token that starts a stretch of harmony: a chord or NC. Anything else holds. */
const starts = (slot: Slot): boolean => slot.kind === "chord" || slot.kind === "noChord";

const NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const count = (n: number): string => NUMBERS[n] ?? String(n);

/**
 * How a bar reads in the new meter: its tokens as they are, tokens written
 * again, or null when it does not fit. Every case is a rule a player reading
 * the chart would follow; see `fits`.
 */
function readBar(bar: Bar, from: Meter, to: Meter): readonly BarToken[] | "same" | null {
  const slots = slotsOf(bar);
  const n = slots.length;
  // `%` and a bar with no slot are the same in any meter (an error in either, if one).
  if (n === 0 || slots.some((slot) => slot.kind === "simile")) return "same";
  // A bar the chart's own meter cannot read plays its first chord throughout: so it does here.
  if (!validSlotCount(n, from)) {
    const first = slots.find(starts);
    return [first ?? slots[0]!];
  }
  const changes = slots.flatMap((slot, at) => (at > 0 && starts(slot) ? [at] : []));
  const fromTicks = barTicks(from);
  const toTicks = barTicks(to);
  // (a) One chord, or one held from the bar before: any meter holds it.
  if (changes.length === 0) return [slots[0]!];
  // (b) As written, where the count is one the new meter takes and every change is on its pulse.
  if (
    validSlotCount(n, to) &&
    changes.every((at) => {
      const tick = (at * toTicks) / n;
      return Number.isInteger(tick) && onPulse(to, tick);
    })
  )
    return "same";
  // Past here a change only moves if it was on a pulse where it was written: composed
  // syncopation (an eighth before the bar line) is the song's, and is not moved.
  const onItsPulse = changes.every((at) => {
    const tick = (at * fromTicks) / n;
    return Number.isInteger(tick) && onPulse(from, tick);
  });
  if (!onItsPulse) return null;
  const pulses = pulseStarts(to).length;
  const keep = bar.tokens.filter((token) => token.kind === "annotation");
  const hold = (): BarToken => ({ kind: "hold", range: bar.range });
  const parts = [slots[0]!, ...changes.map((at) => slots[at]!)];
  // (c) One change: to where the bar splits, the long part first. The half where its pulses
  // halve (beat 3 of four, the second pulse of six-eight); beat 3 of three.
  if (changes.length === 1) {
    if (pulses % 2 === 0) return [...keep, parts[0]!, parts[1]!];
    const split = Math.ceil(pulses / 2);
    return [
      ...keep,
      parts[0]!,
      ...Array.from({ length: split - 1 }, hold),
      parts[1]!,
      ...Array.from({ length: pulses - split - 1 }, hold),
    ];
  }
  // (c2) As many chords as the new meter has pulses: a chord a pulse.
  if (parts.length === pulses) return [...keep, ...parts];
  // (d) It does not fit.
  return null;
}

/** The section of a chart whose meter is not the chart's, if any: such a chart keeps its meters. */
const ownMeter = (chart: Chart): Section | undefined =>
  chart.sections.find((section) => !sameMeter(section.meter, chart.meter));

/** Every bar of a section as typed, repeats and endings included. */
function barsOf(section: Section): Bar[] {
  const out: Bar[] = [];
  for (const item of section.items) {
    if (item.kind === "bar") out.push(item);
    else if (item.kind === "repeat") {
      for (const inner of [...item.body, ...item.endings.flatMap((ending) => ending.items)])
        if (inner.kind === "bar") out.push(inner);
    }
  }
  return out;
}

const typed = (bar: Bar): string =>
  slotsOf(bar)
    .map((slot) =>
      slot.kind === "chord"
        ? slot.chord.text
        : slot.kind === "noChord"
          ? "NC"
          : slot.kind === "hold"
            ? "."
            : slot.kind === "simile"
              ? "%"
              : slot.text,
    )
    .join(" ");

/**
 * Whether a chart can be played in a meter, and if not, the reason, naming the
 * bar. A chart fits its own meter. It fits another of the band's meters when
 * none of its sections is in a meter of its own and every bar reads:
 *
 * - (a) a bar of one chord fits any meter;
 * - (b) a bar whose slots are a count the meter takes (CHART_FORMAT 4.1), with
 *   every change on one of its pulses, is read as written;
 * - (c) a bar of one change, on a pulse where it was written, splits where the
 *   bar does, the long part first: halves where the pulses halve, 2+1 in 3/4;
 * - (c2) a bar with as many chords as the meter has pulses, each change on a
 *   pulse where it was written, is a chord a pulse;
 * - (d) any other bar does not fit, and nor does the chart.
 *
 * The engine, the CLI and the app all ask this; `plan` and `render` refuse with
 * its reason.
 */
export function fits(chart: Chart, meter: Meter): Fit {
  if (sameMeter(chart.meter, meter)) return { ok: true };
  if (!BAND_METERS.some((one) => sameMeter(one, meter)))
    return {
      ok: false,
      reason: `The band plays a chart in ${BAND_METERS.map(meterToString).join(", ")}, not in ${meterToString(meter)}.`,
      range: null,
    };
  const own = ownMeter(chart);
  if (own)
    return {
      ok: false,
      reason: `The section ${own.label ? `[${own.label}] ` : ""}is in ${meterToString(own.meter)} of its own, so the chart keeps its meters.`,
      range: own.range,
    };
  for (const section of chart.sections) {
    for (const bar of barsOf(section)) {
      if (readBar(bar, chart.meter, meter) !== null) continue;
      const chords = slotsOf(bar).filter(starts).length;
      return {
        ok: false,
        reason: `The bar "${typed(bar)}" (line ${bar.range.line}) has ${count(chords)} chords, and a bar of ${meterToString(meter)} cannot put them on its beats.`,
        range: bar.range,
      };
    }
  }
  return { ok: true };
}

/**
 * The tempo figure a chart's tempo becomes in another meter: the eighth note
 * goes at the speed it had, as a section in another meter keeps it
 * (CHART_FORMAT 3.1). 100 in 4/4 is 100 in 3/4 and 6/4, and 67 in 6/8 and 12/8.
 */
export function tempoIn(tempo: number, from: Meter, to: Meter): number {
  return Math.round((tempo * tempoPulse(from)) / tempoPulse(to));
}

/**
 * The chart as if its header said this meter: every section in it, each bar
 * read as `fits` says, and the written tempo counted in the new meter's pulse
 * (`tempoIn`). The text is not changed. In its own meter the chart is returned
 * as it is; a chart that does not fit is an error (ask `fits` first).
 */
export function remeter(chart: Chart, meter: Meter): Chart {
  if (sameMeter(chart.meter, meter)) return chart;
  const fit = fits(chart, meter);
  if (!fit.ok) throw new Error(fit.reason);
  const from = chart.meter;
  const bar = (item: Bar): Bar => {
    const read = readBar(item, from, meter);
    return read === "same" || read === null ? item : { ...item, tokens: read };
  };
  const each = <T extends RepeatItem | UnreadLine>(item: T): T | Bar =>
    item.kind === "bar" ? bar(item) : item;
  const sections = chart.sections.map(
    (section): Section => ({
      ...section,
      meter,
      items: section.items.map((item) =>
        item.kind !== "repeat"
          ? each(item)
          : {
              ...item,
              body: item.body.map(each),
              endings: item.endings.map((ending) => ({ ...ending, items: ending.items.map(each) })),
            },
      ),
    }),
  );
  return {
    ...chart,
    meter,
    tempo: chart.tempo === null ? null : tempoIn(chart.tempo, from, meter),
    header: headerIn(chart, meter),
    sections,
  };
}

/** The header with its meter line rewritten, or with one added at its end if it had none. */
function headerIn(chart: Chart, meter: Meter): Chart["header"] {
  const value = meterToString(meter);
  const existing = chart.header.find((item) => item.kind === "field" && item.name === "meter");
  if (existing)
    return chart.header.map((item) => (item === existing ? { ...existing, value } : item));
  const added: ChartField = {
    kind: "field",
    name: "meter",
    value,
    range: { start: 0, end: 0, line: 1, column: 1 },
  };
  return [...chart.header, added];
}
