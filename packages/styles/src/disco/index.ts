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
  // In six and twelve the figure counts the dotted quarter, and disco's pulse is the floor's:
  // the kick on every pulse at the dancer's speed, as in four, not two thirds of it. Its eighths
  // are then a triplet at half as fast again as four's (six a second at 120 against four's
  // sixteenths at eight), and the pump, the bark and the chop come as often as they do in four.
  // The meters a player of disco would call its own: listed first. Four on the floor (docs/decisions/styles.md, #2298).
  ownMeters: ["4/4"],
  tempo: {
    default: 120,
    min: 100,
    max: 136,
    meters: {
      "12/8": { default: 120, min: 100, max: 136 },
      "6/8": { default: 120, min: 100, max: 136 },
    },
  },
  feel: {
    // Straight sixteenths, machine-tight. The bass a hair ahead, pulling the floor forward; the
    // guitar on the grid, since its chops double the open hat and any lag flams; the lead
    // floating over it (ST-disco-02).
    swing: { unit: "sixteenth", amount: 0 },
    lean: { bass: -2, chords: 0, solo: 4 },
    humanize: 15,
    // None: a machine for the floor, whose energy never changes the pulse (ST-disco, its first line).
    breathe: 0,
  },
  // The full default arc (ST-disco-32).
  arc: {
    ...DEFAULT_ARC,
    // Now and then a breakdown to the kick and the bass: the comp out of a section where the band
    // plays alone (docs/decisions/styles.md, who is in).
    layOut: {
      seats: ["chords"],
      under: "band",
      span: "section",
      below: 0.75,
      chance: 0.12,
      openChance: 0.1,
    },
  },
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
    // The bass is plucked more gently than its level says and turned up, as funk's is: its
    // softer, rounder recordings. Brandon chose this for funk by ear (`scripts/bass-study.ts`)
    // and named disco among the styles whose bass was harsh; disco itself was not in the study.
    touch: { bass: -12 },
  },
};
