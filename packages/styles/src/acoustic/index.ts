// Acoustic: the singer-songwriter's band, restraint around a guitar. Quiet,
// the steel-string guitar fingerpicks and the drummer barely plays; louder, it
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
    // Three quarters of a percent either way (docs/decisions/engine.md, the tempo breathes): honest time, human and never sloppy (ST-acoustic-03).
    breathe: 0.0075,
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
  // Acoustic bass and steel-string guitar. The notes' default is a nylon-string guitar
  // (ST-acoustic-37), which was the only one the old version had; the steel-string is the
  // genre's instrument and was chosen by ear, and the nylon stays as a choice.
  instruments: { bass: 32, chords: 25 },
  sound: {
    packs: { drums: "drum-kit", bass: "upright-bass", chords: "steel-guitar" },
    choices: {
      chords: [
        { pack: "steel-guitar", name: "Steel-string guitar" },
        { pack: "nylon-guitar", name: "Nylon-string guitar", level: -1.1 },
      ],
    },
    // Measured (`pnpm levels`), no ear yet. At the default mix a strummed guitar reads over
    // the drums and the bass (a strum is up to six strings, and this drummer plays softly)
    // and its own soloist well under the band. The steel-string guitar sits at -6.9, which
    // puts it a decibel over the bass, and its soloist at 3.9, a decibel under the band; the
    // master comes down 0.6, which puts everyone together near -18.2 LUFS, with the blues and
    // jazz the quietest of the eight. The nylon-string guitar's recordings read 1.1 dB louder
    // in the same part, so it is levelled down by that.
    mix: {
      ...DEFAULT_MIX,
      seats: {
        ...DEFAULT_MIX.seats,
        chords: { ...DEFAULT_MIX.seats.chords, level: -6.9 },
        solo: { ...DEFAULT_MIX.seats.solo, level: 3.9 },
      },
      master: DEFAULT_MIX.master - 0.6,
    },
  },
};
