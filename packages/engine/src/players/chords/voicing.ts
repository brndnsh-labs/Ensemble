// The voicing engine: for each strike in turn, the kind's tones fitted to the
// chord, every way the instrument can play them, and the one the critic
// prefers, led from the voicing before. A pianist carries only that from strike
// to strike, so nothing here is random and nothing knows about rhythm.

import { PPQ } from "../../chart/types.ts";
import { choose } from "../../critic/choose.ts";
import type { Feature } from "../../critic/types.ts";
import type { Arrival } from "../../perform/harmony.ts";
import { contextOf } from "../../perform/harmony.ts";
import type { ChordFamily } from "../../theory/chord.ts";
import { chordFamily } from "../../theory/chord.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import { chordScale } from "../../theory/scale.ts";
import { fretsOf, OPEN_STRINGS } from "./guitar.ts";
import type { InstrumentIdiom } from "./idiom.ts";
import type { StrikeLine } from "./line.ts";
import type { Strike, VoicedStrike, Voicing } from "./strike.ts";
import { LOW_LIMITS } from "./strike.ts";
import type { ChordRegister, ChordStyle } from "./style.ts";
import { fitRecipe, identity, recipeFor } from "./tones.ts";

export { LOW_LIMITS };

/** A voicing as the critic judges it: where it sits, and what it follows. */
export interface VoicingCandidate {
  readonly voicing: Voicing;
  /** The voicing the hand is coming from; null for the first strike. */
  readonly previous: Voicing | null;
  readonly register: ChordRegister;
  readonly family: ChordFamily;
  /** What the strike hears of the soloist; null where the line is silent or the seat does not listen. */
  readonly line: StrikeLine | null;
  /**
   * The hand is out of its own place for a soloist: it hears the line now, or
   * it did and has not yet come back within reach of its target.
   */
  readonly away: boolean;
}

/** E4: below it a dominant's half-step rub on the bottom of the hand is a growl, not a colour (Q-03). */
export const RUB_FLOOR = 64;

/** A fourth: how far above the bass the bottom of the hand keeps (Q-03, `chords.crowds-the-bass`). */
const CLEAR_OF_THE_BASS = 5;

/** A fourth: the widest move of the top voice that is still a line. */
const TOP_LEAP = 5;

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
    id: "top-out-of-reach",
    says: "How far the top voice has crept past the style's reach from its target, in semitones.",
    // Voice leading is greedy: each smooth step is cheap, and a hand led a step at a time can
    // climb an octave over a few choruses and never come back (CH-77). This is the pull that
    // turns it round.
    of: ({ voicing, register }) =>
      Math.max(0, Math.abs(top(voicing) - register.target) - register.reach),
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
    id: "crowds-the-bass-under-the-line",
    says: "Under the soloist, how far inside a fourth of the bass note the bottom of the hand sits, in semitones: a hand pressed down out of the line's way, onto the bass.",
    // Without a soloist the hand sits well clear of the bass; it is the room made for the
    // line that brings it down, so this is asked only there.
    of: ({ voicing, line }) =>
      line?.bass === null || line?.bass === undefined
        ? 0
        : Math.max(0, CLEAR_OF_THE_BASS - (voicing.pitches[0]! - line.bass)),
  },
  {
    id: "top-leap",
    says: "Around a solo, how far past a fourth the top voice jumps from the chord before, in semitones: the hand lurching out of the line's way, or lurching home (CH-65).",
    // The movement costs are what a smooth step saves, so a reason strong enough can buy a
    // jump of a fifth with them: a soloist sitting on the top note, or, when the solo is
    // over, a hand that was pressed down out of the line's way and wants to be home. This
    // prices the jump, so the hand gets out of the way and comes back by steps. It is asked
    // only while the hand is away: with nobody soloing it never leaps.
    of: ({ voicing, previous, away }) =>
      away && previous ? Math.max(0, Math.abs(top(voicing) - top(previous)) - TOP_LEAP) : 0,
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
    id: "on-the-soloists-note",
    says: "Comp voices on the very pitch the soloist is sounding, each by the share of the chord's time the note fills: the comp sitting on the line (CH-59).",
    of: ({ voicing, line }) => (line ? doubled(voicing, line, (a, b) => a === b) : 0),
  },
  {
    id: "on-the-soloists-octave",
    says: "Comp voices an octave or more from a pitch the soloist is sounding, by the same share: the line doubled (CH-59).",
    of: ({ voicing, line }) =>
      line ? doubled(voicing, line, (a, b) => a !== b && mod12(a - b) === 0) : 0,
  },
  {
    id: "in-the-soloists-register",
    says: "Comp voices at or above the lowest note the soloist plays in this bar or the bar before, or a half step under it: the piano in the line's register (CH-63).",
    // The hand makes room only as far down as its own slot goes: under a line lower than the
    // reach below its target (an alto sax down in its fourth octave) there is no room, and a
    // hand pressed lower would only crowd the bass and turn to mud.
    of: ({ voicing, line, register }) => {
      const lowest = line?.lowest;
      if (lowest === null || lowest === undefined) return 0;
      const from = Math.max(lowest - 1, register.target - register.reach);
      return voicing.pitches.filter((pitch) => pitch >= from).length;
    },
  },
  {
    id: "silent-strings",
    says: "On a guitar, strings the grip leaves silent: an open-position chord wants them all ringing (CH-24).",
    of: ({ voicing }) => (voicing.strings ? OPEN_STRINGS.length - voicing.strings.length : 0),
  },
  {
    id: "stopped-strings",
    says: "On a guitar, strings a finger stops: an open string rings longer than a fretted one, and is the sound of a chord at the nut (CH-24).",
    of: ({ voicing }) =>
      voicing.strings
        ? fretsOf(voicing.strings, voicing.pitches).filter((fret) => fret > 0).length
        : 0,
  },
  {
    id: "muted-inside",
    says: "On a guitar, a string muted inside the grip: the hand has to damp it, so a shape on neighbouring strings is the one taken where there is one.",
    of: ({ voicing }) =>
      voicing.strings
        ? voicing.strings.at(-1)! - voicing.strings[0]! + 1 - voicing.strings.length
        : 0,
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
 * A half step between the two lowest voices, except on a dominant from E4 up,
 * where the 13th under the 7th is a colour in the middle of the keyboard (CH-66).
 */
function growls(voicing: Voicing, family: ChordFamily): boolean {
  const [low, next] = voicing.pitches;
  if (low === undefined || next === undefined || next - low !== 1) return false;
  return family !== "dominant" || low < RUB_FLOOR;
}

/** Voices a pitch relation away from the soloist's notes, each by the share of the strike it fills. */
function doubled(
  voicing: Voicing,
  line: StrikeLine,
  related: (voice: number, solo: number) => boolean,
): number {
  let sum = 0;
  for (const pitch of voicing.pitches) {
    for (const note of line.over) if (related(pitch, note.pitch)) sum += note.ticks / line.length;
  }
  return sum;
}

/**
 * What the search could not clear, the strike leaves out (CH-60): a voice on
 * the soloist's very pitch for half the strike or a full beat goes, the top
 * voice first. Never a tone the chord is heard by (the 3rd or suspension, the
 * 7th or 6th, a written alteration: X-B-13), never the bottom of the hand,
 * and never below two voices.
 */
function clear(voicing: Voicing, line: StrikeLine, needed: ReadonlySet<number>, root: number) {
  const held = (pitch: number) =>
    line.over.filter((note) => note.pitch === pitch).reduce((sum, note) => sum + note.ticks, 0);
  const keep = voicing.pitches.map(() => true);
  let left = voicing.pitches.length;
  for (let i = voicing.pitches.length - 1; i > 0 && left > 2; i--) {
    const pitch = voicing.pitches[i]!;
    const ticks = held(pitch);
    if (ticks === 0 || (ticks * 2 < line.length && ticks < PPQ)) continue;
    if (needed.has(mod12(pitch - root))) continue;
    keep[i] = false;
    left--;
  }
  if (left === voicing.pitches.length) return voicing;
  const strings = voicing.strings?.filter((_, i) => keep[i]);
  return {
    pitches: voicing.pitches.filter((_, i) => keep[i]),
    tones: voicing.tones.filter((_, i) => keep[i]),
    ...(strings ? { strings } : {}),
  };
}

/**
 * Voice every strike in order, each led from the one before. The same
 * strikes always get the same voicings.
 *
 * A comping figure strikes one chord many times, and a blues plays the same
 * three chords all night, so two things are remembered instead of worked out
 * again: the ways a chord can be played (by its kind, root, quality and scale),
 * and where the hand is led from a given voicing to that chord. Both are what
 * would have been computed; nothing is chosen differently. A strike that hears
 * the soloist (`lines`, one per strike) is chosen afresh, since the line
 * over it is its own; then what the search could not clear is left out.
 */
export function voiceStrikes(
  strikes: readonly Strike[],
  harmony: readonly Arrival[],
  chords: ChordStyle,
  idiom: InstrumentIdiom,
  weights: Readonly<Record<string, number>>,
  lines: readonly (StrikeLine | null)[] = [],
): VoicedStrike[] {
  const ways = new Map<string, Way>();
  const wayAt = new Map<string, Way>();
  const voiced: VoicedStrike[] = [];
  let previous: Voicing | null = null;
  // The chord the hand last played, for an instrument that holds its shape while the chord stays.
  let held: Way | null = null;
  // Whether the hand is still out of its place after a line it heard.
  let away = false;
  for (const [i, strike] of strikes.entries()) {
    const chord = strike.arrival.chord;
    const kind = chords.kinds[strike.kind];
    if (!chord || !kind) continue;
    const at = `${strike.kind} ${strike.arrival.index}`;
    let way = wayAt.get(at);
    if (!way) {
      const scale = chordScale(chord, contextOf(harmony, strike.arrival));
      const root = pitchClass(chord.root);
      const colour = `${JSON.stringify(chord.quality)} ${scale.name} ${scale.intervals.join(" ")}`;
      const name = `${strike.kind} ${root} ${colour}`;
      way = ways.get(name);
      if (!way) {
        // A spread offers each of its recipe's stackings; close position has the one.
        const recipe = recipeFor(kind, chord, scale);
        const stacks =
          kind.position === "spread" ? [recipe.voices, ...(recipe.also ?? [])] : [recipe.voices];
        way = {
          family: chordFamily(chord.quality),
          voicings: stacks.flatMap((voices) =>
            idiom.candidates(
              fitRecipe({ voices }, chord, scale),
              root,
              chords.register,
              kind.position,
            ),
          ),
          led: new Map(),
          root,
          needed: new Set(identity(chord, scale).map((tone) => tone.interval)),
        };
        ways.set(name, way);
      }
      wayAt.set(at, way);
    }
    const line = lines[i] ?? null;
    if (line) away = true;
    // A choice that hears the line, or is on its way home from one, is its own: only a
    // strike with the hand in its own place is remembered.
    let next: Voicing | null | undefined =
      idiom.holds && way === held && previous ? previous : away ? undefined : way.led.get(previous);
    held = way;
    if (next === undefined) {
      // Under the line the hand is pressed down, toward where a half step on the bottom is a
      // growl: there it is never taken while anything else will do (CH-66, KF-B-37).
      const clean = line ? way.voicings.filter((voicing) => !growls(voicing, way.family)) : [];
      const offered = clean.length > 0 ? clean : way.voicings;
      const { family } = way;
      const from: Voicing | null = previous;
      const candidates: VoicingCandidate[] = offered.map((voicing) => ({
        voicing: idiom.placed?.(voicing, from) ?? voicing,
        previous,
        register: chords.register,
        family,
        line,
        away,
      }));
      next = choose(candidates, VOICING_FEATURES, weights)?.candidate.voicing ?? null;
      if (!away) way.led.set(previous, next);
    }
    if (next === null) continue;
    // Home again: the line is gone and the top is back within reach of where the style aims it.
    const { target, reach } = chords.register;
    if (!line && Math.abs(top(next) - target) <= reach) away = false;
    // The hand is led on from the whole voicing it chose, not from what was left sounding.
    previous = next;
    voiced.push({ strike, voicing: line ? clear(next, line, way.needed, way.root) : next });
  }
  return voiced;
}

/** One chord in one kind: every way to play it, and where each hand position is led to. */
interface Way {
  readonly family: ChordFamily;
  readonly voicings: readonly Voicing[];
  /** From the voicing in hand (null: the first strike) to the one chosen; null when there is none. */
  readonly led: Map<Voicing | null, Voicing | null>;
  /** The chord's root, as a pitch class. */
  readonly root: number;
  /** The tones the chord is heard by, as pitch classes above the root: never left out. */
  readonly needed: ReadonlySet<number>;
}
