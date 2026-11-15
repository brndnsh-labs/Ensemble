// The instruments a soloist can be. Which one plays is the player's choice,
// so they live here and not in a style pack: a style only names its default.

import type { SoloInstrument, SoloStyle } from "./style.ts";

export const SOLO_INSTRUMENTS: Readonly<Record<string, SoloInstrument>> = {
  // Three octaves from F3. Its solo voice sits an octave over middle C, above the piano's
  // hand; the bars ring by themselves, so it need not breathe. A bar's pitch does not move.
  vibraphone: {
    name: "Vibraphone",
    program: 11,
    range: [53, 89],
    home: 72,
    breath: null,
    bend: null,
    shake: null,
  },
  // The comfortable solo register, with the ends kept for climaxes (SO-01). It breathes:
  // eight seconds is a long phrase on one breath, and a breath takes half a second (Q-47).
  // Its notes are plain: a horn's scoop, fall and vibrato are not played.
  "alto-sax": {
    name: "Alto sax",
    program: 65,
    range: [53, 82],
    home: 67,
    breath: { lungs: 8, takes: 0.5 },
    bend: null,
    shake: null,
  },
  // The lead guitar: an overdriven guitar's solo register, G3 to E6, at home on B4 (SO-01).
  // Its hand is the one Brandon's ear chose from nine (scripts/pitch-study.ts, clips 5 and
  // 4): a bend struck flat and pushed up to the note in a tenth of a second, and a wide
  // vibrato, the string pushed 60 cents sharp and let back five and a half times a second,
  // starting a third of a second into the note and growing over as long again.
  "driven-guitar": {
    name: "Overdriven guitar",
    program: 29,
    range: [55, 88],
    home: 71,
    breath: null,
    bend: { takes: 0.1 },
    shake: { depth: 60, rate: 5.5, after: 0.35, grows: 0.3, upward: true },
  },
  // The clean electric guitar's solo register, G3 to D6, at home on A4 (SO-01): a lead behind
  // a singer (ST-neosoul-43). The overdriven guitar's hand: the same string, the same bend
  // and the same shake.
  "clean-guitar": {
    name: "Clean electric guitar",
    program: 27,
    range: [55, 86],
    home: 69,
    breath: null,
    bend: { takes: 0.1 },
    shake: { depth: 60, rate: 5.5, after: 0.35, grows: 0.3, upward: true },
  },
};

/** The name an instrument is listed under, for a note's `voice`. */
export function soloVoice(solo: SoloStyle): string {
  return solo.instrument in SOLO_INSTRUMENTS ? solo.instrument : Object.keys(SOLO_INSTRUMENTS)[0]!;
}
