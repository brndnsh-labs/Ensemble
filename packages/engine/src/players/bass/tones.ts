// Fitting a line's tones to the chord that is sounding, and the instrument's
// range. "Third" is the chord's own third or its suspension; "fifth" is the
// chord's own fifth; under a slash chord the line stands on the slash note
// while its other tones are still measured from the real root (X-A-23, X-A-24).

import type { Chord } from "../../theory/chord.ts";
import { chordFamily, chordTones, toneInterval } from "../../theory/chord.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import type { ChordScale } from "../../theory/scale.ts";
import { scaleHas } from "../../theory/scale.ts";
import type { ChordCondition, Tone, ToneSequence } from "./style.ts";

/** The open low E string: a note under it is a note the instrument does not have (X-A-01). */
export const LOW_E = 28;
/** The highest root of any line, E3 (X-A-02). */
export const HIGHEST_ROOT = 52;
/** The highest ornament above a root, A3 (X-A-02). */
export const TOP = 57;

/** The pitch class the bass stands on: the slash note, or the root. */
export function bassPitchClass(chord: Chord): number {
  return pitchClass(chord.bass ?? chord.root);
}

export function isSlash(chord: Chord): boolean {
  return chord.bass !== null && pitchClass(chord.bass) !== pitchClass(chord.root);
}

/**
 * A tone as semitones above the chord's root, or null when the chord cannot
 * give it. The third and fifth are read from the chord itself. The fourth,
 * sixth and flat seventh are played as written unless the chord's scale holds
 * a different note in that place: a minor sixth where the major sixth would
 * go (a dominant on its way to a minor chord), a major seventh where the flat
 * seventh would go (a plain major chord).
 */
export function toneOf(tone: Tone, chord: Chord, scale: ChordScale): number | null {
  const quality = chord.quality;
  const displaced = (interval: number, rival: number) =>
    scaleHas(scale, rival) && !scaleHas(scale, interval);
  switch (tone) {
    case "R":
      return 0;
    case "8":
      return 12;
    case "3": {
      // A chord with no third is played on what stands in its place: the suspension,
      // or the eleventh of an eleventh chord.
      const third =
        toneInterval(quality, "third") ??
        toneInterval(quality, "sus") ??
        toneInterval(quality, "eleventh");
      return third === null ? null : mod12(third);
    }
    case "5":
      return toneInterval(quality, "fifth") ?? 7;
    case "4":
      return displaced(5, 6) ? null : 5;
    case "6":
      return displaced(9, 8) ? null : 9;
    case "b7":
      return displaced(10, 11) ? null : 10;
  }
}

/** What is played in place of a tone the chord cannot give. */
const FALLBACK: Readonly<Record<Tone, Tone>> = {
  R: "R",
  "8": "8",
  "5": "5",
  "3": "R",
  "4": "3",
  "6": "5",
  b7: "8",
};

/**
 * The pitch of a tone over a chord whose bass note sits at `bass`. Tones are
 * stacked above the bass note; one that would pass the ceiling is played an
 * octave lower (the fifth under a high root).
 */
export function tonePitch(
  tone: Tone,
  chord: Chord,
  scale: ChordScale,
  bass: number,
  ceiling: number,
): number {
  let fitted = tone;
  let interval = toneOf(fitted, chord, scale);
  while (interval === null) {
    fitted = FALLBACK[fitted];
    interval = toneOf(fitted, chord, scale);
  }
  const above =
    fitted === "R" ? 0 : fitted === "8" ? 12 : mod12(pitchClass(chord.root) + interval - bass);
  const pitch = bass + above;
  return pitch > Math.min(ceiling, TOP) && pitch - 12 >= LOW_E ? pitch - 12 : pitch;
}

/** Whether a pitch is one of the chord's own notes (its slash bass included). */
export function isChordTone(chord: Chord, pitch: number): boolean {
  const pc = mod12(pitch);
  if (pc === bassPitchClass(chord)) return true;
  const root = pitchClass(chord.root);
  return chordTones(chord.quality).some((tone) => mod12(root + tone.interval) === pc);
}

function meets(when: ChordCondition | undefined, chord: Chord, scale: ChordScale): boolean {
  if (!when) return true;
  if (when.family && !when.family.includes(chordFamily(chord.quality))) return false;
  if (when.slash !== undefined && when.slash !== isSlash(chord)) return false;
  if (when.has?.some((tone) => toneOf(tone, chord, scale) === null)) return false;
  if (when.lacks?.some((tone) => toneOf(tone, chord, scale) !== null)) return false;
  return true;
}

/** The first sequence whose condition the chord meets. With none, the bass stays on the root. */
export function sequenceFor(
  sequences: readonly ToneSequence[],
  chord: Chord,
  scale: ChordScale,
): ToneSequence {
  return sequences.find((sequence) => meets(sequence.when, chord, scale)) ?? { bars: [["R"]] };
}
