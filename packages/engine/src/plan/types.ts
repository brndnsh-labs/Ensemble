// The plan: the complete roadmap of one performance, decided before anyone
// plays a note. Song mode and jam mode both produce this; nothing downstream
// knows which one made it.

import type { ChordSpan, Meter, SectionRole, SourceRange } from "../chart/types.ts";
import { secondsAt } from "../perform/time.ts";
import type { EndingGesture, Seat, Tier } from "../style/types.ts";
import type { Key } from "../theory/pitch.ts";

export interface PlanOptions {
  readonly mode: "song" | "jam";
  /** Overrides the chart's tempo, which overrides the style's default. Pulses a minute, as `Plan.tempo`. */
  readonly tempo?: number;
  /**
   * Jam mode: how many times through the form. Wins over `minutes`. A vamp
   * shorter than eight bars is counted in choruses of several laps.
   */
  readonly passes?: number;
  /** Jam mode: a loose time limit, turned into the nearest whole number of passes. */
  readonly minutes?: number;
  /**
   * Jam mode: the jam has no planned end. The band plays `passes` passes
   * (default 1) and the plan can be made again with more, leaving these unchanged.
   */
  readonly open?: boolean;
  /**
   * Jam mode: the band has been told to finish. The pass with this index (from
   * 0) is the last: it lifts and lands as the last pass of any jam does. Every
   * pass before it is planned as it was, as the open jam or the jam of `passes`
   * or `minutes` it set out to be, so a jam under way can be told to finish
   * without changing what has been played. Ignored when the jam would have
   * ended by then anyway.
   */
  readonly endAfter?: number;
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
  /**
   * Jam mode: the soloist has the lead from the first pass. Default false: the
   * band plays the form once before the soloist comes in.
   */
  readonly soloFromTop?: boolean;
  /**
   * How busy the soloist is, as the player set it: 0 no busier than the
   * soloist first written, 1 as busy as a soloist of the style gets while it
   * still phrases and breathes, 0.5 the style's own. Left out, the style's own.
   * It moves the soloist alone: the band plays what it would have played.
   */
  readonly soloDensity?: number;
  /**
   * The tempo breathes with the arc: each bar's a little quicker as the jam builds and a little
   * slower as it comes down, by the style's own amount (`FeelStyle.breathe`), and never inside a
   * bar. Default false: the tempo as set, in every bar, for someone practising to it.
   */
  readonly breathe?: boolean;
  /** A bar of sticks before the first bar. Default true. */
  readonly countIn?: boolean;
  /** Seats to leave out entirely. Default: none. */
  readonly without?: readonly Seat[];
  /**
   * The take's seed: a jam draws from it where a seat sits out for a while
   * (`ArcStyle.layOut`), keyed by the pass. Left out, everyone stays in.
   */
  readonly seed?: number | string;
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
    /** Index into `Chart.sections` of the header this bar is played under: with `source`, its place on the page. */
    readonly index: number;
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
   * Which time through the form, from 0. The intro belongs to pass 0. On a
   * short vamp the form is a chorus of several laps (twelve bars or more), not
   * a lap: the chorus is one section, and every count below is counted in it.
   */
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

  /**
   * Quarter notes a minute in this bar: `Plan.quarters`, the tempo as set, unless the take
   * breathes (`PlanOptions.breathe`). Everything that turns ticks into seconds reads it.
   */
  readonly quarters: number;

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
  /**
   * The tempo as a musician reads it: pulses a minute, in the pulse of the
   * chart's meter (a dotted quarter in 6/8 and 12/8, a quarter in 4/4 and 6/4).
   * The tempo as set: where the take breathes, each bar has its own (`PlanBar.quarters`).
   */
  readonly tempo: number;
  /**
   * Quarter notes a minute at the tempo as set, since a tick is a 480th of a
   * quarter note in every meter. The tempo itself wherever the pulse is a
   * quarter; half as much again where it is a dotted quarter. The players write
   * to it; time is kept by each bar's own (`PlanBar.quarters`, `secondsAt`).
   */
  readonly quarters: number;
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
  /**
   * How busy the soloist is, as the player set it (`PlanOptions.soloDensity`),
   * 0 to 1. Left out, the style's own. On the plan so that anyone reading the
   * solo from the plan reads it as the soloist did.
   */
  readonly soloDensity?: number;
}

/** The bar at an index, reading into the look-ahead. Undefined past the end. */
export function planBar(plan: Plan, index: number): PlanBar | undefined {
  return index < plan.bars.length ? plan.bars[index] : plan.lookahead[index - plan.bars.length];
}

/** How long the performance lasts, in seconds. */
export function seconds(plan: Plan): number {
  return secondsAt(plan, plan.ticks);
}
