// The clean electric guitar, from two libraries. The notes are FreePats' FSBS
// clean guitar (a Fender, recorded direct and put through an amplifier and
// effects in stereo): nineteen notes from C2 to C-sharp 6, two dynamics up to
// E4 and one above, four alternates each. Its mapping is right about every
// pitch (all within 9 cents). The muted strokes are Karoryfer's Emilyguitar
// (an Epiphone): five deadened strokes with five alternates each.
//
// The FSBS files are folded to mono; `monoCheck` prints what the fold loses.

import { join } from "node:path";
import { byVelocity, capByNote, pickLayers, type Recipe } from "../recipe.ts";
import { alternate, keys, readSfz, soundsByDefault } from "../sfz.ts";

const FSBS = "EGuitarFSBS-clean SFZ+FLAC-20260807";
/** Two dynamics; the mapping splits them at velocity 92. */
const TOPS = [70, 127];
const ALTERNATES = 2;
/**
 * Length cap, falling from the lowest recorded note to the highest. The
 * brief's 4 s to 2.5 s came to about 48 MB decoded against a budget of 30, so the
 * caps are shortened in proportion.
 */
const CAP_LOW: readonly [number, number] = [36, 2.45];
const CAP_HIGH: readonly [number, number] = [85, 1.53];
const RELEASE = 0.06;

/**
 * The five muted strokes, in order of their spectral centre (mean of the five
 * alternates over the first 150 ms: 302, 477, 669, 706 and 777 Hz), and the
 * root each is given. These roots place the strokes, lower strings of a strum
 * on the lower-sounding strokes; they are not tunings. They spread the five
 * evenly over the band's muted strums (51 to 69), so the nearest-zone rule
 * moves a stroke by at most two semitones there.
 */
const MUTED = [
  { stroke: 1, root: 51 },
  { stroke: 2, root: 55.5 },
  { stroke: 4, root: 60 },
  { stroke: 5, root: 64.5 },
  { stroke: 3, root: 69 },
];
const MUTED_ALTERNATES = 5;
/** A stroke is cut where its tail has gone (by 0.26 s); this only bounds it. */
const MUTED_CAP = 0.5;
const MUTED_RELEASE = 0.03;

export const cleanGuitar: Recipe = {
  id: "clean-guitar",
  name: "Clean electric guitar",
  channels: 1,
  kbps: 80,
  level: { measure: "loudness", reference: -20 },
  foldDb: -6.0206,
  budgetMB: 30,
  roots: { skip: 0.15, seconds: 0.5 },
  monoCheck: true,
  credits: [
    {
      source: "fsbs-clean-guitar",
      changes:
        "The plain voice: every recorded note, C2 to C-sharp 6, at both dynamics, two alternates each (a note recorded at one dynamic, G4 and above, has its four alternates split between the two layers), " +
        "the stereo files folded to mono; trimmed to the onset, cut at a length cap and faded; each levelled to one loudness; roots measured; encoded as Opus.",
    },
    {
      source: "emilyguitar",
      changes:
        "The muted voice: the five muted strokes, five alternates each, laid out low to high by spectral centre; " +
        "trimmed to the onset, cut at its decay and faded; each levelled to one loudness; encoded as Opus.",
    },
  ],
  voices(dir, dirOf) {
    const regions = readSfz(join(dir, FSBS, "EGuitarFSBS-clean bridge 20260807.sfz")).filter(
      soundsByDefault,
    );
    const notes = [...new Set(regions.map((r) => keys(r).center))].sort((a, b) => a - b);
    const byNote = notes.map((note) => {
      const own = regions
        .filter((r) => keys(r).center === note)
        .sort((a, b) => alternate(a) - alternate(b));
      const groups = byVelocity(own);
      // A note the mapping plays at every velocity: its alternates in turn, two to a layer.
      if (groups.length === 1) {
        return TOPS.map((top, i) => ({
          top,
          regions: own.slice(i * ALTERNATES, (i + 1) * ALTERNATES),
        }));
      }
      return pickLayers(groups, TOPS, ALTERNATES);
    });

    const emily = readSfz(join(dirOf("emilyguitar"), "emily_basic.sfz"));
    const strokes = MUTED.map(({ stroke, root }) => {
      const takes = emily
        .filter((r) => new RegExp(`/noises/muted${stroke}_rr\\d\\.wav$`).test(r.sample))
        .sort((a, b) => alternate(a) - alternate(b));
      if (takes.length !== MUTED_ALTERNATES) throw new Error(`muted${stroke}: ${takes.length}`);
      return {
        takes: takes.map((r) => ({
          parts: [{ file: r.sample, db: 0 }],
          mapped: root,
          cap: MUTED_CAP,
        })),
      };
    });

    return [
      {
        name: "",
        release: RELEASE,
        layers: TOPS.map((top, i) => ({
          top,
          zones: byNote.map((layers, n) => ({
            takes: layers[i]!.regions.map((r) => ({
              parts: [{ file: r.sample, db: 0 }],
              mapped: notes[n]!,
              cap: capByNote(notes[n]!, CAP_LOW, CAP_HIGH),
            })),
          })),
        })),
      },
      {
        name: "muted",
        release: MUTED_RELEASE,
        measureRoots: false,
        layers: [{ top: 127, zones: strokes }],
      },
    ];
  },
};
