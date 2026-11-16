// Acoustic: the singer-songwriter's band, restraint around a guitar. Quiet,
// the nylon-string guitar fingerpicks and the drummer barely plays; louder, it
// strums open chords, the upright plays root and fifth, and the backbeat fills
// out to a full snare. The arc is carried by texture more than by volume
// (ST-acoustic-01 to ST-acoustic-39).

import { DEFAULT_ARC, DEFAULT_MIX, type StylePack } from "@ensemble/engine";
import { acousticBass } from "./bass.ts";
import { acousticChords } from "./chords.ts";
import { acousticCritic } from "./critic.ts";
import { acousticDrums } from "./drums.ts";
import { acousticSolo } from "./solo.ts";

export const acoustic: StylePack = {
  id: "acoustic",
  name: "Acoustic",
  // ST-acoustic-01: the one stock groove is 90 and the loudness reference 100; about 95.
  // Widened each side, as the other styles' are: a ballad and a brisk strum are both this band.
  tempo: { default: 95, min: 72, max: 120 },
  feel: {
    // Straight eighths with a lilt: swing 15, the off-beat eighth at 52.5% of the beat
    // (ST-acoustic-02). Honest time: the upright 5 ms back, nobody else leaning; human, never
    // sloppy (ST-acoustic-03).
    swing: { unit: "eighth", amount: 15 },
    lean: { bass: 5, chords: 0, solo: 0 },
    humanize: 30,
  },
  // The full default arc (ST-acoustic-36): what changes along it is the texture.
  arc: DEFAULT_ARC,
  ending: {
    // The open tonic triad, I or i, left ringing (ST-acoustic-34).
    finalChord: { major: "", minor: "m", dominant: "" },
    // Soft: no fill, no crash; one strum on 1 rings out (ST-acoustic-35).
    gesture: { kind: "soft" },
    setupFill: false,
    tailBars: 1,
  },
  critic: acousticCritic,
  drums: acousticDrums,
  bass: acousticBass,
  chords: acousticChords,
  solo: acousticSolo,
  // Acoustic bass and nylon-string guitar (ST-acoustic-37).
  instruments: { bass: 32, chords: 24 },
  sound: {
    packs: { drums: "drum-kit", bass: "upright-bass", chords: "nylon-guitar" },
    // Measured (`pnpm levels`), no ear yet. At the default mix the nylon guitar read 4 dB over
    // the drums and 3 over the bass (a strum is up to six strings, and this drummer plays
    // softly) and its own soloist 3.4 dB under the band. The guitar comes down 2 dB and the
    // soloist up a decibel and a half; the master comes down 0.6, which puts everyone
    // together at -18.2 LUFS, with the blues and jazz the quietest of the eight.
    mix: {
      ...DEFAULT_MIX,
      seats: {
        ...DEFAULT_MIX.seats,
        chords: { ...DEFAULT_MIX.seats.chords, level: -8 },
        solo: { ...DEFAULT_MIX.seats.solo, level: 3 },
      },
      master: DEFAULT_MIX.master - 0.6,
    },
  },
};
