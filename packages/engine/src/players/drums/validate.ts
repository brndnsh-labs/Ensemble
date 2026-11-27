// Checks a drum style's meaning. The compiler has already checked its shape;
// this reads it the way the drummer will and says what he could not play.

import type { Meter } from "../../chart/types.ts";
import { cells, LEVELS, STEP } from "../../perform/grid.ts";
import { barSteps, pulseTicks } from "../../perform/meter.ts";
import { readMeter } from "../../style/meters.ts";
import type { Tier } from "../../style/types.ts";
import { shapesFor } from "./fill.ts";
import { TAKEN } from "./groove.ts";
import { KIT } from "./kit.ts";
import type { DrumStyle, DrumTime, FillShape, Lines, Strike } from "./style.ts";

const TIERS: readonly Tier[] = ["low", "mid", "high"];
const FOUR_FOUR = { beats: 4, unit: 4 } as const;

/** Every problem in a drum style, in words. An empty list means the data is sound. */
export function validateDrumStyle(drums: DrumStyle): string[] {
  const problems: string[] = [];
  for (const name of drums.timekeepers) voiceOf(name, "timekeepers", problems);
  // The part for four plays in 4/4 and in every meter no part is written for (fitted).
  const written = new Set(Object.keys(drums.meters ?? {}));
  problems.push(
    ...validateTime(drums, FOUR_FOUR, (names) =>
      names.some((name) => name === "4/4" || !written.has(name)),
    ),
  );
  for (const [name, time] of Object.entries(drums.meters ?? {})) {
    const meter = readMeter(name);
    if (!meter) problems.push(`meters: "${name}" is not a meter a chart can write, or is 4/4.`);
    else if (time)
      problems.push(
        ...validateTime(time, meter, (names) => names.includes(name)).map(
          (problem) => `in ${name}, ${problem}`,
        ),
      );
  }
  const strike = (written: Strike, where: string): void => {
    for (const [name, symbol] of Object.entries(written)) {
      voiceOf(name, where, problems);
      if (!(symbol in LEVELS))
        problems.push(`${where}: the ${name} is written "${symbol}"; write X, x, o or g.`);
    }
  };
  strike(drums.ending.strike, "ending strike");
  if (drums.ending.button) strike(drums.ending.button, "ending button");
  return [...new Set(problems)];
}

function voiceOf(name: string, where: string, problems: string[]): void {
  if (!(name in KIT)) problems.push(`${where}: "${name}" is not a piece of the kit.`);
}

/**
 * The problems in what is written as a bar: the grooves, the touches, the fills, for a bar of
 * one meter. A part made for a meter is asked this too, a layer and a fill at a time (`derive.ts`).
 */
export function validateTime(
  drums: DrumTime,
  meter: Meter,
  /** Whether a layer naming these meters could ever play in a bar this part is played in. */
  playsIn: (names: readonly string[]) => boolean,
): string[] {
  const problems: string[] = [];
  /** A groove line is one bar of the meter. */
  const GROOVE_STEPS = barSteps(meter);
  /** No fill is longer than the bar less its first pulse (CO-44). */
  const LONGEST_FILL = GROOVE_STEPS - Math.round(pulseTicks(meter)[0]! / STEP);
  const voice = (name: string, where: string) => voiceOf(name, where, problems);
  /**
   * Checks each line's piece and symbols, and returns the lines' lengths. Only a
   * groove line may take a stroke away: a fill replaces the time anyway.
   */
  const lines = (written: Lines, where: string, groove = false): number[] =>
    Object.entries(written).map(([name, text]) => {
      voice(name, where);
      const symbols = cells(text);
      const bad = symbols.filter(
        (symbol) => symbol !== "." && !(symbol in LEVELS) && !(groove && symbol === TAKEN),
      );
      if (bad.length > 0) {
        const allowed = groove ? 'X, x, o, g, "-" or a dot' : "X, x, o, g or a dot";
        problems.push(
          `${where}: the ${name} line "${text}" uses ${[...new Set(bad)].map((s) => `"${s}"`).join(", ")}; write ${allowed}.`,
        );
      }
      return symbols.length;
    });
  const weights = (list: readonly { readonly weight: number }[], where: string): void => {
    if (list.length === 0) problems.push(`${where}: there is nothing to choose from.`);
    else if (list.some((item) => !(item.weight >= 0)))
      problems.push(`${where}: a weight is negative or not a number.`);
    else if (list.every((item) => item.weight === 0))
      problems.push(`${where}: every weight is zero, so nothing can be chosen.`);
  };

  for (const tier of TIERS) {
    const ids = new Set<string>();
    for (const layer of drums.grooves[tier]) {
      const where = `${tier} groove, layer "${layer.id}"`;
      if (ids.has(layer.id))
        problems.push(
          `${where}: two layers of one tier share this id, so they would share a draw.`,
        );
      ids.add(layer.id);
      weights(layer.options, where);
      layer.options.forEach((option, i) => {
        const at = `${where}, option ${i + 1}`;
        for (const length of lines(option.lines, at, true)) {
          if (length !== GROOVE_STEPS)
            problems.push(`${at}: a line has ${length} steps; a bar is ${GROOVE_STEPS}.`);
        }
      });
      const when = layer.when;
      if (when?.playing) voice(when.playing, `${where}, "playing"`);
      if (when?.phraseBars?.some((bar) => !Number.isInteger(bar) || bar < 1))
        problems.push(`${where}: phrase bars are counted from 1.`);
      for (const name of when?.meters ?? []) {
        // 4/4 is the style itself, and a meter like any other here.
        if (name !== "4/4" && readMeter(name) === null)
          problems.push(`${where}: "${name}" is not a meter.`);
      }
      if (when?.meters?.length === 0)
        problems.push(`${where}: names no meter, so it is never played.`);
      else if (when?.meters && !playsIn(when.meters))
        problems.push(
          `${where}: names only meters this part is never played in (${when.meters.join(", ")}), so it is never played.`,
        );
      for (const energy of [when?.energyFrom, when?.energyBelow]) {
        if (energy !== undefined && !(energy >= 0 && energy <= 1))
          problems.push(`${where}: an energy is between 0 and 1, not ${energy}.`);
      }
    }
  }

  const pulseCount = pulseTicks(meter).length;
  if (
    drums.countIn &&
    (drums.countIn.length !== pulseCount || drums.countIn.some((share) => !(share > 0)))
  )
    problems.push(`count-in: a share more than zero for each of the bar's ${pulseCount} pulses.`);

  drums.touches.forEach((touch, i) => {
    const where = `touch ${i + 1}`;
    for (const name of touch.voices) voice(name, where);
    if (touch.steps?.some((step) => !Number.isInteger(step) || step < 0 || step >= GROOVE_STEPS))
      problems.push(`${where}: steps run from 0 to ${GROOVE_STEPS - 1}.`);
    if (!(touch.scale > 0)) problems.push(`${where}: the scale must be more than zero.`);
  });

  const fills = drums.fills;
  const lengthOf = new Map<FillShape, number>();
  for (const list of ["phrase", "section", "top"] as const) {
    for (const tier of TIERS) {
      const tiered = !Array.isArray(fills[list]);
      shapesFor(fills[list], tier).forEach((shape, i) => {
        if (lengthOf.has(shape)) return;
        const where = tiered ? `${tier} ${list} fill ${i + 1}` : `${list} fill ${i + 1}`;
        const lengths = lines(shape.lines, where);
        const length = lengths[0] ?? 0;
        lengthOf.set(shape, length);
        if (!(shape.weight >= 0))
          problems.push(`${where}: its weight is negative or not a number.`);
        if (lengths.length === 0) problems.push(`${where}: it has no lines.`);
        else if (lengths.some((other) => other !== length))
          problems.push(`${where}: its lines are different lengths (${lengths.join(", ")}).`);
        else if (length < 1 || length > LONGEST_FILL)
          problems.push(`${where}: it is ${length} steps long; a fill is 1 to ${LONGEST_FILL}.`);
        const handOff = shape.handOff;
        if (
          handOff !== undefined &&
          !(Number.isInteger(handOff) && handOff >= 0 && handOff <= length)
        )
          problems.push(
            `${where}: the hand leaves the cymbal at step ${handOff}, outside the fill.`,
          );
        if (handOff !== undefined && !fills.keepTime)
          problems.push(
            `${where}: a hand-off means nothing in a style whose fills do not keep time.`,
          );
      });
    }
  }
  // Every length the table asks for must have a shape to play: one of that length, or a longer
  // one to take the tail of (DR-16). Half lengths come up on short vamps (CO-46). A fill is
  // sized by the tier it leads into and played from the vocabulary of the tier it is in, so
  // each tier's shapes must reach the lengths of the tiers above it too.
  for (const boundary of ["phrase", "section"] as const) {
    for (const [rank, tier] of TIERS.entries()) {
      const length = fills.length[boundary][tier];
      if (!Number.isInteger(length) || length < 0 || length > LONGEST_FILL) {
        problems.push(
          `fill length, ${boundary} ${tier}: ${length} is not a whole number of steps from 0 to ${LONGEST_FILL}.`,
        );
        continue;
      }
      const wanted = length >= 4 ? [length, Math.floor(length / 2)] : length > 0 ? [length] : [];
      // A top is always the end of a section.
      for (const list of boundary === "section"
        ? (["section", "top"] as const)
        : ([boundary] as const)) {
        for (const steps of wanted) {
          for (const own of TIERS.slice(0, rank + 1)) {
            const playable = shapesFor(fills[list], own).some(
              (shape) => shape.weight > 0 && (lengthOf.get(shape) ?? 0) >= steps,
            );
            const from = own === tier ? "" : ` from the ${own} tier`;
            if (!playable)
              problems.push(
                `${list} fills: the ${tier} tier calls for ${steps} steps${from} and no shape is that long.`,
              );
          }
        }
      }
    }
  }

  return problems;
}
