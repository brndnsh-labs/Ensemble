// The chart contract: what the parser promises to everything downstream.
// See docs/CHART_FORMAT.md section 8.

import type { Chord } from "../theory/chord.ts";
import type { Degree, Key } from "../theory/pitch.ts";

/** Ticks per quarter note. All musical time in the engine is in ticks. */
export const PPQ = 480;

/** A half-open span of the source text. Lines and columns are 1-based; offsets are 0-based. */
export interface SourceRange {
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
}

export interface Diagnostic {
  readonly severity: "error" | "warning" | "info";
  /** Written for a musician: says what is wrong and what to type instead. */
  readonly message: string;
  readonly range: SourceRange;
}

export interface Meter {
  readonly beats: number;
  readonly unit: 2 | 4 | 8;
}

/** The length of one bar in ticks. */
export function barTicks(meter: Meter): number {
  return (meter.beats * PPQ * 4) / meter.unit;
}

/** A chord as it stands in a chart: harmony, its place in the key, and where it was typed. */
export interface ChartChord extends Chord {
  /** The root against the section's key. For `V7/ii` in C this is VI, where the chord sounds. */
  readonly degree: Degree;
  readonly bassDegree: Degree | null;
  /** How the author wrote it. Printing and display keep this choice. */
  readonly written: "name" | "numeral";
  /**
   * For a secondary function such as `V7/ii`: the numeral as written (V) and
   * the degree it is "of" (ii). Null otherwise.
   */
  readonly secondary: {
    readonly numeral: Degree;
    readonly of: Degree;
    readonly ofMinor: boolean;
  } | null;
  /** The token exactly as typed. Not part of the chart's meaning. */
  readonly text: string;
  readonly range: SourceRange;
}

export type SectionRole = "intro" | "body" | "ending";

/** One stretch of a bar under a single harmony. */
export interface ChordSpan {
  /** Null is "no chord" (NC): the band lays out or plays unpitched. */
  readonly chord: ChartChord | null;
  /** Ticks from the start of the bar. */
  readonly start: number;
  readonly duration: number;
  /**
   * True when this span continues the harmony already sounding at the bar line
   * (a `.` at the start of a bar). The chord did not change and is not restated.
   */
  readonly tied: boolean;
}

/**
 * One bar as played, after repeats, endings, `%`, and section references are
 * expanded. The spans cover the bar exactly, in order, without gaps.
 */
export interface FlatBar {
  readonly sectionLabel: string;
  readonly role: SectionRole;
  /** Index into `Chart.sections` of the section header this bar was played under. */
  readonly sectionIndex: number;
  /** Counts bars within this pass through the section, from 0. */
  readonly barInSection: number;
  readonly key: Key;
  readonly meter: Meter;
  readonly ticks: number;
  readonly spans: readonly ChordSpan[];
  /** The bar in the source text that produced this one, for linking the playhead to the text. */
  readonly source: SourceRange;
}

/** A chart flattened for the planner, split by what jam mode does with each part. */
export interface ExpandedChart {
  /** Song mode: every section once, in file order. */
  readonly song: readonly FlatBar[];
  /** `Intro` sections: played once at the start. */
  readonly intro: readonly FlatBar[];
  /** Everything else: the form that loops. */
  readonly body: readonly FlatBar[];
  /** `Outro`, `Ending`, `Coda`, `Tag` sections: played once at the end. Empty if the chart has none. */
  readonly ending: readonly FlatBar[];
}
