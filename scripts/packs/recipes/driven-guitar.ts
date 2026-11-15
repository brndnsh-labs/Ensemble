// The overdriven guitar: the clean guitar's plain notes played through an
// amplifier (`amp.ts`), not a recording of a driven amp. The old band made
// its lead guitar the same way (docs/music-notes, SN-25) and its numbers are
// the starting point: thinned below 90 Hz, clipped softly and a little
// unevenly, a speaker that rolls off at 4 kHz with some body at 450 Hz and a
// little presence at 2.4 kHz. How hard it is driven is the knob that is set
// by ear, so there are two of them until an ear has chosen.

import type { Amp, Recipe } from "../recipe.ts";
import { cleanGuitar, plainVoice } from "./clean-guitar.ts";

const SPEAKER: Amp["speaker"] = {
  rollOff: 4000,
  peaks: [
    [450, 2.5, 1],
    [2400, 1.5, 1],
  ],
};

/** The softer of the two dynamics is driven this much less: a lighter touch cleans the amp up. */
const SOFT_PUSH = 0.5;

function driven(id: string, name: string, drive: number, said: string): Recipe {
  return {
    ...cleanGuitar,
    id,
    name,
    amp: { lowCut: 90, drive, bias: 0.12, speaker: SPEAKER },
    monoCheck: false,
    credits: [
      {
        source: "fsbs-clean-guitar",
        changes:
          "Every recorded note, C2 to C-sharp 6, at both dynamics, two alternates each, the stereo files folded to mono; " +
          `trimmed to the onset, cut at a length cap and faded; played through a simulated amplifier (${said}: thinned below 90 Hz, ` +
          "a soft uneven clip, and a speaker rolling off at 4 kHz); each levelled to one loudness; roots measured; encoded as Opus.",
      },
    ],
    voices(dir) {
      // The notes only: a lead does not strum muted strokes.
      const plain = plainVoice(dir);
      return [
        {
          ...plain,
          layers: plain.layers.map((layer, at) => ({
            ...layer,
            zones: layer.zones.map((zone) => ({
              takes: zone.takes.map((take) => ({
                ...take,
                push: at === plain.layers.length - 1 ? 1 : SOFT_PUSH,
              })),
            })),
          })),
        },
      ];
    },
  };
}

/** Three times drive: "a bluesy edge" by the old band's ear. */
export const drivenGuitar = driven("driven-guitar", "Overdriven guitar", 3, "three times drive");
/** Six: "more grit". */
export const drivenGuitarGrit = driven(
  "driven-guitar-grit",
  "Overdriven guitar, more grit",
  6,
  "six times drive",
);
