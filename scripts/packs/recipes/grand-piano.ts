// The grand piano, from the Salamander Grand Piano (a Yamaha C5), recorded
// every minor third at sixteen dynamics on a pair of microphones. The pack
// takes three dynamics, folds the pair to mono, and keeps the mapping's own
// pitch for each note: the piano's stretch tuning is meant.

import { join } from "node:path";
import { byVelocity, capByNote, pickLayers, type Recipe } from "../recipe.ts";
import { keys, readSfz, soundsByDefault } from "../sfz.ts";

/** The sampled notes to take: A1 to C7. */
const RANGE: readonly [number, number] = [33, 96];
const TOPS = [62, 78, 127];
/** Length cap: 7 s at the bottom, falling to 3 s at the top. */
const CAP_LOW: readonly [number, number] = [RANGE[0], 7];
const CAP_HIGH: readonly [number, number] = [RANGE[1], 3];
const RELEASE = 0.2;

export const grandPiano: Recipe = {
  id: "grand-piano",
  name: "Grand piano",
  source: "salamander",
  channels: 1,
  kbps: 80,
  level: { measure: "loudness", reference: -20 },
  // The files open on the noise of the action, within 50 dB of the strike's
  // peak; the strike begins 3 to 24 ms in (median 10). Start at the strike.
  onsetDb: -30,
  foldDb: -3,
  budgetMB: 65,
  monoCheck: true,
  changes:
    "Three of the sixteen velocity layers (v8, v10 and v16) of the sampled notes A1 to C7, " +
    "the two microphones summed to mono at -3 dB each; trimmed to the hammer's strike, cut at its decay or a length cap and faded; " +
    "each note levelled to one loudness; encoded as Opus. Release and pedal noises left out.",
  voices(dir) {
    // The "Natural" keyswitch is the default: the recordings as tuned, no retuning.
    const regions = readSfz(join(dir, "Salamander Grand Piano V3.sfz")).filter(
      (r) =>
        soundsByDefault(r) &&
        r.opcodes.master_label === "Notes" &&
        r.opcodes.trigger === undefined &&
        keys(r).center >= RANGE[0] &&
        keys(r).center <= RANGE[1],
    );
    const notes = [...new Set(regions.map((r) => keys(r).center))].sort((a, b) => a - b);
    const byNote = notes.map((note) =>
      pickLayers(byVelocity(regions.filter((r) => keys(r).center === note)), TOPS, 1),
    );
    return [
      {
        name: "",
        release: RELEASE,
        layers: TOPS.map((top, i) => ({
          top,
          zones: byNote.map((layers, n) => {
            const r = layers[i]!.regions[0]!;
            return {
              takes: [
                {
                  parts: [{ file: r.sample, db: 0 }],
                  mapped: notes[n]! + Number(r.opcodes.tune ?? 0) / 100,
                  cap: capByNote(notes[n]!, CAP_LOW, CAP_HIGH),
                },
              ],
            };
          }),
        })),
      },
    ];
  },
};
