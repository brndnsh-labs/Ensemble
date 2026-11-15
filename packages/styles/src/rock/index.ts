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
  // ST-rock-01: 85 (a pop ballad) to 140 (50s rock), 120 most of all.
  tempo: { default: 120, min: 80, max: 160 },
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
    // The old band's make-up gain for rock was 3 dB under the blues' (ST-rock-33: 8.1 dB
    // against 11.1, ST-blues-59): eighth notes on the bass and the piano, every beat of the
    // hat accented when hot, are a louder band. No ear yet.
    mix: { ...DEFAULT_MIX, master: DEFAULT_MIX.master - 3 },
  },
};
