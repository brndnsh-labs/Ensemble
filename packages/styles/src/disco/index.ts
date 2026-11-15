// Disco: a machine for the dance floor. Four on the floor that never lets up,
// the open hat on every "and", an octave-pumping bass, a guitar hand that
// never stops, and an alto soaring over it. Energy changes how hard the band
// digs in, never the pulse.

import { DEFAULT_ARC, DEFAULT_MIX, type StylePack } from "@ensemble/engine";
import { discoBass } from "./bass.ts";
import { discoChords } from "./chords.ts";
import { discoCritic } from "./critic.ts";
import { discoDrums } from "./drums.ts";
import { discoSolo } from "./solo.ts";

export const disco: StylePack = {
  id: "disco",
  name: "Disco",
  // ST-disco-01: 120, the only number the old band attached to it.
  tempo: { default: 120, min: 100, max: 136 },
  feel: {
    // Straight sixteenths, machine-tight. The bass a hair ahead, pulling the floor forward; the
    // guitar on the grid, since its chops double the open hat and any lag flams; the lead
    // floating over it (ST-disco-02).
    swing: { unit: "sixteenth", amount: 0 },
    lean: { bass: -2, chords: 0, solo: 4 },
    humanize: 15,
  },
  // The full default arc (ST-disco-32).
  arc: DEFAULT_ARC,
  ending: {
    // A major 7th in major, a minor 7th in minor, the I9 on a dominant tonic (ST-disco-30).
    finalChord: { major: "maj7", minor: "m7", dominant: "9" },
    // Held, with the set-up fill (ST-disco-31).
    gesture: { kind: "hold" },
    setupFill: true,
    tailBars: 1,
  },
  critic: discoCritic,
  drums: discoDrums,
  bass: discoBass,
  chords: discoChords,
  solo: discoSolo,
  // Fingered electric bass and a clean electric guitar (ST-disco-33).
  instruments: { bass: 33, chords: 27 },
  sound: {
    packs: { drums: "drum-kit", bass: "electric-bass", chords: "clean-guitar" },
    // Measured (`pnpm levels`), no ear yet. The guitar comes up 3 dB, as funk's does: short
    // chops measure quiet, and the soloist up to sit a decibel under the band. With everyone
    // playing that read -16.1 LUFS, a decibel over funk and rock, so the master comes down to
    // bring it level with them.
    mix: {
      ...DEFAULT_MIX,
      seats: {
        ...DEFAULT_MIX.seats,
        chords: { ...DEFAULT_MIX.seats.chords, level: -3 },
        solo: { ...DEFAULT_MIX.seats.solo, level: 4.5 },
      },
      master: DEFAULT_MIX.master - 1.5,
    },
  },
};
