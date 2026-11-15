// What a pianist would say about comping under a soloist: does the hand keep
// off the soloist's note and out of its register, does it get out of the way
// of the line and come back in the holes (CH-62, CH-72, Q-16)?
//
// Everything here counts only where the soloist has the lead, in the bars the
// piano comps. Bars of the pump are left out: a groove does not react to the
// soloist by design (ST-blues-33), and counted in, its eight strikes a bar
// would swamp the conversation being measured.
//
// The soloist's line is read on the straight grid. A breath is the comper's
// own definition (CH-71: a dotted quarter of silence, across a barline, a bar
// sat out straight after playing counted in, a longer rest not), applied here
// to the whole take, so that a comp deaf to the soloist is measured on exactly
// the same breaths as one that listens.

import { STEP } from "../../perform/grid.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { Breath, LineNote } from "../../players/chords/line.ts";
import { breathsOf, soundsAt } from "../../players/chords/line.ts";
import { MUTED } from "../../players/chords/strike.ts";
import { tierOf } from "../../style/types.ts";
import type { Take } from "../../take.ts";
import { mean, notesOf, share } from "../read.ts";
import type { Measure, Measurement } from "../types.ts";
import { pumping } from "./comping.ts";

/** CH-71: a dotted quarter, in sixteenths. */
const BREATH = 6;
/** More than a fourth: the top of the hand leaping. */
const FOURTH = 5;

/** One time the hand comes down under a solo. */
interface Hit {
  readonly bar: number;
  readonly tick: number;
  readonly ends: number;
  readonly pitches: readonly number[];
  /** As played, after the band's energy. */
  readonly velocity: number;
}

interface Reading {
  /** The bars the piano comps in while the soloist has the lead, the pump left out. */
  readonly bars: ReadonlySet<number>;
  /** The soloist's notes, in order. */
  readonly line: readonly LineNote[];
  /** The soloist's notes that start in those bars. */
  readonly heard: readonly LineNote[];
  /** The piano's strikes in those bars, in order. */
  readonly hits: readonly Hit[];
  /** The breaths that become breaths in those bars. */
  readonly breaths: readonly Breath[];
}

const readings = new WeakMap<Take, Reading | null>();

function read(take: Take): Reading | null {
  if (readings.has(take)) return readings.get(take) ?? null;
  const all = take.plan.bars;
  const pumped = pumping(take);
  const bars = new Set(
    all
      .filter(
        (bar) =>
          bar.solo !== null &&
          bar.kind === "music" &&
          bar.seats.chords !== null &&
          !bar.ending &&
          bar.meter.beats === 4 &&
          bar.meter.unit === 4 &&
          !pumped.has(bar.index),
      )
      .map((bar) => bar.index),
  );
  const barOf = (tick: number) => all.findLast((bar: PlanBar) => bar.start <= tick)?.index ?? -1;
  const line = notesOf(take, "solo")
    .map((note) => ({ tick: note.tick, ends: note.tick + note.duration, pitch: note.pitch }))
    .sort((a, b) => a.tick - b.tick);
  let reading: Reading | null = null;
  if (bars.size > 0 && line.length > 0) {
    const byTick = new Map<number, { ends: number; pitches: number[]; velocity: number }>();
    for (const note of notesOf(take, "chords")) {
      // A deadened stroke is rhythm, not a chord: it is not a strike (CH-28).
      if (note.voice === MUTED) continue;
      const hit = byTick.get(note.tick) ?? { ends: 0, pitches: [], velocity: 0 };
      hit.ends = Math.max(hit.ends, note.tick + note.duration);
      hit.pitches.push(note.pitch);
      hit.velocity = Math.max(hit.velocity, note.velocity);
      byTick.set(note.tick, hit);
    }
    const hits = [...byTick]
      .map(([tick, hit]) => ({
        bar: barOf(tick),
        tick,
        ...hit,
        pitches: hit.pitches.sort((a, b) => a - b),
      }))
      .filter((hit) => bars.has(hit.bar))
      .sort((a, b) => a.tick - b.tick);
    const end = take.plan.ticks;
    const breaths = breathsOf(all, line, BREATH * STEP, end).filter((breath) =>
      bars.has(barOf(breath.from + BREATH * STEP - 1)),
    );
    const heard = line.filter((note) => bars.has(barOf(note.tick)));
    reading = { bars, line, heard, hits, breaths };
  }
  readings.set(take, reading);
  return reading;
}

const under = (reading: Reading, hit: Hit) => reading.line.some((note) => soundsAt(note, hit.tick));
const inBreath = (breath: Breath, tick: number) => breath.from <= tick && tick < breath.to;
const hitsIn = (reading: Reading, breath: Breath) =>
  reading.hits.filter((hit) => inBreath(breath, hit.tick));

/** Ticks of a span that fall in the measured bars. */
function measuredTicks(take: Take, reading: Reading, from: number, to: number): number {
  let ticks = 0;
  for (const index of reading.bars) {
    const bar = take.plan.bars[index]!;
    ticks += Math.max(0, Math.min(to, bar.start + bar.ticks) - Math.max(from, bar.start));
  }
  return ticks;
}

/** Sixteenths the line sounds in the measured bars: the time under the line. */
function lineSixteenths(take: Take, reading: Reading): number {
  let ticks = 0;
  let reached = -Infinity;
  for (const note of reading.line) {
    const from = Math.max(note.tick, reached);
    if (note.ends > from) ticks += measuredTicks(take, reading, from, note.ends);
    reached = Math.max(reached, note.ends);
  }
  return ticks / STEP;
}

function breathSixteenths(take: Take, reading: Reading): number {
  return (
    reading.breaths.reduce(
      (sum, breath) => sum + measuredTicks(take, reading, breath.from, breath.to),
      0,
    ) / STEP
  );
}

/** Strikes per sixteenth under the line and in the breaths, with their counts. */
function densities(take: Take): { line: Measurement; breaths: Measurement } | null {
  const reading = read(take);
  if (!reading) return null;
  const lineTime = lineSixteenths(take, reading);
  const breathTime = breathSixteenths(take, reading);
  const underLine = reading.hits.filter((hit) => under(reading, hit)).length;
  const inBreaths = reading.hits.filter((hit) =>
    reading.breaths.some((breath) => inBreath(breath, hit.tick)),
  ).length;
  if (lineTime === 0 || breathTime === 0) return null;
  return {
    line: { value: underLine / lineTime, cases: underLine },
    breaths: { value: inBreaths / breathTime, cases: reading.breaths.length },
  };
}

export const conversationMeasures: readonly Measure[] = [
  {
    id: "chords.on-the-soloists-note",
    seat: "chords",
    says: "While the soloist sounds over the piano, the piano is seldom on the soloist's very note: the line keeps its own pitch (an octave apart is not counted).",
    unit: "share",
    of(take) {
      const reading = read(take);
      if (!reading) return null;
      let over = 0;
      let on = 0;
      let notes = 0;
      for (const note of reading.heard) {
        let here = 0;
        for (const hit of reading.hits) {
          if (hit.tick >= note.ends) break;
          const ticks = Math.min(note.ends, hit.ends) - Math.max(note.tick, hit.tick);
          if (ticks <= 0) continue;
          here += ticks;
          if (hit.pitches.includes(note.pitch)) on += ticks;
        }
        if (here > 0) notes++;
        over += here;
      }
      return over === 0 ? null : { value: on / over, cases: notes };
    },
  },
  {
    id: "chords.in-the-soloists-register",
    seat: "chords",
    says: "Of the piano's notes that sound under the line, few are at or above the lowest note the soloist is sounding: the soloist has the top of the band to itself.",
    unit: "share",
    of(take) {
      const reading = read(take);
      if (!reading) return null;
      let notes = 0;
      let above = 0;
      for (const hit of reading.hits) {
        const over = reading.line.filter((note) => note.tick < hit.ends && note.ends > hit.tick);
        if (over.length === 0) continue;
        const lowest = Math.min(...over.map((note) => note.pitch));
        notes += hit.pitches.length;
        above += hit.pitches.filter((pitch) => pitch >= lowest).length;
      }
      return share(above, notes);
    },
  },
  {
    id: "chords.overlap",
    seat: "chords",
    says: "Fewer of the piano's strikes come down while the soloist is sounding a note than would if the piano were deaf to the line: it gets out of the way.",
    unit: "share",
    of(take) {
      const reading = read(take);
      if (!reading) return null;
      return share(reading.hits.filter((hit) => under(reading, hit)).length, reading.hits.length);
    },
  },
  {
    id: "chords.overlap-over-chance",
    seat: "chords",
    says: "The share of the piano's strikes under a sounding note, less the share of the time the line sounds: below zero the piano comes down in the holes more than a hand placed at random would, above it, it talks over the line.",
    unit: "share",
    of(take) {
      // The overlap alone mostly says how busy the line is (ME-18): a line sounding four
      // fifths of the time catches four strikes in five dropped anywhere.
      const reading = read(take);
      if (!reading || reading.hits.length === 0) return null;
      const underLine = reading.hits.filter((hit) => under(reading, hit)).length;
      let ticks = 0;
      for (const index of reading.bars) ticks += take.plan.bars[index]!.ticks;
      const chance = (lineSixteenths(take, reading) * STEP) / ticks;
      return { value: underLine / reading.hits.length - chance, cases: reading.hits.length };
    },
  },
  {
    id: "chords.struck-with-the-soloist",
    seat: "chords",
    says: "Few of the soloist's notes have the piano struck on the very same tick: the two are not talking at once.",
    unit: "share",
    of(take) {
      const reading = read(take);
      if (!reading) return null;
      const ticks = new Set(reading.hits.map((hit) => hit.tick));
      return share(
        reading.heard.filter((note) => ticks.has(note.tick)).length,
        reading.heard.length,
      );
    },
  },
  {
    id: "chords.strikes-under-the-line",
    // A comp that converses: a groove keeps its figure and is not measured by this.
    idiom: true,
    seat: "chords",
    says: "Strikes per sixteenth while the soloist is sounding a note: under the line the piano is sparse.",
    unit: "ratio",
    of: (take) => densities(take)?.line ?? null,
  },
  {
    id: "chords.strikes-in-breaths",
    // A comp that converses: a groove keeps its figure and is not measured by this.
    idiom: true,
    seat: "chords",
    says: "Strikes per sixteenth in the soloist's breaths: where the line stops, the piano speaks.",
    unit: "ratio",
    of: (take) => densities(take)?.breaths ?? null,
  },
  {
    id: "chords.breaths-over-the-line",
    seat: "chords",
    says: "The piano is busier in the soloist's breaths than under its line, by this ratio of strikes per sixteenth: it answers rather than talking over.",
    unit: "ratio",
    of(take) {
      const both = densities(take);
      if (!both || both.line.value === 0) return null;
      return { value: both.breaths.value / both.line.value, cases: both.breaths.cases };
    },
  },
  {
    id: "chords.breaths-answered",
    // A comp that converses: a groove keeps its figure and is not measured by this.
    idiom: true,
    seat: "chords",
    says: "Most of the soloist's breaths have something from the piano in them, but not all: an answer, not a reflex.",
    unit: "share",
    of(take) {
      const reading = read(take);
      if (!reading) return null;
      const held = reading.breaths.filter((breath) => hitsIn(reading, breath).length > 0);
      return share(held.length, reading.breaths.length);
    },
  },
  {
    id: "chords.answers-louder",
    // A comp that converses: a groove keeps its figure and is not measured by this.
    idiom: true,
    seat: "chords",
    says: "What the piano plays in the soloist's breaths is a little louder than what it plays under the line, in velocity steps as played.",
    unit: "velocity",
    of(take) {
      const reading = read(take);
      if (!reading) return null;
      const inBreaths = reading.hits.filter((hit) =>
        reading.breaths.some((breath) => inBreath(breath, hit.tick)),
      );
      const underLine = reading.hits.filter((hit) => under(reading, hit));
      const a = mean(inBreaths.map((hit) => hit.velocity));
      const b = mean(underLine.map((hit) => hit.velocity));
      if (!a || !b) return null;
      return { value: a.value - b.value, cases: inBreaths.length };
    },
  },
  {
    id: "chords.thin-bars-under-the-solo",
    // A comp that converses: a groove keeps its figure and is not measured by this.
    idiom: true,
    seat: "chords",
    says: "Under a solo few bars have one strike or none: the piano gets out of the line's way and still keeps the time (CH-70, Q-15).",
    unit: "share",
    of(take) {
      const reading = read(take);
      if (!reading) return null;
      const perBar = new Map<number, number>();
      for (const hit of reading.hits) perBar.set(hit.bar, (perBar.get(hit.bar) ?? 0) + 1);
      const bars = [...reading.bars];
      return share(bars.filter((bar) => (perBar.get(bar) ?? 0) <= 1).length, bars.length);
    },
  },
  {
    id: "chords.top-leaps-under-the-solo",
    seat: "chords",
    says: "Under a solo the top of the piano's chord seldom jumps more than a fourth from one strike to the next: the hand does not flip an octave to get out of the way. Counted between strikes of the same size, so a voice left out because the soloist has that note (CH-60) is not the hand moving.",
    unit: "share",
    of(take) {
      const reading = read(take);
      if (!reading) return null;
      let moves = 0;
      let leaps = 0;
      reading.hits.forEach((hit, i) => {
        const before = reading.hits[i - 1];
        // Strike to strike: the one before is in this bar or the last, not across a rest.
        if (!before || hit.bar - before.bar > 1) return;
        if (hit.pitches.length !== before.pitches.length) return;
        moves++;
        if (Math.abs(hit.pitches.at(-1)! - before.pitches.at(-1)!) > FOURTH) leaps++;
      });
      return share(leaps, moves);
    },
  },
  {
    id: "chords.strikes-per-bar-under-a-hot-solo",
    // A comp that converses: a groove keeps its figure and is not measured by this.
    idiom: true,
    seat: "chords",
    says: "When the band is at its loudest under a solo, which is when the soloist is busiest, the piano does not get busier with it: a few strikes a bar, not a hammered groove. The pump is counted here.",
    unit: "per bar",
    of(take) {
      const hot = take.plan.bars.filter(
        (bar) =>
          bar.solo !== null &&
          bar.kind === "music" &&
          bar.seats.chords !== null &&
          !bar.ending &&
          bar.meter.beats === 4 &&
          bar.meter.unit === 4 &&
          tierOf(bar.energy) === "high",
      );
      if (hot.length === 0) return null;
      const bars = new Set(hot.map((bar) => bar.index));
      const all = take.plan.bars;
      const struck = new Set<number>();
      for (const note of notesOf(take, "chords")) {
        if (note.voice === MUTED) continue;
        const bar = all.findLast((candidate) => candidate.start <= note.tick);
        if (bar && bars.has(bar.index)) struck.add(note.tick);
      }
      return { value: struck.size / hot.length, cases: hot.length };
    },
  },
];
