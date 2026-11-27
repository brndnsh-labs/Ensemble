// The drummer's part for a meter the style has not written, made from the part
// it wrote (#2244; docs/decisions/meters.md, "every style in every meter: the
// design", section 3).
//
// The time is cut by the beat: every tier's layers, every option's lines, a
// turn (`audible`) laid only in the last pulse that takes its beat. A layer
// that names the meters it plays in stays out (DR-59). The touches' steps go
// with their cells. The fills, and the lengths the style asks of them, are
// counted back from the barline in pulses. Each derived layer and fill is
// asked what `validate.ts` asks of a written one in the meter, and what fails
// is left out. In a bar whose shape has to be told (`Cut.tells`): one backbeat
// a group, a kick on every 1 the style's own time kicks, no fill longer than
// the last pulse, the turn only at a phrase's end, and a count-in that leans
// on the bar's marks.

import type { Meter } from "../../chart/types.ts";
import type { Cut, Symbols } from "../../style/cut.ts";
import { cutLine, cutTail, partIn } from "../../style/cut.ts";
import type { PerTier, Tier } from "../../style/types.ts";
import { shapesFor } from "./fill.ts";
import type { DrumVoice } from "./kit.ts";
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

/**
 * The pieces that keep time and are neither a kick nor a backbeat: in the middle pulse of a
 * group of three they play on (one backbeat a group). The hat closed with the foot is not
 * among them: where a style plays it, it is the backbeat.
 */
const TIME: readonly DrumVoice[] = ["closedHat", "openHat", "ride", "rideBell", "shaker"];

const NO_LENGTH = { low: 0, mid: 0, high: 0 } as const;
const NO_FILLS: DrumFills = {
  length: { phrase: NO_LENGTH, section: NO_LENGTH },
  phrase: [],
  section: [],
  top: [],
};

/** The count-in's sticks in a bar whose shape is told, as shares of their level: the downbeat, a later mark, a pulse between. */
const COUNT_IN = { one: 1.2, mark: 1, between: 0.5 } as const;

/**
 * What the drummer has for a bar of a meter: the part the style wrote for it, else the one
 * made from what it wrote; nothing in a meter the band still fits its 4/4 bar to.
 */
export function drumTimeIn(drums: DrumStyle, meter: Meter): DrumTime | undefined {
  return partIn(drums, drums.meters, meter, (cut) => derived(drums, cut));
}

function derived(drums: DrumStyle, cut: Cut): DrumTime | undefined {
  const source: DrumTime = cut.source === "12/8" ? (drums.meters?.["12/8"] ?? drums) : drums;
  // What keeps the time going: the style's own timekeepers, and any cymbal or shaker.
  const cymbals = new Set<string>([...drums.timekeepers, ...TIME]);
  const sound = (time: DrumTime): boolean =>
    validateTime(time, cut.meter, (names) => names.includes(cut.name)).length === 0;

  // ── the time ──
  const grooves = {} as Record<Tier, GrooveLayer[]>;
  for (const tier of TIERS) {
    grooves[tier] = [];
    for (const layer of source.grooves[tier]) {
      if (layer.when?.meters && !layer.when.meters.includes(cut.name)) continue;
      const options = layer.options.map((option): GrooveOption => {
        const lines: Record<string, string> = {};
        for (const [voice, text] of Object.entries(option.lines)) {
          const line = [
            ...cutLine(cellsOf(text), cut, DRUMS, { turn: layer.audible === true }).line,
          ];
          // One backbeat a group: in the middle pulse of a group of three the drums keep time
          // (the cymbal, the shaker) and play neither the kick nor the backbeat.
          if (!cymbals.has(voice))
            for (const pulse of cut.pulses)
              if (pulse.weak) line.fill(".", pulse.start, pulse.start + pulse.steps);
          lines[voice] = line.join("");
        }
        return { ...option, lines: lines as Lines };
      });
      // Held: the time turns only at a phrase's end, not on every answer bar.
      const { phraseBars, ...when } = layer.when ?? {};
      const turnsOnce = cut.tells && layer.audible === true && phraseBars !== undefined;
      const made: GrooveLayer = turnsOnce
        ? { ...layer, options, when: { ...when, phraseEnd: true } }
        : { ...layer, options };
      if (sound({ grooves: { low: [made], mid: [], high: [] }, touches: [], fills: NO_FILLS }))
        grooves[tier].push(made);
    }
  }
  if (TIERS.every((tier) => grooves[tier].length === 0)) return undefined;

  // ── the touches: each step goes with its cell ──
  const where = stepsMap(cut);
  const touches: Touch[] = source.touches.map((touch) => {
    if (!touch.steps) return touch;
    const steps = [...new Set(touch.steps.flatMap((step) => where.get(step) ?? []))].sort(
      (a, b) => a - b,
    );
    return { ...touch, steps };
  });

  // ── the fills ──
  // Longer than the bar less its first pulse, a fill is left out; where the downbeat is kept,
  // longer than the bar's last pulse.
  const longest = cut.tells ? cut.pulses.at(-1)!.steps : cut.steps - cut.pulses[0]!.steps;
  const fillsOf = (list: "phrase" | "section" | "top"): FillShapes => {
    const shapes = source.fills[list];
    const one = (written: readonly FillShape[]): FillShape[] =>
      written.flatMap((shape) => {
        const made = fillIn(shape, cut);
        if (!made) return [];
        const length = Math.max(...Object.values(made.lines).map((text) => cellsOf(text).length));
        if (length > longest) return [];
        const alone = {
          grooves: { low: [], mid: [], high: [] },
          touches: [],
          fills: { ...NO_FILLS, keepTime: source.fills.keepTime, phrase: [made] },
        } as DrumTime;
        return sound(alone) ? [made] : [];
      });
    if (Array.isArray(shapes)) return one(shapes as readonly FillShape[]);
    const tiered = {} as Record<Tier, FillShape[]>;
    for (const tier of TIERS) tiered[tier] = one(shapesFor(shapes, tier));
    return tiered as PerTier<readonly FillShape[]>;
  };
  const lengthOf = (written: number): number => {
    if (written <= 0) return written;
    const tail = cutTail(new Array<string>(written).fill("x"), cut, DRUMS);
    return Math.min(tail?.line.length ?? longest, longest);
  };
  const lengths = (boundary: "phrase" | "section"): PerTier<number> => {
    const table = source.fills.length[boundary];
    return { low: lengthOf(table.low), mid: lengthOf(table.mid), high: lengthOf(table.high) };
  };
  const fills: DrumFills = {
    ...source.fills,
    length: { phrase: lengths("phrase"), section: lengths("section") },
    phrase: fillsOf("phrase"),
    section: fillsOf("section"),
    top: fillsOf("top"),
  };

  if (!cut.tells) {
    const part: DrumTime = { grooves, touches, fills };
    return sound(part) ? part : undefined;
  }

  // The downbeat kept: a kick on every 1, whatever the section's kick does there. Not where
  // the style's own time at this level never kicks on 1 (reggae's one drop).
  const kick = `x${".".repeat(cut.steps - 1)}`;
  for (const tier of TIERS) {
    const first = grooves[tier][0];
    const kicksOne = source.grooves[tier].some((layer) =>
      layer.options.some((option) => {
        const stroke = cellsOf(option.lines.kick ?? ".")[0]!;
        return stroke !== "." && stroke !== "-";
      }),
    );
    if (first && kicksOne)
      grooves[tier].push({
        id: "the-one",
        hold: first.hold,
        options: [{ weight: 1, lines: { kick } }],
      });
  }
  // The count-in leans on the bar's marks: loud on 1, plain on a later mark, soft between.
  const countIn = cut.pulses.map((pulse) =>
    pulse.start === 0
      ? COUNT_IN.one
      : cut.marks.includes(pulse.start)
        ? COUNT_IN.mark
        : COUNT_IN.between,
  );
  const part: DrumTime = { grooves, touches, fills, countIn };
  return sound(part) ? part : undefined;
}

/**
 * A fill counted back from the barline in the new bar's pulses, its hand-off moved with its
 * sixteenth; nothing where it is more beats than the bar has pulses.
 */
function fillIn(shape: FillShape, cut: Cut): FillShape | undefined {
  const lines: Record<string, string> = {};
  let length = -1;
  for (const [voice, text] of Object.entries(shape.lines)) {
    const made = cutTail(cellsOf(text), cut, DRUMS);
    if (!made) return undefined;
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
