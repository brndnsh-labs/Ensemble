// Funk: sixteenth-note funk. A syncopated kick that stays off the backbeat, a
// one-bar bass riff locked to it, a guitar scratching sixteenths with clipped
// stabs, and a horn on top. The rhythm section pushes on the One.

import { DEFAULT_ARC, DEFAULT_MIX, type StylePack } from "@ensemble/engine";
import { funkBass } from "./bass.ts";
import { funkChords } from "./chords.ts";
import { funkCritic } from "./critic.ts";
import { funkDrums } from "./drums.ts";
import { funkSolo } from "./solo.ts";

export const funk: StylePack = {
  id: "funk",
  name: "Funk",
  // ST-funk-01: the old band's funk scenes ran 100 to 115.
  tempo: { default: 105, min: 80, max: 126 },
  feel: {
    // A trace on the sixteenths, not a shuffle (ST-funk-02).
    swing: { unit: "sixteenth", amount: 15 },
    // Bass and guitar ahead of the drums; the horn on the grid, on top of the pocket (ST-funk-03).
    lean: { bass: -5, chords: -3, solo: 0 },
    humanize: 25,
  },
  arc: DEFAULT_ARC,
  ending: {
    // The I9 on a dominant tonic; the 6/9 where a flat seventh would turn the last chord
    // into the V of IV (ST-funk-40).
    finalChord: { major: "69", minor: "m9", dominant: "9" },
    // The dead stop: a one-beat set-up, everyone hits the One, silence (ST-funk-41).
    gesture: { kind: "stop" },
    setupFill: true,
    tailBars: 1,
  },
  critic: funkCritic,
  drums: funkDrums,
  bass: funkBass,
  chords: funkChords,
  solo: funkSolo,
  // Fingered electric bass and a clean electric guitar.
  instruments: { bass: 33, chords: 27 },
  sound: {
    packs: { drums: "drum-kit", bass: "electric-bass", chords: "clean-guitar" },
    // Short strokes measure quieter than a piano's chords at the same level: alone, the
    // guitar read 3 dB under the bass. It comes up to sit with the bass and drums. No ear yet.
    mix: {
      ...DEFAULT_MIX,
      seats: {
        ...DEFAULT_MIX.seats,
        chords: { ...DEFAULT_MIX.seats.chords, level: -3 },
        // A funk soloist's stabs are short and the band under them is busy: left at the
        // default it measured 5.4 dB under the band, where the blues' was 2.5.
        solo: { ...DEFAULT_MIX.seats.solo, level: 4.5 },
      },
    },
    // The bass is plucked more gently than its level says and turned up: its softer, rounder
    // recordings (Brandon's ear, from `scripts/bass-study.ts`: the electric bass as the band
    // played it was "a little harsh").
    touch: { bass: -12 },
  },
};
