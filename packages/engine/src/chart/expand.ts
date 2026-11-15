// Flattens a chart into bars as played: repeats and endings unrolled, `%` and
// `.` resolved, section references followed. This is also where a bar's
// mistakes are found and recovered from, so the two cannot disagree: `parse`
// runs the same code to collect its diagnostics.

import { chordToString } from "../theory/chord.ts";
import type { Key } from "../theory/pitch.ts";
import { keyToString } from "../theory/pitch.ts";
import { meterToString } from "./fields.ts";
import type { Bar, BarToken, Chart, RepeatItem, SectionItem } from "./model.ts";
import { respellChord } from "./symbol.ts";
import type { ChartChord, ChordSpan, ExpandedChart, FlatBar, Meter, SourceRange } from "./types.ts";
import { barTicks } from "./types.ts";

/** Called with each mistake found in a bar. Every one is an error. */
export type Report = (range: SourceRange, message: string) => void;

export function expand(chart: Chart): ExpandedChart {
  return expandReporting(chart, () => {});
}

/**
 * A bar may have a number of slots that divides the meter's numerator or is
 * the numerator times a power of two, so long as each slot is a whole number
 * of ticks.
 */
export function validSlotCount(slots: number, meter: Meter): boolean {
  if (slots < 1 || barTicks(meter) % slots !== 0) return false;
  const perBeat = slots / meter.beats;
  const powerOfTwo = Number.isInteger(perBeat) && (perBeat & (perBeat - 1)) === 0;
  return meter.beats % slots === 0 || powerOfTwo;
}

interface Played {
  readonly bar: Bar;
  /** The bar that `%` here would repeat. */
  readonly previous: Bar | null;
}

/** A bar that holds nothing but a misplaced repeat count is text, not music. */
const isPlayed = (item: RepeatItem | SectionItem): item is Bar =>
  item.kind === "bar" && item.tokens.some((token) => token.kind !== "misplaced");

/**
 * A section's bars in the order they are played. Each comes with the bar that
 * `%` would repeat: the one played just before it the first time it is
 * reached. That is the bar written before it, except around endings: an
 * ending follows the last bar before the endings, and the bars after a repeat
 * follow whatever its last time through ended on.
 */
function playOrder(items: readonly SectionItem[]): Played[] {
  const out: Played[] = [];
  const chain = (list: readonly RepeatItem[], from: Bar | null): Played[] => {
    const run: Played[] = [];
    let previous = from;
    for (const item of list) {
      if (!isPlayed(item)) continue;
      run.push({ bar: item, previous });
      previous = item;
    }
    return run;
  };
  let before: Bar | null = null;
  for (const item of items) {
    if (isPlayed(item)) {
      out.push({ bar: item, previous: before });
      before = item;
    } else if (item.kind === "repeat") {
      const body = chain(item.body, before);
      const lastOfBody: Bar | null = body.at(-1)?.bar ?? before;
      const endings: Played[][] = item.endings.map((ending) => chain(ending.items, lastOfBody));
      for (let pass = 0; pass < item.times; pass++) {
        out.push(...body, ...(endings[pass] ?? []));
      }
      before = endings[item.times - 1]?.at(-1)?.bar ?? lastOfBody;
    }
  }
  return out;
}

const sameKey = (a: Key, b: Key): boolean => keyToString(a) === keyToString(b);

const sameHarmony = (a: ChartChord | null, b: ChartChord | null): boolean =>
  a === null || b === null ? a === b : chordToString(a) === chordToString(b);

type Slot = Exclude<BarToken, { kind: "annotation" | "misplaced" }>;

export function expandReporting(chart: Chart, report: Report): ExpandedChart {
  const song: FlatBar[] = [];
  /**
   * The harmony at the end of the last bar played: a chord, null for no chord,
   * undefined before the first bar. A `.` at the start of a bar holds it.
   */
  let sounding: ChartChord | null | undefined;

  chart.sections.forEach((section, sectionIndex) => {
    const source = section.barsFrom === null ? undefined : chart.sections[section.barsFrom];
    if (!source) return;
    const { meter } = section;
    const ticks = barTicks(meter);
    // A reference with its own `key:` line plays the section in that key.
    const respell = sameKey(section.key, source.key) ? null : section.key;
    const spelled = (chord: ChartChord): ChartChord =>
      respell ? respellChord(chord, respell) : chord;
    /** What each bar came to the last time it was played, for `%` to copy. */
    const played = new Map<Bar, readonly ChordSpan[]>();

    const whole = (chord: ChartChord | null, tied = false): ChordSpan[] => [
      { chord, start: 0, duration: ticks, tied },
    ];
    const held = (): ChordSpan[] => (sounding === undefined ? whole(null) : whole(sounding, true));

    function spansOf(bar: Bar, previous: Bar | null): readonly ChordSpan[] {
      const slots = bar.tokens.filter(
        (token): token is Slot => token.kind !== "annotation" && token.kind !== "misplaced",
      );
      if (slots.some((slot) => slot.kind === "simile")) {
        if (slots.length > 1) {
          report(
            bar.range,
            "`%` repeats the whole bar before it, so it must be alone in its bar. This bar plays as no chord.",
          );
          return whole(null);
        }
        const copied = previous ? played.get(previous) : undefined;
        const first = copied?.[0];
        if (!copied || !first) {
          report(
            bar.range,
            "`%` repeats the bar before it, but this section has no bar before this one. Write the chords out.",
          );
          return whole(null);
        }
        // A copied bar keeps its tie only if that chord is still the one sounding.
        const tied = first.tied && sounding !== undefined && sameHarmony(first.chord, sounding);
        return [{ ...first, tied }, ...copied.slice(1)];
      }

      if (!validSlotCount(slots.length, meter)) {
        report(bar.range, slotCountMessage(slots.length, meter));
        const first = slots.find((slot) => slot.kind === "chord" || slot.kind === "noChord");
        if (!first) return held();
        return whole(first.kind === "chord" ? spelled(first.chord) : null);
      }

      const size = ticks / slots.length;
      const spans: { chord: ChartChord | null; start: number; duration: number; tied: boolean }[] =
        [];
      slots.forEach((slot, index) => {
        const current = spans.at(-1);
        const start = index * size;
        if (slot.kind === "chord") {
          spans.push({ chord: spelled(slot.chord), start, duration: size, tied: false });
        } else if (slot.kind === "noChord") {
          spans.push({ chord: null, start, duration: size, tied: false });
        } else if (current) {
          // `.` or an unrecognized token: the chord before it lasts one slot longer.
          current.duration += size;
        } else if (sounding !== undefined) {
          spans.push({ chord: sounding, start, duration: size, tied: true });
        } else {
          if (slot.kind === "hold")
            report(
              slot.range,
              "`.` holds the chord before it, but nothing has been played yet. Start with a chord or `NC`.",
            );
          spans.push({ chord: null, start, duration: size, tied: false });
        }
      });
      return spans;
    }
    let barInSection = 0;
    for (const { bar, previous } of playOrder(source.items)) {
      const spans = spansOf(bar, previous);
      played.set(bar, spans);
      sounding = spans.at(-1)?.chord ?? null;
      song.push({
        sectionLabel: section.label,
        role: section.role,
        sectionIndex,
        barInSection: barInSection++,
        key: section.key,
        meter,
        ticks,
        spans,
        source: bar.range,
      });
    }
  });

  const withRole = (role: FlatBar["role"]): FlatBar[] => song.filter((bar) => bar.role === role);
  return {
    song,
    intro: withRole("intro"),
    body: withRole("body"),
    ending: withRole("ending"),
    arrangement: chart.arrangement?.fits ? chart.arrangement.lines : null,
  };
}

/** Bars split into runs, one for each time through a section. */
export function runsOf(bars: readonly FlatBar[]): FlatBar[][] {
  const runs: FlatBar[][] = [];
  for (const bar of bars) {
    const run = runs.at(-1);
    const previous = run?.at(-1);
    const continues =
      previous !== undefined &&
      previous.sectionIndex === bar.sectionIndex &&
      bar.barInSection === previous.barInSection + 1;
    if (run && continues) run.push(bar);
    else runs.push([bar]);
  }
  return runs;
}

function slotCountMessage(slots: number, meter: Meter): string {
  if (slots === 0)
    return "This bar has no chord in it. Write a chord, `.` to hold the one before, or `NC`.";
  // Every count this meter takes: the divisors of its beats, then the beats doubled and doubled again.
  const valid: number[] = [];
  for (let n = 1; n <= barTicks(meter); n++) if (validSlotCount(n, meter)) valid.push(n);
  const choices = `${valid.slice(0, -1).join(", ")} or ${valid.at(-1)}`;
  return `This bar has ${slots} slots, but a bar of ${meterToString(meter)} takes ${choices}. Use \`.\` to hold a chord for another slot, as in \`| C . G |\`. Until then this bar plays its first chord throughout.`;
}
