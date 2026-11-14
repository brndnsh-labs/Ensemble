// The instrument the chord seat is being. The voicing engine asks the idiom
// what a candidate is; the player asks it how strikes become notes. A
// strummed guitar answers both very differently from a piano: grips on the
// fretboard, rolled and held from strike to strike, with stroke direction read
// from the grid. That is why it gets the whole part at once.

import type { WrittenNote } from "../../perform/notes.ts";
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
  /** The notes of a whole part, its strikes in order. */
  write(part: readonly VoicedStrike[]): WrittenNote[];
}

export const IDIOM_PLAYERS: Readonly<Record<Idiom, InstrumentIdiom>> = { keys };
