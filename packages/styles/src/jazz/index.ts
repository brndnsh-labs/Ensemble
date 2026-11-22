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
  // ST-jazz-01: ballads near 66, medium swing 130 to 140, bebop near 200. Twelve-eight is
  // the ballad in twelve, in dotted quarters: two thirds of four's range would make it usually
  // 92 and as quick as 160, a medium six and not a ballad, so the usual is 66 (four's ballad
  // speed, a pulse a beat), the floor 40 (a bar of six seconds) and the ceiling 96. Six-eight
  // keeps two thirds of four's: 40 to 160, usually 92, its eighths as quick as four's at most.
  tempo: {
    default: 138,
    min: 60,
    max: 240,
    meters: { "12/8": { default: 66, min: 40, max: 96 } },
  },
  feel: {
    // Lighter than a triplet, and it does not ease off as the tempo rises (ST-jazz-02, 03).
    swing: { unit: "eighth", amount: 60 },
    // The bass a hair ahead, on top of the ride; the piano laid back; the horn furthest back.
    lean: { bass: -2, chords: 8, solo: 10 },
    humanize: 40,
    // A percent either way (docs/decisions/engine.md, the tempo breathes): the band opens up after the head and pushes into its peak.
    breathe: 0.01,
  },
  // The head is played a tier under the blowing: in two, on the hat, and the move to the
  // ride and the walk is the band opening up (ST-jazz-09, ST-jazz-50). A louder section of
  // the head (a bridge) reaches the working level and walks, as it should.
  // The bridge sits a little higher than the default arc's, so that under the head it is
  // clear of the line between the tiers however the jam is shaped (0.45 to 0.48, not 0.42).
  arc: {
    ...DEFAULT_ARC,
    levels: [["bridge", 0.63], ...DEFAULT_ARC.levels],
    head: -0.15,
    // The piano strolls a chorus under the soloist now and then: bass and drums alone under the
    // horn (docs/decisions/styles.md, who is in). Rare: he heard it thin when it laid out too readily (EAR-26).
    layOut: { seats: ["chords"], under: "solo", span: "pass", below: 0.75, chance: 0.16 },
  },
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
    // A ride and a feathered kick measure 6 dB under a shuffle's backbeat, and the comping
    // is sparser than a blues piano's: the drums come up, the piano a little. No ear yet.
    mix: {
      ...DEFAULT_MIX,
      seats: {
        ...DEFAULT_MIX.seats,
        drums: { ...DEFAULT_MIX.seats.drums, level: 3 },
        chords: { ...DEFAULT_MIX.seats.chords, level: -5 },
        // A jazz band is the quietest of the four, and its soloist is nearer its level already.
        solo: { ...DEFAULT_MIX.seats.solo, level: 0.5 },
      },
    },
  },
};
