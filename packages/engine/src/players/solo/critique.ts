// What the critic can say about a phrase of a solo. Everything is judged on
// the notes as they sound and on what the plan asks of the phrase's place in
// the solo; nothing reads how the phrase was made. So a finished take can be
// read back and judged by the same features, and the scorecard's number for a
// solo is the one the soloist chose by.

import { PPQ } from "../../chart/types.ts";
import { choose } from "../../critic/choose.ts";
import type { Feature } from "../../critic/types.ts";
import type { PlanBar } from "../../plan/types.ts";
import { mod12 } from "../../theory/pitch.ts";
import type { Slot, World } from "./slots.ts";

/** A note of the solo as it sounds: where it is struck on the grid and when it stops. */
export interface Sounding {
  readonly bar: PlanBar;
  readonly tick: number;
  readonly ends: number;
  readonly pitch: number;
}

/** A phrase as it was heard: its slot and its notes, a pickup into it included. */
export interface Heard {
  readonly slot: Slot;
  readonly notes: readonly Sounding[];
}

/** One whole phrase in its place: what the critic chooses between. */
export interface SoloCandidate extends Heard {
  /** How it was made, for a report. The features never read it. */
  readonly kind: string;
  /** The phrases of this solo already played, oldest first. */
  readonly earlier: readonly Heard[];
  readonly world: World;
}

/** A phrase's notes without the pickup into it. */
export const body = (heard: Heard): Sounding[] =>
  heard.notes.filter((note) => note.tick >= heard.slot.bars[0]!.start);

const inLastBeat = (note: Sounding) => note.tick - note.bar.start >= note.bar.ticks - PPQ;

/**
 * The idea itself: a phrase's notes without any pickup, into it or inside it.
 * A bar whose only notes are in its last beat is a pickup into the next bar.
 */
export function idea(heard: Heard): Sounding[] {
  const notes = body(heard);
  const played = new Set(notes.filter((note) => !inLastBeat(note)).map((note) => note.bar.index));
  return notes.filter((note) => played.has(note.bar.index));
}

/**
 * How alike two phrases are, 0 to 1, as a listener would match them: the
 * share of their attacks that fall in the same places in the bar, scaled by
 * how many of those shared notes move the same way (same direction, within a
 * whole step of the same size). The same rhythm with the line turned over is
 * half alike; the same phrase moved up the scale is wholly alike. A lick that
 * comes back a bar or two later in its phrase is still the same lick, so the
 * phrases are lined up bar against bar every way and the best match counts.
 */
export function likeness(a: Heard, b: Heard): number {
  const moves = (heard: Heard) => {
    const notes = idea(heard);
    const first = notes[0]?.bar.index ?? 0;
    return notes.map((note, i) => ({
      bar: note.bar.index - first,
      step: note.tick - note.bar.start,
      move: i === 0 ? null : note.pitch - notes[i - 1]!.pitch,
    }));
  };
  const [one, two] = [moves(a), moves(b)];
  if (one.length === 0 || two.length === 0) return 0;
  const placed = new Map(one.map((note) => [`${note.bar}:${note.step}`, note.move]));
  let best = 0;
  for (let late = -3; late <= 3; late++) {
    let shared = 0;
    let moving = 0;
    let agree = 0;
    for (const note of two) {
      const other = placed.get(`${note.bar + late}:${note.step}`);
      if (other === undefined) continue;
      shared++;
      if (note.move === null || other === null) continue;
      moving++;
      if (Math.sign(note.move) === Math.sign(other) && Math.abs(note.move - other) <= 2) agree++;
    }
    const rhythm = shared / (one.length + two.length - shared);
    best = Math.max(best, rhythm * (0.5 + 0.5 * (moving === 0 ? 0 : agree / moving)));
  }
  return best;
}

/** A phrase is "related" to another from here up: above what two unrelated blues phrases score. */
export const RELATED = 0.5;
/** And from here up it is the same phrase again. */
export const SAME = 0.9;

/** The likeness of a phrase to the earlier phrase of its solo most like it. Null for the first. */
export function closest(heard: Heard, earlier: readonly Heard[]): number | null {
  return earlier.length === 0 ? null : Math.max(...earlier.map((other) => likeness(heard, other)));
}

const beat = (note: Sounding) => (note.tick - note.bar.start) % PPQ === 0;
/** Longer than a swung eighth on the beat: a note that is held. */
const held = (note: Sounding) => note.ends - note.tick >= PPQ * 0.75;

/** The bars of a phrase that carry a line (three notes or more), each as the gaps between its attacks. */
export function lineBars(heard: Heard): string[] {
  const bars = new Map<number, number[]>();
  for (const note of body(heard)) {
    bars.set(note.bar.index, [...(bars.get(note.bar.index) ?? []), note.tick]);
  }
  return [...bars.values()]
    .filter((ticks) => ticks.length >= 3)
    .map((ticks) =>
      ticks
        .slice(1)
        .map((tick, i) => tick - ticks[i]!)
        .join(" "),
    );
}

/**
 * The longest stretch of playing with no silence of `breath` ticks in it, in
 * ticks, from its first attack to its last: a last note left to ring is not
 * more playing.
 */
export function longestRun(notes: readonly Sounding[], breath: number): number {
  let longest = 0;
  let from = notes[0]?.tick ?? 0;
  notes.forEach((note, i) => {
    const next = notes[i + 1];
    if (next && next.tick - note.ends < breath) return;
    longest = Math.max(longest, note.tick - from);
    from = next?.tick ?? 0;
  });
  return longest;
}

/**
 * What the critic can say about a phrase of a solo. The style's
 * `critic.weights.solo` says what each costs; the lowest sum is played.
 */
export const SOLO_FEATURES: readonly Feature<SoloCandidate>[] = [
  {
    id: "lost-the-thread",
    says: "How little of the phrase comes from anything played earlier in the solo: a new idea every time is wandering. The top of a chorus is where a new idea may start, so there it counts half.",
    of: (candidate) =>
      (1 - (closest(candidate, candidate.earlier) ?? 1)) * (candidate.slot.index === 0 ? 0.5 : 1),
  },
  {
    id: "off-the-density",
    says: "How far the phrase is from as busy as the arc, the band and the tempo ask, as a share of what they ask.",
    of: (candidate) => {
      const want = candidate.slot.level.notesPerBar;
      return Math.abs(body(candidate).length / candidate.slot.bars.length - want) / want;
    },
  },
  {
    id: "off-the-register",
    says: "Semitones between the middle of the phrase and where the arc puts this part of the solo.",
    of: (candidate) => {
      const notes = body(candidate);
      if (candidate.slot.peak || notes.length === 0) return 0;
      const mean = notes.reduce((sum, note) => sum + note.pitch, 0) / notes.length;
      return Math.abs(mean - candidate.slot.centre);
    },
  },
  {
    id: "peak-thrown-away",
    says: "The phrase's highest note is a short note off the beat: a high point nobody could hear as one (Q-45).",
    of: (candidate) => {
      const notes = body(candidate);
      if (notes.length < 3) return 0;
      const top = notes.reduce((high, note) => (note.pitch > high.pitch ? note : high));
      return beat(top) || held(top) ? 0 : 1;
    },
  },
  {
    id: "leaps-left-hanging",
    says: "Leaps wider than a fifth inside a line that are not followed by a step or a third back the other way.",
    of: (candidate) => {
      const notes = body(candidate);
      let hanging = 0;
      for (let i = 1; i < notes.length; i++) {
        const [from, to, next] = [notes[i - 1]!, notes[i]!, notes[i + 1]];
        const leap = to.pitch - from.pitch;
        // Across a breath it is a new start, not a leap.
        if (Math.abs(leap) <= 7 || to.tick - from.ends >= PPQ) continue;
        const back = next === undefined ? 0 : next.pitch - to.pitch;
        if (back === 0 || Math.sign(back) === Math.sign(leap) || Math.abs(back) > 4) hanging++;
      }
      return hanging;
    },
  },
  {
    id: "stuck",
    says: "The share of moves that repeat a note or rock back and forth between two: a line going nowhere.",
    of: (candidate) => {
      const pitches = body(candidate).map((note) => note.pitch);
      if (pitches.length < 2) return 0;
      let stuck = 0;
      for (let i = 1; i < pitches.length; i++) {
        const trill = i >= 3 && pitches[i] === pitches[i - 2] && pitches[i - 1] === pitches[i - 3];
        if (pitches[i] === pitches[i - 1] || trill) stuck++;
      }
      return stuck / (pitches.length - 1);
    },
  },
  {
    id: "doubles-the-bass",
    says: "The share of notes on a chord change that are the note the bass player struck there: the bass line an octave up.",
    of: ({ notes, world }) => {
      const landings = notes.filter((note) => {
        const arrival = world.arrivalAt(note.tick);
        return arrival?.tick === note.tick && arrival.changed && world.bass.has(note.tick);
      });
      if (landings.length === 0) return 0;
      const doubled = landings.filter((note) => world.bass.get(note.tick) === mod12(note.pitch));
      return doubled.length / landings.length;
    },
  },
  {
    id: "rests-where-the-last-did",
    says: "The phrase comes to rest on the very note the phrase before it rested on (SO-14).",
    of: (candidate) => {
      const last = body(candidate).at(-1);
      const before = candidate.earlier.at(-1)?.notes.at(-1);
      return last !== undefined && before !== undefined && last.pitch === before.pitch ? 1 : 0;
    },
  },
  {
    id: "runs-on",
    says: "Seconds of playing without a breath, beyond what the style has patience for.",
    of: ({ notes, world }) => {
      const breath = world.solo.space.breath * world.ticksPerSecond;
      const seconds = longestRun(notes, breath) / world.ticksPerSecond;
      return Math.max(0, seconds - world.solo.space.patience);
    },
  },
  {
    id: "bars-in-a-row",
    says: "The share of the phrase's line bars whose rhythm comes back nowhere else in it: bars in a row, not a phrase (Q-43).",
    of: (candidate) => {
      const bars = lineBars(candidate);
      if (bars.length < 2) return 0;
      const alone = bars.filter((bar, i) => !bars.some((other, j) => j !== i && other === bar));
      return alone.length / bars.length;
    },
  },
];

/** How a phrase is chosen from its candidates. The soloist asks the critic; a report may ask otherwise. */
export type SoloPick = (candidates: readonly SoloCandidate[]) => SoloCandidate;

/** The candidate the critic prefers. With no weights at all it is the first one made. */
export const bySoloCritic =
  (weights: Readonly<Record<string, number>>): SoloPick =>
  (candidates) =>
    choose(candidates, SOLO_FEATURES, weights)!.candidate;

/** A take's bass notes as the soloist hears them: the pitch class struck at each tick. */
export function bassStruck(
  notes: Iterable<{ readonly tick: number; readonly pitch: number }>,
): Map<number, number> {
  const struck = new Map<number, number>();
  for (const note of notes) struck.set(note.tick, mod12(note.pitch));
  return struck;
}

/**
 * A solo's notes sorted into its phrases. A note struck in a bar belongs to
 * that bar's slot, except a note struck in the last beat of a slot's final
 * bar, which leads into the next slot: no phrase strikes its own last beat.
 */
export function phrasesOf(world: World, notes: readonly Sounding[]): Heard[] {
  const slotOf = new Map<number, number>();
  world.slots.forEach((slot, i) => {
    for (const bar of slot.bars) slotOf.set(bar.index, i);
  });
  const sorted: Sounding[][] = world.slots.map(() => []);
  for (const note of notes) {
    let at = slotOf.get(note.bar.index);
    if (at === undefined) continue;
    const slot = world.slots[at]!;
    const next = world.slots[at + 1];
    const lastBar = slot.bars.at(-1)!;
    const leadsIn =
      note.bar === lastBar &&
      note.tick >= lastBar.start + lastBar.ticks - PPQ &&
      !lastBar.ending &&
      next !== undefined &&
      next.bars[0]!.index === lastBar.index + 1 &&
      next.chorus === slot.chorus;
    if (leadsIn) at++;
    sorted[at]!.push(note);
  }
  return world.slots.map((slot, i) => ({ slot, notes: sorted[i]! }));
}
