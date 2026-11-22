// Country: the boom-chick two-step turning into a train beat. The upright on
// the root and the fifth, walking up into a change a fourth away; the
// steel-string guitar chicking on 2 and 4 on its top four strings, the 6th on a
// plain I or IV; the drummer's two-step, its light train, and the full train
// with the snare's sixteenth lattice when the band is hot; a clean electric
// lead that curls into the third and bends into the root and the fifth
// (ST-country-01 to ST-country-12).

import { DEFAULT_ARC, DEFAULT_MIX, type StylePack } from "@ensemble/engine";
import { countryBass } from "./bass.ts";
import { countryChords } from "./chords.ts";
import { countryCritic } from "./critic.ts";
import { countryDrums } from "./drums.ts";
import { countrySolo } from "./solo.ts";

export const country: StylePack = {
  id: "country",
  name: "Country",
  // ST-country-01: 110 imported, 100 the stock groove, 110 the loudness reference. The range
  // is what the three feels carry: a ballad down to 66, a train up to 160.
  tempo: { default: 110, min: 66, max: 160 },
  feel: {
    // Dead straight eighths: any lilt read as a shuffle that is not one. Nobody leans (the
    // piano's 3 ms belonged to the piano, which this band does not have). "Rock solid":
    // humanize 25 (ST-country-02).
    swing: { unit: "eighth", amount: 0 },
    lean: { bass: 0, chords: 0, solo: 0 },
    humanize: 25,
    // Half a percent either way (docs/decisions/engine.md, the tempo breathes): rock solid,
    // under the three quarters of acoustic and rock.
    breathe: 0.005,
  },
  // The full default arc: ballad, two-step, train (ST-country-11). Everyone stays in.
  arc: DEFAULT_ARC,
  ending: {
    // A plain I or i (ST-country-10).
    finalChord: { major: "", minor: "m", dominant: "" },
    // Held, with a set-up pickup: crash and kick on 1 and the chord ringing (ST-country-10).
    // The bass's walk-up and the guitar's stinger are their own build (EN-45 to EN-49).
    gesture: { kind: "hold" },
    setupFill: true,
    tailBars: 1,
  },
  critic: countryCritic,
  drums: countryDrums,
  bass: countryBass,
  chords: countryChords,
  solo: countrySolo,
  // Acoustic bass and steel-string guitar.
  instruments: { bass: 32, chords: 25 },
  sound: {
    packs: { drums: "drum-kit", bass: "upright-bass", chords: "steel-guitar" },
    // Measured (`pnpm levels country`, the song in G): at the default mix drums -22.9, bass
    // -22.8, guitar -23.2, the band -19.3 LUFS (rock's -18.3, acoustic's -19.3), and the clean
    // guitar 0.6 dB under it. The soloist comes down 0.4 dB to sit about a decibel under. No ear.
    mix: {
      ...DEFAULT_MIX,
      seats: {
        ...DEFAULT_MIX.seats,
        solo: { ...DEFAULT_MIX.seats.solo, level: DEFAULT_MIX.seats.solo.level - 0.4 },
      },
    },
  },
};
