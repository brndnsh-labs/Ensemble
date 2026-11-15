// The parsed chart: the text's structure kept for display and printing.
// Repeats, endings, `%`, references, comments, and unknown fields all survive
// here; `expand` flattens them into bars for the planner.
// See docs/CHART_FORMAT.md section 8.

import type { Key } from "../theory/pitch.ts";
import type { ChartChord, Meter, SectionRole, SourceRange } from "./types.ts";

/** A `//` comment. `trailing` comments sit at the end of the line of the node before them. */
export interface ChartComment {
  readonly kind: "comment";
  /** The text after `//`, without the first space. */
  readonly text: string;
  readonly trailing: boolean;
  readonly range: SourceRange;
}

/**
 * A `name: value` line as typed. What the line achieved is on the chart and
 * the section (`key`, `meter`, ...); the node itself is kept so that printing
 * never loses a line, including ones the parser ignored: unknown fields,
 * duplicates, and a field stranded among the bars (an error).
 * Known names are lowercase and valid values are in canonical form.
 */
export interface ChartField {
  readonly kind: "field";
  readonly name: string;
  readonly value: string;
  readonly range: SourceRange;
}

/**
 * A line in the header, or under a label before its bars, that is neither a
 * `name: value` line nor chords (`tempo 120`, a title with no `title:`). An
 * error; kept as typed so that printing does not lose it.
 */
export interface UnreadLine {
  readonly kind: "unread";
  readonly text: string;
  readonly range: SourceRange;
}

/** One token of a bar. Every kind but `annotation` and `misplaced` occupies a slot. */
export type BarToken =
  | { readonly kind: "chord"; readonly chord: ChartChord; readonly range: SourceRange }
  /** `.`: extends the chord before it by one slot. */
  | { readonly kind: "hold"; readonly range: SourceRange }
  /** `NC`. */
  | { readonly kind: "noChord"; readonly range: SourceRange }
  /** `%`: repeat the previous bar. Valid only when alone in its bar. */
  | { readonly kind: "simile"; readonly range: SourceRange }
  /** `!word`: reserved, parsed and ignored. */
  | { readonly kind: "annotation"; readonly word: string; readonly range: SourceRange }
  /** A token that is not a chord. Kept as typed; it plays as a hold. */
  | { readonly kind: "unknown"; readonly text: string; readonly range: SourceRange }
  /**
   * A repeat count (`x4`) where none can apply. Kept as typed. It takes no
   * slot, and a bar holding nothing else is not played.
   */
  | { readonly kind: "misplaced"; readonly text: string; readonly range: SourceRange };

export interface Bar {
  readonly kind: "bar";
  readonly tokens: readonly BarToken[];
  readonly range: SourceRange;
}

/**
 * What can sit between the marks of a repeat: bars, and lines that are not
 * bars. A comment always goes in the same list as the bar before it, so one
 * written just after a repeat is the last item inside it.
 */
export type RepeatItem = Bar | ChartComment | ChartField;

/** A numbered ending. Its number is its position in `Repeat.endings`, plus one. */
export interface Ending {
  readonly items: readonly RepeatItem[];
  readonly range: SourceRange;
}

/**
 * `|: ... :|`. Pass n plays `body`, then `endings[n - 1]` if there is one.
 * With endings, `times` is their count, plus one when the last ending is
 * itself closed with `:|` (so `|: A |1 B :|` plays A B, then A, and goes on).
 */
export interface Repeat {
  readonly kind: "repeat";
  readonly body: readonly RepeatItem[];
  readonly endings: readonly Ending[];
  /** Total passes. */
  readonly times: number;
  readonly range: SourceRange;
}

export type SectionItem = RepeatItem | Repeat | UnreadLine;

export interface Section {
  /**
   * As typed between the brackets. Bars with no label above them are a section
   * too: labeled `A` when the chart has no labels at all, and unlabeled (the
   * empty string) when they come before the first label.
   */
  readonly label: string;
  /** True for bars with no `[Label]` line above them. */
  readonly implicit: boolean;
  /**
   * What jam mode does with it, from the label and its place: an `Intro` is
   * the intro only before the body begins, and part of the body after that.
   */
  readonly role: SectionRole;
  /** Resolved: the section's own `key:` line, else the key of the section it repeats, else the chart's. */
  readonly key: Key;
  readonly meter: Meter;
  /**
   * Index into `Chart.sections` of the section whose bars are played here:
   * this one, an earlier one for a reference (or a duplicate label), or null
   * when the label was never defined and the section is skipped.
   */
  readonly barsFrom: number | null;
  /** Comment lines directly above the label. */
  readonly leading: readonly ChartComment[];
  /**
   * Everything under the label, in order. `key:` and `meter:` lines before the
   * first bar are the section's overrides; a field after a bar is a mistake
   * kept in place.
   */
  readonly items: readonly SectionItem[];
  /** Bars per printed line: 4 unless the source used another consistent width. */
  readonly barsPerLine: number;
  /** The `[Label]` in the text (empty, at the first bar, for an implicit section). */
  readonly range: SourceRange;
}

/** A level a section or a player is called at: 1 is the band at its quietest, 4 is flat out. */
export type ArrangementLevel = 1 | 2 | 3 | 4;

/** What a player is asked for in a section: a level of its own, `"out"` to lay out, or null to follow the section. */
export type SeatCall = ArrangementLevel | "out" | null;

export type ArrangedSeat = "drums" | "bass" | "chords" | "solo";

/** One section of the song, as it is to be played. */
export interface ArrangementLine {
  readonly label: string;
  /** Null for the level the style gives a section of this name. */
  readonly energy: ArrangementLevel | null;
  /** The soloist has the lead wherever its call is not `"out"`. */
  readonly seats: Readonly<Record<ArrangedSeat, SeatCall>>;
  /** Comment lines above it, each without its `//`. */
  readonly leading: readonly string[];
  /** A comment at the end of the line. */
  readonly comment: string | null;
  readonly range: SourceRange;
}

/** Everything from a `---` line to the end of the file. */
export interface ArrangementBlock {
  /** The lines of an `--- arrangement` block, one for each section played. Null when the block is something else. */
  readonly lines: readonly ArrangementLine[] | null;
  /** Comments after the last line. */
  readonly closing: readonly string[];
  /**
   * The block as typed, kept when printing must not rewrite it: it is not an
   * arrangement, or a line of it could not be read. Null when `lines` say it all.
   */
  readonly typed: string | null;
  /**
   * The lines are the song's sections in the order it plays them, so the block
   * is used. When they are not, nobody can say which section a line was meant for.
   */
  readonly fits: boolean;
  readonly range: SourceRange;
}

export interface Chart {
  /** `Untitled` when the chart has no title. */
  readonly title: string;
  /** Resolved: stated, or taken from the first chord when the chart has no `key:` line. */
  readonly key: Key;
  /** Null when absent: the default tempo comes from the style. */
  readonly tempo: number | null;
  readonly meter: Meter;
  readonly styleId: string | null;
  /** The header as typed, in order, including fields this version does not know. */
  readonly header: readonly (ChartField | ChartComment | UnreadLine)[];
  readonly sections: readonly Section[];
  readonly arrangement: ArrangementBlock | null;
  readonly range: SourceRange;
}
