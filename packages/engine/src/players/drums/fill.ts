// Fills: the drummer marking the form. The plan says where a fill is owed and
// how big a boundary it marks; the style says how long it is and what shapes
// it may be. One whole shape is chosen per fill, never stroke by stroke (X-A-31).

import type { PlayerContext } from "../../perform/notes.ts";
import { heldRng } from "../../perform/notes.ts";
import type { Plan, PlanBar } from "../../plan/types.ts";
import { type PerTier, type Tier, tierOf } from "../../style/types.ts";
import type { BarPart } from "./groove.ts";
import { levels, lineOf, pulses } from "./groove.ts";
import type { DrumVoice } from "./kit.ts";
import type { DrumStyle, FillShape, FillShapes } from "./style.ts";

/** A fill as it will be played: the last `steps` sixteenths of a written shape. */
export interface PlayedFill {
  readonly steps: number;
  readonly lines: readonly (readonly [DrumVoice, readonly number[]])[];
  /** Steps from the fill's start that a cymbal keeping time under it goes on playing. */
  readonly handOff?: number;
}

/** The shapes a vocabulary offers a fill of this tier. */
export function shapesFor(shapes: FillShapes, tier: Tier): readonly FillShape[] {
  return isTiered(shapes) ? shapes[tier] : shapes;
}

function isTiered(shapes: FillShapes): shapes is PerTier<readonly FillShape[]> {
  return !Array.isArray(shapes);
}

/** The feet keep the groove's part under a fill unless the fill writes its own (DR-12). */
const FEET: readonly DrumVoice[] = ["kick", "pedalHat"];

/**
 * The fill for every bar that owes one, by plan bar index.
 *
 * Each fill is one draw from its own bar's generator. The one thing it looks
 * back at is the last fill of the same length the drummer played: he does not
 * end two choruses running with the same fill, so a shape that would repeat is
 * drawn again from the others. With only two shapes to choose between he may
 * repeat himself, since never repeating would be strict alternation, a pattern
 * of its own. This reads the plan before the bar, never what was generated, so
 * a longer jam leaves every earlier fill as it was.
 */
export function chooseFills(
  plan: Plan,
  drums: DrumStyle,
  rng: PlayerContext["rng"],
): Map<number, PlayedFill> {
  const fills = new Map<number, PlayedFill>();
  const lastOfLength = new Map<number, string>();
  for (const bar of plan.bars) {
    // A fill nobody heard is not one to avoid repeating.
    if (bar.kind !== "music" || bar.ending || bar.seats.drums === null) continue;
    const options = candidates(drums, bar);
    if (options.length === 0) continue;
    const weight = (option: Candidate) => option.weight;
    let choice = heldRng(rng, "fill", "bar", bar).weighted(options, weight);
    const last = lastOfLength.get(choice.fill.steps);
    const others = options.filter((option) => option.key !== last);
    if (choice.key === last && others.length >= 2) {
      choice = heldRng(rng, "fill-again", "bar", bar).weighted(others, weight);
    }
    fills.set(bar.index, choice.fill);
    lastOfLength.set(choice.fill.steps, choice.key);
  }
  return fills;
}

/**
 * Play a fill over the end of a bar of time. `under` are the pieces besides
 * the feet that keep the groove's part under it: in a style whose fills keep
 * time, the cymbal (ST-jazz-15).
 */
export function applyFill(
  part: BarPart,
  fill: PlayedFill,
  steps: number,
  under: readonly DrumVoice[],
): void {
  const from = steps - fill.steps;
  const written = new Set(fill.lines.map(([voice]) => voice));
  // A fill replaces the time (DR-12): over its span each piece plays only what the fill writes.
  for (const [voice, line] of Object.entries(part) as [DrumVoice, number[]][]) {
    if (written.has(voice)) line.fill(0, from);
    else if (under.includes(voice)) line.fill(0, from + (fill.handOff ?? fill.steps));
    else if (!FEET.includes(voice)) line.fill(0, from);
  }
  for (const [voice, strokes] of fill.lines) {
    const line = lineOf(part, voice, steps);
    strokes.forEach((level, i) => {
      line[steps - strokes.length + i] = level;
    });
  }
}

interface Candidate {
  readonly weight: number;
  readonly fill: PlayedFill;
  /** What is played, as text: two candidates with one key are the same fill. */
  readonly key: string;
}

/** The shapes this bar's fill may be, cut to the length the bar calls for. */
function candidates(drums: DrumStyle, bar: PlanBar): Candidate[] {
  const mark = bar.fill;
  if (!mark) return [];
  const beats = pulses(bar.meter);
  const barSteps = beats.reduce((sum, pulse) => sum + pulse, 0);

  let wanted = drums.fills.length[mark.boundary][mark.tier];
  // The first beat of a fill bar always keeps time (DR-13, CO-44).
  wanted = Math.min(wanted, barSteps - (beats[0] ?? barSteps));
  if (wanted <= 0) return [];

  // The bigger the boundary, the bigger the gesture (DR-15).
  const own = tierOf(bar.seats.drums ?? bar.energy);
  const vocabulary = shapesFor(mark.top ? drums.fills.top : drums.fills[mark.boundary], own)
    .filter((shape) => shape.weight > 0)
    .map((shape) => ({ shape, lines: writtenLines(shape) }))
    .map((entry) => ({
      ...entry,
      length: Math.max(0, ...entry.lines.map(([, line]) => line.length)),
    }))
    .filter((entry) => entry.length > 0);

  // A length with no written shape plays the tail of the next longer one, so the last stroke
  // still lands on the eve of the barline (DR-16). With nothing longer, the longest there is.
  const longer = vocabulary.filter((entry) => entry.length >= wanted).map((entry) => entry.length);
  const use =
    longer.length > 0 ? Math.min(...longer) : Math.max(0, ...vocabulary.map((e) => e.length));
  const steps = Math.min(use, wanted);

  return vocabulary
    .filter((entry) => entry.length === use)
    .map(({ shape, lines }) => {
      const tail = lines.map(([voice, line]) => [voice, line.slice(-steps)] as const);
      // A hand that leaves the cymbal partway through the shape leaves it as far into the tail.
      const handOff =
        shape.handOff === undefined ? undefined : Math.max(0, shape.handOff - (use - steps));
      const fill = handOff === undefined ? { steps, lines: tail } : { steps, lines: tail, handOff };
      return { weight: shape.weight, fill, key: JSON.stringify(tail) };
    });
}

function writtenLines(shape: FillShape): [DrumVoice, number[]][] {
  return (Object.entries(shape.lines) as [DrumVoice, string][]).map(([voice, text]) => [
    voice,
    levels(text),
  ]);
}
