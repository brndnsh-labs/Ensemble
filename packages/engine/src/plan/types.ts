// The plan: the complete roadmap of one performance, decided before anyone
// plays a note. Song mode and jam mode both produce this; nothing downstream
// knows which one made it.

import type { ChordSpan, Meter, SectionRole, SourceRange } from "../chart/types.ts";
import type { EndingGesture, Seat, Tier } from "../style/types.ts";
import type { Key } from "../theory/pitch.ts";

export interface PlanOptions {
  readonly mode: "song" | "jam";
  /** Overrides the chart's tempo, which overrides the style's default. */
  readonly tempo?: number;
  /** Jam mode: how many times through the form. Wins over `minutes`. */
  readonly passes?: number;
  /** Jam mode: a loose time limit, turned into the nearest whole number of passes. */
  readonly minutes?: number;
  /**
   * Jam mode: the jam has no planned end. The band plays `passes` passes
   * (default 1) and the plan can be made again with more, leaving these unchanged.
   */
  readonly open?: boolean;
  /**
   * A level the player sets, 0 to 1, in place of the arc. It holds on every
   * pass (no lift, no arc), and the form still breathes around it at half depth.
   */
  readonly energy?: number;
  /**
   * The band's soloist plays. Default false: someone practising wants the band,
   * not a soloist (SO-04). Where it plays and lays out is the plan's to say.
   */
  readonly solo?: boolean;
  /** A bar of sticks before the first bar. Default true. */
  readonly countIn?: boolean;
  /** Seats to leave out entirely. Default: none. */
  readonly without?: readonly Seat[];
}

/** A fill the drummer owes at the end of a bar, and how big a boundary it marks. */
export interface FillMark {
  readonly boundary: "phrase" | "section";
  /**
   * A top: a new pass, a move into a bigger section, or the set-up into the
   * final hit. The bigger the boundary, the bigger the gesture.
   */
  readonly top: boolean;
  /** Sized by where the music is going: the bigger of this bar's tier and the next bar's. */
  readonly tier: Tier;
  /** Half length, so consecutive laps of a short vamp differ. */
  readonly half: boolean;
}

/**
 * The soloist's place in its solo. A solo is one arc of up to three choruses:
 * it starts low and sparse and peaks in its last chorus (SO-05), so the soloist
 * needs to know which chorus this is and how many the solo has.
 */
export interface SoloMark {
  /** Which chorus of this solo, from 0. */
  readonly chorus: number;
  /** How many choruses this solo has: 1 to 3. */
  readonly of: number;
}

/** The final chord and how the band plays it. Present on the ending bar only. */
export interface EndingMark {
  readonly gesture: EndingGesture;
  /** Ticks from the start of the bar to where the final chord lands. */
  readonly at: number;
  /** Ticks the final chord may ring from `at`, through the tail. */
  readonly ring: number;
}

export interface PlanBar {
  /** Position in the performance, from 0. Look-ahead bars continue the count. */
  readonly index: number;
  /** Absolute tick of the bar line. */
  readonly start: number;
  readonly ticks: number;
  readonly meter: Meter;
  readonly key: Key;
  /**
   * - `count-in`: sticks only
   * - `music`: the band plays
   * - `tail`: silence after the ending bar while the last chord rings
   */
  readonly kind: "count-in" | "music" | "tail";
  /** Harmony as it will be played. On the ending bar this is already resolved. */
  readonly spans: readonly ChordSpan[];

  readonly section: {
    readonly label: string;
    /**
     * What the section is for every held choice: the label lower-cased with
     * trailing digits and primes removed, so A, A2 and A' are one section.
     */
    readonly identity: string;
    readonly role: SectionRole;
    /** Counts section starts across the whole performance, from 0. */
    readonly occurrence: number;
    readonly bars: number;
  };
  /**
   * Counts the stretches a choice held "per pass" lasts, from 0: each time
   * through a section, except on a short vamp, where it is every 16 bars.
   */
  readonly stretch: number;
  /** Which time through the form, from 0. The intro belongs to pass 0. */
  readonly pass: number;
  readonly barInSection: number;
  /** Bars since the top of this pass (intro and written ending count from their own top). */
  readonly barInPass: number;
  readonly phrase: {
    /** Counts phrases within this time through the section, from 0. */
    readonly index: number;
    readonly bar: number;
    readonly length: number;
  };

  /** What to play and how loud: 0 to 1, after every lift. */
  readonly energy: number;
  /**
   * The section's own energy before any lift. Used to ask "is the next section
   * bigger than this one", which must not change with how many passes have gone by.
   */
  readonly level: number;
  /** Each seat's energy for this bar, or null when it lays out. */
  readonly seats: Readonly<Record<Seat, number | null>>;

  /** Present where the soloist has the lead. Null where it lays out. */
  readonly solo: SoloMark | null;

  readonly fill: FillMark | null;
  /** An arrival: crash on beat 1. */
  readonly crash: boolean;
  /** The last time through the form of a performance that ends. */
  readonly lastPass: boolean;
  readonly ending: EndingMark | null;

  /** Where this bar was typed, for linking the playhead to the text. */
  readonly source: SourceRange | null;
}

export interface Plan {
  readonly mode: "song" | "jam";
  readonly tempo: number;
  /** Every bar that is played, in order. */
  readonly bars: readonly PlanBar[];
  /**
   * For an open jam: the next pass, which players may read and must not play.
   * It is why the last bar leads into the top of the form. Empty when the plan ends.
   */
  readonly lookahead: readonly PlanBar[];
  /** Times through the form. */
  readonly passes: number;
  readonly open: boolean;
  /** Length in ticks of everything played. */
  readonly ticks: number;
}

/** The bar at an index, reading into the look-ahead. Undefined past the end. */
export function planBar(plan: Plan, index: number): PlanBar | undefined {
  return index < plan.bars.length ? plan.bars[index] : plan.lookahead[index - plan.bars.length];
}

export function seconds(plan: Plan): number {
  return (plan.ticks / 480) * (60 / plan.tempo);
}
