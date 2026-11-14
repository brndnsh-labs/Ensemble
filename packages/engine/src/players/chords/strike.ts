// Where the three steps of a comping part meet. The rhythm writes strikes;
// the voicing engine gives each strike its pitches; the idiom turns voiced
// strikes into notes. Each side knows only this file of the others.

import type { Arrival } from "../../perform/harmony.ts";
import type { FittedTone } from "./tones.ts";

/** One time the hand comes down: where, how long, how hard, and on what chord. */
export interface Strike {
  /** Index of the plan bar the strike starts in. Every strike starts inside its own bar. */
  readonly bar: number;
  /** Absolute tick on the straight grid. */
  readonly tick: number;
  /** Straight-grid length in ticks. The idiom may cut it short where the next strike comes. */
  readonly duration: number;
  /** Written level, before the bar's energy scales it. */
  readonly velocity: number;
  /**
   * The chord the strike plays. Its chord is never null: nothing is struck
   * under N.C. For a strike pushed ahead of a change, this is the chord coming.
   */
  readonly arrival: Arrival;
  /** The name of the style's voicing kind the strike asks for. */
  readonly kind: string;
}

/**
 * Pitches for a strike, low to high, each with the tone of the chord it plays.
 * An idiom may carry more (a guitar's strings) in its own candidates.
 */
export interface Voicing {
  readonly pitches: readonly number[];
  readonly tones: readonly FittedTone["tone"][];
}

export interface VoicedStrike {
  readonly strike: Strike;
  readonly voicing: Voicing;
}
