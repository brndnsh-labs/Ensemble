// The instruments a soloist can be. Which one plays is the player's choice,
// so they live here and not in a style pack: a style only names its default.

import type { SoloInstrument, SoloStyle } from "./style.ts";

export const SOLO_INSTRUMENTS: Readonly<Record<string, SoloInstrument>> = {
  // Three octaves from F3. Its solo voice sits an octave over middle C, above the piano's
  // hand; the bars ring by themselves, so it need not breathe.
  vibraphone: { name: "Vibraphone", program: 11, range: [53, 89], home: 72, breath: null },
  // The comfortable solo register, with the ends kept for climaxes (SO-01). It breathes:
  // eight seconds is a long phrase on one breath, and a breath takes half a second (Q-47).
  "alto-sax": {
    name: "Alto sax",
    program: 65,
    range: [53, 82],
    home: 67,
    breath: { lungs: 8, takes: 0.5 },
  },
  // A lead guitar's working register, from the open D string's octave up to the top of the
  // neck, at home around the twelfth fret. Its notes are plain for now: no bends, no vibrato.
  "driven-guitar": {
    name: "Overdriven guitar",
    program: 29,
    range: [52, 85],
    home: 69,
    breath: null,
  },
};

/** The name an instrument is listed under, for a note's `voice`. */
export function soloVoice(solo: SoloStyle): string {
  return solo.instrument in SOLO_INSTRUMENTS ? solo.instrument : Object.keys(SOLO_INSTRUMENTS)[0]!;
}
