// The chord seat's rhythm book for a meter the style has not written, made
// from the book it wrote (#2244; docs/decisions/meters.md, "every style in
// every meter: the design", section 3).
//
// Every tier's figures, with their turned, alone and soloing forms, are cut by
// the beat; a chord struck before the bar's last beat and held to the barline
// (a push into the next bar written as one long chord) is counted back from
// the barline where the cut would lose it; a figure of two bars is cut a bar
// at a time. Each derived grid is asked what `validate.ts` asks of a written
// one, and one that fails is left out. In a bar whose shape has to be told
// (`Cut.tells`) the hand strikes nothing new in the middle pulse of a group of
// three, and holds one figure a tier with no answer set against it.

import type { Meter } from "../../chart/types.ts";
import { cells } from "../../perform/grid.ts";
import type { Cut, Symbols } from "../../style/cut.ts";
import { cutLine, cutTail, partIn } from "../../style/cut.ts";
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

/** A hand's symbols to the cut, and which of its strokes leave a chord ringing (a scratch does not). */
interface HandSymbols extends Symbols {
  readonly rings: (symbol: string) => boolean;
}

function symbolsOf(articulation: Articulation): HandSymbols {
  return {
    strike: (symbol) => symbol in articulation,
    hold: (symbol) => symbol === HELD,
    rest: ".",
    held: HELD,
    rings: (symbol) => articulation[symbol] !== undefined && !articulation[symbol].muted,
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
 * One written bar cut into the new one: by the beat, and then a push counted back from the
 * barline (a chord struck off the pulse and held to the barline) where the cut did not keep it.
 * A chord struck on a pulse and held (the half note on 3) is time, and is cut by the beat like
 * the rest.
 */
function cutBar(written: readonly string[], cut: Cut, symbols: HandSymbols): string[] {
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
  // One backbeat a group: the hand does not strike in the middle pulse of a group of three.
  // What was sounding goes on; nothing new is struck.
  if (cut.tells) {
    let sounding = false;
    line.forEach((symbol, step) => {
      const weak = cut.pulses.some(
        (pulse) => pulse.weak && step >= pulse.start && step < pulse.start + pulse.steps,
      );
      if (symbols.strike(symbol) && weak) line[step] = sounding ? symbols.held : symbols.rest;
      else if (symbols.strike(symbol)) sounding = symbols.rings(symbol);
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
function cutGridOf(grid: string, cut: Cut, symbols: HandSymbols, figure?: string): string {
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

/**
 * The rhythm book the hand comps from in a bar of a meter: the one the style wrote for it, else
 * the one made from what it wrote; nothing in a meter the band still plays its plain rhythm in,
 * or where the style has no book to make one from.
 */
export function rhythmBookIn(chords: ChordStyle, meter: Meter): RhythmBook | undefined {
  return partIn(chords, chords.meters, meter, (cut) => derived(chords, cut));
}

function derived(chords: ChordStyle, cut: Cut): RhythmBook | undefined {
  const source = cut.source === "12/8" ? chords.meters?.["12/8"] : chords.rhythm;
  if (!source) return undefined;
  let plainTiers = 0;

  const tierIn = (tier: Tier, written: RhythmTier): RhythmTier => {
    const articulation = fitArticulation(written.articulation, cut);
    const figureIn = (figure: CompFigure, bars: 1 | 2): CompFigure | null => {
      const own = figure.articulation ? fitArticulation(figure.articulation, cut) : undefined;
      const art = own ?? articulation;
      const symbols = symbolsOf(art);
      const grid = cutGridOf(figure.grid, cut, symbols);
      if (figureProblems(grid, art, tier, cut.steps, bars).length > 0) return null;
      let made: CompFigure = { ...figure, grid, ...(own ? { articulation: own } : {}) };
      // A form that fails is left out, and the figure is played in its place.
      const form = (key: "turn" | "alone" | "soloing") => {
        const text = figure[key];
        if (text === undefined) return;
        // A turn differs from its figure where it turns: taken once, in the last pulse taking each beat.
        const cutForm = cutGridOf(text, cut, symbols, key === "turn" ? figure.grid : undefined);
        if (figureProblems(cutForm, art, tier, cut.steps).length > 0) {
          const { [key]: _gone, ...rest } = made;
          made = rest;
        } else made = { ...made, [key]: cutForm };
      };
      form("turn");
      form("alone");
      form("soloing");
      return made;
    };
    const every = written.figures
      .map((figure) => figureIn(figure, 1))
      .filter((figure): figure is CompFigure => figure !== null);
    // Held: one figure a tier, the one the style draws most often, with no answer set against
    // it and no phrase of two bars.
    const most = every.reduce(
      (best, figure) => (figure.weight > best.weight ? figure : best),
      every[0]!,
    );
    const figures = cut.tells && most ? [most] : every;
    const answers = cut.tells
      ? []
      : written.answers
          .map((figure) => figureIn(figure, 1))
          .filter((figure): figure is CompFigure => figure !== null);
    let twoBars = cut.tells ? undefined : written.twoBars;
    if (twoBars) {
      const kept = twoBars.figures
        .map((figure) => figureIn(figure, 2))
        .filter((figure): figure is CompFigure => figure !== null);
      twoBars = kept.some((figure) => figure.weight > 0)
        ? { ...twoBars, figures: kept }
        : undefined;
    }
    // A tier left with no figure a section could take takes the plain form.
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
      return { ...withoutTwoBars(base), figures: [plainFigure(chords, cut)], answers: [] };
    }
    return twoBars ? { ...base, figures, twoBars } : { ...withoutTwoBars(base), figures };
  };

  const tiers = {
    low: tierIn("low", source.tiers.low),
    mid: tierIn("mid", source.tiers.mid),
    high: tierIn("high", source.tiers.high),
  };
  return plainTiers === TIERS.length ? undefined : { ...source, tiers };
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
