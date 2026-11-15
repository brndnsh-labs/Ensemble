// Jazz: medium swing. The ride and a walking bass, a piano comping rootless
// voicings, a bebop horn. The band states the tune lightly, in two, and opens
// up into four for the blowing.

import { DEFAULT_ARC, DEFAULT_MIX, type StylePack } from "@ensemble/engine";
import { jazzBass } from "./bass.ts";
import { jazzChords } from "./chords.ts";
import { jazzCritic } from "./critic.ts";
import { jazzDrums } from "./drums.ts";
import { jazzSolo } from "./solo.ts";

export const jazz: StylePack = {
  id: "jazz",
  name: "Jazz",
  // ST-jazz-01: ballads near 66, medium swing 130 to 140, bebop near 200.
  tempo: { default: 138, min: 60, max: 240 },
  feel: {
    // Lighter than a triplet, and it does not ease off as the tempo rises (ST-jazz-02, 03).
    swing: { unit: "eighth", amount: 60 },
    // The bass a hair ahead, on top of the ride; the piano laid back; the horn furthest back.
    lean: { bass: -2, chords: 8, solo: 10 },
    humanize: 40,
  },
  // The head is played a tier under the blowing: in two, on the hat, and the move to the
  // ride and the walk is the band opening up (ST-jazz-09, ST-jazz-50). A louder section of
  // the head (a bridge) reaches the working level and walks, as it should.
  // The bridge sits a little higher than the default arc's, so that under the head it is
  // clear of the line between the tiers however the jam is shaped (0.45 to 0.48, not 0.42).
  arc: { ...DEFAULT_ARC, levels: [["bridge", 0.63], ...DEFAULT_ARC.levels], head: -0.15 },
  ending: {
    // The tonic 6th: no major-seventh rub under a melody resting on the root (ST-jazz-47).
    finalChord: { major: "6", minor: "m6", dominant: "6" },
    // Held from beat 1, then one short hit on the "and" of 4: "doo-BOP" (ST-jazz-48).
    gesture: { kind: "button" },
    setupFill: false,
    tailBars: 1,
  },
  critic: jazzCritic,
  drums: jazzDrums,
  bass: jazzBass,
  chords: jazzChords,
  solo: jazzSolo,
  // Acoustic bass and acoustic grand piano.
  instruments: { bass: 32, chords: 0 },
  sound: {
    packs: { drums: "drum-kit", bass: "upright-bass", chords: "grand-piano" },
    mix: DEFAULT_MIX,
  },
};
