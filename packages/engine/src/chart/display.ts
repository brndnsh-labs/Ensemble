// A chord's parts for display, as a name or as a numeral. Either works for any
// chord, however it was typed. The parts are separate so that a lead sheet can
// set the root large and the quality small.

import type { BaseQuality } from "../theory/chord.ts";
import { qualityToString } from "../theory/chord.ts";
import type { Degree } from "../theory/pitch.ts";
import { noteNameToString } from "../theory/pitch.ts";
import type { ChartChord } from "./types.ts";

export interface ChordParts {
  /** The note name (`Bb`) or the numeral (`bVII`, `ii`). */
  readonly root: string;
  /** The canonical quality suffix. Empty for a major triad, and for a minor triad as a numeral. */
  readonly quality: string;
  /** For a secondary function shown as a numeral, what it is "of": the `ii` of `V7/ii`. */
  readonly of: string | null;
  /** The slash bass: a note name, or a scale degree (`3`, `b7`) beside a numeral. */
  readonly bass: string | null;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;

/**
 * How each quality is written after a numeral. Case carries the third, so a
 * quality built on a minor third is a lowercase numeral without its `m`:
 * `ii7`, `imaj7`, `i6`, `viio7`, `iiø7`.
 */
const AS_NUMERAL: Readonly<Record<BaseQuality, readonly [lowercase: boolean, suffix: string]>> = {
  "": [false, ""],
  m: [true, ""],
  dim: [true, "o"],
  aug: [false, "aug"],
  "5": [false, "5"],
  sus4: [false, "sus4"],
  sus2: [false, "sus2"],
  "6": [false, "6"],
  m6: [true, "6"],
  "69": [false, "69"],
  m69: [true, "69"],
  add9: [false, "add9"],
  madd9: [true, "add9"],
  "7": [false, "7"],
  maj7: [false, "maj7"],
  m7: [true, "7"],
  mMaj7: [true, "maj7"],
  m7b5: [true, "ø7"],
  dim7: [true, "o7"],
  "7sus4": [false, "7sus4"],
  "9": [false, "9"],
  maj9: [false, "maj9"],
  m9: [true, "9"],
  "11": [false, "11"],
  m11: [true, "11"],
  "13": [false, "13"],
  maj13: [false, "maj13"],
  m13: [true, "13"],
  "9sus4": [false, "9sus4"],
  "13sus4": [false, "13sus4"],
  "7alt": [false, "7alt"],
};

const marks = (accidental: number): string =>
  (accidental < 0 ? "b" : "#").repeat(Math.abs(accidental));

function numeral(degree: Degree, lowercase: boolean): string {
  const roman = ROMAN[degree.step - 1]!;
  return marks(degree.accidental) + (lowercase ? roman.toLowerCase() : roman);
}

/** The parts of a chord shown as a name (`Bb`, `maj7`, `D`) or as a numeral (`ii`, `7`, `3`). */
export function chordParts(chord: ChartChord, as: "name" | "numeral"): ChordParts {
  if (as === "name")
    return {
      root: noteNameToString(chord.root),
      quality: qualityToString(chord.quality),
      of: null,
      bass: chord.bass ? noteNameToString(chord.bass) : null,
    };
  const [lowercase, suffix] = AS_NUMERAL[chord.quality.base];
  const alterations = qualityToString(chord.quality).slice(chord.quality.base.length);
  const { secondary, bassDegree } = chord;
  return {
    // `V7/ii` is shown as written, not as the VI7 it sounds as.
    root: numeral(secondary?.numeral ?? chord.degree, lowercase),
    quality: suffix + alterations,
    of: secondary ? numeral(secondary.of, secondary.ofMinor) : null,
    bass: bassDegree ? marks(bassDegree.accidental) + bassDegree.step : null,
  };
}

/** A chord as one string, in canonical spelling. By default, the way its author wrote it. */
export function chordText(chord: ChartChord, as: "name" | "numeral" = chord.written): string {
  const { root, quality, of, bass } = chordParts(chord, as);
  const slash = of ?? bass;
  return root + quality + (slash === null ? "" : `/${slash}`);
}
