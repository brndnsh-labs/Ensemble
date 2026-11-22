// Reggae: roots reggae in the slow count. The one drop, kick and cross-stick
// together on beat 3 with nothing on the One; the guitar's skank chopping 2 and
// 4; a deep bass with holes in it; and a horn laying back over the top. When
// the band is hot the drummer plays one riddim for the whole performance,
// steppers or rockers, and puts the kick back on the One (ST-reggae-01 to
// ST-reggae-37). In twelve it is the reggae shuffle, in six a bar of two with
// the drop on its second pulse, each seat's part written for the meter in its
// own file.

import { DEFAULT_ARC, DEFAULT_MIX, type StylePack } from "@ensemble/engine";
import { reggaeBass } from "./bass.ts";
import { reggaeChords } from "./chords.ts";
import { reggaeCritic } from "./critic.ts";
import { reggaeDrums } from "./drums.ts";
import { reggaeSolo } from "./solo.ts";

export const reggae: StylePack = {
  id: "reggae",
  name: "Reggae",
  // ST-reggae-01: the slow count, about 60 to 90, 76 for the import and the loudness reference.
  // A chart written in the fast count (the skank on every "and") is not read as such: it would
  // play at twice the tempo it is written at.
  // In twelve and in six the pulse is the slow count's beat: twelve is the shuffle, the one
  // drop with its beat a triplet, and six is a bar of two of the same pulse, the drop on the
  // second. So the range is four's in both, as the blues' is for its shuffle in twelve, and
  // not the two thirds of it that keeps a style's eighths at four's speed.
  tempo: {
    default: 76,
    min: 60,
    max: 90,
    meters: {
      "12/8": { default: 76, min: 60, max: 90 },
      "6/8": { default: 76, min: 60, max: 90 },
    },
  },
  feel: {
    // Swing 20 on the sixteenths: the off-sixteenth at 53.3% of its pair (ST-reggae-02). The bass
    // drags most, the chop a touch less so it stays crisp against the hat, the horn furthest
    // back (ST-reggae-03).
    swing: { unit: "sixteenth", amount: 20 },
    lean: { bass: 8, chords: 5, solo: 12 },
    humanize: 30,
    // None: the hat keeps the grid as the reference (AU-74) and the arc is played at half depth.
    breathe: 0,
  },
  arc: {
    ...DEFAULT_ARC,
    // The song-length arc at half depth: a plain chart's climax reaches about 0.65, so the build
    // and the breath are heard in dynamics only (ST-reggae-34).
    depth: 0.5,
    // No build, arc or lift carries a section from the one drop into steppers or rockers, or
    // back (ST-reggae-33).
    liftsCrossHigh: false,
    // Now and then the dub's drop to the riddim: the skank out of a section where the band plays
    // alone (docs/decisions/styles.md, who is in).
    layOut: {
      seats: ["chords"],
      under: "band",
      span: "section",
      below: 0.75,
      chance: 0.45,
      openChance: 0.12,
    },
  },
  ending: {
    // The plain triad, I or i (ST-reggae-31).
    finalChord: { major: "", minor: "m", dominant: "" },
    // The stop: a set-up fill, then bass and chord hit the One together for an eighth and the
    // band drops out (ST-reggae-32).
    gesture: { kind: "stop" },
    setupFill: true,
    tailBars: 0,
  },
  critic: reggaeCritic,
  drums: reggaeDrums,
  bass: reggaeBass,
  chords: reggaeChords,
  solo: reggaeSolo,
  // Fingered electric bass and a clean electric guitar on the skank (ST-reggae-35).
  instruments: { bass: 33, chords: 27 },
  sound: {
    packs: { drums: "drum-kit", bass: "electric-bass", chords: "clean-guitar" },
    // Measured (`pnpm levels`), no ear yet. At the default mix the skank read 2 dB under the
    // drums (short chops measure quiet, as funk's and disco's do), the band -19.9 LUFS and the
    // alto 1.4 dB under it: the guitar comes up 3 dB as theirs does, the soloist a decibel, the
    // master a decibel.
    mix: {
      ...DEFAULT_MIX,
      seats: {
        ...DEFAULT_MIX.seats,
        // The tone control all the way down (Brandon's ear, from `scripts/bass-study.ts`). The
        // soft recordings turned up read 0.6 dB louder than the hard ones did, so the seat comes
        // down by that and the band is as loud as it was measured.
        bass: {
          ...DEFAULT_MIX.seats.bass,
          level: DEFAULT_MIX.seats.bass.level - 0.6,
          lowpass: 400,
        },
        chords: { ...DEFAULT_MIX.seats.chords, level: -3 },
        solo: { ...DEFAULT_MIX.seats.solo, level: 2.5 },
      },
      master: DEFAULT_MIX.master + 1,
    },
    // And plucked much more gently than its level says, with the thumb: the softest
    // recordings the bass has, turned up. Round and dark, all low end.
    touch: { bass: -24 },
  },
};
