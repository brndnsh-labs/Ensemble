// The soloist's rhythms for a meter the style has not written, made from the
// ones it wrote (#2244; docs/decisions/meters.md, "every style in every meter:
// the design", section 3).
//
// Each level's rhythms are cut by the beat; the endings and the bar the top
// note is held in come to rest from the top; the pickups are counted back from
// the barline in whole pulses. Each is asked what `validate.ts` asks of a
// written one, and one that fails is left out; a list left empty keeps the
// written one, whose front the line then takes.

import type { Meter } from "../../chart/types.ts";
import { cells } from "../../perform/grid.ts";
import type { Cut, Symbols } from "../../style/cut.ts";
import { cutHead, cutLine, cutTail, partIn } from "../../style/cut.ts";
import type { Cell, Density, Pickup, SoloStyle, SoloTime } from "./style.ts";
import { endingProblems, pickupProblems, rhythmProblems } from "./validate.ts";

const SYMBOLS: Symbols = {
  strike: (symbol) => symbol === "x",
  hold: (symbol) => symbol === "-",
  rest: ".",
  held: "-",
};

/**
 * What the soloist has for a bar of a meter: the rhythms the style wrote for it, else the ones
 * made from what it wrote; nothing in a meter the line still takes the front of a 4/4 rhythm in.
 */
export function soloTimeIn(solo: SoloStyle, meter: Meter): SoloTime | undefined {
  return partIn(solo, solo.meters, meter, (cut) => derived(solo, cut));
}

function derived(solo: SoloStyle, cut: Cut): SoloTime {
  const source = cut.source === "12/8" ? solo.meters?.["12/8"] : undefined;
  const written: SoloTime = source ?? {
    levels: solo.levels,
    endings: solo.endings,
    pickups: solo.habits.pickup.figures,
    peak: solo.arc.peak.ending,
  };
  const pulses = cut.pulses.map((pulse) => pulse.steps);
  const lastPulse = pulses.at(-1)!;

  const levels: Density[] = written.levels.map((level) => {
    const kept = level.cells
      .map((cell) => cutLine(cells(cell), cut, SYMBOLS).line.join(""))
      .filter((made) => rhythmProblems(made, level.name, cut.steps).length === 0);
    return {
      ...level,
      notesPerBar: level.notesPerBar * cut.scale,
      cells: kept.length > 0 ? [...new Set(kept)] : level.cells,
    };
  });

  /** An ending, or the top note's bar, come to rest from the top; null where it does not fit the bar. */
  const rest = (cell: Cell): Cell | null => {
    const line = cutHead(cells(cell), cut, SYMBOLS);
    if (!line) return null;
    const made = line.join("");
    return endingProblems(made, "ending", cut.steps, lastPulse).length > 0 ? null : made;
  };
  const endings = [...new Set(written.endings.map(rest).filter((cell) => cell !== null))];
  const peak = rest(written.peak);

  // Pickups: so many pulses before the barline, each made as its pulse is.
  const pickups: Pickup[] = [];
  for (const figure of written.pickups) {
    const laid = cutTail(cells(figure.cell), cut, SYMBOLS);
    if (!laid) continue;
    const made = laid.line.join("");
    if (pickupProblems(made, "pickup", cut.steps, pulses).length === 0)
      pickups.push({ ...figure, cell: made });
  }

  return {
    levels,
    endings: endings.length > 0 ? endings : written.endings,
    pickups,
    peak: peak ?? written.peak,
  };
}
