// What the critic can say about a phrase of a solo. Everything is judged on
// the notes as they sound and on what the plan asks of the phrase's place in
// the solo; nothing reads how the phrase was made. So a finished take can be
// read back and judged by the same features, and the scorecard's number for a
// solo is the one the soloist chose by.

import { PPQ } from "../../chart/types.ts";
import { choose } from "../../critic/choose.ts";
import type { Feature } from "../../critic/types.ts";
import { onPulse, pulseTicks } from "../../perform/meter.ts";
import type { PlanBar } from "../../plan/types.ts";
import { mod12 } from "../../theory/pitch.ts";
import { isChordTone, ranked } from "./harmony.ts";
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

/** Struck in the later half of its bar, where a pickup lives (SO-36): half the bar at most. */
const inLaterHalf = (note: Sounding) => (note.tick - note.bar.start) * 2 >= note.bar.ticks;

/**
 * The idea itself: a phrase's notes without any pickup, into it or inside it.
 * A bar whose only notes are in its later half is a pickup into the next bar.
 */
export function idea(heard: Heard): Sounding[] {
  const notes = body(heard);
  const played = new Set(notes.filter((note) => !inLaterHalf(note)).map((note) => note.bar.index));
  return notes.filter((note) => played.has(note.bar.index));
}

/** The air a soloist leaves between two phrases, in ticks, less a tenth for the player's own timing. */
export const owedBreath = (world: World): number =>
  Math.max(world.solo.space.breath, world.instrument.breath?.takes ?? 0) *
  0.9 *
  world.ticksPerSecond;

/**
 * The notes of a solo that lead into a bar from the bar before it (SO-36), as
 * heard: struck in the later half of a bar that is not the band's last, after
 * a breath, and running on without one into a note struck on the next
 * downbeat. A run that starts in the first half of its bar is a line, not a
 * pickup. Notes in time order.
 */
export function pickupsOf(world: World, notes: readonly Sounding[]): Set<Sounding> {
  const owed = owedBreath(world);
  const found = new Set<Sounding>();
  // Walking back from each downbeat struck, the run of notes joined to it in the bar before.
  let run: Sounding[] = [];
  const keep = (before: Sounding | undefined) => {
    const opens = run.at(-1);
    if (opens && (!before || opens.tick - before.ends >= owed)) {
      for (const note of run) found.add(note);
    }
    run = [];
  };
  for (let i = notes.length - 1; i >= 0; i--) {
    const [note, next] = [notes[i]!, notes[i + 1]];
    const joined = next !== undefined && next.tick - note.ends < owed;
    const into = run.length > 0 ? run[0]!.bar.start + run[0]!.bar.ticks : next?.tick;
    const leads =
      joined &&
      (run.length > 0 || next.tick === next.bar.start) &&
      note.bar.start + note.bar.ticks === into &&
      inLaterHalf(note) &&
      note.bar.ending === null;
    if (leads) {
      run.push(note);
      continue;
    }
    keep(note);
  }
  keep(undefined);
  return found;
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

/** The likeness of a phrase to the earlier phrase of its solo most like it. Null for the first. */
export function closest(heard: Heard, earlier: readonly Heard[]): number | null {
  return earlier.length === 0 ? null : Math.max(...earlier.map((other) => likeness(heard, other)));
}

/** An earlier phrase of the solo, and which way a phrase says it again a pulse away from where it was. */
export interface Displacement {
  readonly of: Heard;
  /** A pulse late (1) or early (-1). */
  readonly by: 1 | -1;
  /** The notes of the earlier phrase that are said again, in order. */
  readonly source: readonly Sounding[];
  /** Each of them as it is said now, wherever in the solo it falls: inside the phrase or not. */
  readonly notes: readonly Sounding[];
  /**
   * The line goes the same way too: the idea said again. Otherwise only its rhythm is
   * (an answer turned from a moved idea): not counted as the idea displaced.
   */
  readonly line: boolean;
}

/**
 * Whether a phrase is an earlier one of its solo said again a pulse early or
 * late, as a listener would match them: every note of the earlier one (three
 * or more; fewer are not an idea) struck again the same distance after the one
 * before, the whole moved by one of the bar's pulses (the quarter in 4/4, the
 * dotted quarter in 6/8 and 12/8) from where it fell in its bar, so that it
 * falls across the bar differently, the phrase's own notes all among them; the
 * same contour (four moves in five the same way, up, down or the same note: a
 * note fitted to the chord now under it may turn); and no earlier phrase whose
 * rhythm it plays where that one fell. The notes said again are looked for in
 * the whole solo (`all`), not only in the phrase's bars, so a note of the idea
 * that falls outside them is still the idea's. The earlier phrase is taken
 * with or without the pickups inside it, the phrase without a pickup into it.
 */
export function displacedFrom(
  heard: Heard,
  earlier: readonly Heard[],
  all: readonly Sounding[],
): Displacement | null {
  const found = rhythmsAgain(heard, earlier, all);
  // A rhythm played again where it fell before is not moved, whatever its line does.
  if (found.length === 0 || found.some((one) => one.inBar === 0)) return null;
  // The idea itself if it is there; else its rhythm alone, with another line.
  const away = found.filter((one) => one.by !== null);
  const moved = away.find((one) => one.line) ?? away[0];
  return moved
    ? { of: moved.of, by: moved.by!, source: moved.source, notes: moved.notes, line: moved.line }
    : null;
}

/** An earlier phrase whose rhythm a phrase plays again, and where. */
export interface RhythmAgain {
  readonly of: Heard;
  readonly source: readonly Sounding[];
  readonly notes: readonly Sounding[];
  /** Ticks into the bar it is moved by, from where it fell. */
  readonly inBar: number;
  /** A pulse late (1), a pulse early (-1), or moved some other way (null). */
  readonly by: 1 | -1 | null;
  /** Its line goes the same way too, four moves in five. */
  readonly line: boolean;
}

/**
 * Every earlier phrase of the solo (with or without the pickups inside it, three
 * notes or more) whose notes are all struck again the same distances apart, the
 * phrase's own notes among them, looked for in the whole solo: what
 * `displacedFrom` chooses among.
 */
export function rhythmsAgain(
  heard: Heard,
  earlier: readonly Heard[],
  all: readonly Sounding[],
): RhythmAgain[] {
  const said = body(heard);
  if (said.length === 0) return [];
  const { meter, ticks } = said[0]!.bar;
  const pulse = pulseTicks(meter)[0]!;
  const at = new Map(all.map((note) => [note.tick, note]));
  const contour = (notes: readonly Sounding[]) =>
    notes.slice(1).map((note, i) => Math.sign(note.pitch - notes[i]!.pitch));
  const found: RhythmAgain[] = [];
  for (const other of [...earlier].reverse()) {
    for (const source of [idea(other), body(other)]) {
      if (source.length < 3 || source.some((note) => note.bar.ticks !== ticks)) continue;
      const moved = said[0]!.tick - source[0]!.tick;
      const notes = source.map((note) => at.get(note.tick + moved));
      if (!notes.every((note): note is Sounding => note !== undefined)) continue;
      if (!said.every((note) => notes.includes(note))) continue;
      // Fitted to the chords now under it a note may move the other way: four moves in
      // five the same way is the same line.
      const [shape, was] = [contour(notes), contour(source)];
      const same = shape.filter((move, i) => move === was[i]).length;
      const inBar = ((moved % ticks) + ticks) % ticks;
      const by = inBar === pulse ? 1 : inBar === ticks - pulse ? -1 : null;
      found.push({ of: other, source, notes, inBar, by, line: same * 5 >= shape.length * 4 });
    }
  }
  return found;
}

const beat = (note: Sounding) => onPulse(note.bar.meter, note.tick - note.bar.start);
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
    says: "How far the phrase is from as busy as the arc, the band and the tempo ask, as a share of what they ask. A level's notes a bar are for a bar of four; a shorter bar is asked for fewer.",
    of: (candidate) => {
      const bars = candidate.slot.bars;
      const fours = bars.reduce((sum, bar) => sum + bar.ticks, 0) / (4 * PPQ);
      const want = candidate.slot.level.notesPerBar * (fours / bars.length);
      return Math.abs(body(candidate).length / bars.length - want) / want;
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
  {
    id: "rocks",
    says: "The share of moves that rock back and forth between two notes (a-b-a-b). For a style that stabs a note on purpose, where a repeated note is not being stuck.",
    of: (candidate) => {
      const pitches = body(candidate).map((note) => note.pitch);
      if (pitches.length < 4) return 0;
      let rocking = 0;
      for (let i = 3; i < pitches.length; i++) {
        const [a, b, c, d] = [pitches[i - 3]!, pitches[i - 2]!, pitches[i - 1]!, pitches[i]!];
        if (a === c && b === d && a !== b) rocking++;
      }
      return rocking / (pitches.length - 1);
    },
  },
  {
    id: "note-for-note",
    says: "The share of the phrase's notes that one of the three phrases before it played at the same place in its bars on the same pitch: said again that soon, an idea wants changing. For a style that develops a line; a riff style means to say it again.",
    of: (candidate) => {
      const notes = idea(candidate);
      if (notes.length === 0) return 0;
      const first = notes[0]!.bar.index;
      let most = 0;
      for (const other of candidate.earlier.slice(-3)) {
        const theirs = idea(other);
        const from = theirs[0]?.bar.index ?? 0;
        const placed = new Set(
          theirs.map(
            (note) => `${note.bar.index - from}:${note.tick - note.bar.start}:${note.pitch}`,
          ),
        );
        const shared = notes.filter((note) =>
          placed.has(`${note.bar.index - first}:${note.tick - note.bar.start}:${note.pitch}`),
        ).length;
        most = Math.max(most, shared);
      }
      return most / notes.length;
    },
  },
  {
    id: "beats-off-the-chord",
    says: "The share of the phrase's notes on a beat that are not tones of the chord under them: a line that does not spell the changes.",
    of: ({ notes, world }) => {
      const on = notes.filter(beat);
      if (on.length === 0) return 0;
      const off = on.filter((note) => {
        const pool = world.poolOf(world.arrivalAt(note.tick));
        return pool !== null && !isChordTone(pool, note.pitch);
      });
      return off.length / on.length;
    },
  },
  {
    id: "changes-down-the-list",
    says: "How far down the style's own list of where a change lands the phrase's notes on chord changes fall: 0 on the tone it most wants there, 1 on the one it wants last.",
    of: ({ notes, world }) => {
      let cases = 0;
      let down = 0;
      for (const note of notes) {
        const arrival = world.arrivalAt(note.tick);
        const pool = world.poolOf(arrival);
        if (!pool || arrival?.tick !== note.tick || !arrival.changed) continue;
        const order = ranked(pool, world.solo.arrive);
        const place = order.indexOf(mod12(note.pitch));
        if (place < 0 || order.length < 2) continue;
        cases++;
        down += place / (order.length - 1);
      }
      return cases === 0 ? 0 : down / cases;
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
 * that bar's slot, except a pickup into a slot's first bar (`pickupsOf`),
 * which belongs to that slot, from whichever bar it is played in: the last of
 * the slot before, or a bar of the band's before the solo or a chorus of it.
 */
export function phrasesOf(world: World, notes: readonly Sounding[]): Heard[] {
  const slotOf = new Map<number, number>();
  const opens = new Map<number, number>();
  world.slots.forEach((slot, i) => {
    for (const bar of slot.bars) slotOf.set(bar.index, i);
    opens.set(slot.bars[0]!.index, i);
  });
  const leads = pickupsOf(world, notes);
  const sorted: Sounding[][] = world.slots.map(() => []);
  for (const note of notes) {
    const into = leads.has(note) ? opens.get(note.bar.index + 1) : undefined;
    const at = into ?? slotOf.get(note.bar.index);
    if (at === undefined) continue;
    sorted[at]!.push(note);
  }
  return world.slots.map((slot, i) => ({ slot, notes: sorted[i]! }));
}
