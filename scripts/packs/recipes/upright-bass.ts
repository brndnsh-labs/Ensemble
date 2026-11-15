// The upright bass, from Karoryfer's Meatbass: pizzicato, recorded every minor
// third with four dynamics and four alternates. The library's percussive
// noises (keys 72 to 79) are knocks with no string pitch in them, so the pack
// has no dead note; a dead note falls back to the plain voice.

import { join } from "node:path";
import { byVelocity, capByNote, pickLayers, type Recipe } from "../recipe.ts";
import { alternate, keys, readSfz, soundsByDefault } from "../sfz.ts";

/** The notes to cover: the band plays 28 to 55. */
const RANGE: readonly [number, number] = [26, 57];
/** Four dynamics, split where the band plays. */
const TOPS = [56, 68, 80, 127];
/** Alternates per layer, softest first: one in the outer layers, two in the middle. */
const ALTERNATES = [1, 2, 2, 1];
/**
 * Length cap, falling from the bottom of the range to the top. The brief's 4 s
 * to 2.5 s came to 39.9 MB decoded against a budget of 30, so the caps are
 * shortened in proportion.
 */
const CAP_LOW: readonly [number, number] = [RANGE[0], 2.9];
const CAP_HIGH: readonly [number, number] = [RANGE[1], 1.8];
const RELEASE = 0.12;

export const uprightBass: Recipe = {
  id: "upright-bass",
  name: "Upright bass",
  channels: 1,
  kbps: 80,
  level: { measure: "loudness", reference: -20 },
  foldDb: -6.0206,
  budgetMB: 30,
  roots: { skip: 0.15, seconds: 0.5 },
  credits: [
    {
      source: "meatbass",
      changes:
        "Pizzicato notes from E-flat 1 to A3 at four dynamics, with alternates; trimmed to the onset, cut at its decay or a length cap and faded; " +
        "each levelled to one loudness; roots measured; encoded as Opus.",
    },
  ],
  voices(dir) {
    const regions = readSfz(join(dir, "Programs/04_pizz.sfz")).filter(
      (r) => soundsByDefault(r) && r.opcodes.trigger === undefined,
    );
    // The recorded notes whose key range in the mapping reaches into the range.
    const notes = [
      ...new Set(
        regions
          .filter((r) => keys(r).hi >= RANGE[0] && keys(r).lo <= RANGE[1])
          .map((r) => keys(r).center),
      ),
    ].sort((a, b) => a - b);
    const byNote = notes.map((note) => {
      const own = regions
        .filter((r) => keys(r).center === note)
        .sort((a, b) => alternate(a) - alternate(b));
      return pickLayers(byVelocity(own), TOPS, 4);
    });
    return [
      {
        name: "",
        release: RELEASE,
        layers: TOPS.map((top, i) => ({
          top,
          zones: byNote.map((layers, n) => ({
            takes: layers[i]!.regions.slice(0, ALTERNATES[i]).map((r) => ({
              parts: [{ file: r.sample, db: 0 }],
              mapped: notes[n]!,
              cap: capByNote(notes[n]!, CAP_LOW, CAP_HIGH),
            })),
          })),
        })),
      },
    ];
  },
};
