// What players write, what the band hears of each other, and what a
// performance finally contains.

import type { Plan, PlanBar } from "../plan/types.ts";
import type { Rng } from "../rng.ts";
import type { Hold, Seat, StylePack } from "../style/types.ts";

/**
 * A note as a player writes it: on the straight grid, at its written level.
 * Dynamics and feel are applied afterwards, in one place, for every seat.
 */
export interface WrittenNote {
  readonly seat: Seat;
  /** Index of the plan bar the note starts in. Every note starts inside its own bar. */
  readonly bar: number;
  /** Absolute tick on the straight grid. */
  readonly tick: number;
  /** Straight-grid length in ticks. */
  readonly duration: number;
  /** MIDI note number. For drums, the General MIDI percussion note of the voice. */
  readonly pitch: number;
  /** Written level, 1 to 127, before the bar's energy scales it. */
  readonly velocity: number;
  /** The drum piece or articulation, for consumers that have a sound for it. */
  readonly voice?: string;
  /**
   * A deliberate displacement in ticks that is part of the gesture, not the
   * pocket: the roll of a strum, a flam. Added on top of the feel.
   */
  readonly nudge?: number;
}

/** A sounding note. Its time is `tick + offset`. */
export interface NoteEvent {
  readonly kind: "note";
  readonly seat: Seat;
  /** Where the note sits on the straight grid, in absolute ticks. */
  readonly tick: number;
  /** Microtiming in ticks: swing, the seat's lean, and human placement. May be negative. */
  readonly offset: number;
  /** Sounding length in ticks. */
  readonly duration: number;
  readonly pitch: number;
  /** 1 to 127, as played. */
  readonly velocity: number;
  readonly voice?: string;
}

/** Something a chart view or a MIDI file can show: where we are in the form. */
export interface MarkerEvent {
  readonly kind: "marker";
  readonly tick: number;
  /**
   * - `section`: a section starts; text is its label
   * - `chord`: the harmony changes; text is the chord name, or "N.C."
   * - `pass`: a time through the form starts; text is "2/9", or "2" in an open jam
   * - `last-pass`: the final time through begins
   * - `ending`: the final chord lands
   */
  readonly marker: "section" | "chord" | "pass" | "last-pass" | "ending";
  readonly text: string;
}

export type PerformanceEvent = NoteEvent | MarkerEvent;

/** Everything a player is given. */
export interface PlayerContext {
  readonly plan: Plan;
  readonly style: StylePack;
  /** This seat's own stream. Fork it by purpose and place; never draw from it in sequence. */
  readonly rng: Rng;
  /** The written notes of every seat that has already played, grouped by plan bar. */
  readonly heard: Heard;
}

export type Heard = Readonly<Partial<Record<Seat, readonly (readonly WrittenNote[])[]>>>;

/** A seat's part: every note it plays in the plan, in any order. */
export type Player = (context: PlayerContext) => WrittenNote[];

/**
 * The generator for a choice that is held for a span: the same section gives
 * the same generator every time it returns, the same pass every bar of it.
 * `purpose` names the decision so that two decisions never share a draw.
 */
export function heldRng(rng: Rng, purpose: string, hold: Hold, bar: PlanBar): Rng {
  switch (hold) {
    case "song":
      return rng.fork(purpose);
    case "section":
      return rng.fork(purpose, "section", bar.section.identity);
    case "pass":
      return rng.fork(purpose, "pass", bar.section.identity, bar.stretch);
    case "phrase":
      return rng.fork(purpose, "phrase", bar.section.occurrence, bar.phrase.index);
    case "bar":
      // Keyed by place in the form, not by position in the plan, so a take with a count-in
      // and one without draw the same bars.
      return rng.fork(purpose, "bar", bar.section.occurrence, bar.barInSection);
  }
}

/** Group notes by the plan bar they start in. */
export function byBar(notes: readonly WrittenNote[], barCount: number): WrittenNote[][] {
  const bars: WrittenNote[][] = Array.from({ length: barCount }, () => []);
  for (const note of notes) bars[note.bar]?.push(note);
  return bars;
}
