// A bar of comping as a rhythm, and when two bars are the same rhythm. The
// comper asks this of the plans it weighs and the critic asks it of what was
// played, so "the figure came back" means the same thing to both.

import type { Meter } from "../../chart/types.ts";
import { STEP } from "../../perform/grid.ts";
import { barSteps, pulseTicks } from "../../perform/meter.ts";

/** Sixteenths in an eighth, and in a beat and a bar of 4/4. */
const EIGHTH_STEPS = 2;
const BEAT_STEPS = 4;
const BAR_STEPS = 16;

export interface BarRhythm {
  /** Sixteenths from the barline where the hand comes down in this bar. */
  readonly steps: readonly number[];
  /** The bar opens on a new chord, which may have been played early. */
  readonly arrives: boolean;
  /** The next bar opens on a new chord, which the end of this bar may lean into. */
  readonly leaves: boolean;
  /** Sixteenths in the bar and in its last pulse, where it is not a bar of 4/4. */
  readonly shape?: { readonly bar: number; readonly last: number };
}

export function barRhythm(
  ticks: readonly number[],
  barStart: number,
  arrives: boolean,
  leaves: boolean,
  meter?: Meter,
): BarRhythm {
  const steps = [...new Set(ticks.map((tick) => (tick - barStart) / STEP))].sort((a, b) => a - b);
  if (!meter || (meter.beats === 4 && meter.unit === 4)) return { steps, arrives, leaves };
  const last = Math.round(pulseTicks(meter).at(-1)! / STEP);
  return { steps, arrives, leaves, shape: { bar: barSteps(meter), last } };
}

/**
 * Whether two bars are the same rhythm. Around a change of chord at the
 * barline the hand does what the change asks, whatever the figure: in the last
 * beat (the bar's last pulse) it either leans into the new chord (and the old chord's strike on that
 * beat gives way) or lets it land, and in the first eighth a chord already
 * pushed is not struck again. Those places are left out of the comparison, so
 * a figure that crosses a change is still the same figure.
 */
export function alike(a: BarRhythm, b: BarRhythm): boolean {
  const bar = a.shape?.bar ?? BAR_STEPS;
  if ((b.shape?.bar ?? BAR_STEPS) !== bar) return false;
  const from = a.arrives || b.arrives ? EIGHTH_STEPS : 0;
  const to = a.leaves || b.leaves ? bar - (a.shape?.last ?? BEAT_STEPS) : bar;
  const body = (rhythm: BarRhythm) =>
    rhythm.steps.filter((step) => step >= from && step < to).join(" ");
  return body(a) === body(b);
}

/** Whether two phrases are the same, bar for bar. */
export function samePhrase(a: readonly BarRhythm[], b: readonly BarRhythm[]): boolean {
  return a.length === b.length && a.every((bar, i) => alike(bar, b[i]!));
}
