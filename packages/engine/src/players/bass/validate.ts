// Checks a bass style's meaning. The compiler has already checked its shape;
// this reads it the way the bassist will and says what he could not play.

import { cells, STEP } from "../../perform/grid.ts";
import type { Hold, Tier } from "../../style/types.ts";
import { SHORTEST } from "./line.ts";
import type { BassLine, BassStyle, ChordCondition, Tone } from "./style.ts";
import { FIGURE_STEPS, LEAD_IN_KINDS, ROOT_MOTIONS, TONES } from "./style.ts";
import { HIGHEST_ROOT, LOW_E, TOP } from "./tones.ts";

const TIERS: readonly Tier[] = ["low", "mid", "high"];
const HOLDS: readonly Hold[] = ["song", "section", "pass", "phrase", "bar"];
/** The ending's button is this much harder than its chord, and must still be a MIDI level. */
const LOUDEST_ENDING = 115;

/** Every problem in a bass style, in words. An empty list means the data is sound. */
export function validateBassStyle(bass: BassStyle): string[] {
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

  for (const tier of TIERS) {
    const line = bass.lines[tier];
    checkLine(line, `${tier} line`);
    if (line.ceiling < register.highest)
      problems.push(
        `${tier} line: the ceiling ${line.ceiling} is under the highest root ${register.highest}.`,
      );
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
      const at = `${where}, figure ${i + 1} "${figure.grid}"`;
      const grid = cells(figure.grid);
      const bad = grid.filter((symbol) => !"xo-.".includes(symbol));
      if (bad.length > 0) {
        const named = [...new Set(bad)].map((symbol) => `"${symbol}"`).join(", ");
        problems.push(`${at}: it uses ${named}; write x, o, - or a dot.`);
      }
      if (grid.length !== FIGURE_STEPS)
        problems.push(`${at}: it has ${grid.length} steps; a bar of 4/4 is ${FIGURE_STEPS}.`);
      if (!grid.includes("x")) problems.push(`${at}: it never plays a tone (x).`);
      let sounding = false;
      let tone = false;
      grid.forEach((symbol, step) => {
        if (symbol === "-" && !sounding)
          problems.push(`${at}: step ${step + 1} holds a note that was never struck.`);
        if (symbol === "o" && !tone)
          problems.push(`${at}: step ${step + 1} strikes a tone again before any tone was played.`);
        if (symbol === "x") tone = true;
        sounding = symbol !== ".";
      });
      // No note shorter than half a sixteenth (BA-14).
      grid.forEach((symbol, step) => {
        if (symbol !== "x" && symbol !== "o") return;
        let length = 1;
        while (grid[step + length] === "-") length++;
        const next = grid[step + length];
        const part =
          symbol === "o" ? line.length.short : next === "o" ? line.length.long : line.length.note;
        if (length * STEP * part < SHORTEST)
          problems.push(
            `${at}: the note on step ${step + 1} would last ${Math.round(length * STEP * part)} ticks; the shortest bass note is ${SHORTEST}.`,
          );
      });
    });

    if (line.otherMeters !== "pulses" && line.otherMeters !== "downbeat")
      problems.push(`${where}: "${line.otherMeters}" is not a way to play other meters.`);
    if (line.ceiling > TOP)
      problems.push(
        `${where}: the ceiling ${line.ceiling} is over the instrument's top note (${TOP}).`,
      );
    share(line.length.note, `${where}, note length`);
    share(line.length.long, `${where}, long length`);
    share(line.length.short, `${where}, short length`);
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
  for (const tier of TIERS) {
    chance(lead.chance.inside[tier], `lead-in chance inside a section, ${tier}`);
    chance(lead.chance.intoSection[tier], `lead-in chance into a section, ${tier}`);
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

  level(bass.ending.velocity, "ending velocity", LOUDEST_ENDING);
  return problems;
}
