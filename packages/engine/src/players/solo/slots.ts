// Where the soloist plays, read from the plan alone: its solos, their
// choruses, and the phrase slots in them, each with what the arc asks of it
// (how busy, how high). Nothing here is drawn by chance, so the critic can
// read a finished take the same way the soloist read the plan.

import type { Meter } from "../../chart/types.ts";
import { PPQ } from "../../chart/types.ts";
import { cells, STEP } from "../../perform/grid.ts";
import type { Arrival } from "../../perform/harmony.ts";
import { arrivals } from "../../perform/harmony.ts";
import { meterName, pulseTicks } from "../../perform/meter.ts";
import type { Plan, PlanBar } from "../../plan/types.ts";
import type { FeelStyle, StylePack } from "../../style/types.ts";
import { tierOf } from "../../style/types.ts";
import { soloTimeIn } from "./derive.ts";
import type { Pool } from "./harmony.ts";
import { EIGHTH, isChordTone, poolOf } from "./harmony.ts";
import { SOLO_INSTRUMENTS } from "./instruments.ts";
import type { Density, SoloInstrument, SoloStyle } from "./style.ts";

/** What a bar of a phrase is: a line bar, an end bar, a rest, or the final note of the take. */
export type Part = "L" | "E" | "R" | "F";

/** A four-bar shape on a phrase of another length: line bars added at the front, or bars cut from it (SO-09). */
export function fitShape(shape: string, length: number): Part[] {
  let letters = cells(shape) as Part[];
  while (letters.length < length) {
    letters = length - letters.length >= 2 ? ["L", "E", ...letters] : ["L", ...letters];
  }
  letters = letters.slice(letters.length - length);
  if (!letters.includes("E")) letters[letters.length - 1] = "E";
  return letters;
}

/**
 * How many line bars in a row a phrase may play before it has to land. A phrase is
 * as long as the style has patience for, in seconds, so at a slow tempo it is fewer
 * bars (KF-B-12); and a horn has to get the line and the bar it lands in out of one
 * breath.
 */
export function lungsOf(
  solo: SoloStyle,
  instrument: SoloInstrument,
  slot: Pick<Slot, "bars">,
  ticksPerSecond: number,
): number {
  const barSeconds = slot.bars[0]!.ticks / ticksPerSecond;
  const patient = Math.floor((solo.space.patience + solo.space.breath) / barSeconds);
  const air = instrument.breath
    ? Math.floor((instrument.breath.lungs + instrument.breath.takes) / barSeconds - 1)
    : slot.bars.length;
  return Math.max(1, Math.min(patient, air));
}

/** A phrase that no shape fits: as many line bars as one breath carries and an end bar, over and over. */
export function breathed(length: number, lungs: number): Part[] {
  const unit = Math.min(lungs, Math.max(1, length - 1)) + 1;
  return Array.from({ length }, (_, i): Part => ((length - 1 - i) % unit === 0 ? "E" : "L"));
}

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
  /** How busy the arc, the band's energy, the tempo and the player's setting ask it to be. */
  readonly level: Density;
  /** The share of its room the soloist gives up here, 0 to 1 (`SoloStyle.busier.room`). */
  readonly room: number;
  /** The level the arc, the band's energy and the tempo ask, before the player's setting lifts it. */
  readonly asked: Density;
  /** The pitch the phrase sits around, and the lowest and highest it may reach (SO-12). */
  readonly centre: number;
  readonly low: number;
  readonly high: number;
  /** The solo's one top note may be this high and no higher (SO-07). */
  readonly top: number;
  /**
   * How far, in ticks, an idea is moved "a pulse" late and early here. In a bar the soloist has
   * rhythms for (written, or made for the meter), late is the bar's first pulse and early its
   * last, so the downbeat goes to a pulse either way; where the line takes the front of a 4/4
   * rhythm, the first pulse both ways.
   */
  readonly displace: { readonly late: number; readonly early: number };
}

/** `Slot.displace` for a phrase in bars of this meter. */
export function displaceOf(solo: SoloStyle, meter: Meter): Slot["displace"] {
  const pulses = pulseTicks(meter);
  const own = soloTimeIn(solo, meter) !== undefined;
  return { late: pulses[0]!, early: own ? pulses.at(-1)! : pulses[0]! };
}

const inMeter = new WeakMap<SoloStyle, Map<string, SoloStyle>>();

/**
 * The soloist's style as it is in a bar of a meter: with what it has written
 * for that meter, or what is made for it, in place of its 4/4 rhythms; as it
 * stands where it has neither.
 */
export function soloIn(solo: SoloStyle, meter: Meter): SoloStyle {
  const written = soloTimeIn(solo, meter);
  if (!written) return solo;
  let known = inMeter.get(solo);
  if (!known) {
    known = new Map();
    inMeter.set(solo, known);
  }
  // By the meter's shape: 7/8 and 7/8 (3+2+2) are kept apart.
  const name = meterName(meter);
  let style = known.get(name);
  if (!style) {
    style = {
      ...solo,
      levels: written.levels,
      endings: written.endings,
      habits: { ...solo.habits, pickup: { ...solo.habits.pickup, figures: written.pickups } },
      arc: { ...solo.arc, peak: { ...solo.arc.peak, ending: written.peak } },
    };
    known.set(name, style);
  }
  return style;
}

/**
 * The most the player's setting at its top asks of any style: levels lifted, and
 * the share of its room given up: every phrase a level busier than its arc asks,
 * and four fifths of its room given up. A style's own is less, so the top of the
 * setting is busier than its middle in every style.
 */
export const MOST_BUSY = { lift: 1, room: 0.8 } as const;

/**
 * How much busier than its arc the soloist plays in a take: the style's own at
 * the middle of the player's setting (or with none set), nothing at its
 * bottom, the engine's most at its top, and in a straight line between.
 */
export function busyOf(plan: Plan, solo: SoloStyle): { lift: number; room: number } {
  const setting = plan.soloDensity ?? 0.5;
  const own = solo.busier;
  if (setting <= 0.5) return { lift: own.lift * (setting / 0.5), room: own.room * (setting / 0.5) };
  const up = (setting - 0.5) / 0.5;
  return {
    lift: own.lift + (MOST_BUSY.lift - own.lift) * up,
    room: own.room + (MOST_BUSY.room - own.room) * up,
  };
}

/**
 * The most the player's setting at its top asks of a style that plays double time at all: the
 * chance a phrase that may take a burst is offered one. A style that never plays it does not
 * at any setting.
 */
export const MOST_DOUBLE = 1;

/**
 * How often a phrase that may take a burst in double time is offered one: the style's own at
 * the middle of the player's setting, none at its bottom, the engine's most at its top (where
 * the style plays it at all), in a straight line between.
 */
export function doubleChanceOf(plan: Plan, solo: SoloStyle): number {
  const setting = plan.soloDensity ?? 0.5;
  const own = solo.doubleTime.chance;
  if (setting <= 0.5 || own <= 0) return own * Math.min(1, setting / 0.5);
  return own + (Math.max(own, MOST_DOUBLE) - own) * ((setting - 0.5) / 0.5);
}

/**
 * A bar's four pulses in seconds: tempo is felt in the pulse, not the bar, so a bar of
 * six-eight is as quick as a bar of four at the same pulse, and a bar of three as slow.
 */
export function fourPulses(plan: Plan, bar: PlanBar): number {
  return ((bar.ticks / PPQ) * (60 / plan.quarters) * 4) / pulseTicks(bar.meter).length;
}

/**
 * Where a phrase stands among the phrases of its solo for a part of a lift, 0
 * to 1: the n-th phrase's place on the golden-ratio sequence, which spreads
 * any share of them evenly through the solo, and keeps every phrase lifted at
 * a smaller share lifted at a larger one. The first phrase that can be lifted
 * (mostly the solo's opening, its sparsest, whose lift is worth the most) stands
 * at 0.6: only a lift past every style's own takes it, so the setting's third
 * quarter has it to give, and the slider moves by more even steps.
 */
const RANK = (n: number): number => (0.6 + n * 0.6180339887498949) % 1;

/** A level's place among the style's, sparsest first, by its name: the same level in every meter. */
export function levelIndex(solo: SoloStyle, level: Density): number {
  return solo.levels.findIndex((other) => other.name === level.name);
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
  const poolFor = (tick: number, hold: number) => {
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
  };
  return {
    plan,
    solo,
    feel: style.feel,
    instrument,
    harmony,
    slots: withinReach(
      slotsOf(plan, solo, instrument),
      solo,
      instrument,
      (plan.quarters * PPQ) / 60,
      poolFor,
    ),
    ticksPerSecond: (plan.quarters * PPQ) / 60,
    bass,
    arrivalAt,
    poolOf: poolOfArrival,
    poolFor,
  };
}

/**
 * Each solo's top note as it can be played: the highest tone of the chord the
 * climb ends on that is no higher than the top the arc allows. Where that
 * chord has nothing so high, the top is lower, and so is every other phrase's
 * ceiling, so that nothing else in the solo comes within `clear` of the top
 * note it will in fact play (SO-07).
 */
function withinReach(
  slots: readonly Slot[],
  solo: SoloStyle,
  instrument: SoloInstrument,
  ticksPerSecond: number,
  poolFor: (tick: number, hold: number) => { readonly pool: Pool | null },
): Slot[] {
  const tops = new Map<number, number>();
  // The climb is the same phrase of the form in whichever chorus it comes, so it is read
  // from the solo's first chorus: known as the solo starts, and the same however long the
  // solo turns out to be (a jam told to finish, an open jam made longer).
  const firstChorus = new Map<number, number>();
  for (const slot of slots) {
    if (!firstChorus.has(slot.solo)) firstChorus.set(slot.solo, slot.chorus);
    const climbs = Math.max(0, slot.count - 1 - solo.arc.peak.fromEnd);
    if (slot.chorus !== firstChorus.get(slot.solo) || slot.index !== climbs) continue;
    // A top note is climbed to, not the tune's last note (which comes to rest).
    if (tops.has(slot.solo) || slot.bars.at(-1)!.ending !== null) continue;
    // Where the climb ends: on its shape's last end bar, or where the shape is longer than
    // one breath carries, on the phrase's last bar, as the soloist will play it.
    const shape = fitShape(solo.arc.peak.shape, slot.bars.length);
    const lungs = lungsOf(soloIn(solo, slot.bars[0]!.meter), instrument, slot, ticksPerSecond);
    const run = Math.max(
      ...shape
        .join("")
        .split(/[^L]/)
        .map((line) => line.length),
    );
    const at = (run <= lungs ? shape : breathed(slot.bars.length, lungs)).lastIndexOf("E");
    const bar = slot.bars[at];
    if (!bar) continue;
    const held = cells(soloIn(solo, bar.meter).arc.peak.ending);
    const struck = held.lastIndexOf("x");
    if (struck < 0) continue;
    let length = 1;
    while (held[struck + length] === "-") length++;
    const { pool } = poolFor(bar.start + struck * STEP, length * STEP);
    const reach = pool?.ladder
      .filter((pitch) => isChordTone(pool, pitch) && pitch <= slot.top)
      .at(-1);
    tops.set(slot.solo, reach !== undefined && reach < slot.top ? reach : slot.top);
  }
  return slots.map((slot) => {
    const top = tops.get(slot.solo);
    if (top === undefined || top === slot.top) return slot;
    const high = slot.peak ? top : Math.min(slot.high, top - solo.arc.peak.clear);
    const low = Math.max(instrument.range[0], Math.min(slot.low, high - 12));
    return { ...slot, top, high, low };
  });
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

  const levelNamed = (name: string) =>
    Math.max(
      0,
      solo.levels.findIndex((level) => level.name === name),
    );
  // Tempo is felt in the pulse, not the bar (`fourPulses`).
  const busy = busyOf(plan, solo);
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
  /** How many phrases of this solo so far a part of a step could have lifted. */
  let ordinal = 0;
  phrases.forEach((bars, i) => {
    const mark = bars[0]!.solo!;
    const index = i - chorusOf.indexOf(chorusOf[i]!);
    const count = chorusOf.filter((chorus) => chorus === chorusOf[i]).length;
    // A solo is its choruses in a row; a chorus that starts the count again is a new solo.
    if (index === 0 && (mark.chorus === 0 || soloIndex < 0)) {
      soloIndex++;
      ordinal = 0;
    }
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
    const seconds = fourPulses(plan, bars[0]!);
    // However hot the band, a solo opens with room: its first stage is not made busier.
    const opening = stage === stages[0] && !peak;
    const byEnergy = tier === "low" ? -1 : tier === "high" && !opening ? 1 : 0;
    const byTempo = seconds > solo.tempo.slowBar ? 1 : seconds < solo.tempo.fastBar ? -1 : 0;
    const shift = Math.max(-1, Math.min(1, byEnergy + byTempo));
    const base = levelNamed(peak ? solo.arc.peak.density : stage.density);
    // The level's rhythms are the ones written for the phrase's meter, where there are any.
    const levels = soloIn(solo, bars[0]!.meter).levels;
    const busiest = levels.length - 1;
    const asked = Math.max(0, Math.min(busiest, base + (peak ? Math.max(0, shift) : shift)));
    // Busier as the style and the player ask: whole steps, and a share of the phrases a
    // step more. The opening is lifted no higher than the arc's next stretch asks, nor to
    // the busiest level, so a solo still opens lower than it ends (SO-05). The share is of
    // the phrases a step can lift, so that none of it is spent on a phrase already as busy
    // as the style plays.
    const next = levelNamed(stages[Math.min(1, stages.length - 1)]!.density);
    const ceiling = opening ? Math.max(asked, Math.min(busiest - 1, next)) : busiest;
    const whole = Math.min(ceiling, asked + Math.floor(busy.lift));
    const part = busy.lift - Math.floor(busy.lift);
    const more = whole < ceiling && part > 0 && RANK(ordinal++) < part ? 1 : 0;
    const level = levels[whole + more]!;

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
      room: busy.room,
      asked: levels[asked]!,
      centre,
      low: Math.round(low),
      high: Math.round(high),
      top,
      displace: displaceOf(solo, bars[0]!.meter),
    });
  });
  return slots;
}
