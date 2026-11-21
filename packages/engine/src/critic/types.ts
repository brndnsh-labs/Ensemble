// The critic: pure functions that judge generated music. It is used two ways.
// Players score candidates with features and pick the best; the scorecard
// measures whole takes across many seeds and reports the distribution.
//
// A passing score means the rules hold. It does not mean it grooves.

import type { Seat, StylePack } from "../style/types.ts";
import type { Take } from "../take.ts";

/**
 * One thing a musician might say about a take, as a number. Measures are
 * individually simple and named for what they mean, and they are taken at the
 * musical event (the last note before a change, the end of a phrase), not
 * pooled over every note.
 */
export interface Measure {
  /** Seat and name: `bass.half-step-approaches`. */
  readonly id: string;
  readonly seat: Seat | "band";
  /** One sentence, in a musician's words, saying what a good value means. */
  readonly says: string;
  /**
   * A measure of one way of playing (a backbeat, a ride on every beat, the
   * boogie box's sixth). It says something only about a style that plays that
   * way, so it is on the scorecard only of a style that sets it a target:
   * "no backbeat" is not a finding about a jazz drummer.
   */
  readonly idiom?: boolean;
  /**
   * A cost: the less of it the better. With no target, the scorecard's worst
   * takes are then the highest and not the lowest.
   */
  readonly lowerIsBetter?: boolean;
  /**
   * - `share`: a fraction of cases, 0 to 1
   * - `semitones`, `per bar`, `per beat`, `velocity`: a mean in those units
   * - `pitch`: a mean MIDI note number
   * - `seconds`, `per second`: time as a listener feels it, whatever the tempo
   * - `ratio`: one count over another
   * - `cost`: what a player's choices cost under the style's own weights
   */
  readonly unit:
    | "share"
    | "semitones"
    | "per bar"
    | "per beat"
    | "velocity"
    | "pitch"
    | "seconds"
    | "per second"
    | "ratio"
    | "cost";
  /**
   * The value for one take and how many cases it was measured over. A rate
   * measured on nothing passes any ceiling, so the count travels with the value.
   * Null when the take has nothing of this kind to measure.
   */
  of(take: Take, style: StylePack): Measurement | null;
}

export interface Measurement {
  readonly value: number;
  readonly cases: number;
}

/**
 * Where a style wants a measure to fall. Each bound says what kind it is:
 * an `intent` bound is true whatever the band currently plays (a backbeat is
 * louder than a ghost note) and loosening it is a musical decision; a
 * `measured` bound sits a margin from what the band currently delivers and
 * loosening it needs a new measurement.
 */
export interface Target {
  readonly min?: number;
  readonly max?: number;
  readonly kind: "intent" | "measured";
  /** Fewer cases than this in a take, and the take does not count as measured. */
  readonly minCases?: number;
}

/** The critic's part of a style pack. */
export interface CriticStyle {
  /** Target bands for the scorecard, by measure id. A measure with no target is reported only. */
  readonly targets: Readonly<Record<string, Target>>;
  /**
   * What a player's choice costs, by decision and then by feature id: the
   * candidate with the lowest weighted sum wins. A feature with no weight is ignored.
   */
  readonly weights: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/**
 * One thing that can be said about a candidate (a voicing, a comping figure, a
 * phrase), as a number in natural units: semitones moved, notes out of range,
 * strikes that collide. The style decides how much each one costs.
 */
export interface Feature<Candidate> {
  readonly id: string;
  readonly says: string;
  of(candidate: Candidate): number;
}
