// Where the soloist plays, read from the plan alone: its solos, their
// choruses, and the phrase slots in them, each with what the arc asks of it
// (how busy, how high). Nothing here is drawn by chance, so the critic can
// read a finished take the same way the soloist read the plan.

import { PPQ } from "../../chart/types.ts";
import type { Arrival } from "../../perform/harmony.ts";
import { arrivals } from "../../perform/harmony.ts";
import type { Plan, PlanBar } from "../../plan/types.ts";
import type { FeelStyle, StylePack } from "../../style/types.ts";
import { tierOf } from "../../style/types.ts";
import type { Pool } from "./harmony.ts";
import { EIGHTH, poolOf } from "./harmony.ts";
import { SOLO_INSTRUMENTS } from "./instruments.ts";
import type { Density, SoloInstrument, SoloStyle } from "./style.ts";

/** One phrase of a solo: the bars of the form's phrase that the soloist has. */
export interface Slot {
  readonly bars: readonly PlanBar[];
  /** Which solo of the take this is, from 0. */
  readonly solo: number;
  readonly chorus: number;
  /** How many choruses the solo has. */
  readonly of: number;
  /** Which phrase of its chorus, from 0, and how many the chorus has. */
  readonly index: number;
  readonly count: number;
  /** The first phrase of the solo. */
  readonly first: boolean;
  /** The phrase that goes up to the solo's top note: in the blues, the one before the last (SO-05). */
  readonly peak: boolean;
  /** The last phrase of the solo, which winds down. */
  readonly last: boolean;
  /** How busy the arc, the band's energy and the tempo ask it to be. */
  readonly level: Density;
  /** The pitch the phrase sits around, and the lowest and highest it may reach (SO-12). */
  readonly centre: number;
  readonly low: number;
  readonly high: number;
  /** The solo's one top note may be this high and no higher (SO-07). */
  readonly top: number;
}

/** Everything about a take that the soloist, and anyone reading its solo, works from. */
export interface World {
  readonly plan: Plan;
  readonly solo: SoloStyle;
  readonly feel: FeelStyle;
  readonly instrument: SoloInstrument;
  readonly harmony: readonly Arrival[];
  readonly slots: readonly Slot[];
  readonly ticksPerSecond: number;
  /** The pitch class the bass struck at a tick, where it struck one. */
  readonly bass: ReadonlyMap<number, number>;
  /** The chord's arrival at a tick, and its notes. Null under N.C. */
  arrivalAt(tick: number): Arrival | undefined;
  poolOf(arrival: Arrival | undefined): Pool | null;
  /**
   * The notes for a note struck at a tick and held for a while. A note struck
   * within an eighth before a change and still sounding over it belongs to
   * the new chord (X-B-07); `leans` says so.
   */
  poolFor(tick: number, hold: number): { readonly pool: Pool | null; readonly leans: boolean };
}

export function worldOf(
  plan: Plan,
  style: StylePack,
  bass: ReadonlyMap<number, number>,
  instrumentName?: string,
): World {
  const solo = style.solo;
  const instrument =
    SOLO_INSTRUMENTS[instrumentName ?? solo.instrument] ?? Object.values(SOLO_INSTRUMENTS)[0]!;
  const harmony = arrivals(plan);
  const pools = new Map<number, Pool | null>();
  const poolOfArrival = (arrival: Arrival | undefined): Pool | null => {
    if (!arrival) return null;
    if (!pools.has(arrival.index)) {
      pools.set(arrival.index, poolOf(arrival, harmony, solo, instrument));
    }
    return pools.get(arrival.index) ?? null;
  };
  const arrivalAt = (tick: number): Arrival | undefined => {
    let low = 0;
    let high = harmony.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (harmony[middle]!.tick <= tick) low = middle;
      else high = middle - 1;
    }
    const found = harmony[low];
    return found && found.tick <= tick ? found : undefined;
  };
  return {
    plan,
    solo,
    feel: style.feel,
    instrument,
    harmony,
    slots: slotsOf(plan, solo, instrument),
    ticksPerSecond: (plan.tempo * PPQ) / 60,
    bass,
    arrivalAt,
    poolOf: poolOfArrival,
    poolFor(tick, hold) {
      const here = arrivalAt(tick);
      const next = here && harmony[here.index + 1];
      // A note struck where a chord arrives is that chord's, however soon the next one comes.
      const leans =
        next !== undefined &&
        here?.tick !== tick &&
        next.changed &&
        next.chord !== null &&
        next.tick - tick <= EIGHTH &&
        tick + hold > next.tick;
      // Nothing is struck under N.C., whatever is coming (X-B-18).
      if (!here?.chord) return { pool: null, leans: false };
      return { pool: poolOfArrival(leans ? next : here), leans };
    },
  };
}

/** The slots of every solo in the plan, in the order they are played. */
function slotsOf(plan: Plan, solo: SoloStyle, instrument: SoloInstrument): Slot[] {
  // Phrases first, then the choruses they belong to.
  const phrases: PlanBar[][] = [];
  let place = "";
  for (const bar of plan.bars) {
    if (bar.kind !== "music" || bar.solo === null || bar.seats.solo === null) {
      place = "";
      continue;
    }
    const here = `${bar.section.occurrence}/${bar.phrase.index}/${bar.solo.chorus}`;
    if (here !== place) phrases.push([]);
    place = here;
    phrases.at(-1)!.push(bar);
  }

  const levels = solo.levels;
  const levelNamed = (name: string) =>
    Math.max(
      0,
      levels.findIndex((level) => level.name === name),
    );
  const barSeconds = (bar: PlanBar) => (bar.ticks / PPQ) * (60 / plan.tempo);
  const home = instrument.home + solo.lift;
  const top = Math.min(instrument.range[1] - 1, home + solo.arc.peak.above);

  // Phrases in a row under the same chorus mark are one chorus.
  const continues = (i: number): boolean => {
    const [before, here] = [phrases[i - 1], phrases[i]];
    const [last, first] = [before?.at(-1), here?.[0]];
    return (
      last !== undefined &&
      first !== undefined &&
      last.index === first.index - 1 &&
      last.solo?.chorus === first.solo?.chorus
    );
  };
  const chorusOf: number[] = [];
  phrases.forEach((_, i) => {
    chorusOf.push(continues(i) ? chorusOf[i - 1]! : (chorusOf[i - 1] ?? -1) + 1);
  });

  const slots: Slot[] = [];
  let soloIndex = -1;
  phrases.forEach((bars, i) => {
    const mark = bars[0]!.solo!;
    const index = i - chorusOf.indexOf(chorusOf[i]!);
    const count = chorusOf.filter((chorus) => chorus === chorusOf[i]).length;
    // A solo is its choruses in a row; a chorus that starts the count again is a new solo.
    if (index === 0 && (mark.chorus === 0 || soloIndex < 0)) soloIndex++;
    const lastChorus = mark.chorus === mark.of - 1;
    const peak = lastChorus && index === Math.max(0, count - 1 - solo.arc.peak.fromEnd);
    const last = lastChorus && count > 1 && index === count - 1;

    const stages = solo.arc.stages;
    const through = (mark.chorus + index / count) / mark.of;
    const stage = last
      ? solo.arc.windDown
      : stages[Math.min(stages.length - 1, Math.floor(through * stages.length))]!;
    // The band's energy and the tempo each move the density a step, a step in all; the
    // peak is never made sparser (SO-06). Energy does not move the register.
    const tier = tierOf(bars[0]!.seats.solo ?? bars[0]!.energy);
    const seconds = barSeconds(bars[0]!);
    // However hot the band, a solo opens with room: its first stage is not made busier.
    const opening = stage === stages[0] && !peak;
    const byEnergy = tier === "low" ? -1 : tier === "high" && !opening ? 1 : 0;
    const byTempo = seconds > solo.tempo.slowBar ? 1 : seconds < solo.tempo.fastBar ? -1 : 0;
    const shift = Math.max(-1, Math.min(1, byEnergy + byTempo));
    const base = levelNamed(peak ? solo.arc.peak.density : stage.density);
    const level =
      levels[Math.max(0, Math.min(levels.length - 1, base + (peak ? Math.max(0, shift) : shift)))]!;

    const centre = home + stage.register;
    const high = peak ? top : Math.min(top - solo.arc.peak.clear, centre + level.span / 2 + 3);
    const low = Math.max(instrument.range[0], Math.min(centre - level.span / 2 - 3, high - 12));
    slots.push({
      bars,
      solo: soloIndex,
      chorus: mark.chorus,
      of: mark.of,
      index,
      count,
      first: mark.chorus === 0 && index === 0,
      peak,
      last,
      level,
      centre,
      low: Math.round(low),
      high: Math.round(high),
      top,
    });
  });
  return slots;
}
