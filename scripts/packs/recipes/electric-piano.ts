// The electric piano, from jRhodes3d: Jeff Learman's 1977 Rhodes Mark I Stage 73,
// recorded from the harp connector every fourth white key (fifteen notes, F1
// to C7) at up to five dynamics, each a full-length recording. The pack keeps
// every note and every dynamic the mapping has, at the mapping's own velocity
// tops, from the mono files (the library's stereo folders are the same takes
// with a doubling added).
//
// The library is licensed CC BY-NC 4.0: not permissive. Its text is the
// pack's LICENCE. (The mapping file's header comment names a different
// licence; the LICENSE file is what the pack follows.)
//
// The mapping used is the one without crossfades, for which file serves which
// keys and velocities. Where it gives one recording to two dynamics (the
// upper notes), both layers are kept and each carries its own copy of the file.

import { join } from "node:path";
import { byVelocity, capByNote, type Recipe } from "../recipe.ts";
import { keys, readSfz, soundsByDefault } from "../sfz.ts";

/** Length cap: 6 s at the lowest note falling to 3.5 s at the highest. */
const CAP_LOW: readonly [number, number] = [29, 6];
const CAP_HIGH: readonly [number, number] = [96, 3.5];
/**
 * The pack carries one release for the voice. The mapping gives each note its
 * own `ampeg_release`, 0.5 s on the lowest notes falling to 0.2 s on the
 * highest (0.2 on 15 regions, 0.3 on 25, 0.4 on 20, 0.5 on 15), and with the
 * sustain pedal up (`ampeg_releasecc64` is the pedal's addition, zero when it
 * is up) that is the release a note gets. 0.3 is the middle of them.
 */
const RELEASE = 0.3;

export const electricPiano: Recipe = {
  id: "electric-piano",
  name: "Electric piano",
  channels: 1,
  kbps: 80,
  level: { measure: "loudness", reference: -20 },
  foldDb: 0,
  budgetMB: 70,
  roots: { skip: 0.15, seconds: 0.5 },
  credits: [
    {
      source: "jrhodes3d",
      changes:
        "Every recorded note, F1 to C7 (fifteen notes, every fourth white key), at every dynamic the source maps (up to five, at the source's velocity tops); " +
        "the full-length mono recordings, trimmed to the onset, cut at a length cap and faded; " +
        "each levelled to one loudness; roots measured; encoded as Opus.",
    },
  ],
  voices(dir) {
    const regions = readSfz(join(dir, "jRhodes3d-mono-no-xfade.sfz")).filter(soundsByDefault);
    const notes = [...new Set(regions.map((r) => keys(r).center))].sort((a, b) => a - b);
    const byNote = notes.map((note) =>
      byVelocity(regions.filter((r) => keys(r).center === note)).map((g) => g[0]!),
    );
    const tops = [47, 72, 95, 111, 127];
    return [
      {
        name: "",
        release: RELEASE,
        layers: tops.map((top, i) => ({
          top,
          zones: byNote.map((layers, n) => ({
            takes: [
              {
                parts: [{ file: layers[i]!.sample, db: 0 }],
                mapped: notes[n]!,
                cap: capByNote(notes[n]!, CAP_LOW, CAP_HIGH),
              },
            ],
          })),
        })),
      },
    ];
  },
};
