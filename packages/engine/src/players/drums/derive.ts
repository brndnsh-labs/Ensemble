// PROTOTYPE (#2244, the study page; not for merging). The drums seat's part
// for a meter the style has not written, made from the part it wrote.
// See docs/decisions/meters.md, "every style in every meter: the design".
//
// The time is cut by the beat (rule a): every tier's layers, every option's
// lines, a turn (`audible`) laid only in the last pulse that takes its beat. A
// layer that names the meters it plays in stays out, as under the fit (DR-59).
// The touches' steps go with their cells. The fills, and the lengths the style
// asks of them, are counted back from the barline in pulses (rule b). Each
// derived layer and fill is asked what `validate.ts` asks of a written one in
// the meter, and what fails is left out.

import type { Cut, Symbols } from "../../style/cut.ts";
import { cutLine, cutTail, grouped } from "../../style/cut.ts";
import type { Derived } from "../../style/derive.ts";
import type { PerTier, Tier } from "../../style/types.ts";
import { shapesFor } from "./fill.ts";
import type {
  DrumFills,
  DrumStyle,
  DrumTime,
  FillShape,
  FillShapes,
  GrooveLayer,
  GrooveOption,
  Lines,
  Touch,
} from "./style.ts";
import { validateTime } from "./validate.ts";

const TIERS: readonly Tier[] = ["low", "mid", "high"];

/** In the drums every written stroke is a strike, a stroke taken off ("-") too; nothing is held. */
const DRUMS: Symbols = {
  strike: (symbol) => symbol !== ".",
  hold: () => false,
  rest: ".",
  held: ".",
};

const cellsOf = (text: string): string[] => [...text.replace(/\s+/g, "")];

/** A figure against the barline for reading: grouped from the barline back, a pulse (or a written beat) to a group. */
const fromBarline = (line: readonly string[], sizes: readonly number[]): string => {
  const groups: string[] = [];
  let end = line.length;
  for (let i = sizes.length - 1; i >= 0 && end > 0; i--) {
    groups.unshift(line.slice(Math.max(0, end - sizes[i]!), end).join(""));
    end -= sizes[i]!;
  }
  if (end > 0) groups.unshift(line.slice(0, end).join(""));
  return groups.join(" ");
};
/** A written grid for reading: a beat to a group. */
const beats = (line: readonly string[], cell: number): string => {
  const groups: string[] = [];
  for (let i = 0; i < line.length; i += cell) groups.push(line.slice(i, i + cell).join(""));
  return groups.join(" ");
};

const NO_LENGTH = { low: 0, mid: 0, high: 0 } as const;
const NO_FILLS: DrumFills = {
  length: { phrase: NO_LENGTH, section: NO_LENGTH },
  phrase: [],
  section: [],
  top: [],
};

export function drumsIn(drums: DrumStyle, cut: Cut): Derived<DrumTime> {
  const source: DrumTime =
    cut.source === "12/8" ? (drums.meters?.["12/8"] ?? drums) : (drums as DrumTime);
  const dropped: string[] = [];
  const grids: string[] = [];
  const cymbals = new Set<string>([...drums.timekeepers, "closedHat", "openHat", "ride"]);
  const problemsOf = (time: DrumTime): string[] =>
    validateTime(time, cut.meter, (names) => names.includes(cut.name));

  // ── the time ──
  const grooves = {} as Record<Tier, GrooveLayer[]>;
  for (const tier of TIERS) {
    grooves[tier] = [];
    for (const layer of source.grooves[tier]) {
      const label = `${tier} ${layer.id}${layer.audible ? " (turn)" : ""}`;
      if (layer.when?.meters && !layer.when.meters.includes(cut.name)) {
        dropped.push(
          `${label}: plays only in ${layer.when.meters.join(", ")}, so stays out, as under the fit (DR-59)`,
        );
        continue;
      }
      const options = layer.options.map((option, i): GrooveOption => {
        const lines: Record<string, string> = {};
        for (const [voice, text] of Object.entries(option.lines)) {
          const written = cellsOf(text);
          const cutTo = cutLine(written, cut, DRUMS, { turn: layer.audible === true });
          // One backbeat a group: in the middle pulse of a group of three the drums keep time
          // and play neither the kick nor the backbeat.
          const line = [...cutTo.line];
          if (!cymbals.has(voice))
            for (const pulse of cut.pulses)
              if (pulse.weak) line.fill(".", pulse.start, pulse.start + pulse.steps);
          const made = { ...cutTo, line };
          lines[voice] = made.line.join("");
          const moved = made.moved
            ? `   (nothing left: moved whole to pulse ${cut.refuge + 1})`
            : "";
          grids.push(
            `${label} #${i + 1} ${voice.padEnd(10)} ${beats(written, cut.cell)}  ->  ${grouped(made.line, cut)}${moved}`,
          );
        }
        return { ...option, lines: lines as Lines };
      });
      // Held: the time turns only at a phrase's end, not on every answer bar.
      const { phraseBars, ...when } = layer.when ?? {};
      const turnsOnce = cut.clear.has("hold") && layer.audible === true && phraseBars !== undefined;
      const made: GrooveLayer = turnsOnce
        ? { ...layer, options, when: { ...when, phraseEnd: true } }
        : { ...layer, options };
      const problems = problemsOf({
        grooves: { low: [made], mid: [], high: [] },
        touches: [],
        fills: NO_FILLS,
      });
      if (problems.length > 0) {
        dropped.push(`${label}: ${problems.join("; ")}`);
        continue;
      }
      grooves[tier].push(made);
    }
  }

  // ── the touches: each step goes with its cell ──
  const where = stepsMap(cut);
  const touches: Touch[] = source.touches.map((touch) => {
    if (!touch.steps) return touch;
    const steps = [...new Set(touch.steps.flatMap((step) => where.get(step) ?? []))].sort(
      (a, b) => a - b,
    );
    grids.push(
      `touch ${touch.voices.join("+")} steps ${touch.steps.join(",")}  ->  ${steps.join(",")}`,
    );
    return { ...touch, steps };
  });

  // ── the fills ──
  // The downbeat kept: no fill is longer than the bar's last pulse.
  const longest = cut.clear.has("one")
    ? cut.pulses.at(-1)!.steps
    : cut.steps - cut.pulses[0]!.steps;
  const fillsOf = (list: "phrase" | "section" | "top"): FillShapes => {
    const shapes = source.fills[list];
    const one = (written: readonly FillShape[], tier: Tier | null): FillShape[] =>
      written.flatMap((shape, i) => {
        const label = `${tier ? `${tier} ` : ""}${list} fill ${i + 1}`;
        const made = fillIn(shape, cut);
        if (typeof made === "string") {
          dropped.push(`${label}: ${made}`);
          return [];
        }
        if (Math.max(...Object.values(made.lines).map((text) => cellsOf(text).length)) > longest) {
          dropped.push(`${label}: longer than the bar's last pulse (the downbeat kept)`);
          return [];
        }
        for (const [voice, text] of Object.entries(shape.lines)) {
          grids.push(
            `${label} ${voice.padEnd(10)} ${fromBarline(cellsOf(text), [cut.cell, cut.cell, cut.cell, cut.cell])}  ->  ${fromBarline(
              cellsOf(made.lines[voice as keyof Lines]!),
              cut.pulses.map((p) => p.steps),
            )}`,
          );
        }
        const problems = problemsOf({
          grooves: { low: [], mid: [], high: [] },
          touches: [],
          fills: { ...NO_FILLS, keepTime: source.fills.keepTime, phrase: [made] },
        } as DrumTime);
        if (problems.length > 0) {
          // Asked as the one shape of a list, so the validator names it "phrase fill 1".
          const said = problems.map((problem) => problem.replace(/^phrase fill 1: /, ""));
          dropped.push(`${label}: ${said.join("; ")}`);
          return [];
        }
        return [made];
      });
    if (Array.isArray(shapes)) return one(shapes as readonly FillShape[], null);
    const tiered = {} as Record<Tier, FillShape[]>;
    for (const tier of TIERS) tiered[tier] = one(shapesFor(shapes, tier), tier);
    return tiered as PerTier<readonly FillShape[]>;
  };
  const lengthOf = (written: number, label: string): number => {
    if (written <= 0) return written;
    const tail = cutTail(new Array<string>(written).fill("x"), cut, DRUMS);
    const steps = tail?.line.length ?? Infinity;
    if (steps <= longest) {
      if (steps !== written) grids.push(`fill length, ${label}: ${written}  ->  ${steps}`);
      return steps;
    }
    dropped.push(
      `fill length, ${label}: ${written} sixteenths is longer than the bar less its first pulse; ${longest} instead`,
    );
    return longest;
  };
  const lengths = (boundary: "phrase" | "section"): PerTier<number> => {
    const table = source.fills.length[boundary];
    return {
      low: lengthOf(table.low, `${boundary} low`),
      mid: lengthOf(table.mid, `${boundary} mid`),
      high: lengthOf(table.high, `${boundary} high`),
    };
  };
  const fills: DrumFills = {
    ...source.fills,
    length: { phrase: lengths("phrase"), section: lengths("section") },
    phrase: fillsOf("phrase"),
    section: fillsOf("section"),
    top: fillsOf("top"),
  };

  if (cut.clear.has("one")) {
    // A kick on every downbeat, whatever the section's kick does there.
    const kick = `x${".".repeat(cut.steps - 1)}`;
    for (const tier of TIERS) {
      const first = grooves[tier][0];
      // Not where the style's own time at this level never kicks on 1 (reggae's one drop).
      const kicksOne = source.grooves[tier].some((layer) =>
        layer.options.some(
          (option) =>
            DRUMS.strike(cellsOf(option.lines.kick ?? ".")[0]!) &&
            cellsOf(option.lines.kick ?? ".")[0] !== "-",
        ),
      );
      if (!kicksOne)
        dropped.push(`${tier}: no kick put on 1, since the style's own time has none there`);
      if (first && kicksOne)
        grooves[tier].push({
          id: "the-one",
          hold: first.hold,
          options: [{ weight: 1, lines: { kick } }],
        });
    }
  }
  // The count-in leans on the bar's marks: each pulse's stick as a share of its level.
  const countIn = cut.clear.has("one")
    ? cut.pulses.map((pulse) =>
        cut.marks.includes(pulse.start) && pulse.start === 0
          ? 1.2
          : cut.marks.includes(pulse.start)
            ? 1
            : 0.5,
      )
    : undefined;
  const part: DrumTime = { grooves, touches, fills, ...(countIn ? { countIn } : {}) };
  // The whole part, as a written one is asked: what is left must be a part.
  const left = problemsOf(part);
  if (left.length > 0) {
    dropped.push(...left.map((problem) => `the part: ${problem}`));
    return { part: undefined, dropped, grids };
  }
  if (TIERS.every((tier) => grooves[tier].length === 0)) return { part: undefined, dropped, grids };
  return { part, dropped, grids };
}

/**
 * A fill counted back from the barline in the new bar's pulses (rule b), its hand-off moved
 * with its sixteenth; or why it is left out.
 */
function fillIn(shape: FillShape, cut: Cut): FillShape | string {
  const lines: Record<string, string> = {};
  let length = -1;
  for (const [voice, text] of Object.entries(shape.lines)) {
    const written = cellsOf(text);
    const made = cutTail(written, cut, DRUMS);
    if (!made) return `${written.length} sixteenths is more beats than the bar has pulses`;
    lines[voice] = made.line.join("");
    length = Math.max(length, made.line.length);
  }
  const made: FillShape = { ...shape, lines: lines as Lines };
  if (shape.handOff === undefined) return made;
  // The hand leaves the cymbal at the first sixteenth that came from its written step or later.
  const written = Math.max(0, ...Object.values(shape.lines).map((t) => cellsOf(t).length));
  const tail = cutTail(new Array<string>(written).fill("x"), cut, DRUMS);
  const at = tail?.from.findIndex((from) => from >= shape.handOff!) ?? -1;
  return { ...made, handOff: at < 0 ? length : at };
}

/**
 * Where each sixteenth of the written bar goes in the new one: a line struck everywhere, cut,
 * and a line struck only in each beat the bar does not take, which moves whole to the refuge.
 */
function stepsMap(cut: Cut): Map<number, number[]> {
  const where = new Map<number, number[]>();
  const add = (from: readonly number[]) =>
    from.forEach((step, at) => {
      if (step < 0) return;
      const list = where.get(step) ?? [];
      if (!list.includes(at)) list.push(at);
      where.set(step, list);
    });
  const length = cut.cell * 4;
  add(cutLine(new Array<string>(length).fill("x"), cut, DRUMS).from);
  for (const beat of cut.untaken) {
    const line = new Array<string>(length).fill(".");
    for (let i = 0; i < cut.cell; i++) line[beat * cut.cell + i] = "x";
    add(cutLine(line, cut, DRUMS).from);
  }
  return where;
}
