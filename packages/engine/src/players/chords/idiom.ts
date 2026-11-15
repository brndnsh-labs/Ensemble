// The instrument the chord seat is being. The voicing engine asks the idiom
// what a candidate is; the player asks it how strikes become notes. A
// strummed guitar answers both very differently from a piano: grips on the
// fretboard, rolled and held from strike to strike, with stroke direction read
// from the grid. That is why it gets the whole part at once.

import type { WrittenNote } from "../../perform/notes.ts";
import type { Plan } from "../../plan/types.ts";
import { guitar } from "./guitar.ts";
import { keys } from "./keys.ts";
import type { VoicedStrike, Voicing } from "./strike.ts";
import type { ChordRegister, Idiom } from "./style.ts";
import type { FittedTone } from "./tones.ts";

export interface InstrumentIdiom {
  /**
   * Every way this instrument can play these tones in the register, in order
   * of preference when two cost the same. `root` is the chord's root pitch class.
   */
  candidates(tones: readonly FittedTone[], root: number, register: ChordRegister): Voicing[];
  /**
   * A candidate as the hand would take it coming from the voicing it holds
   * (null: from nothing). A guitar can fret the same notes in more than one
   * place and takes the nearest; a keyboard has one place for a note.
   */
  placed?(voicing: Voicing, from: Voicing | null): Voicing;
  /**
   * Whether the hand keeps its shape from strike to strike while the chord
   * stays: a guitarist holds a grip and moves only when the chord does; a
   * pianist re-voices every strike, each led from the one before (CH-31).
   */
  readonly holds: boolean;
  /**
   * The notes of a whole part, its strikes in order. The plan says where the
   * barlines are and how long a millisecond is, for an instrument whose
   * strokes have a direction and a roll.
   */
  write(part: readonly VoicedStrike[], plan: Plan): WrittenNote[];
}

/** The instrument a style puts in the seat. */
export function idiomOf(idiom: Idiom): InstrumentIdiom {
  return idiom === "keys" ? keys : guitar(idiom);
}
