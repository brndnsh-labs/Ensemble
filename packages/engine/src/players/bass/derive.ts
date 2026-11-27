// The bassist's part for a meter the style has not written, made from the part
// it wrote (#2244; docs/decisions/meters.md, "every style in every meter: the
// design", section 3).
//
// Each tier's figures are cut by the beat, a hold kept only with its note, and
// each `x` keeps the place in the sequence it had in the written bar
// (`Figure.places`: a tone travels with its cell). Turns are counted back from
// the barline in pulses. The rest of the line is carried over. Each derived
// figure and turn is asked what `validate.ts` asks of a written one in the
// meter; what fails is left out, and a tier whose every figure fails plays the
// plain form (`otherMeters`). In a bar whose shape has to be told (`Cut.tells`)
// the bass marks it: the root on each mark, the notes between lighter, and one
// figure and one shape of notes a tier.

import type { Meter } from "../../chart/types.ts";
import { STEP } from "../../perform/grid.ts";
import type { Cut, Symbols } from "../../style/cut.ts";
import { cutLine, cutTail, gridOf, partIn } from "../../style/cut.ts";
import type { PerTier, Tier } from "../../style/types.ts";
import type { BassLine, BassStyle, Figure } from "./style.ts";
import { DEAD_NOTE, RIFF_TONES } from "./style.ts";
import { validateBassStyle } from "./validate.ts";

const TIERS: readonly Tier[] = ["low", "mid", "high"];

/** A note between the bar's marks is played at this share of its written level. */
const BETWEEN_MARKS = 0.78;

/** A note is struck on `x`, `o`, a tone a riff names and a dead note; `-` holds it. */
const BASS: Symbols = {
  strike: (symbol) =>
    symbol === "x" || symbol === "o" || symbol === DEAD_NOTE || symbol in RIFF_TONES,
  hold: (symbol) => symbol === "-",
  rest: ".",
  held: "-",
};

const cellsOf = (text: string): string[] => [...text.replace(/\s+/g, "")];

/**
 * The lines the bass plays in a bar of a meter: the ones the style wrote for it, else the ones
 * made from what it wrote; nothing in a meter the band still plays its plain bar in.
 */
export function bassLinesIn(bass: BassStyle, meter: Meter): PerTier<BassLine> | undefined {
  return partIn(bass, bass.meters, meter, (cut) => derived(bass, cut));
}

/** A figure's `x`s by the sixteenth each is on, and its place in the sequence. */
function placesOf(figure: Figure, written: readonly string[]): Map<number, number> {
  const places = new Map<number, number>();
  let n = 0;
  written.forEach((symbol, step) => {
    if (symbol !== "x") return;
    places.set(step, figure.places?.[n] ?? n);
    n++;
  });
  return places;
}

/** A figure cut by the beat, each `x` keeping its place; the root (place -1) where the bar's shape is marked. */
function figureIn(figure: Figure, cut: Cut): Figure {
  const written = cellsOf(figure.grid);
  const made = cutLine(written, cut, BASS);
  const places = placesOf(figure, written);
  const kept: number[] = [];
  made.line.forEach((symbol, step) => {
    if (symbol !== "x") return;
    const marked = cut.tells && cut.marks.includes(step);
    kept.push(marked ? -1 : (places.get(made.from[step]!) ?? 0));
  });
  const plain = kept.every((place, i) => place === i);
  const { places: _, ...rest } = figure;
  return { ...rest, grid: gridOf(made.line, cut), ...(plain ? {} : { places: kept }) };
}

/** A turn counted back from the barline in the new bar's pulses; nothing where the bar is too short for it. */
function turnIn(turn: Figure, cut: Cut): Figure | undefined {
  const made = cutTail(cellsOf(turn.grid), cut, BASS);
  return made ? { ...turn, grid: made.line.join("") } : undefined;
}

function derived(bass: BassStyle, cut: Cut): PerTier<BassLine> | undefined {
  const source = cut.source === "12/8" ? (bass.meters?.["12/8"] ?? bass.lines) : bass.lines;
  /** Whether a line is sound as one written for the meter, its draw left out (it is asked of the whole). */
  const sound = (line: BassLine): boolean => {
    const { draw: _, ...figures } = line.figures;
    const alone = { ...line, figures };
    return (
      validateBassStyle(bass, { lines: { low: alone, mid: alone, high: alone }, meter: cut.meter })
        .length === 0
    );
  };

  // Each tier's figures and turns, and which figures fail.
  const made = TIERS.map((tier) => {
    const line = source[tier];
    const { turns: _, ...bare } = line;
    const figures = line.figures.options.map((written) => {
      const figure = figureIn(written, cut);
      // Asked alone, at a weight that can be drawn: the weights are asked of the list.
      const alone = { ...figure, weight: 1 };
      return { figure, ok: sound({ ...bare, figures: { ...line.figures, options: [alone] } }) };
    });
    const first = figures.find((figure) => figure.ok)?.figure ?? figures[0]!.figure;
    const turns = (line.turns?.options ?? []).flatMap((written) => {
      const turn = turnIn(written, cut);
      if (!turn) return [];
      const ok = sound({
        ...line,
        figures: { ...line.figures, options: [{ ...first, weight: 1 }] },
        turns: { ...line.turns!, offer: 0, options: [{ ...turn, weight: 1 }] },
      });
      return ok ? [turn] : [];
    });
    return { tier, line, figures, turns };
  });

  // Tiers that share a draw keep the same list (the same riff, thinned): a figure that fails
  // in one of them is left out of all.
  const failing = new Map<string, Set<number>>();
  for (const { line, figures } of made) {
    const draw = line.figures.draw;
    if (draw === undefined) continue;
    const set = failing.get(draw) ?? new Set<number>();
    figures.forEach((figure, i) => {
      if (!figure.ok) set.add(i);
    });
    failing.set(draw, set);
  }

  const part = {} as Record<Tier, BassLine>;
  let derivedTiers = 0;
  for (const { tier, line, figures, turns } of made) {
    const draw = line.figures.draw;
    const out = draw === undefined ? undefined : failing.get(draw);
    const all = figures
      .filter((figure, i) => figure.ok && !out?.has(i))
      .map((figure) => figure.figure);
    // Held: one figure a tier, the one the style draws most often.
    const most = all.reduce(
      (best, figure) => (figure.weight > best.weight ? figure : best),
      all[0]!,
    );
    const kept = cut.tells && most ? [most] : all;
    if (kept.length === 0 || kept.every((figure) => figure.weight === 0)) {
      // The floor is never lower than the plain bar: the line as written, which a bar it does
      // not fit plays plainly (BA-16).
      part[tier] = bass.lines[tier];
      continue;
    }
    derivedTiers++;
    const { turns: _, ...bare } = line;
    const lighter = (level: number) => Math.round(level * BETWEEN_MARKS);
    // The bass marks the shape: a note on a mark at the strong level, the notes between
    // lighter; and held, one shape of notes for each kind of chord.
    const told: Partial<BassLine> = cut.tells
      ? {
          marks: cut.marks.map((step) => step * STEP),
          velocity: {
            ...line.velocity,
            weak: lighter(line.velocity.weak),
            restrike: lighter(line.velocity.restrike),
            ...(line.velocity.off === undefined ? {} : { off: lighter(line.velocity.off) }),
          },
          tones: line.tones.map(({ others: _others, ...first }) => first),
        }
      : {};
    part[tier] = {
      ...bare,
      ...told,
      figures: { ...line.figures, options: kept },
      ...(line.turns && turns.length > 0 ? { turns: { ...line.turns, options: turns } } : {}),
    };
  }
  return derivedTiers === 0 ? undefined : (part as PerTier<BassLine>);
}
