// What the critic can say about a phrase of a solo. Everything is judged on
// the notes as they sound and on what the plan asks of the phrase's place in
// the solo; nothing reads how the phrase was made. So a finished take can be
// read back and judged by the same features, and the scorecard's number for a
// solo is the one the soloist chose by.

import type { Meter } from "../../chart/types.ts";
import { PPQ } from "../../chart/types.ts";
import { choose } from "../../critic/choose.ts";
import type { Feature } from "../../critic/types.ts";
import { swing } from "../../perform/feel.ts";
import { STEP } from "../../perform/grid.ts";
import { isCompound, onPulse, pulseTicks } from "../../perform/meter.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { FeelStyle } from "../../style/types.ts";
import { mod12 } from "../../theory/pitch.ts";
import { isChordTone, ranked } from "./harmony.ts";
import type { Slot, World } from "./slots.ts";
import { displaceIn } from "./slots.ts";
import type { SoloStyle } from "./style.ts";

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
  /**
   * Where the phrase has a run in double time (`burstsIn`), its notes as the line runs: the
   * run read at the line's own rate, each other note of it, where the line's own rhythm
   * would strike it. What the critic counts and matches rhythms by, so that a burst is
   * judged as the line it doubles; its pitches are judged as they are played. Left out, the
   * notes themselves.
   */
  readonly run?: Run;
}

/** A phrase's notes as the line runs, and the bars a burst runs through. */
export interface Run {
  readonly notes: readonly Sounding[];
  readonly bars: ReadonlySet<number>;
}

/** A phrase as the line runs (`Heard.run`). */
const asRun = (heard: Heard): Heard =>
  heard.run ? { slot: heard.slot, notes: heard.run.notes } : heard;

/** One whole phrase in its place: what the critic chooses between. */
export interface SoloCandidate extends Heard {
  /** How it was made, for a report. The features never read it. */
  readonly kind: string;
  /** The phrases of this solo already played, oldest first. */
  readonly earlier: readonly Heard[];
  /** It says an idea a pulse early or late, and is matched to what came before as that. */
  readonly moved?: boolean;
  readonly world: World;
}

/**
 * The notes a pulse of double time in a bar (`SoloStyle.doubleTime`): the style's own in a
 * bar of quarters, six (twice a pulse's three eighths) in a bar of dotted pulses; none in a
 * bar whose pulses are not all one length.
 */
export function doubledIn(solo: SoloStyle, meter: Meter): number | null {
  const pulses = pulseTicks(meter);
  if (pulses.some((pulse) => pulse !== pulses[0])) return null;
  return isCompound(meter) ? 6 : solo.doubleTime.perPulse;
}

/** Where a note on the written grid is heard in its bar, once the band's swing has bent it. */
export function heardIn(bar: PlanBar, tick: number, feel: FeelStyle): number {
  const within = tick - bar.start;
  return bar.meter.unit === 4 && within < bar.ticks ? swing(within, feel) : within;
}

/** A run of the solo in double time, and the note it lands on. */
export interface Burst {
  /** Its notes, in order, without the note it lands on. */
  readonly notes: readonly Sounding[];
  /** The note it runs into: the last of its notes so close together. */
  readonly landing: Sounding;
  /** The note before it, if any. */
  readonly before: Sounding | null;
  /** The ticks, as heard, between two notes in double time in its bar. */
  readonly step: number;
  /** Its notes a pulse. */
  readonly perPulse: number;
}

/**
 * The runs of a solo's notes in double time, as heard: notes come one after another no more
 * than half as far apart again as double time's step (`doubledIn`), for three quarters of the
 * style's shortest run or more. Nothing a style writes as a line comes so close for so long
 * (rock's sixteenths into a busy bar from a pickup are two beats, under its shortest run of
 * three quarters of a bar). The run's last note is the one it lands on.
 */
export function burstsIn(world: World, notes: readonly Sounding[]): Burst[] {
  const bursts: Burst[] = [];
  const heard = (note: Sounding) => note.bar.start + heardIn(note.bar, note.tick, world.feel);
  let chain: Sounding[] = [];
  const close = () => {
    const first = chain[0];
    if (first) {
      const perPulse = doubledIn(world.solo, first.bar.meter)!;
      const pulse = pulseTicks(first.bar.meter)[0]!;
      const pulses = first.bar.ticks / pulse;
      const shortest = world.solo.doubleTime.bars.shortest * pulses * perPulse;
      if (chain.length - 1 >= Math.ceil(0.75 * shortest)) {
        const at = notes.indexOf(first);
        bursts.push({
          notes: chain.slice(0, -1),
          landing: chain.at(-1)!,
          before: notes[at - 1] ?? null,
          step: pulse / perPulse,
          perPulse,
        });
      }
    }
    chain = [];
  };
  notes.forEach((note, i) => {
    const before = notes[i - 1];
    const perPulse = doubledIn(world.solo, note.bar.meter);
    const near =
      before !== undefined &&
      perPulse !== null &&
      doubledIn(world.solo, before.bar.meter) !== null &&
      before.bar.meter.beats === note.bar.meter.beats &&
      before.bar.meter.unit === note.bar.meter.unit &&
      heard(note) - heard(before) <= (1.5 * pulseTicks(note.bar.meter)[0]!) / perPulse;
    if (near) {
      if (chain.length === 0) chain.push(before);
      chain.push(note);
    } else {
      close();
    }
  });
  close();
  return bursts;
}

/**
 * A phrase's notes as the line runs (`Heard.run`), where it has a burst in double time:
 * each other note of the run, struck where the line's own grid is heard nearest it, and the
 * note it lands on, and the bars the run goes through. Undefined where it has none.
 */
export function runOf(world: World, notes: readonly Sounding[]): Run | undefined {
  const bursts = burstsIn(world, notes);
  if (bursts.length === 0) return undefined;
  const skipped = new Set<Sounding>();
  const placed = new Map<Sounding, Sounding>();
  const bars = new Set<number>();
  for (const burst of bursts) {
    burst.notes.forEach((note, i) => {
      bars.add(note.bar.index);
      if (i % 2 === 1) {
        skipped.add(note);
        return;
      }
      const at = heardIn(note.bar, note.tick, world.feel);
      let best = 0;
      for (let grid = 0; grid < note.bar.ticks; grid += STEP) {
        const off = Math.abs(heardIn(note.bar, note.bar.start + grid, world.feel) - at);
        if (off < Math.abs(heardIn(note.bar, note.bar.start + best, world.feel) - at)) best = grid;
      }
      placed.set(note, { ...note, tick: note.bar.start + best });
    });
  }
  return {
    notes: notes.filter((note) => !skipped.has(note)).map((note) => placed.get(note) ?? note),
    bars,
  };
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

/** More ticks than any bar has: a bar's place in a phrase times this, and the step inside it, is a note's place. */
const PLACES = 1 << 20;

interface Move {
  readonly bar: number;
  readonly step: number;
  readonly move: number | null;
}

/** Each note's bar in its phrase, its step inside the bar, and the interval it moves by. */
function moves(notes: readonly Sounding[]): Move[] {
  const first = notes[0]?.bar.index ?? 0;
  return notes.map((note, i) => ({
    bar: note.bar.index - first,
    step: note.tick - note.bar.start,
    move: i === 0 ? null : note.pitch - notes[i - 1]!.pitch,
  }));
}

/**
 * A phrase's idea as `likeness` lines it up, and where each of its notes is, by bar and step:
 * the same for a phrase each time it is matched against another, so worked out once for it.
 * A solo's earlier phrases are matched against every candidate after them.
 */
interface Lined {
  readonly moves: readonly Move[];
  readonly placed: ReadonlyMap<number, number | null>;
}
const lined = new WeakMap<Heard, Lined>();
function linedUp(heard: Heard): Lined {
  let found = lined.get(heard);
  if (!found) {
    const these = moves(idea(asRun(heard)));
    found = { moves: these, placed: placedBy(these, inBar) };
    lined.set(heard, found);
  }
  return found;
}

/** A step is inside its bar, so a bar and a step are one number: the bar in the high digits. */
const inBar = (bar: number, step: number) => bar * PLACES + step;

function placedBy(
  these: readonly Move[],
  key: (bar: number, step: number) => number,
): Map<number, number | null> {
  return new Map(these.map((note) => [key(note.bar, note.step), note.move]));
}

/**
 * The best match of two phrases' notes, lined up bar against bar every way; `key` says where a
 * note is, as a number no other place in the phrases has, and `placed` is where the first
 * phrase's notes are by it.
 */
function best(
  these: readonly Move[],
  placed: ReadonlyMap<number, number | null>,
  those: readonly Move[],
  key: (bar: number, step: number) => number,
  shift = 0,
): number {
  let most = 0;
  for (let late = -3; late <= 3; late++) {
    let shared = 0;
    let moving = 0;
    let agree = 0;
    for (const note of those) {
      const other = placed.get(key(note.bar + late, note.step + shift));
      if (other === undefined) continue;
      shared++;
      if (note.move === null || other === null) continue;
      moving++;
      if (Math.sign(note.move) === Math.sign(other) && Math.abs(note.move - other) <= 2) agree++;
    }
    const rhythm = shared / (these.length + those.length - shared);
    most = Math.max(most, rhythm * (0.5 + 0.5 * (moving === 0 ? 0 : agree / moving)));
  }
  return most;
}

/**
 * How alike two phrases are, 0 to 1, as a listener would match them: the
 * share of their attacks that fall in the same places in the bar, scaled by
 * how many of those shared notes move the same way (same direction, within a
 * whole step of the same size). The same rhythm with the line turned over is
 * half alike; the same phrase moved up the scale is wholly alike. A lick that
 * comes back a bar or two later in its phrase is still the same lick, so the
 * phrases are lined up bar against bar every way and the best match counts.
 *
 * `moved` says the first phrase was made by saying an idea a pulse early or
 * late: it is then also lined up a pulse either side, since it is still that
 * idea. Only then: two phrases that have nothing to do with each other often
 * line up a pulse apart by chance, and are not alike for it.
 */
export function likeness(a: Heard, b: Heard, moved = false): number {
  const [one, two] = [linedUp(a), linedUp(b)];
  if (one.moves.length === 0 || two.moves.length === 0) return 0;
  const inPlace = best(one.moves, one.placed, two.moves, inBar);
  if (!moved) return inPlace;
  // A pulse either side. Moved, a bar's notes may all fall in its later half, where a
  // pickup would be, so here the phrases are taken whole, pickups inside them and all;
  // and a moved note may cross a barline, so a note is placed by its distance from the
  // phrase's first bar, which is only one place when every bar is as long as the next.
  const [whole, other] = [body(a), body(b)];
  const ticks = whole[0]!.bar.ticks;
  if ([...whole, ...other].some((note) => note.bar.ticks !== ticks)) return inPlace;
  // PROTOTYPE (#2244): a pulse late and early as the slot moves it (`Slot.displace`).
  const pulse = displaceIn(a.slot);
  const along = (bar: number, step: number) => bar * ticks + step;
  const [these, those] = [moves(whole), moves(other)];
  const placed = placedBy(these, along);
  return Math.max(
    inPlace,
    best(these, placed, those, along, pulse.late),
    best(these, placed, those, along, -pulse.early),
  );
}

/**
 * The likeness of a phrase to the earlier phrase of its solo most like it. Null for the
 * first. `moved`: the phrase is an idea said a pulse away (see `likeness`).
 */
export function closest(heard: Heard, earlier: readonly Heard[], moved = false): number | null {
  return earlier.length === 0
    ? null
    : Math.max(...earlier.map((other) => likeness(heard, other, moved)));
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
  /** Earlier phrases already heard as an idea moved: one said where they fell is that idea moved again. */
  movedBefore: ReadonlySet<Heard> = new Set(),
): Displacement | null {
  const found = rhythmsAgain(heard, earlier, all);
  // A rhythm played again where it fell before is not moved, whatever its line does; unless
  // it fell there in a phrase that was itself the idea moved, and the idea is here too, moved
  // a pulse from where it was stated.
  const lineAway = found.some((one) => one.by !== null && one.line);
  const inPlace = (one: RhythmAgain) => one.inBar === 0 && !(lineAway && movedBefore.has(one.of));
  if (found.length === 0 || found.some(inPlace)) return null;
  // The idea itself if it is there; else its rhythm alone, with another line.
  const away = found.filter((one) => one.by !== null);
  const best = away.find((one) => one.line) ?? away[0];
  return best
    ? { of: best.of, by: best.by!, source: best.source, notes: best.notes, line: best.line }
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
  const { ticks } = said[0]!.bar;
  // PROTOTYPE (#2244): a pulse late and early as the slot moves it (`Slot.displace`).
  const pulse = displaceIn(heard.slot);
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
      // Fitted to the chords now under it a note may move: four moves in five that do not
      // turn the other way (a note said again may become a step, or a step a note said
      // again) is the same line.
      const [shape, was] = [contour(notes), contour(source)];
      const same = shape.filter((move, i) => move * was[i]! >= 0).length;
      const inBar = ((moved % ticks) + ticks) % ticks;
      const by = inBar === pulse.late ? 1 : inBar === ticks - pulse.early ? -1 : null;
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
    // A bar a run in double time goes through is the phrase's flurry, not a bar of its line.
    if (heard.run?.bars.has(note.bar.index)) continue;
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
      (1 - (closest(candidate, candidate.earlier, candidate.moved) ?? 1)) *
      (candidate.slot.index === 0 ? 0.5 : 1),
  },
  {
    id: "off-the-density",
    says: "How far the phrase is from as busy as the arc, the band and the tempo ask, as a share of what they ask. A level's notes a bar are for a bar of four; a shorter bar is asked for fewer.",
    of: (candidate) => {
      const bars = candidate.slot.bars;
      const fours = bars.reduce((sum, bar) => sum + bar.ticks, 0) / (4 * PPQ);
      const want = candidate.slot.level.notesPerBar * (fours / bars.length);
      // A run in double time counts as the line it doubles.
      return Math.abs(body(asRun(candidate)).length / bars.length - want) / want;
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
      const notes = idea(asRun(candidate));
      if (notes.length === 0) return 0;
      const first = notes[0]!.bar.index;
      let most = 0;
      for (const other of candidate.earlier.slice(-3)) {
        const theirs = idea(asRun(other));
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
  return world.slots.map((slot, i) => {
    const run = runOf(world, sorted[i]!);
    return run ? { slot, notes: sorted[i]!, run } : { slot, notes: sorted[i]! };
  });
}
