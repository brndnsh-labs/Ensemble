// The electric bass, from Karoryfer's Black And Blue Basses: the "darkblack"
// Washburn AB-95, a five-string played with the fingers on the neck pickup.
// Its regular notes are recorded on every semitone from B0 to E4 at four
// dynamics with four alternates; its ghost notes at two dynamics with four.
//
// The mapping plays each recording an octave above where it sounds (key 40 is
// the open E string, E1): bass is written an octave above its sound, and the
// files are named as written. Every take measured 12 semitones under its key,
// so the pitch a take is given here is its key less an octave.
//
// The pack takes every third semitone, not every one. All 32 recorded notes
// from 26 to 57 at the brief's alternates and length caps came to 92 MB
// decoded for the plain voice alone, against a budget of 30 for the pack; caps
// short enough to fit (about 0.55 s) would cut the held last note of a phrase. A minor third apart, no note is more than a
// semitone from a recording, as with recordings a whole step apart.
//
// Each recording opens on about 25 ms of finger noise before the string
// speaks. It is kept, as the library's own default keeps it (its "preroll"
// control skips it); the sampler puts the hit, not the noise, on the beat.
//
// The ghost notes are short (20 dB down within 0.03 to 0.4 s) and pitched,
// but not at their note: a ghost recorded at a fret sounds 0.5 to 2 semitones
// under it, rings an open string's harmonic near the bottom and the top of the
// neck, and several neighbouring frets measure alike. So the `dead` voice
// keeps the fret it was played at as its root (`measureRoots: false`): a dead
// note plays the ghost recorded at that fret, as the library does. The
// staccato notes are not used.

import { join } from "node:path";
import { byVelocity, capByNote, pickLayers, type Recipe, type Voice } from "../recipe.ts";
import { alternate, keys, readSfz, type SfzRegion, soundsByDefault } from "../sfz.ts";

/** The notes to cover, as they sound: the band plays 28 to 55. */
const RANGE: readonly [number, number] = [26, 57];
/** Recordings taken this many semitones apart, from the bottom of the range. */
const SPACING = 3;
/** The mapping's keys are an octave above the sound. */
const WRITTEN = 12;
/** Four dynamics, split where the band plays. */
const TOPS = [56, 68, 80, 127];
/** Alternates per layer, softest first: one in the outer layers, two in the middle. */
const ALTERNATES = [1, 2, 2, 1];
/**
 * Length cap, falling from the bottom of the range to the top. The brief's
 * 3 s to 2 s came to about 36 MB decoded with the dead voice against a budget of
 * 30, so the caps are shortened in proportion.
 */
const CAP_LOW: readonly [number, number] = [RANGE[0], 2.45];
const CAP_HIGH: readonly [number, number] = [RANGE[1], 1.63];
const RELEASE = 0.08;

/** The ghost notes: two dynamics, the soft one up to the band's dead notes (38 to 47). */
const DEAD_TOPS = [44, 127];
const DEAD_ALTERNATES = 3;
/** The band's dead notes last 80 ms; a ghost is cut at 0.3 s or where its tail has gone. */
const DEAD_CAP = 0.3;
const DEAD_RELEASE = 0.04;

/** The pitches to take: every `SPACING` semitones from the bottom of the range. */
function notes(): number[] {
  const out: number[] = [];
  for (let n = RANGE[0]; n <= RANGE[1]; n += SPACING) out.push(n);
  return out;
}

/** The regions a program plays with every control at its default: the centre voice, poly. */
function program(dir: string, file: string): SfzRegion[] {
  return readSfz(join(dir, "Programs", file)).filter(
    (r) => soundsByDefault(r) && r.opcodes.trigger === undefined,
  );
}

function voice(
  regions: readonly SfzRegion[],
  name: string,
  tops: readonly number[],
  alternates: (layer: number) => number,
  cap: (note: number) => number,
): Omit<Voice, "release"> {
  const byNote = notes().map((note) => {
    const own = regions
      .filter((r) => keys(r).center === note + WRITTEN)
      .sort((a, b) => alternate(a) - alternate(b));
    if (own.length === 0) throw new Error(`no ${name || "plain"} recording of ${note}`);
    return { note, layers: pickLayers(byVelocity(own), tops, 4) };
  });
  return {
    name,
    layers: tops.map((top, i) => ({
      top,
      zones: byNote.map(({ note, layers }) => ({
        takes: layers[i]!.regions.slice(0, alternates(i)).map((r) => ({
          parts: [{ file: r.sample, db: 0 }],
          mapped: note,
          cap: cap(note),
        })),
      })),
    })),
  };
}

export const electricBass: Recipe = {
  id: "electric-bass",
  name: "Electric bass",
  channels: 1,
  kbps: 80,
  level: { measure: "loudness", reference: -20 },
  foldDb: -6.0206,
  budgetMB: 30,
  roots: { skip: 0.15, seconds: 0.5 },
  credits: [
    {
      source: "black-and-blue-basses",
      changes:
        "The darkblack bass's regular fingered notes, every third semitone from D1 to A-flat 3, at four dynamics with alternates, roots measured; " +
        "and its ghost notes at the same frets, both dynamics, three alternates each, as the dead-note voice; " +
        "trimmed to the onset, cut at its decay or a length cap and faded; each levelled to one loudness; encoded as Opus.",
    },
  ],
  voices(dir) {
    return [
      {
        ...voice(
          program(dir, "05-darkblack_pluck.sfz"),
          "",
          TOPS,
          (i) => ALTERNATES[i]!,
          (note) => capByNote(note, CAP_LOW, CAP_HIGH),
        ),
        release: RELEASE,
      },
      {
        ...voice(
          program(dir, "07-darkblack_ghost.sfz"),
          "dead",
          DEAD_TOPS,
          () => DEAD_ALTERNATES,
          () => DEAD_CAP,
        ),
        release: DEAD_RELEASE,
        measureRoots: false,
      },
    ];
  },
};
