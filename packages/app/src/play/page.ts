// The chart as a page: sections, lines of bars, and what each bar shows.
// Repeats and endings stay as their signs, as on a lead sheet; a section that
// repeats an earlier one by name is written out again, so the eye moves down
// the page in the order the band plays it.

import type { Chart, ChartChord, Key, Meter, PlanBar, SectionRole } from "@ensemble/engine";
import { expand, flow } from "@ensemble/engine";

export interface PageChord {
  /** Null is "no chord". */
  readonly chord: ChartChord | null;
  /** Where in the bar it starts and how much of it it takes, as fractions. */
  readonly at: number;
  readonly span: number;
}

export interface PageBar {
  /** Its place on the page: what a planned bar is matched to. */
  readonly id: string;
  /** `%`: the bar before, again. */
  readonly simile: boolean;
  /** Each change of chord in the bar. A chord held from the bar before is not written again. */
  readonly chords: readonly PageChord[];
  readonly repeatOpens: boolean;
  /** A repeat closes here; `times` when it is played more than twice. */
  readonly repeatCloses: { readonly times: number | null } | null;
  /** The number of the ending that starts at this bar. */
  readonly ending: number | null;
}

export interface PageSection {
  readonly index: number;
  readonly label: string;
  readonly role: SectionRole;
  /** Set when the section is in another key or meter than the chart. */
  readonly key: Key | null;
  readonly meter: Meter | null;
  readonly lines: readonly (readonly PageBar[])[];
}

export const barId = (sectionIndex: number, sourceStart: number): string =>
  `${sectionIndex}:${sourceStart}`;

/** The bar on the page that a planned bar is played from. Undefined for the count-in. */
export function pageBarOf(bar: PlanBar): string | undefined {
  return bar.source === null || bar.kind === "count-in"
    ? undefined
    : barId(bar.section.index, bar.source.start);
}

/**
 * Lay the chart out. `widen` multiplies each section's line width: 2 puts
 * eight bars on a line where the chart has four, and 0.5 puts two.
 */
export function pageOf(chart: Chart, widen = 1): PageSection[] {
  // What each bar plays, from the same expansion the band reads: a section
  // repeated in another key shows the chords it will be played with.
  const played = new Map<string, PageChord[]>();
  for (const bar of expand(chart).song) {
    const id = barId(bar.sectionIndex, bar.source.start);
    if (played.has(id)) continue;
    played.set(
      id,
      bar.spans
        .filter((span) => !span.tied)
        .map((span) => ({
          chord: span.chord,
          at: span.start / bar.ticks,
          span: span.duration / bar.ticks,
        })),
    );
  }

  const sameKey = (a: Key, b: Key) =>
    a.mode === b.mode &&
    a.tonic.letter === b.tonic.letter &&
    a.tonic.accidental === b.tonic.accidental;
  const sections: PageSection[] = [];
  chart.sections.forEach((section, index) => {
    const source = section.barsFrom === null ? undefined : chart.sections[section.barsFrom];
    if (!source) return;
    const width = Math.max(1, Math.round(source.barsPerLine * widen));
    const lines = flow(source.items, width).flatMap((row) =>
      row.kind !== "bars"
        ? []
        : [
            row.cells.map((cell): PageBar => {
              const id = barId(index, cell.bar.range.start);
              const ending = /\|(\d+)$/.exec(cell.open);
              return {
                id,
                simile: cell.bar.tokens.some((token) => token.kind === "simile"),
                chords: played.get(id) ?? [],
                repeatOpens: cell.open.startsWith("|:"),
                repeatCloses: cell.close && {
                  times:
                    cell.close.times !== null && cell.close.times > 2 ? cell.close.times : null,
                },
                ending: ending ? Number(ending[1]) : null,
              };
            }),
          ],
    );
    if (lines.length === 0) return;
    sections.push({
      index,
      label: section.label,
      role: section.role,
      key: sameKey(section.key, chart.key) ? null : section.key,
      meter:
        section.meter.beats === chart.meter.beats && section.meter.unit === chart.meter.unit
          ? null
          : section.meter,
      lines,
    });
  });
  return sections;
}
