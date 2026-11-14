// Checks a drum style's meaning. The compiler has already checked its shape;
// this reads it the way the drummer will and says what he could not play.

import { cells, LEVELS } from "../../perform/grid.ts";
import type { Tier } from "../../style/types.ts";
import { KIT } from "./kit.ts";
import type { DrumStyle, FillShape, Lines } from "./style.ts";

const TIERS: readonly Tier[] = ["low", "mid", "high"];
/** A groove line is one bar of 4/4. */
const GROOVE_STEPS = 16;
/** No fill is longer than a 4/4 bar less its first beat (CO-44). */
const LONGEST_FILL = 12;

/** Every problem in a drum style, in words. An empty list means the data is sound. */
export function validateDrumStyle(drums: DrumStyle): string[] {
  const problems: string[] = [];
  const voice = (name: string, where: string) => {
    if (!(name in KIT)) problems.push(`${where}: "${name}" is not a piece of the kit.`);
  };
  /** Checks each line's piece and symbols, and returns the lines' lengths. */
  const lines = (written: Lines, where: string): number[] =>
    Object.entries(written).map(([name, text]) => {
      voice(name, where);
      const symbols = cells(text);
      const bad = symbols.filter((symbol) => symbol !== "." && !(symbol in LEVELS));
      if (bad.length > 0) {
        problems.push(
          `${where}: the ${name} line "${text}" uses ${[...new Set(bad)].map((s) => `"${s}"`).join(", ")}; write X, x, o, g or a dot.`,
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
        for (const length of lines(option.lines, at)) {
          if (length !== GROOVE_STEPS)
            problems.push(`${at}: a line has ${length} steps; a bar is ${GROOVE_STEPS}.`);
        }
      });
      const when = layer.when;
      if (when?.playing) voice(when.playing, `${where}, "playing"`);
      if (when?.phraseBars?.some((bar) => !Number.isInteger(bar) || bar < 1))
        problems.push(`${where}: phrase bars are counted from 1.`);
      for (const energy of [when?.energyFrom, when?.energyBelow]) {
        if (energy !== undefined && !(energy >= 0 && energy <= 1))
          problems.push(`${where}: an energy is between 0 and 1, not ${energy}.`);
      }
    }
  }

  for (const name of drums.timekeepers) voice(name, "timekeepers");
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
    fills[list].forEach((shape, i) => {
      const where = `${list} fill ${i + 1}`;
      const lengths = lines(shape.lines, where);
      const length = lengths[0] ?? 0;
      lengthOf.set(shape, length);
      if (!(shape.weight >= 0)) problems.push(`${where}: its weight is negative or not a number.`);
      if (lengths.length === 0) problems.push(`${where}: it has no lines.`);
      else if (lengths.some((other) => other !== length))
        problems.push(`${where}: its lines are different lengths (${lengths.join(", ")}).`);
      else if (length < 1 || length > LONGEST_FILL)
        problems.push(`${where}: it is ${length} steps long; a fill is 1 to ${LONGEST_FILL}.`);
    });
  }
  // Every length the table asks for must have a shape to play: one of that length, or a longer
  // one to take the tail of (DR-16). Half lengths come up on short vamps (CO-46).
  for (const boundary of ["phrase", "section"] as const) {
    for (const tier of TIERS) {
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
          const playable = fills[list].some(
            (shape) => shape.weight > 0 && (lengthOf.get(shape) ?? 0) >= steps,
          );
          if (!playable)
            problems.push(
              `${list} fills: the ${tier} tier calls for ${steps} steps and no shape is that long.`,
            );
        }
      }
    }
  }

  for (const [name, symbol] of Object.entries(drums.ending.strike)) {
    voice(name, "ending strike");
    if (!(symbol in LEVELS))
      problems.push(`ending strike: the ${name} is written "${symbol}"; write X, x, o or g.`);
  }

  return [...new Set(problems)];
}
