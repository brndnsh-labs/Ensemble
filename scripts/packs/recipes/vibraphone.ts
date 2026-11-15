// The vibraphone, from the Versilian Community Sample Library: hard mallets,
// eleven notes a third or so apart, at two dynamics. The library ships no
// mapping for it, so the filenames say which note and dynamic each file is;
// they call middle C "C3", and the measured pitch has the last word.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { capByNote, type Recipe } from "../recipe.ts";

const FOLDER = "Idiophones/Struck Idiophones/Vibraphone/Hard Mallets";
/** The library's two hard-mallet dynamics, softest first, and the layer each plays. */
const LAYERS = [
  { top: 70, dynamic: "v2" },
  { top: 127, dynamic: "v3" },
];
/** Length cap: 6 s at the bottom falling to 3.5 s at the top. */
const CAP_LOW: readonly [number, number] = [53, 6];
const CAP_HIGH: readonly [number, number] = [88, 3.5];
const RELEASE = 0.25;

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "Vibes_hard_A2_v2_rr1_Main.wav": A2 in the library's naming is MIDI 57. */
function parse(file: string) {
  const m = /^Vibes_hard_([A-G])(#|b)?(\d)_(v\d)_rr(\d)_Main\.wav$/.exec(file);
  if (!m) return undefined;
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const note = (Number(m[3]) + 2) * 12 + STEPS[m[1]!]! + accidental;
  return { note, dynamic: m[4]!, alternate: Number(m[5]) };
}

export const vibraphone: Recipe = {
  id: "vibraphone",
  name: "Vibraphone",
  channels: 1,
  kbps: 80,
  level: { measure: "loudness", reference: -20 },
  foldDb: -6.0206,
  budgetMB: 25,
  roots: { skip: 0.1, seconds: 0.5 },
  credits: [
    {
      source: "vcsl",
      changes:
        "The hard-mallet notes at both dynamics, the stereo pair folded to mono; trimmed to the onset, cut at its decay or a length cap and faded; " +
        "each levelled to one loudness; roots measured; encoded as Opus.",
    },
  ],
  voices(dir) {
    const folder = join(dir, FOLDER);
    const files = readdirSync(folder)
      .map((f) => ({ f, info: parse(f) }))
      .filter((x) => x.info !== undefined)
      .sort((a, b) => a.info!.note - b.info!.note || a.info!.alternate - b.info!.alternate);
    return [
      {
        name: "",
        release: RELEASE,
        layers: LAYERS.map(({ top, dynamic }) => {
          const own = files.filter((x) => x.info!.dynamic === dynamic);
          const notes = [...new Set(own.map((x) => x.info!.note))];
          return {
            top,
            zones: notes.map((note) => ({
              takes: own
                .filter((x) => x.info!.note === note)
                .map((x) => ({
                  parts: [{ file: join(folder, x.f), db: 0 }],
                  mapped: note,
                  cap: capByNote(note, CAP_LOW, CAP_HIGH),
                })),
            })),
          };
        }),
      },
    ];
  },
};
