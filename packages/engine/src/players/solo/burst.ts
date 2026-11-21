// Double time: a phrase that runs for part of its length at twice the style's running
// subdivision, then lands. It is made from a phrase already written (the phrase it doubles):
// the notes from a pulse to the held note an end bar lands on are taken out, and in their
// place a run goes one way through the style's notes, a chord tone on every pulse, into a
// chord tone on that pulse. The rest of the phrase is as it was. The run is offered beside
// the phrase it doubles, and the critic judges both.

import { unswing } from "../../perform/feel.ts";
import { onPulse, pulseTicks } from "../../perform/meter.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { Rng } from "../../rng.ts";
import type { ToneRole } from "../../theory/chord.ts";
import { doubledIn, heardIn } from "./critique.ts";
import { isChordTone, landing, leads } from "./harmony.ts";
import type { Spot } from "./line.ts";
import type { Phrase, Placed } from "./phrases.ts";
import type { World } from "./slots.ts";

/** What a run in double time is asked to be in a phrase. */
export interface BurstAsk {
  /** Its longest, in bars: the style's, or a ballad's. */
  readonly longest: number;
  /** Where the phrase comes to rest, best first: for a run that lands on its last note. */
  readonly ending: readonly ToneRole[];
}

/** The notes a run may be made of on a spot: a chord tone on a pulse or where a chord arrives. */
function allowed(spot: Spot, pitch: number): boolean {
  const { pool } = spot;
  // The bebop scale's note from outside the chord's scale leads to the note a half step on,
  // which a run that skips to a chord tone does not always play: it is left out.
  if (pool.leading.has(((pitch % 12) + 12) % 12)) return false;
  const lands = spot.lands || onPulse(spot.bar.meter, spot.tick - spot.bar.start);
  return !lands || isChordTone(pool, pitch);
}

/** The next note a run may take from a pitch, one way, on a spot: the nearest rung that will do. */
function onward(spot: Spot, from: number, way: 1 | -1): number | undefined {
  const ladder = spot.pool.ladder;
  const rungs = way > 0 ? ladder.filter((p) => p > from) : ladder.filter((p) => p < from).reverse();
  return rungs.find((pitch) => allowed(spot, pitch));
}

/**
 * The phrase with a run in double time in it, or null where none will go: no end bar landing
 * on a held note on a pulse with line before it, a bar under N.C., a run that would leave the
 * phrase's register before it has lasted half a bar, or one quicker than the instrument plays.
 */
export function burstOf(world: World, phrase: Phrase, ask: BurstAsk, rng: Rng): Phrase | null {
  const { slot } = phrase;
  const first = slot.bars[0]!;
  const { meter } = first;
  if (slot.bars.some((bar) => bar.ticks !== first.ticks)) return null;
  const perPulse = doubledIn(world.solo, meter);
  if (perPulse === null) return null;
  const pulse = pulseTicks(meter)[0]!;
  // Never quicker than the instrument plays: not squeezed, not thinned, not offered.
  if ((perPulse * world.ticksPerSecond) / pulse > world.instrument.fastest + 1e-9) return null;
  const step = pulse / perPulse;
  const pulses = first.ticks / pulse;
  const shortest = Math.ceil(world.solo.doubleTime.bars.shortest * pulses);
  const longest = Math.floor(ask.longest * pulses);
  if (longest < shortest) return null;

  const line = phrase.line;
  const partOf = (bar: PlanBar) => phrase.bars[slot.bars.indexOf(bar)]?.part;
  // Where it may land: the held note an end bar lands on, on a pulse, held a pulse or more.
  const landings = line
    .map((note, i) => ({ note, i }))
    .filter(({ note, i }) => {
      const { spot } = note;
      const next = line[i + 1];
      return (
        i > 0 &&
        !note.lead &&
        partOf(spot.bar) === "E" &&
        (next === undefined || next.spot.bar !== spot.bar) &&
        onPulse(meter, spot.tick - spot.bar.start) &&
        spot.hold >= pulse
      );
    })
    .reverse();
  if (landings.length === 0) return null;

  const draw = rng.fork("double time");
  // A length drawn from those the style allows, then each shorter one; the way drawn, then
  // the other. The climb goes up, to the top note.
  const drawn = shortest + draw.fork("length").int(longest - shortest + 1);
  const ways: (1 | -1)[] = slot.peak ? [1] : draw.fork("way").chance(0.5) ? [1, -1] : [-1, 1];

  for (const { note: lands, i: at } of landings) {
    for (let k = drawn; k >= shortest; k--) {
      for (const way of ways) {
        const made = run(world, phrase, lands, at, k * pulse, step, way, ask);
        if (made) return made;
      }
    }
  }
  return null;
}

/** The run of `span` ticks into the note at `at`, one way, or null where it will not go. */
function run(
  world: World,
  phrase: Phrase,
  lands: Placed,
  at: number,
  span: number,
  step: number,
  way: 1 | -1,
  ask: BurstAsk,
): Phrase | null {
  const { slot } = phrase;
  const line = phrase.line;
  const to = lands.spot.tick;
  const from = to - span;
  if (from <= slot.bars[0]!.start) return null;
  // Every bar it runs through carries the line.
  const covered = slot.bars.filter((bar) => bar.start < to && bar.start + bar.ticks > from);
  const parts = covered.map((bar) => phrase.bars[slot.bars.indexOf(bar)]?.part);
  if (parts.some((part) => part !== "L" && part !== "E")) return null;
  // Straight out of the line's own notes: one struck in the pulse before it, and heard far
  // enough before the run's first note that the run is heard to start on its pulse.
  const before = line.findLast((note) => note.spot.tick < from);
  if (!before || before.lead || before.spot.tick < from - pulseTicks(before.spot.bar.meter)[0]!) {
    return null;
  }
  // A note from outside the chord's scale was on its way to the note a half step on, which
  // the run takes the place of: it is not left hanging.
  if (leads(before.spot.pool, before.pitch)) return null;
  const heard = (spot: Spot) => spot.bar.start + heardIn(spot.bar, spot.tick, world.feel);
  if (from - heard(before.spot) <= 1.5 * step) return null;
  if (line.some((note, i) => i < at && note.spot.tick >= from && note.lead)) return null;

  // Its spots, even as heard: a pulse is where it is written, swung or not.
  const count = Math.round(span / step);
  const struck = Array.from({ length: count }, (_, j) => {
    const heard = from + j * step;
    const bar = slot.bars.findLast((one) => one.start <= heard)!;
    const within = heard - bar.start;
    const tick =
      bar.start + Math.round(bar.meter.unit === 4 ? unswing(within, world.feel) : within);
    return { bar, tick };
  });
  const placed: Spot[] = [];
  for (const [j, { bar, tick }] of struck.entries()) {
    const hold = (struck[j + 1]?.tick ?? to) - tick;
    const { pool, leans } = world.poolFor(tick, hold);
    if (!pool) return null;
    const arrives = world.arrivalAt(tick)?.tick === tick;
    placed.push({ bar, tick, hold, onset: j, pool, lands: leans || arrives });
  }

  // The phrase's own register (SO-12): never over its ceiling, which keeps every phrase but
  // the climb clear of the top note (SO-07), nor under its floor, which keeps a run out of
  // the comp's hand: let down under it, a run in rock had the piano's voices at or over its
  // note in 9% of the piano's strikes under it, against 1% under the line anywhere else.
  const { low, high } = slot;
  const leap = slot.peak ? 17 : 12;
  const inside = (pitch: number) => pitch >= low && pitch <= high;
  const ranks = at === line.length - 1 ? ask.ending : world.solo.arrive;
  const { perRank } = world.solo.landing;
  /** The run walked back from the note it lands on, a rung at a time, the other way. */
  const back = (into: number): number[] | null => {
    const pitches: number[] = [];
    let cur = into;
    for (let j = placed.length - 1; j >= 0; j--) {
      const next = onward(placed[j]!, cur, way > 0 ? -1 : 1);
      if (next === undefined || !inside(next)) return null;
      pitches.unshift(next);
      cur = next;
    }
    // Come to from the line's last note by no more than an octave (on the way to the top
    // note, an octave and a fourth: down, to run up from there), and not on its pitch.
    const start = pitches[0]!;
    return Math.abs(start - before.pitch) > leap || start === before.pitch ? null : pitches;
  };
  /** The run on from the line's last note, a rung at a time, the way it goes. */
  const on = (): number[] | null => {
    const pitches: number[] = [];
    let cur = before.pitch;
    for (const spot of placed) {
      const next = onward(spot, cur, way);
      if (next === undefined || !inside(next)) return null;
      pitches.push(next);
      cur = next;
    }
    return pitches;
  };
  /** A tone of the landing's chord in a window, the best the style's ranking gives (SO-21). */
  const landIn = (ideal: number, lo: number, hi: number): number | null => {
    if (lo > hi) return null;
    const pitch = landing(lands.spot.pool, ideal, ranks, perRank, lo, hi);
    return pitch >= lo && pitch <= hi && isChordTone(lands.spot.pool, pitch) ? pitch : null;
  };

  /**
   * The run as a sequence, where the register will not carry it straight: each pulse's notes
   * a run from a chord tone, all of them the way the whole goes (`inner` the same as `way`) or
   * all the other way (a rising sequence of falling fours), each pulse starting on the chord
   * tone after the one the pulse before started on (KF-B-11's sequence, a pulse long), so that
   * the whole goes one way in a narrower room.
   */
  const sequence = (start: number, inner: 1 | -1): number[] | null => {
    const pitches: number[] = [];
    let cur = start;
    let opened = start;
    for (const [j, spot] of placed.entries()) {
      let next: number | undefined = cur;
      if (j > 0) {
        const pulse = onPulse(spot.bar.meter, spot.tick - spot.bar.start);
        next = pulse ? onward(spot, opened, way) : onward(spot, cur, inner);
        if (pulse && next !== undefined) opened = next;
      }
      if (next === undefined || !inside(next) || !allowed(spot, next)) return null;
      pitches.push(next);
      cur = next;
    }
    return pitches;
  };
  /**
   * Where a run lands: a tone of the chord a step or two on from the furthest it went, the way
   * it goes (for a straight run or a sequence of runs the way it goes, its last note; for a
   * sequence of runs the other way, the note its last pulse started on).
   */
  const onFrom = (run: readonly number[] | null): number | null => {
    if (run === null || run.length === 0) return null;
    const far = way > 0 ? Math.max(...run) : Math.min(...run);
    return way > 0
      ? landIn(far + 2, far + 1, Math.min(high, far + 5))
      : landIn(far - 2, Math.max(low, far - 5), far - 1);
  };
  const inners: readonly (1 | -1)[] = [way, way > 0 ? -1 : 1];

  let pitches: number[] | null = null;
  let landed: number | null = lands.pitch;
  if (slot.peak) {
    // Up to the top note, walked back down from it; or a sequence up to it, from the chord
    // tone nearest the line's last note that brings it a step or two under the top.
    pitches = back(lands.pitch);
    const starts = placed[0]!.pool.ladder
      .filter((pitch) => allowed(placed[0]!, pitch) && pitch !== before.pitch)
      .filter((pitch) => Math.abs(pitch - before.pitch) <= leap && inside(pitch))
      .sort((a, b) => Math.abs(a - before.pitch) - Math.abs(b - before.pitch));
    for (const inner of inners) {
      for (const start of pitches === null ? starts : []) {
        const run = sequence(start, inner);
        const far = run && Math.max(...run);
        if (run && far !== null && far < lands.pitch && lands.pitch - far <= 5) {
          pitches = run;
          break;
        }
      }
    }
  } else {
    // On from the line's last note, into a chord tone a step or two on the way it was going.
    pitches = on();
    landed = onFrom(pitches);
    if (pitches === null || landed === null) {
      // Or, where the register will not carry it that far, from where it can start: it
      // lands at the edge of the phrase's register the way it goes, and starts an octave
      // at most from the line's last note.
      landed = way > 0 ? landIn(high, high - 4, high) : landIn(low, low, low + 4);
      pitches = landed === null ? null : back(landed);
    }
    for (const inner of inners) {
      if (pitches !== null && landed !== null) break;
      // Or as a sequence on from the line's last note.
      const start = onward(placed[0]!, before.pitch, way);
      pitches = start === undefined ? null : sequence(start, inner);
      landed = onFrom(pitches);
    }
  }
  if (pitches === null || landed === null) return null;

  const burst: Placed[] = placed.map((spot, j) => ({ spot, pitch: pitches[j]!, burst: true }));
  const { bend: _, ...plainLanding } = lands;
  const landing_: Placed = landed === lands.pitch ? lands : { ...plainLanding, pitch: landed };
  const kept = line.filter((note, i) => i !== at && (note.spot.tick < from || note.spot.tick > to));
  const after = kept.filter((note) => note.spot.tick > to);
  return {
    ...phrase,
    kind: `${phrase.kind}, in double time`,
    line: [...kept.filter((note) => note.spot.tick < from), ...burst, landing_, ...after],
    plain: phrase,
    burst: { from, lands: to },
  };
}
