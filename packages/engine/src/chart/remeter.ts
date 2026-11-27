// A chart read in another meter: as if its header said that meter, with the
// text left as it is. Each bar is read as a player reading the chart would:
// as written where its chords fall on the new meter's pulses, its one change
// moved to where the bar splits, or a chord a pulse; a bar that still does not
// fit means the chart does not fit the meter, and it is refused, not squeezed.
// See docs/decisions/engine.md, "a chart can be played in another meter".

import {
  meterName,
  onPulse,
  pulseGroups,
  pulseStarts,
  pulseTicks,
  tempoPulse,
} from "../perform/meter.ts";
import { validSlotCount } from "./expand.ts";
import { meterToString } from "./fields.ts";
import type { Bar, BarToken, Chart, ChartField, RepeatItem, Section, UnreadLine } from "./model.ts";
import type { Meter, SourceRange } from "./types.ts";
import { barTicks, PPQ } from "./types.ts";

/**
 * The meters a player is offered for a chart: those a style has parts written for. The engine
 * plays a chart in any meter it fits (`fits`); this is what is listed (#2298, #2338).
 */
export const BAND_METERS: readonly Meter[] = [
  { beats: 4, unit: 4 },
  { beats: 3, unit: 4 },
  { beats: 6, unit: 8 },
  { beats: 12, unit: 8 },
  { beats: 6, unit: 4 },
];

/** One meter and one shape: 5/4 and 5/4 (2+3) are two, and 5/4 and 5/4 (3+2) are one. */
export const sameMeter = (a: Meter, b: Meter): boolean =>
  a.beats === b.beats &&
  a.unit === b.unit &&
  (a.groups === b.groups ||
    (same(pulseTicks(a), pulseTicks(b)) && same(pulseGroups(a), pulseGroups(b))));

const same = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((n, i) => n === b[i]);

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

/** Why a bar does not read in a meter: a change written off the beat, or chords that do not go into its beats. */
type Refusal = { readonly offBeat: true } | { readonly chords: number; readonly pulses: number };

/**
 * How a bar reads in the new meter: its tokens as they are, tokens written
 * again, or why it does not fit. Every case is a rule a player reading the
 * chart would follow; see `fits`.
 */
function readBar(bar: Bar, from: Meter, to: Meter): readonly BarToken[] | "same" | Refusal {
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
  // A change is read only where it was written on a pulse: composed syncopation (an eighth
  // before the bar line) is the song's, and is neither moved nor read onto a pulse of another meter.
  const onItsPulse = changes.every((at) => {
    const tick = (at * fromTicks) / n;
    return Number.isInteger(tick) && onPulse(from, tick);
  });
  if (!onItsPulse) return { offBeat: true };
  // (b) As written, where the count is one the new meter takes and every change is on its pulse.
  if (
    validSlotCount(n, to) &&
    changes.every((at) => {
      const tick = (at * toTicks) / n;
      return Number.isInteger(tick) && onPulse(to, tick);
    })
  )
    return "same";
  const begins = pulseStarts(to);
  const pulses = begins.length;
  const keep = bar.tokens.filter((token) => token.kind === "annotation");
  const hold = (): BarToken => ({ kind: "hold", range: bar.range });
  const parts = [slots[0]!, ...changes.map((at) => slots[at]!)];
  // A chord on each of these pulses, held to the next. A slot a pulse where the pulses are one
  // length; where they are not (7/8), a slot an eighth, since a bar takes no slot a pulse there.
  const even = new Set(pulseTicks(to)).size === 1;
  const onPulses = (at: readonly number[]): BarToken[] => {
    const slot = even ? pulseTicks(to)[0]! : EIGHTH;
    const where = new Map(at.map((pulse, i) => [begins[pulse]! / slot, parts[i]!]));
    return [...keep, ...Array.from({ length: toTicks / slot }, (_, i) => where.get(i) ?? hold())];
  };
  // (c) One change: to where the bar splits. Between its groups where it has two or more (beat
  // 4 of 5/4, beat 3 of 5/4 as 2+3), at the boundary nearest the middle. In a bar of one group,
  // where its pulses halve by count (beat 3 of four, the second pulse of six-eight), and the
  // part of more pulses first where they do not (beat 3 of three, the third pulse of 7/8).
  if (changes.length === 1) {
    // A bar of one pulse has nowhere to change (rule d).
    if (pulses < 2) return { chords: parts.length, pulses };
    const split = splitOf(to, pulses);
    // Two slots where the bar halves and takes two (3/2 halves and does not: a slot a pulse).
    if (even && split * 2 === pulses && validSlotCount(2, to))
      return [...keep, parts[0]!, parts[1]!];
    return onPulses([0, split]);
  }
  // (c2) As many chords as the new meter has pulses: a chord a pulse.
  if (parts.length === pulses)
    return even ? [...keep, ...parts] : onPulses(begins.map((_, i) => i));
  // (d) It does not fit.
  return { chords: parts.length, pulses };
}

const EIGHTH = PPQ / 2;

/** The pulse a bar of one change changes on: where the bar splits (rule c of `fits`). */
function splitOf(meter: Meter, pulses: number): number {
  const groups = pulseGroups(meter);
  if (groups.length < 2) return Math.ceil(pulses / 2);
  let at = 0;
  let best = 0;
  for (const size of groups.slice(0, -1)) {
    at += size;
    if (Math.abs(at - pulses / 2) <= Math.abs(best - pulses / 2)) best = at;
  }
  return best;
}

/** The section of a chart whose meter is not the chart's, if any: such a chart keeps its meters. */
const ownMeter = (chart: Chart): Section | undefined =>
  chart.sections.find((section) => !sameMeter(section.meter, chart.meter));

/**
 * Every bar a chart plays, as typed, repeats and endings included: the bars of each section
 * that holds its own. A reference plays an earlier section's, and a label defined a second time
 * plays its first definition (`Section.barsFrom`), so the bars under the second are never
 * played, and are left as they are.
 */
const playedSections = (chart: Chart): Section[] =>
  chart.sections.filter((section, index) => section.barsFrom === index);

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
 * bar. A chart fits its own meter. It fits any other meter a chart can write when
 * none of its sections is in a meter of its own and every bar reads:
 *
 * - (a) a bar of one chord fits any meter;
 * - (b) a bar whose slots are a count the meter takes (CHART_FORMAT 4.1), with
 *   every change on one of its pulses, is read as written;
 * - (c) a bar of one change, on a pulse where it was written, splits where the
 *   bar does: between its groups (beat 4 of 5/4), halves where the pulses halve
 *   by count, and otherwise the part of more pulses first (2+1 in 3/4, the third
 *   pulse of 7/8); a bar of one pulse has nowhere to change, and is (d);
 * - (c2) a bar with as many chords as the meter has pulses, each change on a
 *   pulse where it was written, is a chord a pulse;
 * - (d) any other bar does not fit, and nor does the chart.
 *
 * The engine, the CLI and the app all ask this; `plan` and `render` refuse with
 * its reason.
 */
export function fits(chart: Chart, meter: Meter): Fit {
  if (sameMeter(chart.meter, meter)) return { ok: true };
  const own = ownMeter(chart);
  if (own)
    return {
      ok: false,
      reason: `The section ${own.label ? `[${own.label}] ` : ""}is in ${meterToString(own.meter)} of its own, so the chart keeps its meters.`,
      range: own.range,
    };
  const name = meterName(meter);
  for (const section of playedSections(chart)) {
    for (const bar of barsOf(section)) {
      const read = readBar(bar, chart.meter, meter);
      if (read === "same" || Array.isArray(read)) continue;
      const which = `The bar "${typed(bar)}" (line ${bar.range.line})`;
      const refusal = read as Refusal;
      const reason =
        "offBeat" in refusal
          ? `${which} has a chord written off the beat, which is the song's and is not moved, so it cannot be read in ${name}.`
          : refusal.chords > refusal.pulses
            ? `${which} has ${count(refusal.chords)} chords, more than the ${count(refusal.pulses)} beats of a bar of ${name}.`
            : `${which} has ${count(refusal.chords)} chords: a bar of ${name} splits in two or takes a chord on each of its ${count(refusal.pulses)} beats, and ${count(refusal.chords)} is neither.`;
      return { ok: false, reason, range: bar.range };
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
    return Array.isArray(read) ? { ...item, tokens: read } : item;
  };
  const each = <T extends RepeatItem | UnreadLine>(item: T): T | Bar =>
    item.kind === "bar" ? bar(item) : item;
  const sections = chart.sections.map(
    (section, index): Section => ({
      ...section,
      meter,
      // Bars that are never played (under a label defined a second time) are left as typed.
      items:
        section.barsFrom !== index
          ? section.items
          : section.items.map((item) =>
              item.kind !== "repeat"
                ? each(item)
                : {
                    ...item,
                    body: item.body.map(each),
                    endings: item.endings.map((ending) => ({
                      ...ending,
                      items: ending.items.map(each),
                    })),
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
