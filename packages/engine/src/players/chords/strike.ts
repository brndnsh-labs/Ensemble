// Where the three steps of a comping part meet. The rhythm writes strikes;
// the voicing engine gives each strike its pitches; the idiom turns voiced
// strikes into notes. Each side knows only this file of the others.

import type { Arrival } from "../../perform/harmony.ts";
import type { PickPlace } from "./style.ts";
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
  /** Played as an answer to the soloist: put into a breath, or played harder there (CH-71). */
  readonly answers?: true;
  /**
   * The notes are deadened: a scratch. It deadens the voicing the hand holds,
   * which is the chord named here, and is written with the voice `MUTED`.
   */
  readonly muted?: true;
  /**
   * The hand comes down on purpose, wherever a strumming hand's pendulum
   * would be: a chord laid in where it arrives (CH-34), a chord on a pulse of
   * a plain bar, the final chord (CH-74). A keyboard has no other way to play.
   */
  readonly down?: true;
  /**
   * The stroke is plucked: only these places of the grip sound, a string
   * each, written with the voice `PICKED`. It is voiced like any strike, so
   * the grip under it is the one a strum would sound.
   */
  readonly pluck?: readonly PickPlace[];
  /** The stroke crosses only the grip's top this many strings (`Attack.top`). */
  readonly top?: number;
  /**
   * The chord just struck, struck again: an ending's button (EN-17). The hand
   * has not moved, so it sounds the notes the strike before it did, whatever
   * the soloist has done since.
   */
  readonly again?: true;
}

/**
 * The voice a deadened stroke is written with, as a drummer's ghost stroke has
 * its own. Its pitches are the notes the hand is holding, at half a sixteenth
 * and a scratch's level: a sampler has its scratch to play for them; a plain
 * patch gets a clipped, quiet stroke of the right chord and never a wrong note.
 */
export const MUTED = "muted";

/**
 * The voice a plucked string is written with: one string of the grip sounded
 * by a finger or the thumb, where a strum crosses them all. A sampler with a
 * plucked sound plays it; any other plays the note plainly.
 */
export const PICKED = "picked";

/**
 * Pitches for a strike, low to high, each with the tone of the chord it plays.
 * An idiom may carry more (a guitar's strings) in its own candidates.
 */
export interface Voicing {
  readonly pitches: readonly number[];
  readonly tones: readonly FittedTone["tone"][];
  /** On a fretted instrument, the string each pitch is played on, 0 the lowest: where the hand is. */
  readonly strings?: readonly number[];
}

export interface VoicedStrike {
  readonly strike: Strike;
  readonly voicing: Voicing;
}

/**
 * The lowest pitch each interval between neighbouring voices may stand on
 * before it turns to mud (X-B-04), by its size in semitones.
 */
export const LOW_LIMITS: Readonly<Record<number, number>> = {
  1: 52,
  2: 51,
  3: 48,
  4: 46,
  5: 46,
  6: 47,
  7: 34,
  8: 43,
  9: 41,
  10: 41,
  11: 41,
};
