// PROTOTYPE (#2244, the study page; not for merging). The bass seat's part
// for a meter the style has not written, made from the part it wrote.
// See docs/decisions/meters.md, "every style in every meter: the design".
//
// Each tier's figures are cut by the beat (rule a), a hold kept only with its
// note, and each `x` keeps the place in the sequence it had in the written bar
// (`Figure.places`: a tone travels with its cell). Turns are counted back from
// the barline in pulses (rule b). The rest of the line is carried over. Each
// derived figure and turn is asked what `validate.ts` asks of a written one in
// the meter; what fails is left out, and a tier whose every figure fails plays
// the plain form it plays today (`otherMeters`).

import { STEP } from "../../perform/grid.ts";
import type { Cut, Symbols } from "../../style/cut.ts";
import { cutLine, cutTail, grouped } from "../../style/cut.ts";
import type { Derived } from "../../style/derive.ts";
import type { PerTier, Tier } from "../../style/types.ts";
import type { BassLine, BassStyle, Figure } from "./style.ts";
import { DEAD_NOTE, RIFF_TONES } from "./style.ts";
import { validateBassStyle } from "./validate.ts";

const TIERS: readonly Tier[] = ["low", "mid", "high"];

/** A note is struck on `x`, `o`, a tone a riff names and a dead note; `-` holds it. */
const BASS: Symbols = {
  strike: (symbol) =>
    symbol === "x" || symbol === "o" || symbol === DEAD_NOTE || symbol in RIFF_TONES,
  hold: (symbol) => symbol === "-",
  rest: ".",
  held: "-",
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

/** A figure cut by the beat, each `x` keeping its place. */
function figureIn(figure: Figure, cut: Cut): { figure: Figure; grid: string } {
  const written = cellsOf(figure.grid);
  const made = cutLine(written, cut, BASS);
  const places = placesOf(figure, written);
  const kept: number[] = [];
  // The root where the bar's shape is marked (`bass`), and on the downbeat (`one`): place -1.
  const rooted = (step: number) =>
    step === 0 ? cut.clear.has("one") : cut.clear.has("bass") && cut.marks.includes(step);
  made.line.forEach((symbol, step) => {
    if (symbol === "x") kept.push(rooted(step) ? -1 : (places.get(made.from[step]!) ?? 0));
  });
  const grid = grouped(made.line, cut);
  const plain = kept.every((place, i) => place === i);
  const { places: _, ...rest } = figure;
  return {
    figure: { ...rest, grid, ...(plain ? {} : { places: kept }) },
    grid: `${beats(written, cut.cell)}  ->  ${grid}${plain ? "" : `   places ${kept.join(" ")}`}`,
  };
}

/** A turn counted back from the barline in the new bar's pulses, or null where the bar is too short for it. */
function turnIn(turn: Figure, cut: Cut): { figure: Figure; grid: string } | null {
  const written = cellsOf(turn.grid);
  const made = cutTail(written, cut, BASS);
  if (!made) return null;
  const grid = made.line.join("");
  return {
    figure: { ...turn, grid },
    grid: `${fromBarline(written, [cut.cell, cut.cell, cut.cell, cut.cell])}  ->  ${fromBarline(
      made.line,
      cut.pulses.map((p) => p.steps),
    )}`,
  };
}

export function bassIn(bass: BassStyle, cut: Cut): Derived<PerTier<BassLine>> {
  const source = cut.source === "12/8" ? (bass.meters?.["12/8"] ?? bass.lines) : bass.lines;
  const dropped: string[] = [];
  const grids: string[] = [];
  /** The problems in one line as a line written for the meter, its draw left out (it is asked of the whole). */
  const problemsOf = (line: BassLine): string[] => {
    const { draw: _, ...figures } = line.figures;
    const alone = { ...line, figures };
    return validateBassStyle(bass, {
      lines: { low: alone, mid: alone, high: alone },
      meter: cut.meter,
    });
  };

  // Each tier's figures and turns, and which figures fail.
  const made = TIERS.map((tier) => {
    const line = source[tier];
    const { turns: _, ...bare } = line;
    const figures = line.figures.options.map((figure, i) => {
      const label = `${tier} figure ${figure.name ?? i + 1}`;
      const one = figureIn(figure, cut);
      grids.push(`${label.padEnd(36)} ${one.grid}`);
      // Asked alone, at a weight that can be drawn: the weights are asked of the list.
      const alone = { ...one.figure, weight: 1 };
      const problems = problemsOf({ ...bare, figures: { ...line.figures, options: [alone] } });
      if (problems.length > 0) dropped.push(`${label}: ${[...new Set(problems)].join("; ")}`);
      return { figure: one.figure, ok: problems.length === 0 };
    });
    const turns = (line.turns?.options ?? []).flatMap((turn, i) => {
      const label = `${tier} turn ${turn.name ?? i + 1}`;
      const one = turnIn(turn, cut);
      if (!one) {
        dropped.push(`${label}: longer than the bar has pulses`);
        return [];
      }
      grids.push(`${label.padEnd(36)} ${one.grid}`);
      const first = figures.find((figure) => figure.ok)?.figure ?? figures[0]!.figure;
      const problems = problemsOf({
        ...line,
        figures: { ...line.figures, options: [{ ...first, weight: 1 }] },
        turns: { ...line.turns!, offer: 0, options: [{ ...one.figure, weight: 1 }] },
      });
      if (problems.length > 0) {
        dropped.push(`${label}: ${[...new Set(problems)].join("; ")}`);
        return [];
      }
      return [one.figure];
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
  let derived = 0;
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
    const kept = cut.clear.has("hold") && most ? [most] : all;
    if (out && out.size > 0 && figures.some((figure, i) => figure.ok && out.has(i)))
      dropped.push(
        `${tier}: figure(s) ${[...out].map((i) => i + 1).join(", ")} left out too, failing in a tier sharing the draw "${draw}"`,
      );
    if (kept.length === 0 || kept.every((figure) => figure.weight === 0)) {
      // The floor is never lower than now: the line as written, which a bar it does not fit
      // plays plainly (BA-16).
      dropped.push(
        `${tier}: no figure is left, so the tier plays its plain form ("${line.otherMeters}")`,
      );
      part[tier] = bass.lines[tier];
      continue;
    }
    derived++;
    const { turns: _, ...bare } = line;
    const lighter = (level: number) => Math.round(level * 0.78);
    const marked: Partial<BassLine> = cut.clear.has("bass")
      ? {
          marks: cut.marks.map((step) => step * STEP),
          velocity: {
            ...line.velocity,
            weak: lighter(line.velocity.weak),
            restrike: lighter(line.velocity.restrike),
            ...(line.velocity.off === undefined ? {} : { off: lighter(line.velocity.off) }),
          },
        }
      : {};
    // Held: one shape for each kind of chord too, with no other way to play it.
    const held: Partial<BassLine> = cut.clear.has("hold")
      ? { tones: line.tones.map(({ others: _others, ...first }) => first) }
      : {};
    part[tier] = {
      ...bare,
      ...marked,
      ...held,
      figures: { ...line.figures, options: kept },
      ...(line.turns && turns.length > 0 ? { turns: { ...line.turns, options: turns } } : {}),
    };
    if (line.turns && turns.length === 0)
      dropped.push(`${tier}: no turn is left, so it never turns`);
  }
  if (derived === 0) return { part: undefined, dropped, grids };
  return { part: part as PerTier<BassLine>, dropped, grids };
}
