// Reading one chord symbol: absolute (`Bb7/D`) or numeral (`V7/ii`), and
// resolving it against a key. The alias table is docs/CHART_FORMAT.md 6.3.

import type { Alteration, BaseQuality, Quality } from "../theory/chord.ts";
import {
  BASE_QUALITIES,
  chordFamily,
  makeQuality,
  qualityToString,
  toneInterval,
} from "../theory/chord.ts";
import type { Degree, Key, Letter, NoteName } from "../theory/pitch.ts";
import { degreeOf, noteAtDegree, pitchClass } from "../theory/pitch.ts";
import type { ChartChord, SourceRange } from "./types.ts";

/** Characters that mean the same as a plain one. All are one code unit, so columns do not move. */
const LOOKALIKES: Readonly<Record<string, string>> = {
  "♯": "#",
  "♭": "b",
  "∆": "Δ",
  º: "°",
  "˚": "°",
  Ø: "ø",
};
export const plainSigns = (text: string): string =>
  text.replace(/[♯♭∆º˚Ø]/g, (ch) => LOOKALIKES[ch] ?? ch);

/** The "also accepted" column of the quality table. Matching is case-sensitive. */
const ALSO_ACCEPTED: Readonly<Record<BaseQuality, readonly string[]>> = {
  "": ["M", "maj"],
  m: ["min", "mi", "-"],
  dim: ["o", "°"],
  aug: ["+"],
  "5": [],
  sus4: ["sus"],
  sus2: [],
  "6": [],
  m6: ["min6", "-6"],
  "69": ["6/9"],
  m69: ["m6/9"],
  add9: ["add2"],
  madd9: [],
  "7": [],
  maj7: ["M7", "ma7", "^7", "^", "Δ", "Δ7"],
  m7: ["min7", "mi7", "-7"],
  mMaj7: ["m(maj7)", "mM7", "m^7", "-^7"],
  m7b5: ["ø", "ø7", "h", "h7", "min7b5", "-7b5"],
  dim7: ["o7", "°7"],
  "7sus4": ["7sus"],
  "9": [],
  maj9: ["M9", "ma9", "^9", "Δ9"],
  m9: ["min9", "mi9", "-9"],
  "11": [],
  m11: [],
  "13": [],
  maj13: [],
  m13: [],
  "9sus4": ["9sus"],
  "13sus4": ["13sus"],
  "7alt": ["alt"],
};

type Spelling = readonly [text: string, base: BaseQuality, implied: readonly Alteration[]];

/** Every accepted spelling, longest first, so `maj7` is tried before `m`. */
const SPELLINGS: readonly Spelling[] = [
  ...BASE_QUALITIES.flatMap((base) =>
    [base, ...ALSO_ACCEPTED[base]].map((text): Spelling => [text, base, []]),
  ),
  // `7#5` is the base `7` with an alteration; these two name it in one word.
  ["+7", "7", ["#5"]] as const,
  ["aug7", "7", ["#5"]] as const,
].sort((a, b) => b[0].length - a[0].length);

const ALT = "b5|#5|b9|#9|#11|b13";
/** Alterations in any order, bare or in parentheses, with or without commas. */
const ALTERATION_RUN = new RegExp(`^(?:,?(?:${ALT})|,?\\((?:${ALT})(?:,?(?:${ALT}))*\\))+$`);
const ONE_ALTERATION = new RegExp(ALT, "g");

/** Seventh-family qualities take bare alterations (`7b9`); the rest need parentheses (`(b5)`). */
const takesBareAlterations = (base: BaseQuality): boolean =>
  !qualityToString({ base, alterations: ["b9"] }).includes("(");

function readAlterations(rest: string, base: BaseQuality): Alteration[] | null {
  if (rest === "") return [];
  if (!ALTERATION_RUN.test(rest)) return null;
  const parenthesized = /^\([^()]*\)$/.test(rest);
  if (!parenthesized && !takesBareAlterations(base)) return null;
  return (rest.match(ONE_ALTERATION) ?? []) as Alteration[];
}

/** A quality suffix, or null. `spelling` is the part that named the base, as typed. */
function readQuality(text: string): { quality: Quality; spelling: string } | null {
  for (const [spelling, base, implied] of SPELLINGS) {
    if (!text.startsWith(spelling)) continue;
    const alterations = readAlterations(text.slice(spelling.length), base);
    if (alterations) return { quality: makeQuality(base, [...implied, ...alterations]), spelling };
  }
  return null;
}

const accidentalOf = (mark: string): number => (mark === "#" ? 1 : mark === "b" ? -1 : 0);

function readNote(text: string): NoteName | null {
  const match = /^([A-G])([#b]?)$/.exec(text);
  return match ? { letter: match[1] as Letter, accidental: accidentalOf(match[2]!) } : null;
}

const ROMAN = "VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i";
const ROMAN_STEP: Readonly<Record<string, Degree["step"]>> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
};
const NUMERAL = new RegExp(`^([#b]?)(${ROMAN})$`);
const NUMERAL_THEN_REST = new RegExp(`^([#b]?(?:${ROMAN}))(.*)$`);

function readNumeral(text: string): { degree: Degree; lowercase: boolean } | null {
  const match = NUMERAL.exec(text);
  if (!match) return null;
  const roman = match[2]!;
  return {
    degree: { step: ROMAN_STEP[roman.toLowerCase()]!, accidental: accidentalOf(match[1]!) },
    lowercase: roman === roman.toLowerCase(),
  };
}

/** What a lowercase numeral makes of its suffix: `ii7` is m7, `imaj7` is mMaj7. */
const ON_A_MINOR_THIRD: Partial<Record<BaseQuality, BaseQuality>> = {
  "": "m",
  "6": "m6",
  "69": "m69",
  add9: "madd9",
  "7": "m7",
  maj7: "mMaj7",
  "9": "m9",
  "11": "m11",
  "13": "m13",
};

/** A chord symbol before it meets a key. */
export type ChordSymbol =
  | {
      readonly written: "name";
      readonly root: NoteName;
      readonly quality: Quality;
      readonly bass: NoteName | null;
    }
  | {
      readonly written: "numeral";
      readonly numeral: Degree;
      readonly quality: Quality;
      readonly bassDegree: Degree | null;
      /** `V7/ii`: the numeral after the slash. */
      readonly of: { readonly degree: Degree; readonly minor: boolean } | null;
    };

/** Split at the last slash, unless a `9` follows it: `6/9` is a quality, never a bass. */
function splitSlash(text: string): [head: string, tail: string | null] {
  const at = text.lastIndexOf("/");
  if (at < 0 || text.startsWith("9", at + 1)) return [text, null];
  return [text.slice(0, at), text.slice(at + 1)];
}

/** Read a token as a chord, or null. Pass text through `plainSigns` first. */
export function parseChordSymbol(text: string): ChordSymbol | null {
  // An accidental binds to the root first: `Bb5` is a B-flat power chord.
  const name = /^([A-G][#b]?)(.*)$/.exec(text);
  if (name) {
    const [head, tail] = splitSlash(name[2]!);
    const quality = readQuality(head)?.quality;
    const bass = tail === null ? null : readNote(tail);
    if (!quality || (tail !== null && !bass)) return null;
    return { written: "name", root: readNote(name[1]!)!, quality, bass };
  }

  const numeral = NUMERAL_THEN_REST.exec(text);
  if (!numeral) return null;
  const { degree, lowercase } = readNumeral(numeral[1]!)!;
  const [head, tail] = splitSlash(numeral[2]!);
  const read = readQuality(head);
  if (!read) return null;
  let quality = read.quality;
  if (lowercase) {
    // Case sets the third, and the suffix is applied on top of it.
    const minor = ON_A_MINOR_THIRD[quality.base];
    const saysMajor = quality.base === "" && read.spelling !== "";
    const hasMajorThird = toneInterval({ base: quality.base, alterations: [] }, "third") === 4;
    if (saysMajor || (!minor && hasMajorThird)) return null;
    quality = makeQuality(minor ?? quality.base, quality.alterations);
  }
  if (tail === null)
    return { written: "numeral", numeral: degree, quality, bassDegree: null, of: null };
  // A numeral after the slash is "of"; a digit 1 to 7 is a bass degree.
  const target = readNumeral(tail);
  if (target) {
    const of = { degree: target.degree, minor: target.lowercase };
    return { written: "numeral", numeral: degree, quality, bassDegree: null, of };
  }
  const bass = /^([#b]?)([1-7])$/.exec(tail);
  if (!bass) return null;
  const bassDegree = {
    step: Number(bass[2]) as Degree["step"],
    accidental: accidentalOf(bass[1]!),
  };
  return { written: "numeral", numeral: degree, quality, bassDegree, of: null };
}

/** The key assumed when a chart of absolute chords has no `key:` line: its first chord. */
export function keyFromFirstChord(symbol: ChordSymbol & { written: "name" }): Key {
  return { tonic: symbol.root, mode: chordFamily(symbol.quality) === "minor" ? "minor" : "major" };
}

/** Place a symbol in a key: spell numerals, and find the degree of names. */
export function resolveChord(
  symbol: ChordSymbol,
  key: Key,
  text: string,
  range: SourceRange,
): ChartChord {
  if (symbol.written === "name") {
    const bass =
      symbol.bass && pitchClass(symbol.bass) !== pitchClass(symbol.root) ? symbol.bass : null;
    return {
      root: symbol.root,
      quality: symbol.quality,
      bass,
      degree: degreeOf(symbol.root, key),
      bassDegree: bass ? degreeOf(bass, key) : null,
      written: "name",
      secondary: null,
      text,
      range,
    };
  }
  // `V7/ii`: measure the numeral from the target as a temporary tonic, then
  // record where that lands against the real key.
  const tonic = symbol.of
    ? { tonic: noteAtDegree(symbol.of.degree, key), mode: symbol.of.minor ? "minor" : "major" }
    : key;
  const root = noteAtDegree(symbol.numeral, tonic as Key);
  const bassNote = symbol.bassDegree ? noteAtDegree(symbol.bassDegree, key) : null;
  const hasBass = bassNote !== null && pitchClass(bassNote) !== pitchClass(root);
  return {
    root,
    quality: symbol.quality,
    bass: hasBass ? bassNote : null,
    degree: symbol.of ? degreeOf(root, key) : symbol.numeral,
    bassDegree: hasBass ? symbol.bassDegree : null,
    written: "numeral",
    secondary: symbol.of
      ? { numeral: symbol.numeral, of: symbol.of.degree, ofMinor: symbol.of.minor }
      : null,
    text,
    range,
  };
}

/** The same chord in another key: degrees kept, spelling recomputed. Used by `transpose`. */
export function respellChord(chord: ChartChord, key: Key): ChartChord {
  return {
    ...chord,
    root: noteAtDegree(chord.degree, key),
    bass: chord.bassDegree ? noteAtDegree(chord.bassDegree, key) : null,
  };
}

/** A musician's explanation of a token that is not a chord. Every message starts the same way. */
export function unreadableChord(raw: string): string {
  const text = plainSigns(raw);
  const lead = `Unrecognized chord \`${raw}\`.`;
  if (/^\.{2,}$/.test(text)) return `${lead} Put a space between dots: one \`.\` per slot.`;
  if (/^[#b]?[1-7]/.test(text))
    return `${lead} Number chords are not supported yet; use a roman numeral such as \`IV\` or \`bVII\`.`;
  const capital = text.charAt(0).toUpperCase() + text.slice(1);
  if (/^[a-g]/.test(text) && parseChordSymbol(capital))
    return `${lead} Note names are uppercase: did you mean \`${capital}\`?`;
  const lower = /^([#b]?)([iv]+)(.*)$/.exec(text);
  const upper = lower ? lower[1]! + lower[2]!.toUpperCase() + lower[3]! : "";
  if (lower && NUMERAL_THEN_REST.test(text) && parseChordSymbol(upper))
    return `${lead} A lowercase numeral has a minor third, which \`${lower[3]}\` does not. Write \`${upper}\`.`;
  const root = /^([A-G][#b]?)(.+)$/.exec(text) ?? NUMERAL_THEN_REST.exec(text);
  if (root?.[2]) {
    const hint = new RegExp(ALT).test(root[2])
      ? " An alteration goes after a seventh or in parentheses: `C7b9`, `C(b9)`."
      : "";
    return `${lead} \`${root[1]}\` is fine, but \`${root[2]}\` is not a quality this version knows.${hint}`;
  }
  return `${lead} Chords look like \`C\`, \`F#m7\`, \`Bb7/D\`, or numerals like \`ii7\` and \`bVII\`.`;
}
