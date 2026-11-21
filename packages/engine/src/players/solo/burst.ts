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
import { doubledIn } from "./critique.ts";
import { isChordTone, landing } from "./harmony.ts";
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
  // Straight out of the line's own notes: one struck in the pulse before it.
  const before = line.findLast((note) => note.spot.tick < from);
  if (!before || before.lead || before.spot.tick < from - pulseTicks(before.spot.bar.meter)[0]!) {
    return null;
  }
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

  // The phrase's register, and under it room for a run to come up from: on the way to the
  // top note, as far as an octave and a half under it; elsewhere a fourth under the phrase's
  // floor. Never over the phrase's ceiling, which keeps every phrase but the climb clear of
  // the top note (SO-07).
  const { high } = slot;
  const floor = world.instrument.range[0];
  const low = Math.max(floor, slot.peak ? slot.top - 19 : slot.low - 5);
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

  let pitches: number[] | null = null;
  let landed: number | null = lands.pitch;
  if (slot.peak) {
    // Up to the top note, walked back down from it.
    pitches = back(lands.pitch);
  } else {
    // On from the line's last note, into a chord tone a step or two on the way it was going.
    pitches = on();
    const last = pitches?.at(-1);
    landed =
      last === undefined
        ? null
        : way > 0
          ? landIn(last + 2, last + 1, Math.min(high, last + 5))
          : landIn(last - 2, Math.max(low, last - 5), last - 1);
    if (pitches === null || landed === null) {
      // Or, where the register will not carry it that far, from where it can start: it
      // lands at the edge of the phrase's register the way it goes, and starts an octave
      // at most from the line's last note.
      landed = way > 0 ? landIn(high, high - 4, high) : landIn(low, low, low + 4);
      pitches = landed === null ? null : back(landed);
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
