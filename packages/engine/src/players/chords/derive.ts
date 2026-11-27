// PROTOTYPE (#2244, the study page; not for merging). The chords seat's part
// for a meter the style has not written, made from the part it wrote.
// See docs/decisions/meters.md, "every style in every meter: the design".
//
// Every tier's figures, with their turned, alone and soloing forms, are cut by
// the beat (rule a); a chord struck before the bar's last beat and held to the
// barline (a push into the next bar written as one long chord) is counted back
// from the barline where the cut would lose it (rule b); a figure of two bars
// is cut a bar at a time. Each derived grid is asked what `validate.ts` asks of
// a written one, and one that fails is left out.

import { cells } from "../../perform/grid.ts";
import type { Cut, Symbols } from "../../style/cut.ts";
import { cutLine, cutTail, grouped } from "../../style/cut.ts";
import type { Derived } from "../../style/derive.ts";
import type { Tier } from "../../style/types.ts";
import { HELD } from "./figure.ts";
import type {
  Articulation,
  Attack,
  ChordStyle,
  CompFigure,
  RhythmBook,
  RhythmTier,
} from "./style.ts";
import { figureProblems } from "./validate.ts";

const TIERS: readonly Tier[] = ["low", "mid", "high"];

function symbolsOf(articulation: Articulation): Symbols {
  return {
    strike: (symbol) => symbol in articulation,
    hold: (symbol) => symbol === HELD,
    rest: ".",
    held: HELD,
  };
}

/** A stroke written to ring a bar ("steps: 16", or 24 in the twelve) rings the new bar. */
function fitAttack(attack: Attack, cut: Cut): Attack {
  return attack.steps >= cut.cell * 4 ? { ...attack, steps: cut.steps } : attack;
}

function fitArticulation(articulation: Articulation, cut: Cut): Articulation {
  return Object.fromEntries(
    Object.entries(articulation).map(([symbol, attack]) => [symbol, fitAttack(attack, cut)]),
  );
}

/**
 * One written bar cut into the new one: rule (a), then rule (b) for a push: a chord struck off
 * the pulse and held to the barline, where (a) did not keep it. A chord struck on a pulse and
 * held (the half note on 3) is time, and is cut by the beat like the rest.
 */
function cutBar(written: readonly string[], cut: Cut, symbols: Symbols): string[] {
  const { line: made, from } = cutLine(written, cut, symbols);
  const line = [...made];
  let last = -1;
  written.forEach((symbol, step) => {
    if (symbols.strike(symbol)) last = step;
  });
  const tail = written.slice(last);
  const held =
    last % cut.cell !== 0 && tail.length > 1 && tail.slice(1).every((s) => symbols.hold(s));
  if (held && !from.includes(last)) {
    const laid = cutTail(tail, cut, symbols);
    if (laid && laid.line.length <= cut.steps - cut.pulses[0]!.steps) {
      const at = cut.steps - laid.line.length;
      laid.line.forEach((symbol, i) => {
        line[at + i] = symbol;
      });
    }
  }
  // One backbeat a group (PROTOTYPE, the second study): the hand does not strike in the middle
  // pulse of a group of three. What was sounding goes on; nothing new is struck.
  if (cut.clear.has("back")) {
    let sounding = false;
    line.forEach((symbol, step) => {
      const weak = cut.pulses.some(
        (pulse) => pulse.weak && step >= pulse.start && step < pulse.start + pulse.steps,
      );
      if (symbols.strike(symbol) && weak) line[step] = sounding ? symbols.held : symbols.rest;
      else if (symbols.strike(symbol)) sounding = true;
      else if (symbols.hold(symbol)) {
        if (!sounding) line[step] = symbols.rest;
      } else sounding = false;
    });
  }
  return line;
}

/**
 * A figure's grid in the new bar, a bar at a time. A turn (`figure`: the bar it turns) is taken
 * once: each pulse plays the turned bar only where it is the last pulse taking its beat, and
 * the figure as written elsewhere.
 */
function cutGridOf(grid: string, cut: Cut, symbols: Symbols, figure?: string): string {
  const written = cells(grid);
  const plain = figure === undefined ? undefined : cells(figure);
  const bar = cut.cell * 4;
  const bars = Math.max(1, Math.round(written.length / bar));
  const made: string[] = [];
  for (let b = 0; b < bars; b++) {
    const line = cutBar(written.slice(b * bar, (b + 1) * bar), cut, symbols);
    if (plain) {
      const own = cutBar(plain.slice(b * bar, (b + 1) * bar), cut, symbols);
      for (const pulse of cut.pulses) {
        if (pulse.turn) continue;
        for (let i = pulse.start; i < pulse.start + pulse.steps; i++) line[i] = own[i]!;
      }
    }
    made.push(...line);
  }
  return made.join("");
}

/** A grid as the study page prints it, a pulse to a group, bar by bar. */
function shown(grid: string, cut: Cut): string {
  const symbols = cells(grid);
  const out: string[] = [];
  for (let at = 0; at < symbols.length; at += cut.steps) {
    out.push(grouped(symbols.slice(at, at + cut.steps), cut));
  }
  return out.join(" | ");
}

export function chordsIn(chords: ChordStyle, cut: Cut): Derived<RhythmBook> {
  const source = cut.source === "12/8" ? chords.meters?.["12/8"] : chords.rhythm;
  if (!source) {
    return {
      part: undefined,
      dropped: [
        `chords: nothing written for ${cut.source}, so nothing to derive (the plain rhythm)`,
      ],
      grids: [],
    };
  }
  const dropped: string[] = [];
  const grids: string[] = [];
  let plainTiers = 0;

  const tierIn = (tier: Tier, written: RhythmTier): RhythmTier => {
    const articulation = fitArticulation(written.articulation, cut);
    const figureIn = (figure: CompFigure, bars: 1 | 2, list: string): CompFigure | null => {
      const own = figure.articulation ? fitArticulation(figure.articulation, cut) : undefined;
      const art = own ?? articulation;
      const symbols = symbolsOf(art);
      const where = `chords ${tier} ${list} "${figure.name}"`;
      const grid = cutGridOf(figure.grid, cut, symbols);
      const problems = figureProblems(grid, art, where, cut.steps, bars);
      grids.push(`${where}  ${figure.grid}  ->  ${shown(grid, cut)}`);
      if (problems.length > 0) {
        dropped.push(`${where}: ${problems.join(" ")}`);
        return null;
      }
      let made: CompFigure = { ...figure, grid, ...(own ? { articulation: own } : {}) };
      const form = (key: "turn" | "alone" | "soloing", label: string) => {
        const text = figure[key];
        if (text === undefined) return;
        // A turn differs from its figure where it turns: taken once, in the last pulse taking each beat.
        const derived = cutGridOf(text, cut, symbols, key === "turn" ? figure.grid : undefined);
        const wrong = figureProblems(derived, art, `${where}, ${label}`, cut.steps);
        grids.push(`${where}, ${label}  ${text}  ->  ${shown(derived, cut)}`);
        if (wrong.length > 0) {
          dropped.push(`${where}, ${label}: ${wrong.join(" ")} (played as the figure)`);
          const { [key]: _gone, ...rest } = made;
          made = rest;
          return;
        }
        made = { ...made, [key]: derived };
      };
      form("turn", "its turn");
      form("alone", "with no bassist");
      form("soloing", "under the soloist");
      return made;
    };
    const every = written.figures
      .map((figure) => figureIn(figure, 1, "figure"))
      .filter((figure): figure is CompFigure => figure !== null);
    // Held (PROTOTYPE, the second study): one figure a tier, the one the style draws most
    // often, with no answer set against it and no phrase of two bars.
    const hold = cut.clear.has("hold");
    const most = every.reduce(
      (best, figure) => (figure.weight > best.weight ? figure : best),
      every[0]!,
    );
    const figures = hold && most ? [most] : every;
    const answers = hold
      ? []
      : written.answers
          .map((figure) => figureIn(figure, 1, "answer"))
          .filter((figure): figure is CompFigure => figure !== null);
    let twoBars = hold ? undefined : written.twoBars;
    if (twoBars) {
      const kept = twoBars.figures
        .map((figure) => figureIn(figure, 2, "two bars"))
        .filter((figure): figure is CompFigure => figure !== null);
      twoBars = kept.some((figure) => figure.weight > 0)
        ? { ...twoBars, figures: kept }
        : undefined;
      if (!twoBars)
        dropped.push(`chords ${tier}: no figure of two bars left; phrases played from their plan`);
    }
    // A tier left with no figure a section could take takes the plain form it has today.
    const usable = figures.some(
      (figure) =>
        figure.weight > 0 &&
        cells(figure.grid).some((symbol) => symbol in (figure.articulation ?? articulation)),
    );
    const base = {
      ...written,
      articulation,
      arrival: fitAttack(written.arrival, cut),
      busy: { from: written.busy.from * cut.scale, to: written.busy.to * cut.scale },
      answers,
    };
    if (!usable) {
      plainTiers++;
      dropped.push(
        `chords ${tier}: no figure left a section could take; the tier plays the plain form`,
      );
      return { ...withoutTwoBars(base), figures: [plainFigure(chords, cut)], answers: [] };
    }
    return twoBars ? { ...base, figures, twoBars } : { ...withoutTwoBars(base), figures };
  };

  const tiers = {
    low: tierIn("low", source.tiers.low),
    mid: tierIn("mid", source.tiers.mid),
    high: tierIn("high", source.tiers.high),
  };
  if (plainTiers === TIERS.length) return { part: undefined, dropped, grids };
  return { part: { ...source, tiers }, dropped, grids };
}

function withoutTwoBars<T extends { readonly twoBars?: unknown }>(tier: T): Omit<T, "twoBars"> {
  const { twoBars: _gone, ...rest } = tier;
  return rest;
}

/**
 * The plain form as a figure, for a tier left with nothing: a strike a pulse (every pulse but the
 * first, for an offbeat part) where the style's plain rhythm strikes on the pulse, else the chord
 * held through the bar.
 */
function plainFigure(chords: ChordStyle, cut: Cut): CompFigure {
  const line = new Array<string>(cut.steps).fill(".");
  if (chords.plain.pulse) {
    cut.pulses.forEach((pulse, i) => {
      if (chords.plain.pulse === "offbeats" && i === 0) return;
      line[pulse.start] = "x";
    });
  } else {
    line.fill(HELD);
    line[0] = "x";
  }
  return {
    name: "plain",
    weight: 1,
    grid: line.join(""),
    articulation: { x: { level: chords.plain.velocity.beat, steps: 4 * chords.plain.length } },
    groove: true,
  };
}
