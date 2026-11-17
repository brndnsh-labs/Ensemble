// Rock: a straight-eighth backbeat band. Kick on 1 and 3, the snare on 2 and
// 4, eighth-note roots on the bass, plain triads on the piano, tom fills, and
// everyone on the last chord together.

import { DEFAULT_ARC, DEFAULT_MIX, type StylePack } from "@ensemble/engine";
import { rockBass } from "./bass.ts";
import { rockChords } from "./chords.ts";
import { rockCritic } from "./critic.ts";
import { rockDrums } from "./drums.ts";
import { rockSolo } from "./solo.ts";

export const rock: StylePack = {
  id: "rock",
  name: "Rock",
  // ST-rock-01: 85 (a pop ballad) to 140 (50s rock), 120 most of all. In twelve, dotted
  // quarters: two thirds of that range would make the usual ballad 80 and the slowest 53,
  // where the slow dance and the rock ballad in twelve-eight live lower, so the usual is 66
  // and the floor 48. The ceiling stays two thirds of four's: eighths no quicker than there.
  tempo: {
    default: 120,
    min: 80,
    max: 160,
    meters: { "12/8": { default: 66, min: 48, max: 107 } },
  },
  feel: {
    // Straight eighths. The bass on the drummer, the chords a hair behind, the lead a little
    // more (ST-rock-02).
    swing: { unit: "eighth", amount: 0 },
    lean: { bass: 0, chords: 3, solo: 4 },
    humanize: 35,
  },
  // The full default arc: verse at the working level, chorus hot, intro and breakdown quiet
  // (ST-rock-31).
  arc: DEFAULT_ARC,
  ending: {
    // The plain triad, I or i (ST-rock-29).
    finalChord: { major: "", minor: "m", dominant: "" },
    // The drummer rolls the band in, everyone hits beat 1, and the chord rings (ST-rock-30).
    gesture: { kind: "hold" },
    setupFill: true,
    tailBars: 1,
  },
  critic: rockCritic,
  drums: rockDrums,
  bass: rockBass,
  chords: rockChords,
  solo: rockSolo,
  // Fingered electric bass and acoustic grand piano.
  instruments: { bass: 33, chords: 0 },
  sound: {
    packs: { drums: "drum-kit", bass: "electric-bass", chords: "grand-piano" },
    // Measured (`pnpm levels`). The old band's rock ran 3 dB under its blues; this one, 3 dB
    // under, read 2 dB quieter than this blues, so it is half a decibel under. The soloist
    // measured 4.9 dB under the band, where the blues' was 2.5, and comes up.
    mix: {
      ...DEFAULT_MIX,
      seats: { ...DEFAULT_MIX.seats, solo: { ...DEFAULT_MIX.seats.solo, level: 3 } },
      master: DEFAULT_MIX.master - 0.5,
    },
  },
};
