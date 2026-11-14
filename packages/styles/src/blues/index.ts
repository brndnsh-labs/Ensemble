// Blues: a Chicago shuffle band. Everything is written on the eighth-note grid
// and swung into a hard triplet, with the band a hair behind the drums.

import { DEFAULT_ARC, type StylePack } from "@ensemble/engine";
import { bluesBass } from "./bass.ts";
import { bluesDrums } from "./drums.ts";

export const blues: StylePack = {
  id: "blues",
  name: "Blues",
  tempo: { default: 100, min: 60, max: 150 },
  feel: {
    // Tuned by ear in the previous band: 90 was not enough, 100 is a hard triplet.
    swing: { unit: "eighth", amount: 100 },
    // Bass a hair behind for weight; piano lazy; the lead furthest back.
    lean: { bass: 2, chords: 6, solo: 8 },
    humanize: 35,
  },
  arc: DEFAULT_ARC,
  ending: {
    // A blues band ends even a major tune on its I9.
    finalChord: { major: "9", minor: "m9", dominant: "9" },
    gesture: { kind: "hold" },
    setupFill: true,
    tailBars: 1,
  },
  drums: bluesDrums,
  bass: bluesBass,
  // Acoustic bass, acoustic grand piano, clean electric guitar.
  instruments: { bass: 32, chords: 0, solo: 27 },
};
