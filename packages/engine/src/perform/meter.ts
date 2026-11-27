// How a bar is felt: its pulses. Every seat builds a bar that is not 4/4 from
// them, the ending's button sits on the "and" of the last one, and the tempo
// counts them.

import type { Meter } from "../chart/types.ts";
import { barTicks, PPQ } from "../chart/types.ts";
import { STEP } from "./grid.ts";

/**
 * A bar's pulses as lengths in ticks. Quarter notes wherever the meter counts
 * them; in eighth-note meters dotted quarters when the eighths group in threes
 * (6/8, 12/8), otherwise quarters with the odd eighth joining the last one
 * (7/8 is 2+2+3).
 */
export function pulseTicks(meter: Meter): readonly number[] {
  const name = meterName(meter);
  let found = PULSES.get(name);
  if (!found) {
    found = Object.freeze(pulsesOf(meter));
    PULSES.set(name, found);
  }
  return found;
}

const PULSES = new Map<string, readonly number[]>();

function pulsesOf(meter: Meter): number[] {
  const { beats, unit } = meter;
  if (unit === 8 && meter.groups) return meter.groups.map((n) => (n === 3 ? PPQ * 1.5 : PPQ));
  if (unit !== 8) {
    return new Array<number>(Math.max(1, Math.round((beats * 4) / unit))).fill(PPQ);
  }
  if (beats % 3 === 0) return new Array<number>(beats / 3).fill(PPQ * 1.5);
  if (beats < 2) return [barTicks(meter)];
  const result = new Array<number>(Math.floor(beats / 2)).fill(PPQ);
  if (beats % 2 === 1) result[result.length - 1]! += PPQ / 2;
  return result;
}

/** A meter as a chart writes it: "12/8". What a style's parts for a meter are filed under. */
export type MeterName = `${number}/${number}` | `${number}/${number} (${string})`;

/** A meter's name: its numbers, and its grouping where that is not the usual one ("7/8 (3+2+2)"). */
export function meterName(meter: Meter): MeterName {
  if (meter.groups) return `${meter.beats}/${meter.unit} (${meter.groups.join("+")})`;
  return `${meter.beats}/${meter.unit}`;
}

/**
 * How many pulses each of the bar's groups has (#2244). The first pulse of a group is a strong
 * pulse, and a group of four has another in its middle. 5/4 is a three and a two and 7/4 a four
 * and a three unless the meter says otherwise; a bar of six pulses or more that halves is two
 * halves; any other bar is one group.
 */
export function pulseGroups(meter: Meter): readonly number[] {
  const count = pulseTicks(meter).length;
  if (meter.unit === 4) {
    if (meter.groups) return meter.groups;
    if (meter.beats === 5) return [3, 2];
    if (meter.beats === 7) return [4, 3];
  }
  if (count >= 6 && count % 2 === 0) return [count / 2, count / 2];
  return [count];
}

/**
 * A meter with its grouping left off where it says the usual one, so the two are one meter.
 * Null where the grouping is not one the meter can have: over 4, groups of two to four beats;
 * over 8, pulses of two or three eighths; adding up to the meter's beats.
 */
export function grouped(meter: Meter, groups: readonly number[]): Meter | null {
  const { beats, unit } = meter;
  const plain: Meter = { beats, unit };
  if (unit === 2 || groups.reduce((sum, n) => sum + n, 0) !== beats) return null;
  if (groups.some((n) => n < 2 || n > (unit === 8 ? 3 : 4))) return null;
  const usual =
    unit === 8 ? pulseTicks(plain).map((ticks) => (ticks === PPQ ? 2 : 3)) : pulseGroups(plain);
  const same = usual.length === groups.length && usual.every((n, i) => n === groups[i]);
  return same ? plain : { beats, unit, groups: [...groups] };
}

/** What a seat has written for a bar of this meter, if anything. */
export function writtenFor<T>(
  meters: Readonly<Partial<Record<MeterName, T>>> | undefined,
  meter: Meter,
): T | undefined {
  return meters?.[meterName(meter)];
}

/** Sixteenths in a bar of a meter: the length of a grid written for it. */
export function barSteps(meter: Meter): number {
  return Math.round(barTicks(meter) / STEP);
}

/**
 * The pulse a tempo counts, in quarter notes: the dotted quarter where the
 * eighths group in threes (6/8, 9/8, 12/8), and the quarter everywhere else.
 * In 7/8 and its like the pulses are uneven and the quarter is the short one;
 * in 2/2 the band plays four quarters to the bar, so that is what is counted.
 */
export function tempoPulse(meter: Meter): number {
  if (meter.groups) return pulseTicks(meter).every((ticks) => ticks === PPQ * 1.5) ? 1.5 : 1;
  return meter.unit === 8 && meter.beats % 3 === 0 ? 1.5 : 1;
}

/** Ticks from the barline where each of the bar's pulses starts. */
export function pulseStarts(meter: Meter): number[] {
  const starts: number[] = [];
  let tick = 0;
  for (const pulse of pulseTicks(meter)) {
    starts.push(tick);
    tick += pulse;
  }
  return starts;
}

/**
 * The bar's strong pulses, as ticks from the barline: its first, and where it
 * falls into two halves of two pulses or more (four pulses, six), the first
 * pulse of the second half. "Beat 3" of a rule written for 4/4 (AU-97).
 */
export function strongPulses(meter: Meter): number[] {
  const starts = pulseStarts(meter);
  const strong: number[] = [];
  let at = 0;
  for (const size of pulseGroups(meter)) {
    strong.push(starts[at]!);
    if (size === 4) strong.push(starts[at + 2]!);
    at += size;
  }
  return strong;
}

/** The pulse a tick from the barline falls in: which one, where it starts and how long it is. */
export function pulseAt(
  meter: Meter,
  tickInBar: number,
): { readonly index: number; readonly start: number; readonly ticks: number } {
  const lengths = pulseTicks(meter);
  let start = 0;
  for (let index = 0; index < lengths.length; index++) {
    const ticks = lengths[index]!;
    if (tickInBar < start + ticks || index === lengths.length - 1) return { index, start, ticks };
    start += ticks;
  }
  return { index: 0, start: 0, ticks: lengths[0]! };
}

/** Whether a bar's every pulse is a dotted quarter: compound time, which is its own triplet. */
export function isCompound(meter: Meter): boolean {
  return tempoPulse(meter) === 1.5;
}

const STARTS = new Map<string, ReadonlySet<number>>();

/**
 * Whether a tick from the barline is on one of the bar's pulses: what "on the
 * beat" means in a bar that is not counted in quarter notes.
 */
export function onPulse(meter: Meter, tickInBar: number): boolean {
  // Counted in quarter notes, a pulse is every quarter: asked often, answered at once.
  if (meter.unit === 4) return tickInBar % PPQ === 0;
  const key = meterName(meter);
  let starts = STARTS.get(key);
  if (!starts) {
    starts = new Set(pulseStarts(meter));
    STARTS.set(key, starts);
  }
  return starts.has(tickInBar);
}

/** The length of a bar's last pulse in ticks: "the last beat" of a bar. */
export function lastPulse(meter: Meter): number {
  return pulseTicks(meter).at(-1)!;
}

/**
 * Whether a tick from the barline is an "and": the eighth before a pulse (or
 * before the barline). In a dotted pulse that is its last eighth.
 */
export function onAnd(meter: Meter, tickInBar: number): boolean {
  if (meter.unit === 4) return tickInBar % PPQ === PPQ / 2;
  const next = tickInBar + PPQ / 2;
  return next === barTicks(meter) || onPulse(meter, next);
}
