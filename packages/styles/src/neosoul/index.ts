// Neo-soul: a soft drum loop of two bars with a lazily syncopated kick, and a
// bass and a Rhodes that sit far behind it, the bass deepest. Held chords in
// fourths, a deep warm line with room in it, and a clean guitar behind a singer.
// Energy adds ghosts, sixteenth hats, the syncopated kicks, the busier lines;
// the register and the pocket never change (ST-neosoul-42).

import { DEFAULT_ARC, DEFAULT_MIX, type StylePack } from "@ensemble/engine";
import { neosoulBass } from "./bass.ts";
import { neosoulChords } from "./chords.ts";
import { neosoulCritic } from "./critic.ts";
import { neosoulDrums } from "./drums.ts";
import { neosoulSolo } from "./solo.ts";

export const neosoul: StylePack = {
  id: "neosoul",
  name: "Neo-soul",
  // ST-neosoul-01: a sixteenth of 165 to 195 ms, 77 to 91; the stock groove at 85. Widened a
  // little each side, as the other styles' are.
  tempo: { default: 85, min: 70, max: 100 },
  feel: {
    // Swing 45 on the sixteenths: the off-sixteenth at 57.5% of its pair (ST-neosoul-02). The
    // deepest pocket of any style, the bass at its bottom (ST-neosoul-03), and the loosest
    // placement (ST-neosoul-04): 32 ms and 5.4 at most stays inside 40.
    swing: { unit: "sixteenth", amount: 45 },
    lean: { bass: 32, chords: 25, solo: 25 },
    humanize: 60,
    breathe: 0,
  },
  // The full default arc (ST-neosoul-42).
  arc: DEFAULT_ARC,
  ending: {
    // A major 9th in major, a minor 9th in minor, the dominant 9th on a dominant tonic
    // (ST-neosoul-39).
    finalChord: { major: "maj9", minor: "m9", dominant: "9" },
    // Soft: no set-up fill, no crash; struck on 1 and left to ring (ST-neosoul-40).
    gesture: { kind: "soft" },
    setupFill: false,
    tailBars: 1,
  },
  critic: neosoulCritic,
  drums: neosoulDrums,
  bass: neosoulBass,
  chords: neosoulChords,
  solo: neosoulSolo,
  // Fingered electric bass and the Rhodes, electric piano 1 (ST-neosoul-43).
  instruments: { bass: 33, chords: 4 },
  sound: {
    packs: { drums: "drum-kit", bass: "electric-bass", chords: "electric-piano" },
    // Measured (`pnpm levels`), no ear yet. At the default mix the Rhodes read 1.4 dB under
    // the drums and every soloist 2.2 to 2.7 dB under the band: the soloist comes up to sit
    // about a decibel under. The master is left alone: everyone together reads -17.7 LUFS,
    // between the loud styles' -17 and the blues' and jazz's -18.5.
    mix: {
      ...DEFAULT_MIX,
      seats: { ...DEFAULT_MIX.seats, solo: { ...DEFAULT_MIX.seats.solo, level: 3 } },
    },
    // The bass is plucked more gently than its level says and turned up: its softer, rounder
    // recordings (Brandon's ear, from `scripts/bass-study.ts`: the electric bass as the band
    // played it was "a little harsh").
    touch: { bass: -12 },
  },
};
