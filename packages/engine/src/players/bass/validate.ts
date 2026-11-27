// Checks a bass style's meaning. The compiler has already checked its shape;
// this reads it the way the bassist will and says what he could not play.

import type { Meter } from "../../chart/types.ts";
import { cells, STEP } from "../../perform/grid.ts";
import { barSteps, pulseTicks } from "../../perform/meter.ts";
import { readMeter } from "../../style/meters.ts";
import type { Hold, Tier } from "../../style/types.ts";
import { SHORTEST } from "./line.ts";
import type { BassLine, BassStyle, ChordCondition, Figure, RootMotion, Tone } from "./style.ts";
import {
  DEAD_NOTE,
  FIGURE_STEPS,
  LEAD_IN_KINDS,
  RIFF_TONES,
  ROOT_MOTIONS,
  TONES,
} from "./style.ts";
import { HIGHEST_ROOT, LOW_E, TOP } from "./tones.ts";

const TIERS: readonly Tier[] = ["low", "mid", "high"];
const HOLDS: readonly Hold[] = ["song", "section", "pass", "phrase", "bar"];
/** The ending's button is this much harder than its chord, and must still be a MIDI level. */
const LOUDEST_ENDING = 115;

/**
 * A turn's lengths in a meter: the bar's last pulse, or its last two. PROTOTYPE (#2244): said
 * from the barline, so it holds in a bar of uneven pulses; in a bar of even ones it is a pulse
 * or two, as it was.
 */
function turnLengths(meter: Meter): readonly number[] {
  const steps = pulseTicks(meter).map((ticks) => Math.round(ticks / STEP));
  return [steps.at(-1)!, steps.at(-1)! + (steps.at(-2) ?? steps.at(-1)!)];
}

/**
 * Every problem in a bass style, in words. An empty list means the data is sound.
 *
 * PROTOTYPE (#2244): with `only`, the problems in those lines alone, as lines written for that
 * meter: what a part derived for a meter is asked (`derive.ts`).
 */
export function validateBassStyle(
  bass: BassStyle,
  only?: { readonly lines: BassStyle["lines"]; readonly meter: Meter },
): string[] {
  const problems: string[] = [];
  const share = (value: number, where: string) => {
    if (!(value > 0 && value <= 1))
      problems.push(
        `${where}: ${value} is not a share of a note's space; write more than 0, up to 1.`,
      );
  };
  const level = (value: number, where: string, top = 127) => {
    if (!(value >= 1 && value <= top))
      problems.push(`${where}: ${value} is not a level from 1 to ${top}.`);
  };
  const chance = (value: number, where: string) => {
    if (!(value >= 0 && value <= 1))
      problems.push(`${where}: ${value} is not a chance from 0 to 1.`);
  };
  const hold = (value: Hold, where: string) => {
    if (!HOLDS.includes(value))
      problems.push(`${where}: "${value}" is not a span a choice can be held for.`);
  };
  const tones = (list: readonly Tone[] | undefined, where: string) => {
    for (const tone of list ?? []) {
      if (!TONES.includes(tone)) problems.push(`${where}: "${tone}" is not a tone.`);
    }
  };

  // The register: every chord needs a root somewhere on the instrument.
  const register = bass.register;
  if (register.lowest < LOW_E)
    problems.push(`register: the lowest root ${register.lowest} is under the open E (${LOW_E}).`);
  if (register.highest > HIGHEST_ROOT)
    problems.push(`register: the highest root ${register.highest} is over E3 (${HIGHEST_ROOT}).`);
  if (register.highest - register.lowest < 11)
    problems.push(
      "register: the roots span less than an octave, so some chords have no root to play.",
    );
  if (!(register.pull >= 0 && register.pull <= 1))
    problems.push(`register: a pull of ${register.pull} is not between 0 and 1.`);
  if (register.anchor.from > register.anchor.to)
    problems.push("register: the anchor's range is written upside down.");
  hold(register.anchor.hold, "register anchor");

  // The bar the lines being checked are written for: its sixteenths, and a pulse of it.
  let figureSteps = FIGURE_STEPS;
  let turnSteps: readonly number[] = [4, 8];
  let draws = new Map<string, string>();
  const checkLines = (lines: BassStyle["lines"], label: string) => {
    for (const tier of TIERS) {
      const line = lines[tier];
      checkLine(line, `${label}${tier} line`);
      if (line.ceiling < register.highest)
        problems.push(
          `${label}${tier} line: the ceiling ${line.ceiling} is under the highest root ${register.highest}.`,
        );
    }
  };
  if (only) {
    figureSteps = barSteps(only.meter);
    turnSteps = turnLengths(only.meter);
    checkLines(only.lines, "");
    return problems;
  }
  checkLines(bass.lines, "");
  for (const [name, lines] of Object.entries(bass.meters ?? {})) {
    const meter = readMeter(name);
    if (!meter || !lines) {
      problems.push(`meters: "${name}" is not a meter a chart can write, or is 4/4.`);
      continue;
    }
    figureSteps = barSteps(meter);
    turnSteps = turnLengths(meter);
    draws = new Map();
    checkLines(lines, `in ${name}, `);
  }
  figureSteps = FIGURE_STEPS;
  turnSteps = [4, 8];

  /** A figure's or a turn's grid, symbol by symbol. Returns its cells. */
  function checkGrid(figure: Figure, line: BassLine, at: string): readonly string[] {
    const grid = cells(figure.grid);
    const strikes = (symbol: string | undefined) =>
      symbol === "x" || symbol === DEAD_NOTE || (symbol !== undefined && symbol in RIFF_TONES);
    const bad = grid.filter((symbol) => !strikes(symbol) && !"o-.".includes(symbol));
    if (bad.length > 0) {
      const named = [...new Set(bad)].map((symbol) => `"${symbol}"`).join(", ");
      problems.push(
        `${at}: it uses ${named}; write x, o, - or a dot, a tone (R 2 3 4 5 6 7 8) or m for a dead note.`,
      );
    }
    if (!grid.some((symbol) => symbol === "x" || symbol in RIFF_TONES))
      problems.push(`${at}: it never plays a tone (x, or a tone by name).`);
    let sounding = false;
    let tone = false;
    grid.forEach((symbol, step) => {
      if (symbol === "-" && !sounding)
        problems.push(`${at}: step ${step + 1} holds a note that was never struck.`);
      if (symbol === "o" && !tone)
        problems.push(`${at}: step ${step + 1} strikes a tone again before any tone was played.`);
      if (strikes(symbol) && symbol !== DEAD_NOTE) tone = true;
      sounding = symbol !== ".";
    });
    // No note shorter than half a sixteenth (BA-14). With a gap a note has at least a
    // sixteenth, however the figure is written.
    grid.forEach((symbol, step) => {
      if (!strikes(symbol) && symbol !== "o") return;
      if (symbol === DEAD_NOTE) return;
      let length = 1;
      while (grid[step + length] === "-") length++;
      const next = grid[step + length];
      const part =
        symbol === "o" ? line.length.short : next === "o" ? line.length.long : line.length.note;
      const gap = line.length.gap;
      // A gap that is no gap at all is said once, below, and not of every note.
      if (gap !== undefined && !(gap > 0)) return;
      const space = gap === undefined ? length : Math.min(1, gap);
      if (space * STEP * part < SHORTEST)
        problems.push(
          `${at}: the note on step ${step + 1} would last ${Math.round(space * STEP * part)} ticks; the shortest bass note is ${SHORTEST}.`,
        );
    });
    return grid;
  }

  function checkLine(line: BassLine, where: string): void {
    // Tones.
    if (line.tones.length === 0) problems.push(`${where}: there are no tones to play.`);
    else if (line.tones[line.tones.length - 1]!.when !== undefined)
      problems.push(
        `${where}: the last tone sequence has a condition, so some chords have no line.`,
      );
    line.tones.forEach((sequence, i) => {
      const at = `${where}, tone sequence ${i + 1}`;
      checkCondition(sequence.when, at);
      [sequence, ...(sequence.others ?? [])].forEach((shape, n) => {
        const named = `${at}, shape ${shape.name ?? n + 1}`;
        if (shape.home !== undefined && !(shape.home >= 0))
          problems.push(`${named}: its home weight is negative or not a number.`);
        if (shape.answer !== undefined && !(shape.answer >= 0))
          problems.push(`${named}: its answer weight is negative or not a number.`);
        if (shape.bars.length === 0) problems.push(`${named}: it has no bars.`);
        shape.bars.forEach((bar, b) => {
          if (bar.length === 0) problems.push(`${named}, bar ${b + 1}: it has no tones.`);
          tones(bar, `${named}, bar ${b + 1}`);
        });
        if (shape.bars[0]?.[0] !== undefined && shape.bars[0][0] !== "R")
          problems.push(
            `${named}: it starts on "${shape.bars[0][0]}", but a chord always arrives on its bass note (R).`,
          );
      });
      if (sequence.bars.length === 0) problems.push(`${at}: it has no bars.`);
      sequence.bars.forEach((bar, b) => {
        if (bar.length === 0) problems.push(`${at}, bar ${b + 1}: it has no tones.`);
        tones(bar, `${at}, bar ${b + 1}`);
      });
      // A chord's arrival is always its bass note (BA-01); a sequence that starts
      // elsewhere would not be played as written.
      if (sequence.bars[0]?.[0] !== undefined && sequence.bars[0][0] !== "R")
        problems.push(
          `${at}: it starts on "${sequence.bars[0][0]}", but a chord always arrives on its bass note (R).`,
        );
    });

    // Figures.
    const figures = line.figures.options;
    hold(line.figures.hold, `${where}, figures`);
    if (figures.length === 0) problems.push(`${where}: there is no rhythm figure to choose from.`);
    else if (figures.some((figure) => !(figure.weight >= 0)))
      problems.push(`${where}: a figure's weight is negative or not a number.`);
    else if (figures.every((figure) => figure.weight === 0))
      problems.push(`${where}: every figure's weight is zero, so none can be chosen.`);
    figures.forEach((figure, i) => {
      const at = `${where}, figure ${figure.name ?? i + 1} "${figure.grid}"`;
      const grid = checkGrid(figure, line, at);
      if (grid.length !== figureSteps)
        problems.push(
          figureSteps === FIGURE_STEPS
            ? `${at}: it has ${grid.length} steps; a bar of 4/4 is ${FIGURE_STEPS}.`
            : `${at}: it has ${grid.length} steps; a bar of this meter is ${figureSteps}.`,
        );
    });

    // Turns: a beat or two laid over the end of the bar.
    const turns = line.turns;
    if (turns) {
      chance(turns.offer, `${where}, turns offered`);
      hold(turns.hold, `${where}, turns`);
      if (turns.options.some((turn) => !(turn.weight >= 0)))
        problems.push(`${where}: a turn's weight is negative or not a number.`);
      else if (turns.offer > 0 && turns.options.every((turn) => turn.weight === 0))
        problems.push(`${where}: turns are offered but every turn's weight is zero.`);
      turns.options.forEach((turn, i) => {
        const at = `${where}, turn ${turn.name ?? i + 1} "${turn.grid}"`;
        const grid = checkGrid(turn, line, at);
        if (!turnSteps.includes(grid.length))
          problems.push(
            `${at}: it has ${grid.length} steps; a turn is one beat or two, ${turnSteps[0]} sixteenths or ${turnSteps[1]}.`,
          );
      });
    }

    // A walked line.
    const walked = line.walked;
    if (walked) {
      if (!(Number.isInteger(walked.reach) && walked.reach >= 2 && walked.reach <= 12))
        problems.push(
          `${where}, walked: a reach of ${walked.reach} semitones is not a whole number from 2 to 12.`,
        );
      if (!(Number.isInteger(walked.intoApproach) && walked.intoApproach >= 2))
        problems.push(
          `${where}, walked: the move onto the approach, ${walked.intoApproach}, must be a whole step or more, or some approaches cannot be reached.`,
        );
      const weights = [
        walked.weights.chord.strong,
        walked.weights.chord.weak,
        walked.weights.scale.strong,
        walked.weights.scale.weak,
      ];
      if (weights.some((weight) => !(weight >= 0)))
        problems.push(`${where}, walked: a weight is negative or not a number.`);
      if (!(walked.weights.chord.strong > 0 && walked.weights.chord.weak > 0))
        problems.push(
          `${where}, walked: chord tones need a weight on strong and on weak beats, or a walk can have no note to play.`,
        );
      const ways = [walked.toward, walked.away, walked.onward, walked.back, walked.early];
      if (ways.some((way) => !(way > 0)))
        problems.push(
          `${where}, walked: the weights toward, away, onward, back and early must be more than 0.`,
        );
      chance(walked.otherOctave, `${where}, walked: the other octave`);
    }

    // The same draw under one name must be the same list, or a section's quiet riff is
    // not its loud one thinned.
    const drawn = line.figures.draw;
    if (drawn !== undefined) {
      const signature = figures.map((figure) => figure.weight).join(",");
      const known = draws.get(drawn);
      if (known === undefined) draws.set(drawn, signature);
      else if (known !== signature)
        problems.push(
          `${where}: its figures share the draw "${drawn}" with another tier but not its list of weights (${signature} against ${known}).`,
        );
    }

    if (line.otherMeters !== "pulses" && line.otherMeters !== "downbeat")
      problems.push(`${where}: "${line.otherMeters}" is not a way to play other meters.`);
    if (line.ceiling > TOP)
      problems.push(
        `${where}: the ceiling ${line.ceiling} is over the instrument's top note (${TOP}).`,
      );
    share(line.length.note, `${where}, note length`);
    share(line.length.long, `${where}, long length`);
    share(line.length.short, `${where}, short length`);
    if (line.length.gap !== undefined && !(line.length.gap > 0))
      problems.push(
        `${where}: a gap of ${line.length.gap} sixteenths is no room for a note; write more than 0.`,
      );
    for (const [name, value] of Object.entries(line.velocity)) {
      level(value, `${where}, ${name} velocity`);
    }
  }

  function checkCondition(when: ChordCondition | undefined, where: string): void {
    if (!when) return;
    tones(when.has, `${where}, "has"`);
    tones(when.lacks, `${where}, "lacks"`);
    if (when.family?.length === 0)
      problems.push(`${where}: its list of chord families is empty, so it is never played.`);
    const both = (when.has ?? []).filter((tone) => when.lacks?.includes(tone));
    if (both.length > 0)
      problems.push(`${where}: it asks for a chord that both has and lacks ${both.join(", ")}.`);
  }

  // Lead-ins.
  const lead = bass.leadIn;
  if (!["beat", "eighth", "sixteenth"].includes(lead.at))
    problems.push(
      `lead-in: "${lead.at}" is not a place before the change; write beat, eighth or sixteenth.`,
    );
  hold(lead.hold, "lead-in");
  if (lead.keepsShape !== undefined && typeof lead.keepsShape !== "boolean")
    problems.push("lead-in: keepsShape is true or false.");
  for (const tier of TIERS) {
    chance(lead.chance.inside[tier], `lead-in chance inside a section, ${tier}`);
    chance(lead.chance.intoSection[tier], `lead-in chance into a section, ${tier}`);
    if (lead.chance.intoPhrase)
      chance(lead.chance.intoPhrase[tier], `lead-in chance into a phrase, ${tier}`);
  }
  chance(lead.chance.intoEnding, "lead-in chance into the ending");
  for (const motion of ROOT_MOTIONS) {
    const weights = lead.kinds[motion];
    if (!weights) {
      problems.push(`lead-in kinds: "${motion}" is missing.`);
      continue;
    }
    for (const kind of LEAD_IN_KINDS) {
      if (!(weights[kind] >= 0))
        problems.push(`lead-in kinds, ${motion}: the weight of "${kind}" is negative or missing.`);
    }
  }

  // Walks.
  const walks = bass.walks;
  if (walks) {
    for (const tier of TIERS) {
      chance(walks.offer.end[tier], `walks offered at the end of a line, ${tier}`);
      chance(walks.offer.inside[tier], `walks offered inside a line, ${tier}`);
      if (walks.offer.intoSection)
        chance(walks.offer.intoSection[tier], `walks offered into a section, ${tier}`);
    }
    for (const [motion, list] of Object.entries(walks.kinds)) {
      if (!ROOT_MOTIONS.includes(motion as RootMotion))
        problems.push(`walks: "${motion}" is not a way the bass note moves.`);
      (list ?? []).forEach((walk, i) => {
        const at = `walks, ${motion}, ${walk.name ?? i + 1}`;
        checkCondition(walk.when, at);
        if (!(walk.weight >= 0)) problems.push(`${at}: its weight is negative or not a number.`);
        if (walk.toward !== "up" && walk.toward !== "down")
          problems.push(`${at}: "${walk.toward}" is not a way to walk; write up or down.`);
        if (walk.last !== "half" && walk.last !== "whole")
          problems.push(`${at}: "${walk.last}" is not a last step; write half or whole.`);
        tones(walk.tones, at);
        if (walk.tones[0] !== "R")
          problems.push(
            `${at}: a walk starts on the chord's root (R), where it still states the chord.`,
          );
        if (walk.length !== undefined) share(walk.length, `${at}, its notes' length`);
        if (walk.grid !== undefined) {
          const grid = cells(walk.grid);
          const named = (symbol: string) => symbol in RIFF_TONES;
          if (grid.some((symbol) => !["x", "-", "."].includes(symbol) && !named(symbol)))
            problems.push(`${at}: its grid is written in x, -, . and the tones a riff names.`);
          if (grid[0] !== "x")
            problems.push(
              `${at}: its grid strikes the root on the downbeat, where it states the chord.`,
            );
          const strokes = grid.filter((symbol) => symbol === "x").length;
          if (strokes !== walk.tones.length + 1)
            problems.push(
              `${at}: its grid strikes ${strokes} notes; a walk of ${walk.tones.length + 1} notes needs as many.`,
            );
          // A bar of four, or of a meter the line is written for: any other grid never walks.
          const bars = [
            FIGURE_STEPS,
            ...Object.keys(bass.meters ?? {}).flatMap((name) => {
              const meter = readMeter(name);
              return meter ? [barSteps(meter)] : [];
            }),
          ];
          if (!bars.includes(grid.length))
            problems.push(
              `${at}: its grid is ${grid.length} sixteenths, which is no bar the line is written for (${bars.join(", ")}).`,
            );
        }
      });
    }
  }

  const home = walks?.ending;
  if (home) {
    if (home.velocity.length !== 4)
      problems.push("walks, ending: a level for each of the bar's four beats.");
    home.velocity.forEach((velocity, beat) => {
      level(velocity, `walks, ending, beat ${beat + 1}`, LOUDEST_ENDING);
    });
    share(home.length, "walks, ending, its notes' length");
    const last = home.velocity[home.velocity.length - 1] ?? 0;
    if (bass.ending.velocity < last)
      problems.push(
        `walks, ending: the final root (${bass.ending.velocity}) is struck at least as hard as the walk's last note (${last}).`,
      );
  }

  // Choosing by the phrase.
  const phrase = bass.phrase;
  if (phrase) {
    if (!(Number.isInteger(phrase.candidates) && phrase.candidates >= 1))
      problems.push(`phrase: ${phrase.candidates} plans is not a whole number of at least 1.`);
    chance(phrase.answers, "phrase: the chance of an answer");
    chance(phrase.halfSteps.min, "phrase: the fewest half steps");
    chance(phrase.halfSteps.max, "phrase: the most half steps");
    if (phrase.halfSteps.min > phrase.halfSteps.max)
      problems.push("phrase: the band of half steps is written upside down.");
  }

  level(bass.ending.velocity, "ending velocity", LOUDEST_ENDING);
  return problems;
}
