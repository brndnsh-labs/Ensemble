// A style pack: how a band plays a genre, as plain data. No functions live
// here, so a pack could be JSON. Adding or tuning a style changes data only.

import type { CriticStyle } from "../critic/types.ts";
import type { BassStyle } from "../players/bass/style.ts";
import type { DrumStyle } from "../players/drums/style.ts";
import type { BaseQuality } from "../theory/chord.ts";

/** The seats in the band. Drums are the clock; the other three are pitched. */
export type Seat = "drums" | "bass" | "chords" | "solo";
export type PitchedSeat = Exclude<Seat, "drums">;
export const SEATS: readonly Seat[] = ["drums", "bass", "solo", "chords"];

/** Which part a player chooses. Energy below 0.42 is low; below 0.70 is mid; the rest is high. */
export type Tier = "low" | "mid" | "high";
export const TIER_MID = 0.42;
export const TIER_HIGH = 0.7;

export function tierOf(energy: number): Tier {
  return energy < TIER_MID ? "low" : energy < TIER_HIGH ? "mid" : "high";
}

/** One value for each tier. */
export interface PerTier<T> {
  readonly low: T;
  readonly mid: T;
  readonly high: T;
}

/**
 * How long a random choice is kept before it is drawn again. A verse sounds
 * like the same verse because its groove is held per section; loop music is
 * literally "choose once per song".
 *
 * - `song`: once for the whole performance
 * - `section`: once per written section, the same every time it returns
 * - `pass`: once per time through a section
 * - `phrase`: once per phrase
 * - `bar`: every bar
 */
export type Hold = "song" | "section" | "pass" | "phrase" | "bar";

export interface FeelStyle {
  /**
   * Swing bends each pair of the unit: at amount 0 the offbeat sits halfway
   * (straight), at 60 it sits at 60% of the pair, at 100 at two thirds (a true
   * triplet). Beats never move.
   */
  readonly swing: { readonly unit: "eighth" | "sixteenth"; readonly amount: number };
  /**
   * Milliseconds behind the drums (negative is ahead), per pitched seat. The
   * drums never lean: a shift applied to the whole band is only latency.
   */
  readonly lean: Readonly<Record<PitchedSeat, number>>;
  /** 0 to 100. At 100 a note moves at most 9 ms and its velocity at most 10. */
  readonly humanize: number;
}

export interface ArcStyle {
  /**
   * A section's own energy, by how its label starts (lowercase). The first
   * prefix that matches wins.
   */
  readonly levels: readonly (readonly [prefix: string, energy: number])[];
  /** The energy of a section whose label matches nothing (A, B, Head). */
  readonly defaultLevel: number;
  /** Added to the last bar of a section that leads into a bigger one. */
  readonly build: number;
  /** An open jam gains `step` each pass, up to `cap`. */
  readonly passLift: { readonly step: number; readonly cap: number };
  /**
   * A timed jam's shape, as offsets from each section's own energy: a
   * restrained first pass, a build to a climax about two thirds in, one pass
   * of breath, then a lift through the last pass into the ending.
   */
  readonly timed: {
    readonly first: number;
    readonly climax: number;
    readonly settle: number;
    readonly breath: number;
    readonly lastFrom: number;
    readonly lastTo: number;
    /** A building pass runs from this far under its mean to this far over, phrase by phrase. */
    readonly lean: number;
  };
  /** Scales every offset above. A style that should not swell much plays the arc shallower. */
  readonly depth: number;
  /**
   * Whether a lift may carry a bar across the high-tier line. False where the
   * high tier is a different groove that a band would not flip into mid-take.
   */
  readonly liftsCrossHigh: boolean;
}

export type EndingGesture =
  /** Everyone strikes the chord and lets it ring. */
  | { readonly kind: "hold" }
  /** Everyone strikes for an eighth, then silence. */
  | { readonly kind: "stop" }
  /** As hold, but quietly and with no crash. */
  | { readonly kind: "soft" }
  /** Held, then one short accented unison hit on the "and" of the last beat. */
  | { readonly kind: "button" }
  /** Short unison stabs on these beats (1-based), the last one ringing. */
  | { readonly kind: "hits"; readonly beats: readonly number[] };

export interface EndingStyle {
  /**
   * The colour of the final tonic when the band has to supply it, by what kind
   * of tonic the chart has: a major key, a minor key, or a dominant tonic (a blues).
   */
  readonly finalChord: {
    readonly major: BaseQuality;
    readonly minor: BaseQuality;
    readonly dominant: BaseQuality;
  };
  readonly gesture: EndingGesture;
  /** Whether the bar before the ending gets the style's biggest fill, however quiet the band is. */
  readonly setupFill: boolean;
  /** Bars of nothing after the ending bar, so a ringing chord can ring. */
  readonly tailBars: number;
}

export interface StylePack {
  readonly id: string;
  readonly name: string;
  readonly tempo: { readonly default: number; readonly min: number; readonly max: number };
  readonly feel: FeelStyle;
  readonly arc: ArcStyle;
  readonly ending: EndingStyle;
  readonly drums: DrumStyle;
  readonly bass: BassStyle;
  /** What the critic expects of this style, and what its players' choices cost. */
  readonly critic: CriticStyle;
  /** General MIDI program numbers (0 to 127) for export. Drums need none. */
  readonly instruments: Readonly<Record<PitchedSeat, number>>;
}

/** The arc the old band settled on by ear. Styles spread this and change what differs. */
export const DEFAULT_ARC: ArcStyle = {
  levels: [
    ["intro", 0.35],
    ["verse", 0.5],
    ["pre", 0.6],
    ["chorus", 0.75],
    ["hook", 0.75],
    ["refrain", 0.75],
    ["bridge", 0.6],
    ["solo", 0.65],
    ["break", 0.3],
    ["outro", 0.45],
    ["coda", 0.45],
    ["ending", 0.45],
    ["tag", 0.45],
  ],
  defaultLevel: 0.55,
  build: 0.06,
  passLift: { step: 0.03, cap: 0.09 },
  timed: {
    first: -0.03,
    climax: 0.19,
    settle: 0.12,
    breath: 0.04,
    lastFrom: 0.09,
    lastTo: 0.2,
    lean: 0.05,
  },
  depth: 1,
  liftsCrossHigh: true,
};
