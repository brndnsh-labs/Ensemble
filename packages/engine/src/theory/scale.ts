// Chord scales: the notes that belong with a chord beyond its own tones, chosen
// by the chord's quality and by what it is doing in the key. Bass passing tones,
// comping tensions, and solo lines must all read the same scale, or they clash.

import type { Chord, ChordFamily, Quality } from "./chord.ts";
import { chordFamily, chordTones } from "./chord.ts";
import type { Key } from "./pitch.ts";
import { mod12, pitchClass } from "./pitch.ts";

/** What a chord scale needs to know about the chord's surroundings. */
export interface HarmonicContext {
  readonly key: Key;
  /** The chord that follows, or null at the end or before a rest. */
  readonly next: Chord | null;
  /** The chords on either side, for reading a minor tonic's mode from its neighbours. */
  readonly previous: Chord | null;
}

export type ScaleName =
  | "ionian"
  | "lydian"
  | "lydian augmented"
  | "mixolydian"
  | "lydian dominant"
  | "mixolydian b13"
  | "phrygian dominant"
  | "half-whole diminished"
  | "altered"
  | "whole tone"
  | "dorian"
  | "phrygian"
  | "aeolian"
  | "melodic minor"
  | "locrian"
  | "locrian natural 2"
  | "whole-half diminished"
  | "major pentatonic"
  | "minor pentatonic";

export interface ChordScale {
  readonly name: ScaleName;
  /** Semitones above the chord root, ascending, starting with 0. */
  readonly intervals: readonly number[];
}

const SCALES: Readonly<Record<ScaleName, readonly number[]>> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  "lydian augmented": [0, 2, 4, 6, 8, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  "lydian dominant": [0, 2, 4, 6, 7, 9, 10],
  "mixolydian b13": [0, 2, 4, 5, 7, 8, 10],
  "phrygian dominant": [0, 1, 4, 5, 7, 8, 10],
  "half-whole diminished": [0, 1, 3, 4, 6, 7, 9, 10],
  altered: [0, 1, 3, 4, 6, 8, 10],
  "whole tone": [0, 2, 4, 6, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  "melodic minor": [0, 2, 3, 5, 7, 9, 11],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  "locrian natural 2": [0, 2, 3, 5, 6, 8, 10],
  "whole-half diminished": [0, 2, 3, 5, 6, 8, 9, 11],
  "major pentatonic": [0, 2, 4, 7, 9],
  "minor pentatonic": [0, 3, 5, 7, 10],
};

/**
 * The scale for a chord in its context. Any tone the symbol writes that the
 * template lacks replaces the template tone a half step away, so the written
 * chord always wins.
 */
export function chordScale(chord: Chord, context: HarmonicContext): ChordScale {
  const name = scaleName(chord, context);
  return { name, intervals: fitToChord(SCALES[name], chord.quality) };
}

/** Whether the scale holds a note this many semitones above the chord root. */
export function scaleHas(scale: ChordScale, interval: number): boolean {
  return scale.intervals.includes(mod12(interval));
}

function scaleName(chord: Chord, context: HarmonicContext): ScaleName {
  const quality = chord.quality;
  const family = chordFamily(quality);
  const has = (...intervals: number[]) =>
    intervals.every((i) => chordTones(quality).some((t) => t.interval === i));
  const degree = mod12(pitchClass(chord.root) - pitchClass(context.key.tonic));
  const minorKey = context.key.mode === "minor";

  switch (family) {
    case "major": {
      if (has(8)) return "lydian augmented";
      if (has(18)) return "lydian";
      if (!minorKey && degree === 5) return "lydian";
      if (minorKey && degree === 8) return "lydian";
      // A plain triad on V: its major seventh would be a leading tone to V.
      if (!minorKey && degree === 7 && !has(11)) return "mixolydian";
      return "ionian";
    }
    case "dominant":
      return dominantScale(chord, context, has);
    case "minor": {
      if (has(11)) return "melodic minor";
      if (has(9)) return "dorian";
      if (has(20)) return "aeolian";
      if (!minorKey && degree === 4) return "phrygian";
      if (!minorKey && degree === 9) return "aeolian";
      if (minorKey && degree === 0) return minorTonicMode(chord, context);
      if (minorKey && degree === 7) return "aeolian";
      return "dorian";
    }
    case "half-diminished":
      return has(14) ? "locrian natural 2" : "locrian";
    case "diminished":
      return "whole-half diminished";
    case "augmented":
      return "whole tone";
    case "suspended":
      return has(2) ? "major pentatonic" : "mixolydian";
    case "power":
      return "minor pentatonic";
  }
}

function dominantScale(
  chord: Chord,
  context: HarmonicContext,
  has: (...intervals: number[]) => boolean,
): ScaleName {
  const flat9 = has(13);
  const sharp9 = has(15);
  const flat13 = has(20);
  const naturalFifth = has(7);
  const raisedFifth = has(8);
  const loweredFifth = has(6);

  if (chord.quality.base === "7alt") return "altered";
  if ((sharp9 && flat13) || (sharp9 && !naturalFifth) || (flat9 && raisedFifth)) return "altered";
  if (flat9 && flat13 && naturalFifth) return "phrygian dominant";
  if (flat9 && !naturalFifth && loweredFifth) return "altered";
  if (flat9 || sharp9) {
    if (!resolvesToMinor(chord, context) || has(21)) return "half-whole diminished";
    // A written b9 or #9 keeps its own colour but still takes the b13 on the way to a minor
    // chord (X-B-11). Over a natural fifth that is Phrygian dominant, the notes of the minor key
    // it is going to, with a written #9 beside its b9: the altered scale has no natural fifth,
    // and fitted to one it keeps a #11 a half step under it and loses the b13.
    return naturalFifth ? "phrygian dominant" : "altered";
  }
  if (raisedFifth) return "whole tone";
  if (flat13) return "mixolydian b13";
  if (has(18) || loweredFifth) return "lydian dominant";
  // An unaltered dominant falling a fifth to a minor chord implies that key's b9 and b13.
  if (naturalFifth && !has(21) && resolvesToMinor(chord, context)) return "phrygian dominant";
  return "mixolydian";
}

/** A dominant whose next chord is a minor-family chord a fifth below. */
export function resolvesToMinor(chord: Chord, context: HarmonicContext): boolean {
  const next = context.next;
  if (!next) return false;
  const fallsAFifth = mod12(pitchClass(chord.root) - pitchClass(next.root)) === 7;
  const family: ChordFamily = chordFamily(next.quality);
  return fallsAFifth && (family === "minor" || family === "half-diminished");
}

/** A minor tonic beside a major or dominant IV is Dorian; otherwise natural minor. */
function minorTonicMode(chord: Chord, context: HarmonicContext): ScaleName {
  const isMajorFour = (neighbour: Chord | null): boolean => {
    if (!neighbour) return false;
    const up = mod12(pitchClass(neighbour.root) - pitchClass(chord.root));
    const family = chordFamily(neighbour.quality);
    return up === 5 && (family === "major" || family === "dominant");
  };
  return isMajorFour(context.next) || isMajorFour(context.previous) ? "dorian" : "aeolian";
}

function fitToChord(template: readonly number[], quality: Quality): number[] {
  const scale = new Set(template);
  // A suspended or eleventh chord has no third, and its scale has none either.
  const tones = chordTones(quality);
  const family = chordFamily(quality);
  if (!tones.some((t) => t.role === "third") && (family === "dominant" || family === "suspended")) {
    scale.delete(4);
  }
  for (const tone of chordTones(quality)) {
    const pc = mod12(tone.interval);
    if (scale.has(pc)) continue;
    // The written tone replaces a template neighbour that is not itself a chord tone.
    for (const neighbour of [mod12(pc + 1), mod12(pc - 1)]) {
      const isChordTone = chordTones(quality).some((t) => mod12(t.interval) === neighbour);
      if (scale.has(neighbour) && !isChordTone) {
        scale.delete(neighbour);
        break;
      }
    }
    scale.add(pc);
  }
  return [...scale].sort((a, b) => a - b);
}
