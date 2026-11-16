// The steel-string guitar, from Karoryfer's Shinyguitar: an archtop recorded
// through a microphone and through a magnetic pickup. The pack takes the
// microphone's recordings (`Samples/acoustic`): seventeen notes about a minor
// third apart, Db2 (37) to C6 (84), each at four dynamics (the mapping splits
// them at velocities 32, 64 and 96) with four alternates, mono, 44.1 kHz.
// The pickup's recordings, the release noises, the muted strings and the body
// taps are not used.
//
// The mapping is `acoustic_one.sfz`, the program for one voice. Its regions
// answer only with the blend controller above zero, and the program's default
// is the pickup alone, so `soundsByDefault` would pass none of them: the
// recipe takes them all, which is what a microphone-only reading means.
// The mapping's `default_path` is `$sample_dir`, which the mapping never
// defines (the player supplies it), so a sample's path comes out under
// `Programs/`; the recipe takes its file name and finds it in `Samples/acoustic`.

import { basename, join } from "node:path";
import { capByNote, type Recipe } from "../recipe.ts";
import { alternate, keys, readSfz, velocities } from "../sfz.ts";

/** The mapping's own layer tops: it splits the four dynamics at 32, 64 and 96. */
const TOPS = [32, 64, 96, 127];
/** Alternates in a zone: the first two of the source's four. */
const ALTERNATES = 2;
/**
 * Length cap, falling from the lowest recorded note to the highest. A strummed
 * chord rings up to two beats and a picked note until the chord changes. The
 * brief's 4 s falling to 2.5 s came to 83.8 MB decoded against a budget of 80,
 * so the top is shortened to 2 s (the brief says to shorten the top first).
 */
const CAP_LOW: readonly [number, number] = [37, 4];
const CAP_HIGH: readonly [number, number] = [84, 2];
/**
 * A hand laid on the strings, or a finger leaving one. The mapping's
 * `ampeg_release` is 0.25 s. The clean guitar's is 0.06 and the nylon's 0.1;
 * a steel string rings longer than a nylon one and the archtop's strings are
 * steel, so it sits between the nylon's and the mapping's.
 */
const RELEASE = 0.12;

export const steelGuitar: Recipe = {
  id: "steel-guitar",
  name: "Steel-string guitar",
  channels: 1,
  kbps: 80,
  level: { measure: "loudness", reference: -20 },
  foldDb: 0,
  budgetMB: 80,
  roots: { skip: 0.15, seconds: 0.5 },
  credits: [
    {
      source: "shinyguitar",
      changes:
        "The microphone recordings only (not the magnetic pickup's): every recorded note, Db2 to C6 (seventeen notes), at all four dynamics at the source's velocity tops, the first two of its four alternates each; " +
        "mono recordings, trimmed to the onset, cut at a length cap or where the tail has gone, and faded; each levelled to one loudness; roots measured; encoded as Opus.",
    },
  ],
  voices(dir) {
    const regions = readSfz(join(dir, "Programs", "acoustic_one.sfz")).filter((r) =>
      /[\\/]acoustic[\\/][a-g]b?\d_vl\d_rr\d_/.test(r.sample),
    );
    const notes = [...new Set(regions.map((r) => keys(r).center))].sort((a, b) => a - b);
    const layers = TOPS.map((top, li) => ({
      top,
      zones: notes.map((note) => {
        const own = regions
          .filter((r) => keys(r).center === note && velocities(r).hi === top)
          .sort((a, b) => alternate(a) - alternate(b))
          .slice(0, ALTERNATES);
        if (own.length !== ALTERNATES) throw new Error(`note ${note} layer ${li}: ${own.length}`);
        return {
          takes: own.map((r) => ({
            parts: [{ file: join(dir, "Samples", "acoustic", basename(r.sample)), db: 0 }],
            mapped: note,
            cap: capByNote(note, CAP_LOW, CAP_HIGH),
          })),
        };
      }),
    }));
    return [{ name: "", release: RELEASE, layers }];
  },
};
