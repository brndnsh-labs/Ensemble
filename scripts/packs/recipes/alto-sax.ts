// The alto sax, from Karoryfer's Weresax: every semitone from D-flat 3 to
// A-flat 5 at two dynamics, on a condenser and a dynamic microphone. The pack
// takes the condenser, every second semitone and the top note, first
// alternate only.

import { join } from "node:path";
import type { Recipe } from "../recipe.ts";
import { alternate, keys, readSfz, type SfzRegion } from "../sfz.ts";

/** The notes to take: every second semitone from 49, and the top note. */
const NOTES = [49, 51, 53, 55, 57, 59, 61, 63, 65, 67, 69, 71, 73, 75, 77, 79, 80];
/** The soft recordings play up to 70; the loud ones above. */
const LAYERS = [
  { top: 70, map: "Programs/alto_map_piano_condenser.sfz" },
  { top: 127, map: "Programs/alto_map_forte_condenser.sfz" },
];
const CAP = 4.5;
const RELEASE = 0.06;

export const altoSax: Recipe = {
  id: "alto-sax",
  name: "Alto sax",
  source: "weresax",
  channels: 1,
  kbps: 80,
  level: { measure: "loudness", reference: -20 },
  foldDb: -6.0206,
  budgetMB: 30,
  roots: { skip: 0.3, seconds: 0.6 },
  changes:
    "The condenser microphone's notes, every second semitone from D-flat 3 and the top A-flat 5, at both dynamics, first alternate; " +
    "trimmed to the onset, cut at a length cap and faded; each levelled to one loudness; roots measured; encoded as Opus.",
  voices(dir) {
    return [
      {
        name: "",
        release: RELEASE,
        layers: LAYERS.map(({ top, map }) => {
          const regions = readSfz(join(dir, map));
          return {
            top,
            zones: NOTES.map((note) => {
              const first: SfzRegion | undefined = regions
                .filter((r) => keys(r).center === note)
                .sort((a, b) => alternate(a) - alternate(b))[0];
              if (!first) throw new Error(`${map}: no region for note ${note}`);
              return {
                takes: [{ parts: [{ file: first.sample, db: 0 }], mapped: note, cap: CAP }],
              };
            }),
          };
        }),
      },
    ];
  },
};
