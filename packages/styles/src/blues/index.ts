// Blues: a Chicago shuffle band. Everything is written on the eighth-note grid
// and swung into a hard triplet, with the band a hair behind the drums.

import { DEFAULT_ARC, DEFAULT_MIX, type StylePack } from "@ensemble/engine";
import { bluesBass } from "./bass.ts";
import { bluesChords } from "./chords.ts";
import { bluesCritic } from "./critic.ts";
import { bluesDrums } from "./drums.ts";
import { bluesSolo } from "./solo.ts";

export const blues: StylePack = {
  id: "blues",
  name: "Blues",
  // In twelve the same range, a shuffle being a bar of 12/8, but a slow blues goes under its floor.
  tempo: {
    default: 100,
    min: 60,
    max: 150,
    meters: { "12/8": { default: 60, min: 40, max: 150 } },
  },
  feel: {
    // Tuned by ear in the previous band: 90 was not enough, 100 is a hard triplet.
    swing: { unit: "eighth", amount: 100 },
    // Bass a hair behind for weight; piano lazy; the lead furthest back.
    lean: { bass: 2, chords: 6, solo: 8 },
    humanize: 35,
    // A percent either way (docs/decisions/engine.md, the tempo breathes): a shuffle band leaning into its last choruses.
    breathe: 0.01,
  },
  arc: DEFAULT_ARC,
  ending: {
    // A blues band ends even a major tune on its I9.
    finalChord: { major: "9", minor: "m9", dominant: "9" },
    gesture: { kind: "hold" },
    setupFill: true,
    tailBars: 1,
  },
  critic: bluesCritic,
  drums: bluesDrums,
  bass: bluesBass,
  chords: bluesChords,
  solo: bluesSolo,
  // Acoustic bass and acoustic grand piano. The soloist's sound is its instrument's.
  instruments: { bass: 32, chords: 0 },
  sound: {
    packs: { drums: "drum-kit", bass: "upright-bass", chords: "grand-piano" },
    mix: DEFAULT_MIX,
  },
};
