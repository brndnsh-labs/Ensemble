// The voicing engine: for each strike in turn, the kind's tones fitted to the
// chord, every way the instrument can play them, and the one the critic
// prefers, led from the voicing before. A pianist carries only that from strike
// to strike, so nothing here is random and nothing knows about rhythm.

import { choose } from "../../critic/choose.ts";
import type { Feature } from "../../critic/types.ts";
import type { Arrival } from "../../perform/harmony.ts";
import { contextOf } from "../../perform/harmony.ts";
import type { ChordFamily } from "../../theory/chord.ts";
import { chordFamily } from "../../theory/chord.ts";
import { pitchClass } from "../../theory/pitch.ts";
import type { ChordScale } from "../../theory/scale.ts";
import { chordScale } from "../../theory/scale.ts";
import type { InstrumentIdiom } from "./idiom.ts";
import type { Strike, VoicedStrike, Voicing } from "./strike.ts";
import type { ChordRegister, ChordStyle } from "./style.ts";
import { fitTones } from "./tones.ts";

/** A voicing as the critic judges it: where it sits, and what it follows. */
export interface VoicingCandidate {
  readonly voicing: Voicing;
  /** The voicing the hand is coming from; null for the first strike. */
  readonly previous: Voicing | null;
  readonly register: ChordRegister;
  readonly family: ChordFamily;
}

/**
 * The lowest pitch each interval between neighbouring voices may stand on
 * before it turns to mud (X-B-04), by its size in semitones.
 */
export const LOW_LIMITS: Readonly<Record<number, number>> = {
  1: 52,
  2: 51,
  3: 48,
  4: 46,
  5: 46,
  6: 47,
  7: 34,
  8: 43,
  9: 41,
  10: 41,
  11: 41,
};

/** E4: below it a dominant's half-step rub on the bottom of the hand is a growl, not a colour (Q-03). */
export const RUB_FLOOR = 64;

const top = (v: Voicing) => v.pitches[v.pitches.length - 1]!;

/** Pairs of voices a half step apart (or a minor 9th and its compounds when `ninths`). */
function rubs(v: Voicing, ninths: boolean): number {
  let count = 0;
  for (let i = 0; i < v.pitches.length; i++) {
    for (let j = i + 1; j < v.pitches.length; j++) {
      const gap = v.pitches[j]! - v.pitches[i]!;
      if (ninths ? gap > 12 && gap % 12 === 1 : gap === 1) count++;
    }
  }
  return count;
}

/**
 * Minor seconds that count against a chord. A dominant's half steps (7th
 * against 13th, 3rd against b9) are its colour, except between the two lowest
 * voices low in the keyboard (CH-16, Q-03, KF-B-29).
 */
function minorSeconds(c: VoicingCandidate): number {
  if (c.family !== "dominant") return rubs(c.voicing, false);
  const [low, next] = c.voicing.pitches;
  return low !== undefined && next !== undefined && next - low === 1 && low < RUB_FLOOR ? 1 : 0;
}

/**
 * What the critic can say about a voicing, in natural units (CH-16). The
 * style's `critic.weights.voicing` says what each costs.
 */
export const VOICING_FEATURES: readonly Feature<VoicingCandidate>[] = [
  {
    id: "outside-register",
    says: "Notes outside the instrument's slot: above the ceiling, crowding the soloist.",
    of: ({ voicing, register }) =>
      voicing.pitches.filter((p) => p < register.floor || p > register.ceiling).length,
  },
  {
    id: "top-from-target",
    says: "How far the top voice is from where the style aims it, in semitones.",
    of: ({ voicing, register }) => Math.abs(top(voicing) - register.target),
  },
  {
    id: "hand-movement",
    says: "How far the hand moves from the chord before, in semitones summed over the voices.",
    // Voices are paired from the top down, so a chord with one voice fewer is judged by the
    // line the listener follows, not by the bottom (CH-17, CH-18).
    of: ({ voicing, previous }) => {
      if (!previous) return 0;
      const a = [...voicing.pitches].reverse();
      const b = [...previous.pitches].reverse();
      let sum = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) sum += Math.abs(a[i]! - b[i]!);
      return sum;
    },
  },
  {
    id: "top-movement",
    says: "How far the top voice moves from the chord before, in semitones: the line on top.",
    of: ({ voicing, previous }) => (previous ? Math.abs(top(voicing) - top(previous)) : 0),
  },
  {
    id: "minor-ninths",
    says: "Minor ninths between voices: a clash, except on a dominant, where it is the colour.",
    of: (c) => (c.family === "dominant" ? 0 : rubs(c.voicing, true)),
  },
  {
    id: "minor-seconds",
    says: "Minor seconds in a chord of four notes or more: a rub the other voices half cover.",
    of: (c) => (c.voicing.pitches.length >= 4 ? minorSeconds(c) : 0),
  },
  {
    id: "minor-seconds-thin",
    says: "Minor seconds in a chord of three notes or fewer, where nothing covers the rub.",
    of: (c) => (c.voicing.pitches.length < 4 ? minorSeconds(c) : 0),
  },
  {
    id: "sharp-nine-under-third",
    says: "A #9 voiced below the 3rd: a cluster, not the 7#9 sound (CH-05).",
    of: ({ voicing, family }) => {
      if (family !== "dominant") return 0;
      const third = voicing.tones.indexOf("3");
      const nine = voicing.tones.indexOf("9");
      if (third < 0 || nine < 0) return 0;
      const gap = voicing.pitches[third]! - voicing.pitches[nine]!;
      // The #9 is a minor third above the root and a half step under the major 3rd.
      return gap > 0 && gap % 12 === 1 ? 1 : 0;
    },
  },
  {
    id: "low-intervals",
    says: "Neighbouring voices too low for the interval between them, which turns to mud (X-B-04).",
    of: ({ voicing }) => {
      let count = 0;
      for (let i = 1; i < voicing.pitches.length; i++) {
        const low = voicing.pitches[i - 1]!;
        const gap = (voicing.pitches[i]! - low) % 12;
        if (gap > 0 && low < (LOW_LIMITS[gap] ?? 0)) count++;
      }
      return count;
    },
  },
];

/**
 * Voice every strike in order, each led from the one before. The same
 * strikes always get the same voicings.
 */
export function voiceStrikes(
  strikes: readonly Strike[],
  harmony: readonly Arrival[],
  chords: ChordStyle,
  idiom: InstrumentIdiom,
  weights: Readonly<Record<string, number>>,
): VoicedStrike[] {
  const scales = new Map<number, ChordScale>();
  const voiced: VoicedStrike[] = [];
  let previous: Voicing | null = null;
  for (const strike of strikes) {
    const chord = strike.arrival.chord;
    const kind = chords.kinds[strike.kind];
    if (!chord || !kind) continue;
    let scale = scales.get(strike.arrival.index);
    if (!scale) {
      scale = chordScale(chord, contextOf(harmony, strike.arrival));
      scales.set(strike.arrival.index, scale);
    }
    const tones = fitTones(kind, chord, scale);
    const family = chordFamily(chord.quality);
    const candidates = idiom
      .candidates(tones, pitchClass(chord.root), chords.register)
      .map((voicing) => ({ voicing, previous, register: chords.register, family }));
    const best = choose(candidates, VOICING_FEATURES, weights);
    if (!best) continue;
    previous = best.candidate.voicing;
    voiced.push({ strike, voicing: previous });
  }
  return voiced;
}
