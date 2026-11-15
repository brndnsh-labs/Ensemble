// Writing the pitches of a phrase whose rhythm is already decided (SO-03:
// rhythm before pitch). The landings are fixed first: the first note, the
// last, every note on a chord change, every note that is followed by a rest.
// Then the line walks the ladder between them a rung at a time, following
// the phrase's contour and always able to step into the next landing. Notes
// that are remembered from an earlier phrase are given, and only fitted to
// the chord now under them.

import { PPQ } from "../../chart/types.ts";
import { cells, STEP } from "../../perform/grid.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { Rng } from "../../rng.ts";
import type { ToneRole } from "../../theory/chord.ts";
import type { Pool } from "./harmony.ts";
import { climb, EIGHTH, isChordTone, landing, onlyPasses, rubs, rung } from "./harmony.ts";
import type { World } from "./slots.ts";
import type { Cell, Contour } from "./style.ts";

/** A place a note will be struck: the rhythm's part of a note. */
export interface Spot {
  readonly bar: PlanBar;
  readonly tick: number;
  /** Ticks the rhythm holds the note for. */
  readonly hold: number;
  /** Which attack of its bar's cell this is, from 0. */
  readonly onset: number;
  readonly pool: Pool;
  /** Struck where a chord arrives, or leaning into one: a chord tone by rule (X-B-06, X-B-07). */
  readonly lands: boolean;
}

/** One bar of a line. `again` plays the bar before it again, moved along the contour (SO-18). */
export interface LineBar {
  readonly spots: readonly Spot[];
  readonly again: boolean;
}

export interface LineAsk {
  /** The lowest and highest pitch the line may touch. */
  readonly low: number;
  readonly high: number;
  /** The pitch the line would like at each moment, from 0 at its first note to 1 at its last. */
  readonly contour: (through: number) => number;
  /** Where the last note may rest, best first. */
  readonly ending: readonly ToneRole[];
  /** The last note is the last of the tune: it rests on one of `ending`'s tones and no other. */
  readonly final: boolean;
  /** The pitch the soloist last played, which the first note leans halfway toward (SO-14). */
  readonly from: number | null;
  /** Where the phrase before came to rest: this one rests somewhere else (SO-14). */
  readonly notOn: number | null;
  /**
   * The line climbs to the solo's top note: its last note is the highest chord
   * tone at or under `to`, and over `above`, the highest note played so far.
   */
  readonly climbsTo: { readonly to: number; readonly above: number } | null;
  /** Pitches already decided, by position in the line: an idea remembered. */
  readonly given: ReadonlyMap<number, number>;
  /** Habits are drawn here, by the place of the landing they decorate. */
  readonly rng: Rng;
}

/** The attacks of a rhythm cell in a bar. Nothing is struck under N.C. (X-B-18). */
export function spotsOf(world: World, bar: PlanBar, cell: Cell): Spot[] {
  const symbols = cells(cell).slice(0, Math.round(bar.ticks / STEP));
  const spots: Spot[] = [];
  let onset = 0;
  symbols.forEach((symbol, step) => {
    if (symbol !== "x") return;
    let length = 1;
    while (symbols[step + length] === "-") length++;
    const tick = bar.start + step * STEP;
    const hold = Math.min(length * STEP, bar.start + bar.ticks - tick);
    const { pool, leans } = world.poolFor(tick, hold);
    const arrives = world.arrivalAt(tick)?.tick === tick;
    if (pool) spots.push({ bar, tick, hold, onset, pool, lands: leans || arrives });
    onset++;
  });
  return spots;
}

/** A contour as the pitch it asks for through a phrase, around a centre, travelling `span` semitones (SO-13). */
export function contourOf(
  kind: Contour,
  centre: number,
  span: number,
): (through: number) => number {
  switch (kind) {
    // Starts a third of its span under the centre, peaks two thirds over it in the middle.
    case "arch":
      return (u) => centre - span / 3 + span * Math.sin(Math.PI * u);
    case "fall":
      return (u) => centre + span / 2 - span * u;
    case "climb":
      return (u) => centre - span / 2 + span * u;
    case "wave":
      return (u) => centre + (span / 2) * Math.sin(2 * Math.PI * u);
  }
}

/** A position that is the same music whatever came before it in the plan: for keying a draw. */
export const placeOf = (bar: PlanBar, tick: number): string =>
  `${bar.section.occurrence}/${bar.barInSection}/${tick - bar.start}`;

const onBeat = (spot: Spot) => (spot.tick - spot.bar.start) % PPQ === 0;
const long = (spot: Spot) => spot.hold > EIGHTH;
/** A note the chord does not allow where it would be heard as more than passing. */
const wrong = (spot: Spot, pitch: number) =>
  (onBeat(spot) || long(spot)) && onlyPasses(spot.pool, pitch);

/** A remembered pitch over the chord now under it: kept if it still belongs, else the nearest that does (SO-33). */
function fit(world: World, spot: Spot, pitch: number, lands: boolean, ask: LineAsk): number {
  const { pool } = spot;
  const inside = Math.min(ask.high, Math.max(ask.low, pitch));
  if (lands || (long(spot) && rubs(pool, inside))) {
    return isChordTone(pool, inside)
      ? inside
      : landing(
          pool,
          inside,
          world.solo.arrive,
          Math.max(ask.low, inside - 4),
          Math.min(ask.high, inside + 4),
        );
  }
  // The nearest note of the pool that is inside the phrase's register.
  const reachable = pool.ladder.filter(
    (rung) => rung >= ask.low && rung <= ask.high && !wrong(spot, rung),
  );
  return reachable.reduce(
    (best, rung) => (Math.abs(rung - inside) < Math.abs(best - inside) ? rung : best),
    reachable[0] ?? pool.ladder[rung(pool, inside)]!,
  );
}

/** The pitches of a line, one for each spot of its bars in order. */
export function writeLine(world: World, bars: readonly LineBar[], ask: LineAsk): number[] {
  const spots = bars.flatMap((bar) => bar.spots);
  const count = spots.length;
  if (count === 0) return [];
  const { solo } = world;
  const start = spots[0]!.tick;
  const length = Math.max(1, spots[count - 1]!.tick - start);
  const through = (i: number) => (spots[i]!.tick - start) / length;
  const pitches = new Array<number | undefined>(count);

  // The top note of the solo is decided before anything: the rest of the climb stays under it.
  let high = ask.high;
  if (ask.climbsTo !== null) {
    const { to, above } = ask.climbsTo;
    const pool = spots[count - 1]!.pool;
    const tones = pool.ladder.filter((pitch) => isChordTone(pool, pitch) && pitch > above);
    // Under the ceiling if any is; else the first one over it, so the top is still the top.
    const top =
      tones.findLast((pitch) => pitch <= to) ??
      tones[0] ??
      landing(pool, to, solo.arrive, to - 4, to);
    pitches[count - 1] = top;
    high = Math.max(ask.low + 9, top - 1);
  }
  const room: LineAsk = { ...ask, high };

  // 1. The landings, in order, each the best tone near where the contour is (SO-20, SO-21).
  let landed: number | null = null;
  let landedAt = 0;
  for (let i = 0; i < count; i++) {
    if (pitches[i] !== undefined) continue;
    const spot = spots[i]!;
    const last = i === count - 1;
    const next = spots[i + 1];
    const beforeRest = next !== undefined && next.tick - (spot.tick + spot.hold) >= PPQ;
    const lands = i === 0 || last || spot.lands || beforeRest;
    // Where the tune ends, a remembered idea gives way: the last note rests by rule.
    const given = last && ask.final ? undefined : ask.given.get(i);
    if (given !== undefined) {
      let pitch = fit(world, spot, given, lands, room);
      // Two remembered notes never collapse onto one pitch: the second keeps moving the
      // way it was going (SO-33).
      const was = ask.given.get(i - 1);
      if (i > 0 && pitch === pitches[i - 1] && was !== undefined && was !== given) {
        const way = Math.sign(given - was);
        // The rung beside it that way, else the other way, else a rung further on.
        const held = pitch;
        const beside = [way, -way, 2 * way, -2 * way]
          .map((rungs) => climb(spot.pool, held, rungs))
          .find((p) => p !== held && p <= high && p >= ask.low && !wrong(spot, p));
        pitch = lands
          ? landing(spot.pool, pitch + 2 * way, solo.arrive, ask.low, high, [pitch])
          : (beside ?? pitch);
      }
      pitches[i] = pitch;
      if (lands) [landed, landedAt] = [pitch, i];
      continue;
    }
    if (!lands) continue;
    let ideal = ask.contour(through(i));
    if (i === 0 && ask.from !== null) ideal = (ideal + ask.from) / 2;
    // A landing more than a major sixth from the one before comes an octave closer (SO-21),
    // unless there are notes enough between them to walk it.
    if (landed !== null && i - landedAt < 4 && Math.abs(ideal - landed) > 9) {
      ideal -= 12 * Math.sign(ideal - landed);
    }
    const not = [landed, last ? ask.notOn : null].filter(
      (pitch): pitch is number => pitch !== null,
    );
    pitches[i] = landing(
      spot.pool,
      ideal,
      last ? ask.ending : solo.arrive,
      ask.low,
      high,
      not,
      last && ask.final,
    );
    [landed, landedAt] = [pitches[i]!, i];
  }

  // 2. The line between them.
  const inWindow = (pitch: number) => pitch >= ask.low && pitch <= high;
  const firstOfBar = bars.map((_, b) =>
    bars.slice(0, b).reduce((sum, bar) => sum + bar.spots.length, 0),
  );
  const barOf = (i: number) => firstOfBar.findLastIndex((first) => first <= i);
  for (let i = 1; i < count; i++) {
    if (pitches[i] !== undefined) continue;
    const spot = spots[i]!;
    const before = pitches[i - 1]!;
    const b = barOf(i);

    let to = i + 1;
    while (pitches[to] === undefined) to++;
    const target = pitches[to]!;
    const left = to - i;

    // A riff bar: the same notes as the bar before, as many rungs along as the contour has moved.
    if (bars[b]!.again && b > 0) {
      const earlier = bars[b - 1]!.spots.findIndex(
        (s) => s.tick - s.bar.start === spot.tick - spot.bar.start,
      );
      if (earlier >= 0) {
        const stride = 12 / Math.max(1, new Set(spot.pool.ladder.map((pitch) => pitch % 12)).size);
        const moved =
          ask.contour(through(firstOfBar[b]!)) - ask.contour(through(firstOfBar[b - 1]!));
        const copied = pitches[firstOfBar[b - 1]! + earlier]!;
        // A sequence moves a step or two a bar, not a leap.
        const rungs = Math.max(-2, Math.min(2, Math.round(moved / stride)));
        const pitch = fit(world, spot, climb(spot.pool, copied, rungs), false, room);
        // At the edge of the register the sequence gives way to the walk, which turns
        // round; pinned there it would rock between two notes (KF-B-18).
        const pinned = pitch === ask.low || pitch === high || pitch === pitches[i - 2];
        // And the note before a landing still has to be able to reach it.
        const strands = left === 1 && Math.abs(pitch - target) > 5;
        if (pitch !== before && !pinned && !strands) {
          pitches[i] = pitch;
          continue;
        }
      }
    }

    const short = !long(spot) && !onBeat(spot);
    const draw = ask.rng.fork("approach", placeOf(spots[to]!.bar, spots[to]!.tick));

    // An enclosure: the step above the landing, the half step under it, then the landing (SO-26).
    if (left === 2 && !long(spot) && !long(spots[i + 1]!) && !onBeat(spots[i + 1]!)) {
      const above = climb(spot.pool, target, 1);
      const circles =
        above !== before && inWindow(above) && inWindow(target - 1) && !wrong(spot, above);
      if (circles && draw.fork("enclosure").chance(solo.habits.enclosure)) {
        pitches[i] = above;
        pitches[i + 1] = target - 1;
        continue;
      }
    }
    if (left === 1) {
      pitches[i] = approach(
        spot,
        before,
        target,
        room,
        short && draw.chance(solo.habits.chromatic),
      );
      continue;
    }

    // Walk: a rung or two from the last note, toward where the contour is, never out of
    // stepping distance of the landing.
    const ideal = ask.contour(through(i));
    const at = rung(spot.pool, before);
    const goal = rung(spot.pool, target);
    let best = before;
    let least = Number.POSITIVE_INFINITY;
    for (let move = -3; move <= 3; move++) {
      const pitch = spot.pool.ladder[at + move];
      if (pitch === undefined || pitch === before || !inWindow(pitch)) continue;
      const far = Math.abs(at + move - goal) - left;
      const size = Math.abs(pitch - before);
      const halfStep = size === 1;
      const turns = Math.sign(pitch - before) === -Math.sign(before - (pitches[i - 2] ?? before));
      const cost =
        // Near the contour is near enough; and a line keeps going the way it is going until
        // the contour pulls it back, so a busy bar is a run and not a flutter (SO-24).
        Math.max(0, Math.abs(pitch - ideal) - 1.5) +
        (turns ? 1.2 : 0) +
        // A step of the scale is a whole step or a minor third; wider is a skip.
        (size <= 3 ? 0 : size <= 5 ? 1.5 : 3) +
        (far > 0 ? far * 10 : 0) +
        (pitch === target ? 2 : 0) +
        // A half step is a way into a chord tone (the blue third up to the third, the
        // fourth down to it); onto anything else, or two in a row, it is a crawl.
        (halfStep && !isChordTone(spot.pool, pitch) ? 2 : 0) +
        (halfStep && Math.abs(before - (pitches[i - 2] ?? before)) === 1 ? 4 : 0) +
        // On a beat a chord tone beats a passing tone a step and a half nearer (SO-25).
        (onBeat(spot) && !isChordTone(spot.pool, pitch) ? 1.5 : 0) +
        (long(spot) && rubs(spot.pool, pitch) ? 3 : 0) +
        (wrong(spot, pitch) ? 1000 : 0) +
        // Coming back to a note just played is a turn the first time and circling after
        // that; a-b-a-b is a trill (SO-49).
        1.5 * [2, 3, 4, 5].filter((back) => pitches[i - back] === pitch).length +
        (pitch === pitches[i - 2] && before === pitches[i - 3] ? 4 : 0);
      if (cost < least) {
        least = cost;
        best = pitch;
      }
    }
    pitches[i] = best;
  }
  return pitches as number[];
}

/**
 * The note before a landing (SO-26): the half step under it when the habit
 * says so, else the rung beside it on the side the line comes from; a long
 * approach that would rub steps in from a chord tone instead.
 */
function approach(
  spot: Spot,
  before: number,
  target: number,
  ask: LineAsk,
  chromatic: boolean,
): number {
  const { pool } = spot;
  if (
    chromatic &&
    Math.abs(before - (target - 1)) <= 4 &&
    target - 1 >= ask.low &&
    before !== target - 1
  ) {
    return target - 1;
  }
  const below = pool.ladder.findLast((pitch) => pitch < target);
  const above = pool.ladder.find((pitch) => pitch > target);
  const sides = (before <= target ? [below, above] : [above, below]).filter(
    (pitch): pitch is number => pitch !== undefined && pitch >= ask.low && pitch <= ask.high,
  );
  const allowed = (pitch: number) => !(long(spot) && rubs(pool, pitch)) && !wrong(spot, pitch);
  const clean = sides.filter((pitch) => pitch !== before && allowed(pitch));
  if (clean.length > 0) return clean[0]!;
  // Nothing beside it will do: the nearest note that would, from the line's side if it can.
  const side = before <= target ? -1 : 1;
  const others = pool.ladder
    .filter(
      (pitch) =>
        pitch >= ask.low &&
        pitch <= ask.high &&
        pitch !== target &&
        pitch !== before &&
        allowed(pitch),
    )
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
  return (
    others.find((pitch) => Math.sign(pitch - target) === side) ?? others[0] ?? sides[0] ?? before
  );
}
