// The nylon-string guitar, from FreePats' Spanish classical guitar: 48 mono
// recordings, one of each note and one dynamic, from G1 (31) to C6 (84)
// (the mapping calls middle C 60, and so do the file names). The mapping, the
// names and the measured pitch agree to within 18 cents on every file. It
// starts below the guitar's low E (40), and the pack keeps those notes too.
// Each file is a single note left to ring, 0.9 s at the top and up to 16 s at
// the bottom; the pack keeps the first five seconds.

import { join } from "node:path";
import type { Recipe } from "../recipe.ts";
import { keys, readSfz, soundsByDefault } from "../sfz.ts";

/**
 * Seconds a take may last at most. A strummed chord rings up to two beats and
 * a picked note is let ring; every recording is kept whole up to this.
 */
const CAP = 5;
/** The extracted release archive, under the source's folder. */
const RELEASE_DIR = "SpanishClassicalGuitar-SFZ+FLAC-20190618";
/**
 * A hand or a finger laid on the string ends the note. The mapping's 1.5 s is
 * a note left to ring after the key is let go, not that. The clean guitar's
 * is 0.06 and the upright's, a plucked string stopped by a finger, 0.12; a
 * nylon string stopped by the hand or the picking fingers is between the two.
 */
const RELEASE = 0.1;

export const nylonGuitar: Recipe = {
  id: "nylon-guitar",
  name: "Nylon-string guitar",
  channels: 1,
  kbps: 80,
  level: { measure: "loudness", reference: -20 },
  foldDb: 0,
  budgetMB: 45,
  roots: { skip: 0.15, seconds: 0.5 },
  credits: [
    {
      source: "spanish-classical-guitar",
      changes:
        "Every recorded note, G1 to C6 (48 notes, one recording of each at one dynamic), the mono recordings kept whole up to five seconds; " +
        "trimmed to the onset, cut at a length cap or where the tail has gone, and faded; each levelled to one loudness; roots measured; encoded as Opus.",
    },
  ],
  voices(dir) {
    const regions = readSfz(join(dir, RELEASE_DIR, "SpanishClassicalGuitar-20190618.sfz")).filter(
      soundsByDefault,
    );
    const zones = regions
      .map((r) => ({ r, note: keys(r).center }))
      .sort((a, b) => a.note - b.note)
      .map(({ r, note }) => ({
        takes: [{ parts: [{ file: r.sample, db: 0 }], mapped: note, cap: CAP }],
      }));
    return [{ name: "", release: RELEASE, layers: [{ top: 127, zones }] }];
  },
};
