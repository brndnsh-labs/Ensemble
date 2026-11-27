// PROTOTYPE (#2244, the study page; not for merging). The solo seat's part
// for a meter the style has not written, made from the part it wrote.
// See docs/decisions/meters.md, "every style in every meter: the design".
//
// Each level's rhythms are cut by the beat (rule a); the endings and the bar the
// top note is held in come to rest from the top (rule c); the pickups are
// counted back from the barline in whole pulses (rule b). Each is asked what
// `validate.ts` asks of a written one, and one that fails is left out.

import { cells } from "../../perform/grid.ts";
import type { Cut, Symbols } from "../../style/cut.ts";
import { cutHead, cutLine, cutTail, grouped } from "../../style/cut.ts";
import type { Derived } from "../../style/derive.ts";
import type { Cell, Density, Pickup, SoloStyle, SoloTime } from "./style.ts";
import { endingProblems, pickupProblems, rhythmProblems } from "./validate.ts";

const SYMBOLS: Symbols = {
  strike: (symbol) => symbol === "x",
  hold: (symbol) => symbol === "-",
  rest: ".",
  held: "-",
};

export function soloTimeIn(solo: SoloStyle, cut: Cut): Derived<SoloTime> {
  const source = cut.source === "12/8" ? solo.meters?.["12/8"] : undefined;
  const written: SoloTime = source ?? {
    levels: solo.levels,
    endings: solo.endings,
    pickups: solo.habits.pickup.figures,
    peak: solo.arc.peak.ending,
  };
  const dropped: string[] = [];
  const grids: string[] = [];
  const show = (line: readonly string[]) => grouped(line, cut);
  const pulses = cut.pulses.map((pulse) => pulse.steps);
  const lastPulse = pulses.at(-1)!;

  const levels: Density[] = written.levels.map((level) => {
    const kept: Cell[] = [];
    for (const cell of level.cells) {
      const where = `solo ${level.name} rhythm`;
      const line = cutLine(cells(cell), cut, SYMBOLS).line;
      const made = line.join("");
      grids.push(`${where}  ${cell}  ->  ${show(line)}`);
      const problems = rhythmProblems(made, where, cut.steps);
      if (problems.length > 0) dropped.push(`${where} ${cell}: ${problems.join(" ")}`);
      else kept.push(made);
    }
    if (kept.length === 0) {
      dropped.push(
        `solo ${level.name}: no rhythm left; the level plays the front of its 4/4 rhythms, as today`,
      );
    }
    return {
      ...level,
      notesPerBar: level.notesPerBar * cut.scale,
      cells: kept.length > 0 ? [...new Set(kept)] : level.cells,
    };
  });

  /** An ending, or the top note's bar, come to rest from the top (rule c). */
  const rest = (cell: Cell, what: string): Cell | null => {
    const line = cutHead(cells(cell), cut, SYMBOLS);
    if (!line) {
      grids.push(`solo ${what}  ${cell}  ->  (left out)`);
      dropped.push(
        `solo ${what} ${cell}: its last note would fall in the bar's last pulse, or after it`,
      );
      return null;
    }
    const made = line.join("");
    grids.push(`solo ${what}  ${cell}  ->  ${show(line)}`);
    const problems = endingProblems(made, `solo ${what}`, cut.steps, lastPulse);
    if (problems.length > 0) {
      dropped.push(`solo ${what} ${cell}: ${problems.join(" ")}`);
      return null;
    }
    return made;
  };
  const endings = [
    ...new Set(written.endings.map((cell) => rest(cell, "ending")).filter((cell) => cell !== null)),
  ];
  if (endings.length === 0) dropped.push("solo: no ending left; the 4/4 endings, as today");
  const peak = rest(written.peak, "top note's bar");
  if (peak === null) dropped.push("solo: the top note's bar is the 4/4 one, as today");

  // Pickups: so many pulses before the barline, each made as its pulse is (rule b).
  const pickups: Pickup[] = [];
  for (const figure of written.pickups) {
    const where = "solo pickup";
    const laid = cutTail(cells(figure.cell), cut, SYMBOLS);
    if (!laid) {
      grids.push(`${where}  ${figure.cell}  ->  (left out)`);
      dropped.push(`${where} ${figure.cell}: longer than the bar has pulses`);
      continue;
    }
    const made = laid.line.join("");
    grids.push(`${where}  ${figure.cell}  ->  ${made}`);
    const problems = pickupProblems(made, where, cut.steps, pulses);
    if (problems.length > 0) dropped.push(`${where} ${figure.cell}: ${problems.join(" ")}`);
    else pickups.push({ ...figure, cell: made });
  }
  if (pickups.length === 0) dropped.push("solo: no pickup left; the phrases are not led into");

  return {
    part: {
      levels,
      endings: endings.length > 0 ? endings : written.endings,
      pickups,
      peak: peak ?? written.peak,
    },
    dropped,
    grids,
  };
}
