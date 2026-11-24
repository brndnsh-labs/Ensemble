// Fitting a voicing kind to the chord that is sounding: which tones the hand
// plays, before anyone decides where they sit. The recipe proposes; chord
// identity disposes (X-B-13).

import type { Alteration, Chord } from "../../theory/chord.ts";
import { chordFamily, chordTones, toneInterval } from "../../theory/chord.ts";
import type { Key } from "../../theory/pitch.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import type { ChordScale } from "../../theory/scale.ts";
import { scaleHas } from "../../theory/scale.ts";
import type { Recipe, Voice, VoiceTone, VoicingCondition, VoicingKind } from "./style.ts";

/** One tone the hand will play: its name in the recipe and its pitch class above the root. */
export interface FittedTone {
  readonly tone: Exclude<VoiceTone, "T">;
  /** Semitones above the root, 0 to 11. */
  readonly interval: number;
  /** The hand may sound it or leave it out (`Recipe.free`). */
  readonly free?: true;
}

/** A written tension, by the interval the chart's symbol gives it (above the root, past the octave). */
const TENSIONS: readonly (readonly [name: string, interval: number, tone: "9" | "11" | "13"])[] = [
  ["b9", 13, "9"],
  ["9", 14, "9"],
  ["#9", 15, "9"],
  ["11", 17, "11"],
  ["#11", 18, "11"],
  ["b13", 20, "13"],
  ["13", 21, "13"],
];

/** Which written tension is voiced first when there is room for only one (CH-03). */
const PRIORITY: Readonly<Record<"dominant" | "other", readonly string[]>> = {
  dominant: ["b13", "#11", "b9", "#9", "13", "9", "11"],
  other: ["#11", "b13", "b9", "#9", "9", "13", "11"],
};

function written(chord: Chord): { name: string; interval: number; tone: "9" | "11" | "13" }[] {
  const intervals = new Set(chordTones(chord.quality).map((t) => t.interval));
  const order = PRIORITY[chordFamily(chord.quality) === "dominant" ? "dominant" : "other"];
  return TENSIONS.filter(([, interval]) => intervals.has(interval))
    .map(([name, interval, tone]) => ({ name, interval, tone }))
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

/**
 * The tensions a chord's symbol names (`VoicingCondition.unwritten`): its
 * highest, the altered ones its quality stacks (C7alt), and its alterations.
 */
function named(chord: Chord): Set<"9" | "11" | "13"> {
  const names = new Set<"9" | "11" | "13">();
  const stacked = written({ ...chord, quality: { ...chord.quality, alterations: [] } });
  const highest = stacked.reduce((top, t) => Math.max(top, t.interval), 0);
  for (const t of stacked) {
    if (t.interval === highest || !NATURAL.has(t.interval)) names.add(t.tone);
  }
  for (const alteration of chord.quality.alterations) {
    const tone = ALTERATION_TONE[alteration].tone;
    if (tone === "9" || tone === "11" || tone === "13") names.add(tone);
  }
  return names;
}

/** A natural 9th, 11th or 13th, in semitones above the root. */
const NATURAL = new Set([14, 17, 21]);

/**
 * A tone as semitones above the root (0 to 11), or null when the chord cannot
 * give it. Unwritten colour comes only from the chord's scale (X-B-10).
 */
export function toneOf(
  tone: Exclude<VoiceTone, "T">,
  chord: Chord,
  scale: ChordScale,
): number | null {
  const quality = chord.quality;
  const family = chordFamily(quality);
  const writtenOf = (kind: "9" | "11" | "13") => written(chord).find((t) => t.tone === kind);
  switch (tone) {
    case "R":
      return 0;
    case "3": {
      // A chord with no third is heard by what stands in its place.
      const third =
        toneInterval(quality, "third") ??
        toneInterval(quality, "sus") ??
        toneInterval(quality, "eleventh");
      return third === null ? null : mod12(third);
    }
    case "5":
      return mod12(toneInterval(quality, "fifth") ?? 7);
    case "7": {
      const seventh = toneInterval(quality, "seventh") ?? toneInterval(quality, "sixth");
      return seventh === null ? null : mod12(seventh);
    }
    case "9": {
      const ninth = writtenOf("9");
      if (ninth) return mod12(ninth.interval);
      if (scaleHas(scale, 2)) return 2;
      // The flat 9 is a dominant's colour and an avoid note on a minor chord (CH-07).
      return family === "dominant" && scaleHas(scale, 1) ? 1 : null;
    }
    case "11": {
      const eleventh = writtenOf("11");
      if (eleventh) return mod12(eleventh.interval);
      // Over a major third the perfect 11 is a minor 9th (CH-04).
      const majorThird = chordTones(quality).some((t) => t.role === "third" && t.interval === 4);
      return !majorThird && scaleHas(scale, 5) ? 5 : null;
    }
    case "13": {
      const thirteenth = writtenOf("13");
      if (thirteenth) return mod12(thirteenth.interval);
      if (scaleHas(scale, 9)) return 9;
      return family === "dominant" && scaleHas(scale, 8) ? 8 : null;
    }
  }
}

/** The numerals a degree may be written in, by the semitones of the major scale's steps. */
const NUMERALS: Readonly<Record<string, number>> = {
  I: 0,
  II: 2,
  III: 4,
  IV: 5,
  V: 7,
  VI: 9,
  VII: 11,
};

/** Semitones above the tonic of a degree as a condition writes it (`bVII` is 10), or null where it is no numeral. */
export function degreeSemitonesOf(written: string): number | null {
  const match = /^([b#]?)(I|II|III|IV|V|VI|VII)$/.exec(written);
  if (!match) return null;
  const shift = match[1] === "b" ? -1 : match[1] === "#" ? 1 : 0;
  return mod12(NUMERALS[match[2]!]! + shift);
}

function meets(
  when: VoicingCondition | undefined,
  chord: Chord,
  scale: ChordScale,
  key: Key | null,
): boolean {
  if (!when) return true;
  const can = (tone: VoiceTone) => tone === "T" || toneOf(tone, chord, scale) !== null;
  if (when.family && !when.family.includes(chordFamily(chord.quality))) return false;
  if (when.has?.some((tone) => !can(tone))) return false;
  if (when.lacks?.some((tone) => tone !== "T" && can(tone))) return false;
  // With no key to read it from, a chord has no degree, and meets no condition on one.
  if (when.mode !== undefined && key?.mode !== when.mode) return false;
  if (when.unwritten?.some((tone) => named(chord).has(tone))) return false;
  if (when.degrees !== undefined) {
    if (!key) return false;
    const above = mod12(pitchClass(chord.root) - pitchClass(key.tonic));
    if (!when.degrees.some((degree) => degreeSemitonesOf(degree) === above)) return false;
  }
  return true;
}

/** Whether a voicing kind's recipes ask what the chord is in the key. */
export function readsTheKey(kind: VoicingKind): boolean {
  return kind.recipes.some(
    (recipe) => recipe.when?.degrees !== undefined || recipe.when?.mode !== undefined,
  );
}

/** The first recipe whose condition the chord meets, in the key its bar is in. */
export function recipeFor(
  kind: VoicingKind,
  chord: Chord,
  scale: ChordScale,
  key: Key | null = null,
): Recipe {
  return (
    kind.recipes.find((recipe) => meets(recipe.when, chord, scale, key)) ?? { voices: ["3", "7"] }
  );
}

/**
 * The tones a chord is voiced with by one recipe, one per pitch class, low role
 * to high. The recipe is read first; then the chord's identity is made whole:
 * the third (or suspension), the seventh (or sixth) and every written
 * alteration always sound, each taking the place of the most expendable voice
 * (the root, then the natural fifth, then colour the chart did not write)
 * (X-B-13, X-B-09).
 */
export function fitRecipe(recipe: Recipe, chord: Chord, scale: ChordScale): FittedTone[] {
  // A free fifth is free only where it is perfect (CH-24): a flat or sharp fifth is part of the
  // chord, so it is a voice, and it takes its own seat before identity gives up the root.
  const perfect = (tone: "5") => toneOf(tone, chord, scale) === 7;
  const freed = (recipe.free ?? []).filter(perfect);
  const voices = [...recipe.voices, ...(recipe.free ?? []).filter((tone) => !perfect(tone))];
  const tones: (FittedTone | null)[] = voices.map(() => null);
  const taken = () => new Set(tones.flatMap((t) => (t ? [t.interval] : [])));
  const fill = (index: number, tone: Exclude<VoiceTone, "T">) => {
    const interval = toneOf(tone, chord, scale);
    if (interval === null || taken().has(interval)) return false;
    tones[index] = { tone, interval };
    return true;
  };
  // Named tones first, so a `T` knows which written tensions are already being played.
  voices.forEach((voice, index) => {
    for (const tone of typeof voice === "string" ? [voice] : voice) {
      if (tone === "T") break;
      if (fill(index, tone)) break;
    }
  });
  voices.forEach((voice, index) => {
    if (tones[index]) return;
    const options = typeof voice === "string" ? [voice] : voice;
    const from = options.indexOf("T");
    if (from < 0) return;
    for (const tone of options.slice(from)) {
      if (tone === "T") {
        const tension = written(chord).find((t) => !taken().has(mod12(t.interval)));
        if (tension) {
          tones[index] = { tone: tension.tone, interval: mod12(tension.interval) };
          break;
        }
      } else if (fill(index, tone)) break;
    }
  });

  const result = tones.filter((t): t is FittedTone => t !== null);
  for (const need of identity(chord, scale)) {
    if (result.some((t) => t.interval === need.interval)) continue;
    const spare = expendable(result, chord);
    if (spare < 0) result.push(need);
    else result[spare] = need;
  }
  // A free fifth last: the hand may add it or leave it, never in place of a voice.
  for (const tone of freed) {
    const interval = toneOf(tone, chord, scale);
    if (interval === null || result.some((t) => t.interval === interval)) continue;
    result.push({ tone, interval, free: true });
  }
  return result;
}

/**
 * A recipe's voices with its free fifth made a voice, as a chord voiced whole
 * plays it (`Strike.whole`): in the seat of a tension the chart may not write,
 * which a written one takes (X-B-13: a written 13th takes the 5th's place),
 * or, where the recipe has no such seat, beside the rest. C7 voiced whole is
 * R 3 5 7 and A13 R 3 13 7, as `R 3 [T 5] 7` voices them.
 */
export function wholeVoices(voices: readonly Voice[], free: readonly "5"[]): Voice[] {
  if (free.length === 0) return [...voices];
  const seat = voices.indexOf("T");
  if (seat < 0) return [...voices, ...free];
  return voices.map((voice, index) => (index === seat ? ["T", ...free] : voice));
}

/** What the chord cannot be heard without: guide tones and written alterations. */
export function identity(chord: Chord, scale: ChordScale): FittedTone[] {
  const needs: FittedTone[] = [];
  for (const tone of ["3", "7"] as const) {
    const interval = toneOf(tone, chord, scale);
    if (interval !== null) needs.push({ tone, interval });
  }
  for (const alteration of chord.quality.alterations) {
    needs.push(ALTERATION_TONE[alteration]);
  }
  return needs;
}

const ALTERATION_TONE: Readonly<Record<Alteration, FittedTone>> = {
  b5: { tone: "5", interval: 6 },
  "#5": { tone: "5", interval: 8 },
  b9: { tone: "9", interval: 1 },
  "#9": { tone: "9", interval: 3 },
  "#11": { tone: "11", interval: 6 },
  b13: { tone: "13", interval: 8 },
};

/** The alterations a chord's symbol writes, as semitones above its root: each is always heard. */
export const alterationsOf = (chord: Chord): number[] =>
  chord.quality.alterations.map((alteration) => ALTERATION_TONE[alteration].interval);

/**
 * The voice to give up for a tone the chord needs: the root (the bass has it),
 * then a natural fifth, then colour the chart did not write, then a written
 * natural tension. -1 when every voice is needed.
 */
function expendable(tones: readonly FittedTone[], chord: Chord): number {
  const writtenIntervals = new Set(written(chord).map((t) => mod12(t.interval)));
  const needed = new Set(chord.quality.alterations.map((a) => ALTERATION_TONE[a].interval));
  const rank = (t: FittedTone): number => {
    if (t.tone === "3" || t.tone === "7" || needed.has(t.interval)) return -1;
    if (t.tone === "R") return 4;
    if (t.tone === "5") return 3;
    return writtenIntervals.has(t.interval) ? 1 : 2;
  };
  let best = -1;
  tones.forEach((t, i) => {
    if (rank(t) > 0 && (best < 0 || rank(t) > rank(tones[best]!))) best = i;
  });
  return best;
}
