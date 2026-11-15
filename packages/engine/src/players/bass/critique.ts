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
  /** Each bar's first pitch (null for a bar of rest): with its shape, the bar note for note. */
  readonly tops: readonly (number | null)[];
  /** The last pitch played before the phrase, and the next phrase's first, where the line carries through. */
  readonly leading: number | null;
  readonly landing: number | null;
  /** What each bar plays, as a bassist would name it: a shape, or a walk. For reports. */
  readonly plays: readonly string[];
  /** The share of the phrase's bars played on an answer, not the section's home shape. */
  readonly answered: number;
  /** Where the plan walks, or turns its riff round: the gesture that ends a line. */
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
  /** The first pitches of those bars. */
  readonly lastTimeTops: readonly (number | null)[] | null;
}

/** A fourth: from here up a move is a leap. */
const LEAP = 5;

/**
 * A walked line as moves: each note against the one before, from the note
 * before the phrase to the first of the next. Where the line is not walked
 * (a bar in two) there are no moves to speak of, and the count starts again.
 */
function movesOf(candidate: BassCandidate): number[] {
  // Three features read the moves: worked out once for each candidate.
  const known = MOVES.get(candidate);
  if (known) return known;
  const { notes, leading, landing } = candidate;
  const moves: number[] = [];
  MOVES.set(candidate, moves);
  let at = leading;
  for (const note of notes) {
    if (note.echo) continue;
    if (note.walked && at !== null && note.pitch !== at) moves.push(note.pitch - at);
    at = note.walked ? note.pitch : null;
  }
  if (landing !== null && at !== null && landing !== at) moves.push(landing - at);
  return moves;
}

const MOVES = new WeakMap<BassCandidate, number[]>();

/** Which of the phrase's bars are walked. */
function walkedBars({ bars, notes }: BassCandidate): boolean[] {
  return bars.map((bar) =>
    notes.some(
      (note) => note.walked && note.tick >= bar.start && note.tick < bar.start + bar.ticks,
    ),
  );
}

const same = (a: readonly string[] | null, b: readonly string[]) =>
  a !== null && a.length === b.length && a.every((shape, i) => shape === b[i]);

/** What a walk in each place costs before the energy is weighed: a walk belongs at the end of a line. */
const OUT_OF_PLACE: Readonly<Record<WalkPlace, number>> = { top: 0, line: 0.5, inside: 1 };

/**
 * What the critic can say about a line that is made and not written: a walk.
 * They are part of `BASS_FEATURES`; a style with no walked line gives them no weight.
 */
const WALKED_FEATURES: readonly Feature<BassCandidate>[] = [
  {
    id: "turns-back",
    says: "The share of the line's moves that turn back on the move before: a line that climbs for a bar and comes back for a bar turns twice, one that wanders round a note turns at every step.",
    of(candidate) {
      const moves = movesOf(candidate);
      if (moves.length < 2) return 0;
      let turns = 0;
      for (let i = 1; i < moves.length; i++) {
        if (Math.sign(moves[i]!) !== Math.sign(moves[i - 1]!)) turns++;
      }
      return turns / (moves.length - 1);
    },
  },
  {
    id: "rocking",
    says: "The share of the line's moves that go straight back to the note before the last: three notes there and back, the line marking time.",
    of(candidate) {
      const moves = movesOf(candidate);
      if (moves.length < 2) return 0;
      let back = 0;
      for (let i = 1; i < moves.length; i++) if (moves[i] === -moves[i - 1]!) back++;
      return back / (moves.length - 1);
    },
  },
  {
    id: "leaps-left-hanging",
    says: "The share of the line's moves that are a leap of a fourth or wider not then filled in: the next move does not come back by step.",
    of(candidate) {
      const moves = movesOf(candidate);
      if (moves.length < 2) return 0;
      let hanging = 0;
      for (let i = 0; i + 1 < moves.length; i++) {
        const [leap, next] = [moves[i]!, moves[i + 1]!];
        if (Math.abs(leap) < LEAP) continue;
        if (Math.sign(next) === Math.sign(leap) || Math.abs(next) > 2) hanging++;
      }
      return hanging / moves.length;
    },
  },
  {
    id: "strong-beats-off-the-chord",
    says: "The share of the notes on beats 1 and 3 that are not tones of the chord: the strong beats say the harmony, the weak ones pass.",
    of({ notes }) {
      const strong = notes.filter(
        (note) =>
          note.walked && !note.echo && (note.level === "strong" || note.level === "arrival"),
      );
      if (strong.length === 0) return 0;
      return strong.filter((note) => note.passing === true).length / strong.length;
    },
  },
  {
    id: "bars-as-last-time",
    says: "The share of the phrase's bars that are walked and are, note for note, what was played at this place the last time through.",
    of(candidate) {
      const { bars, shapes, tops, lastTime, lastTimeTops } = candidate;
      if (!lastTime || !lastTimeTops) return 0;
      const walked = walkedBars(candidate);
      let same = 0;
      shapes.forEach((shape, k) => {
        if (walked[k] && shape === lastTime[k] && tops[k] === lastTimeTops[k]) same++;
      });
      return same / bars.length;
    },
  },
];

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
    says: "A walk, or a riff's turn, away from the top of a chorus: half a point at the end of a line inside the chorus, a point in the middle of one.",
    of: ({ walks }) => walks.reduce((sum, place) => sum + OUT_OF_PLACE[place], 0),
  },
  {
    id: "walk-when-quiet",
    says: "A walk in a band that is not loud: it costs what is missing of full energy.",
    of: ({ walks, energy }) => (walks.length > 0 ? 1 - energy : 0),
  },
  {
    id: "turnaround-unwalked",
    says: "The chorus turns round to its top with no walk and no turn of the riff: it costs as much as the band is loud.",
    of: ({ intoTop, walks, energy }) => (intoTop && !walks.includes("top") ? energy : 0),
  },
  ...WALKED_FEATURES,
];

/** How a phrase is chosen from its candidates. The bassist asks the critic; a report may ask otherwise. */
export type BassPick = (candidates: readonly BassCandidate[]) => BassCandidate;

/** The candidate the critic prefers. With no weights at all it is the first one drawn. */
export const byBassCritic =
  (weights: Readonly<Record<string, number>>): BassPick =>
  (candidates) =>
    choose(candidates, BASS_FEATURES, weights)!.candidate;
