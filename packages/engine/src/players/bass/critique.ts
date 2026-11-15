// What the critic can say about a phrase of bass line, and how the bassist
// asks it. A candidate is one whole way of playing the phrase, already played
// out over the harmony and into the first note of the next phrase, so
// everything here is judged on the notes that would sound.

import { choose } from "../../critic/choose.ts";
import type { Feature } from "../../critic/types.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { LineNote } from "./line.ts";

/** D3: above it a bass guitar is up the neck on its top string. */
export const HIGH_NOTE = 50;

/** Where a walk was played: into the top of a section, into the next line, or inside a line. */
export type WalkPlace = "top" | "line" | "inside";

/** One way of playing a phrase, played out: what the critic chooses between. */
export interface BassCandidate {
  /** The phrase's bars, in order. */
  readonly bars: readonly PlanBar[];
  /** The notes the phrase would sound, its last bar reshaped by how it leads into the next. */
  readonly notes: readonly LineNote[];
  /** Each bar as a shape: its notes' places in the bar and their pitches above its first note. */
  readonly shapes: readonly string[];
  /** What each bar plays, as a bassist would name it: a shape, or a walk. For reports. */
  readonly plays: readonly string[];
  /** The share of the phrase's bars played on an answer, not the section's home shape. */
  readonly answered: number;
  /** Where the plan walks. */
  readonly walks: readonly WalkPlace[];
  /** Semitones from the phrase's last note to the next one's first root, where the bass note changes there. */
  readonly joins: number | null;
  /**
   * Each change of bass note the phrase makes, its arrival into the next phrase
   * included: the pitch played in the beat before it (null if none) and the
   * pitch it lands on.
   */
  readonly arrivals: readonly (readonly [number | null, number])[];
  /** Whether each of the changes just before the phrase, about a chorus of them, was arrived at by a half step. */
  readonly recent: readonly boolean[];
  /** The share of changes the style likes to arrive at by a half step. */
  readonly chromatic: { readonly min: number; readonly max: number };
  /** The phrase leads into the top of a section. */
  readonly intoTop: boolean;
  /** The phrase closes a time through the section that played its home shape throughout, no walk anywhere. */
  readonly loop: boolean;
  /** The bass's energy at the end of the phrase. */
  readonly energy: number;
  /** The shapes of the phrase played before this one. Null at the very top. */
  readonly before: readonly string[] | null;
  /** The shapes played at this place in the section the last time through. Null the first time. */
  readonly lastTime: readonly string[] | null;
}

const same = (a: readonly string[] | null, b: readonly string[]) =>
  a !== null && a.length === b.length && a.every((shape, i) => shape === b[i]);

/** What a walk in each place costs before the energy is weighed: a walk belongs at the end of a line. */
const OUT_OF_PLACE: Readonly<Record<WalkPlace, number>> = { top: 0, line: 0.5, inside: 1 };

/**
 * What the critic can say about a phrase of bass line. The style's
 * `critic.weights.bass` says what each costs; the lowest sum is played.
 */
export const BASS_FEATURES: readonly Feature<BassCandidate>[] = [
  {
    id: "leaps-into-the-next",
    says: "How far the phrase jumps to the next one's first root, past a whole step, in tenths of a leap of an octave: a third costs a little, an octave a point.",
    of: ({ joins }) => (joins === null ? 0 : Math.max(0, joins - 2) / 10),
  },
  {
    id: "half-steps",
    says: "How far the share of changes arrived at by a half step, over the last chorus or so and this phrase, is outside the style's band: chromaticism is seasoning (BA-75), some changes and not all, and not none.",
    of: ({ arrivals, recent, chromatic }) => {
      const halves = [
        ...recent,
        ...arrivals.map(([before, landing]) => before !== null && Math.abs(before - landing) === 1),
      ];
      if (arrivals.length === 0 || halves.length === 0) return 0;
      const share = halves.filter(Boolean).length / halves.length;
      return Math.max(0, chromatic.min - share, share - chromatic.max);
    },
  },
  {
    id: "same-as-last",
    says: "The phrase is the phrase before it again, bar for bar, as shapes.",
    of: ({ shapes, before }) => (same(before, shapes) ? 1 : 0),
  },
  {
    id: "same-as-last-time",
    says: "The phrase is what was played at this place last chorus, bar for bar: a chorus copied.",
    of: ({ shapes, lastTime }) => (same(lastTime, shapes) ? 1 : 0),
  },
  {
    id: "a-loop",
    says: "The chorus ends having been one shape throughout, with no answer and no walk: a loop.",
    of: ({ loop }) => (loop ? 1 : 0),
  },
  {
    id: "away-from-home",
    says: "The share of the phrase's bars not on the section's own line: past a point, the home shape never comes back.",
    of: ({ answered }) => answered,
  },
  {
    id: "high-notes",
    says: "The share of the phrase's notes above D3, up the neck where a bass guitar visits and does not live.",
    of: ({ notes }) =>
      notes.length === 0 ? 0 : notes.filter((note) => note.pitch > HIGH_NOTE).length / notes.length,
  },
  {
    id: "walk-out-of-place",
    says: "A walk away from the top of a chorus: half a point at the end of a line inside the chorus, a point in the middle of one.",
    of: ({ walks }) => walks.reduce((sum, place) => sum + OUT_OF_PLACE[place], 0),
  },
  {
    id: "walk-when-quiet",
    says: "A walk in a band that is not loud: it costs what is missing of full energy.",
    of: ({ walks, energy }) => (walks.length > 0 ? 1 - energy : 0),
  },
  {
    id: "turnaround-unwalked",
    says: "The chorus turns round to its top with no walk: it costs as much as the band is loud.",
    of: ({ intoTop, walks, energy }) => (intoTop && !walks.includes("top") ? energy : 0),
  },
];

/** How a phrase is chosen from its candidates. The bassist asks the critic; a report may ask otherwise. */
export type BassPick = (candidates: readonly BassCandidate[]) => BassCandidate;

/** The candidate the critic prefers. With no weights at all it is the first one drawn. */
export const byBassCritic =
  (weights: Readonly<Record<string, number>>): BassPick =>
  (candidates) =>
    choose(candidates, BASS_FEATURES, weights)!.candidate;
