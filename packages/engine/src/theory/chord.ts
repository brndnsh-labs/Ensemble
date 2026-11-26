// Chord qualities and what they contain. The names are the canonical column of
// the quality table in docs/CHART_FORMAT.md section 6.3.

import type { NoteName } from "./pitch.ts";
import { noteNameToString } from "./pitch.ts";

export const BASE_QUALITIES = [
  "",
  "m",
  "dim",
  "aug",
  "5",
  "sus4",
  "sus2",
  "6",
  "m6",
  "69",
  "m69",
  "add9",
  "madd9",
  "7",
  "maj7",
  "m7",
  "mMaj7",
  "m7b5",
  "dim7",
  "7sus4",
  "9",
  "maj9",
  "m9",
  "11",
  "m11",
  "13",
  "maj13",
  "m13",
  "9sus4",
  "13sus4",
  "7alt",
] as const;

/** The canonical quality name without alterations. The empty string is a major triad. */
export type BaseQuality = (typeof BASE_QUALITIES)[number];

/** In canonical order. */
export const ALTERATIONS = ["b5", "#5", "b9", "#9", "#11", "b13"] as const;
export type Alteration = (typeof ALTERATIONS)[number];

export interface Quality {
  readonly base: BaseQuality;
  /** Sorted in the order of `ALTERATIONS`, without duplicates. */
  readonly alterations: readonly Alteration[];
}

/** Harmony alone: what a player needs to choose notes. */
export interface Chord {
  readonly root: NoteName;
  readonly quality: Quality;
  /** A slash bass, when it differs from the root. */
  readonly bass: NoteName | null;
}

export type ToneRole =
  | "root"
  | "third"
  | "sus"
  | "fifth"
  | "sixth"
  | "seventh"
  | "ninth"
  | "eleventh"
  | "thirteenth";

/** One note of a chord: its job, and its distance above the root in semitones (0 to 21). */
export interface ChordTone {
  readonly role: ToneRole;
  readonly interval: number;
}

export type ChordFamily =
  | "major"
  | "minor"
  | "dominant"
  | "diminished"
  | "half-diminished"
  | "augmented"
  | "suspended"
  | "power";

type Recipe = readonly [family: ChordFamily, tones: readonly (readonly [ToneRole, number])[]];

const R = ["root", 0] as const;
const M3 = ["third", 4] as const;
const m3 = ["third", 3] as const;
const P5 = ["fifth", 7] as const;
const d5 = ["fifth", 6] as const;
const b7 = ["seventh", 10] as const;
const M7 = ["seventh", 11] as const;
const N9 = ["ninth", 14] as const;
const P11 = ["eleventh", 17] as const;
const M13 = ["thirteenth", 21] as const;
const S4 = ["sus", 5] as const;

const RECIPES: Readonly<Record<BaseQuality, Recipe>> = {
  "": ["major", [R, M3, P5]],
  m: ["minor", [R, m3, P5]],
  dim: ["diminished", [R, m3, d5]],
  aug: ["augmented", [R, M3, ["fifth", 8]]],
  "5": ["power", [R, P5]],
  sus4: ["suspended", [R, S4, P5]],
  sus2: ["suspended", [R, ["sus", 2], P5]],
  "6": ["major", [R, M3, P5, ["sixth", 9]]],
  m6: ["minor", [R, m3, P5, ["sixth", 9]]],
  "69": ["major", [R, M3, P5, ["sixth", 9], N9]],
  m69: ["minor", [R, m3, P5, ["sixth", 9], N9]],
  add9: ["major", [R, M3, P5, N9]],
  madd9: ["minor", [R, m3, P5, N9]],
  "7": ["dominant", [R, M3, P5, b7]],
  maj7: ["major", [R, M3, P5, M7]],
  m7: ["minor", [R, m3, P5, b7]],
  mMaj7: ["minor", [R, m3, P5, M7]],
  m7b5: ["half-diminished", [R, m3, d5, b7]],
  dim7: ["diminished", [R, m3, d5, ["seventh", 9]]],
  "7sus4": ["dominant", [R, S4, P5, b7]],
  "9": ["dominant", [R, M3, P5, b7, N9]],
  maj9: ["major", [R, M3, P5, M7, N9]],
  m9: ["minor", [R, m3, P5, b7, N9]],
  // A dominant eleventh is played without its third, which clashes with the eleventh.
  "11": ["dominant", [R, P5, b7, N9, P11]],
  m11: ["minor", [R, m3, P5, b7, N9, P11]],
  "13": ["dominant", [R, M3, P5, b7, N9, M13]],
  maj13: ["major", [R, M3, P5, M7, N9, M13]],
  m13: ["minor", [R, m3, P5, b7, N9, M13]],
  "9sus4": ["dominant", [R, S4, P5, b7, N9]],
  "13sus4": ["dominant", [R, S4, P5, b7, N9, M13]],
  "7alt": ["dominant", [R, M3, d5, b7, ["ninth", 13], ["ninth", 15], ["thirteenth", 20]]],
};

const ALTERED_TONE: Readonly<Record<Alteration, readonly [ToneRole, number]>> = {
  b5: ["fifth", 6],
  "#5": ["fifth", 8],
  b9: ["ninth", 13],
  "#9": ["ninth", 15],
  "#11": ["eleventh", 18],
  b13: ["thirteenth", 20],
};

const ROLE_ORDER: readonly ToneRole[] = [
  "root",
  "third",
  "sus",
  "fifth",
  "sixth",
  "seventh",
  "ninth",
  "eleventh",
  "thirteenth",
];

export function chordFamily(quality: Quality): ChordFamily {
  return RECIPES[quality.base][0];
}

/**
 * Every tone the symbol asks for, low role to high. An alteration replaces the
 * natural tone in the same role (b5 replaces the fifth), except that b9 and #9
 * can stand together.
 */
export function chordTones(quality: Quality): readonly ChordTone[] {
  // A symbol's tones are the same every time it is asked: worked out once for each.
  const name = `${quality.base} ${quality.alterations.join(" ")}`;
  let tones = TONES.get(name);
  if (!tones) {
    tones = tonesOf(quality);
    TONES.set(name, tones);
  }
  return tones;
}

const TONES = new Map<string, readonly ChordTone[]>();

function tonesOf(quality: Quality): readonly ChordTone[] {
  let tones = RECIPES[quality.base][1].map(([role, interval]) => ({ role, interval }));
  for (const alteration of quality.alterations) {
    const [role, interval] = ALTERED_TONE[alteration];
    const isNatural = (t: ChordTone) => t.role === role && !isAlteredInterval(t.interval);
    tones = tones.filter((t) => !isNatural(t) && t.interval !== interval);
    tones.push({ role, interval });
  }
  return Object.freeze(
    tones.sort(
      (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.interval - b.interval,
    ),
  );
}

function isAlteredInterval(interval: number): boolean {
  return Object.values(ALTERED_TONE).some(([, altered]) => altered === interval);
}

/** The interval of one role, or null when the chord has no such tone. Takes the lowest if several. */
export function toneInterval(quality: Quality, role: ToneRole): number | null {
  return chordTones(quality).find((t) => t.role === role)?.interval ?? null;
}

const SEVENTH_FAMILY = new Set<BaseQuality>(
  BASE_QUALITIES.filter((q) => /7|9|11|13/.test(q) && q !== "69" && q !== "m69"),
);

/**
 * Normalize a base and a set of alterations: sorted, deduplicated, and with the
 * spellings that name one chord two ways folded together (m7 with b5 is m7b5).
 */
export function makeQuality(base: BaseQuality, alterations: readonly Alteration[] = []): Quality {
  let sorted = ALTERATIONS.filter((a) => alterations.includes(a));
  let normalBase = base;
  if (base === "m7" && sorted.includes("b5")) {
    normalBase = "m7b5";
    sorted = sorted.filter((a) => a !== "b5");
  }
  return { base: normalBase, alterations: sorted };
}

/** Canonical spelling: `7#9b13`, `maj7#11`, and `(b5)` in parentheses when no seventh precedes it. */
export function qualityToString(quality: Quality): string {
  const alterations = quality.alterations.join("");
  if (alterations === "") return quality.base;
  return SEVENTH_FAMILY.has(quality.base)
    ? quality.base + alterations
    : `${quality.base}(${quality.alterations.join(",")})`;
}

export function sameQuality(a: Quality, b: Quality): boolean {
  return a.base === b.base && a.alterations.join() === b.alterations.join();
}

export function chordToString(chord: Chord): string {
  const bass = chord.bass ? `/${noteNameToString(chord.bass)}` : "";
  return noteNameToString(chord.root) + qualityToString(chord.quality) + bass;
}
