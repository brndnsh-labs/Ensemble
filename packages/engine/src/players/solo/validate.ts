// Checks a solo style's meaning. The compiler has already checked its shape;
// this reads it the way the soloist will and says what it could not play.

import { cells, STEP } from "../../perform/grid.ts";
import { barSteps, pulseTicks } from "../../perform/meter.ts";
import { readMeter } from "../../style/meters.ts";
import { SOLO_INSTRUMENTS } from "./instruments.ts";
import { MOST_BUSY } from "./slots.ts";
import type { Cell, Role, SoloStyle, Way } from "./style.ts";
import { CONTOURS, ROLES } from "./style.ts";

const STEPS = 16;

/** Every problem in a solo style, in words. An empty list means the data is sound. */
export function validateSoloStyle(solo: SoloStyle): string[] {
  const problems: string[] = [];
  const say = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };
  const chance = (value: number, where: string) =>
    say(value >= 0 && value <= 1, `${where}: ${value} is not a chance from 0 to 1.`);
  const rhythm = (cell: Cell, where: string, steps = STEPS) => {
    const symbols = cells(cell);
    say(symbols.length === steps, `${where}: "${cell}" is not ${steps} sixteenths long.`);
    say(
      symbols.every((symbol) => "x-.".includes(symbol)),
      `${where}: "${cell}" has a symbol that is not x, - or a dot.`,
    );
    say(symbols.includes("x"), `${where}: "${cell}" strikes no note.`);
    say(symbols[0] !== "-", `${where}: "${cell}" opens by holding a note nobody struck.`);
    return symbols;
  };

  say(
    solo.instrument in SOLO_INSTRUMENTS,
    `instrument: "${solo.instrument}" is not an instrument the soloist knows.`,
  );
  for (const [name, instrument] of Object.entries(SOLO_INSTRUMENTS)) {
    const [low, high] = instrument.range;
    say(
      low < instrument.home && instrument.home < high,
      `instrument "${name}": its home is outside its range.`,
    );
    const { bend, shake } = instrument;
    say(bend === null || bend.takes > 0, `instrument "${name}": a bend takes time.`);
    say(
      shake === null || (shake.depth > 0 && shake.rate > 0 && shake.after >= 0 && shake.grows >= 0),
      `instrument "${name}": a shake has a depth and a rate, and starts and grows in seconds.`,
    );
  }

  const names = solo.levels.map((level) => level.name);
  const known = (name: string, where: string) =>
    say(
      names.includes(name),
      `${where}: "${name}" is not one of the levels (${names.join(", ")}).`,
    );
  say(solo.levels.length > 0, "levels: there are none.");
  for (const level of solo.levels) {
    const where = `level "${level.name}"`;
    say(level.notesPerBar > 0, `${where}: notes a bar must be more than none.`);
    say(level.span >= 3 && level.span <= 24, `${where}: a span of ${level.span} semitones.`);
    say(level.cells.length > 0, `${where}: has no rhythms.`);
    for (const cell of level.cells) rhythm(cell, where);
    say(
      level.shapes.some((shape) => shape.weight > 0),
      `${where}: has no shape with a weight.`,
    );
    for (const shape of level.shapes) {
      const letters = cells(shape.bars);
      say(letters.length === 4, `${where}: shape "${shape.bars}" is not four bars.`);
      say(
        letters.every((letter) => "LER".includes(letter)),
        `${where}: shape "${shape.bars}" has a letter that is not L, E or R.`,
      );
      say(letters.includes("E"), `${where}: shape "${shape.bars}" never lands (no E).`);
      say(shape.weight >= 0, `${where}: shape "${shape.bars}" has a negative weight.`);
    }
  }

  say(solo.endings.length > 0, "endings: there are none.");
  for (const cell of [...solo.endings, solo.arc.peak.ending]) {
    const symbols = rhythm(cell, "endings");
    // A phrase leaves its last beat unstruck: a note there is the next phrase's pickup.
    say(
      !symbols.slice(STEPS - 4).includes("x"),
      `endings: "${cell}" strikes a note in the last beat, which belongs to the next phrase.`,
    );
    const last = symbols.lastIndexOf("x");
    const held = symbols.slice(last + 1).filter((symbol) => symbol === "-").length + 1;
    say(held >= 4, `endings: "${cell}" does not finish on a long note.`);
  }

  // A solo's first chorus opens on a statement, whatever its length: every length of form
  // the style writes needs one that does.
  const lengths = new Set(solo.forms.map((form) => cells(form.phrases).length));
  say(lengths.size > 0, "forms: there are none.");
  for (const length of lengths) {
    say(
      solo.forms.some(
        (form) =>
          form.weight > 0 &&
          cells(form.phrases).length === length &&
          cells(form.phrases)[0] === "s",
      ),
      `forms: none of ${length} phrases opens on a statement (s), so a solo has nowhere to start.`,
    );
  }
  for (const form of solo.forms) {
    const letters = cells(form.phrases);
    say(letters.length > 0, "forms: an empty form.");
    say(
      letters.every((letter) => (ROLES as readonly string[]).includes(letter)),
      `forms: "${form.phrases}" has a letter that is not one of ${ROLES.join(", ")}.`,
    );
    say(form.weight >= 0, `forms: "${form.phrases}" has a negative weight.`);
    for (const letter of letters) {
      say(
        (solo.book.roles[letter as Role] ?? []).length > 0,
        `forms: "${form.phrases}" asks for "${letter}", and the book offers no way of playing it.`,
      );
    }
  }

  const { book } = solo;
  const ways = (list: readonly Way[], where: string) => {
    for (const way of list) {
      say(way.name.length > 0, `book, ${where}: a way with no name.`);
      if (way.make === "again" && way.by !== "chord") {
        say(
          Number.isInteger(way.by) && way.by >= 0,
          `book, ${where}: "${way.name}" moves by ${way.by}.`,
        );
      }
    }
  };
  say(
    book.opening.length > 0 && book.opening.every((way) => way.make === "new"),
    "book: a solo's first phrase has nothing to work on, so every way of opening is new.",
  );
  say(
    book.peak.some((way) => way.make === "new"),
    "book: the top note's phrase needs a way that asks for no idea.",
  );
  say(
    book.outgrown.levels >= 1 && book.outgrown.ways.every((way) => way.make === "new"),
    "book: an idea is outgrown by a level or more, and what replaces it is new.",
  );
  ways(book.opening, "opening");
  ways(book.peak, "the peak");
  ways(book.outgrown.ways, "outgrown");
  for (const role of ROLES) ways(book.roles[role] ?? [], `"${role}"`);
  say(
    solo.likeness.related > 0 &&
      solo.likeness.related < solo.likeness.same &&
      solo.likeness.same <= 1,
    "likeness: related is under the same, and both are between 0 and 1.",
  );

  say(
    CONTOURS.some((kind) => solo.contours[kind] > 0),
    "contours: none has a weight.",
  );
  for (const [list, tones] of [
    ["arrive", solo.arrive],
    ["settle", solo.settle],
    ["hang", solo.hang],
  ] as const) {
    say(tones.length > 0, `${list}: names no tone.`);
  }
  say(
    solo.landing.perRank >= 0 && solo.landing.reach >= 1,
    "landing: a rank costs nothing or more, and a note can be moved a half step at least.",
  );
  const line = solo.line;
  say(
    line.step >= 1 && line.skip >= line.step,
    "line: a step is a half step or more, and a skip is no narrower than a step.",
  );
  say(
    [
      line.skipCosts,
      line.leapCosts,
      line.halfStepOffChord,
      line.halfStepsInARow,
      line.offChordOnBeat,
      line.strandsTheBeat,
    ].every((cost) => cost >= 0),
    "line: a cost cannot be negative.",
  );
  const degrees = [...solo.notes.key.major, ...solo.notes.key.minor];
  const overRoot = Object.values(solo.notes.overRoot ?? {}).flat();
  say(
    overRoot.every((interval) => Number.isInteger(interval) && interval >= 0 && interval < 12),
    "notes: a note over the chord's root is a whole number of semitones from 0 to 11.",
  );
  say(
    degrees.every((degree) => Number.isInteger(degree) && degree >= 0 && degree < 12),
    "notes: a key note is a whole number of semitones from 0 to 11.",
  );
  for (const blue of solo.notes.blue) {
    say(
      degrees.includes(blue.degree),
      `notes: blue note ${blue.degree} is not one of the key's notes.`,
    );
  }

  const { stages, peak, windDown } = solo.arc;
  say(stages.length > 0, "arc: has no stages.");
  for (const [i, stage] of stages.entries()) known(stage.density, `arc, stage ${i + 1}`);
  known(peak.density, "arc, the peak");
  known(windDown.density, "arc, the wind-down");
  say(peak.above > 0 && peak.clear >= 0, "arc: the peak is above home, and clear of the rest.");
  say(
    Number.isInteger(peak.fromEnd) && peak.fromEnd >= 1,
    "arc: the peak comes a whole number of phrases before the last, and the last winds down.",
  );
  const peakBars = cells(peak.shape);
  say(
    peakBars.length === 4 &&
      peakBars.every((letter) => "LER".includes(letter)) &&
      peakBars.includes("E"),
    `arc: the peak's shape "${peak.shape}" is four bars of L, E or R, with a bar for the top note (E).`,
  );

  say(
    solo.tempo.slowBar > solo.tempo.fastBar && solo.tempo.fastBar > 0,
    "tempo: a slow bar is longer than a fast one.",
  );
  say(solo.space.breath > 0, "space: a breath takes time.");
  say(solo.space.patience > 0, "space: patience is a number of seconds.");
  say(solo.space.emptyBars >= 0, "space: empty bars cannot be negative.");
  chance(solo.space.roomier, "space, roomier");
  say(
    solo.busier.lift >= 0 && solo.busier.lift <= MOST_BUSY.lift,
    `busier: a lift is from 0 to ${MOST_BUSY.lift} levels.`,
  );
  say(
    solo.busier.room >= 0 && solo.busier.room <= MOST_BUSY.room,
    `busier: the room given up is a share from 0 to ${MOST_BUSY.room}.`,
  );
  chance(solo.habits.riff, "habits, riff");
  chance(solo.habits.stab, "habits, stab");
  const every = solo.habits.stabEvery ?? 1;
  say(
    Number.isInteger(every) && every >= 1,
    "habits: a stabbed note is struck again a whole number of sixteenths apart, one or more.",
  );
  chance(solo.habits.tie, "habits, tie");
  chance(solo.habits.chromatic, "habits, chromatic");
  chance(solo.habits.enclosure, "habits, enclosure");
  chance(solo.habits.pickup.chance, "habits, pickup");
  chance(solo.habits.pickup.rising, "habits, pickup rising");
  for (const figure of solo.habits.pickup.figures) rhythm(figure.beat, "habits, pickup", 4);
  chance(solo.habits.bend.third, "habits, bend into a third");
  chance(solo.habits.bend.rootOrFifth, "habits, bend into a root or fifth");
  chance(solo.habits.bend.elsewhere, "habits, bend elsewhere");
  say(
    Number.isInteger(solo.habits.bend.around) && solo.habits.bend.around >= 0,
    "habits, bend: the hand is lyrical a whole number of phrases either side of the top note.",
  );
  say(solo.habits.shake > 0, "habits, shake: a note is held some beats before it is shaken.");

  const touch = solo.touch;
  for (const level of [touch.level, touch.peak, touch.floor, touch.ceiling]) {
    say(level >= 1 && level <= 127, `touch: ${level} is not a level from 1 to 127.`);
  }
  say(touch.floor <= touch.ceiling, "touch: the floor is above the ceiling.");
  say(touch.legato > 0 && touch.legato <= 1, "touch: legato is a share of a note's space.");
  // What is written for another meter: the same levels, every rhythm as long as its bar.
  for (const [name, written] of Object.entries(solo.meters ?? {})) {
    const meter = readMeter(name);
    if (!meter || !written) {
      say(false, `meters: "${name}" is not a meter a chart can write, or is 4/4.`);
      continue;
    }
    const steps = barSteps(meter);
    const pulse = Math.round(pulseTicks(meter).at(-1)! / STEP);
    const where = `in ${name}`;
    say(
      written.levels.map((level) => level.name).join() === names.join(),
      `${where}: its levels are not the style's own (${names.join(", ")}), in their order.`,
    );
    for (const level of written.levels) {
      const at = `${where}, level "${level.name}"`;
      say(level.notesPerBar > 0, `${at}: notes a bar must be more than none.`);
      say(level.span >= 3 && level.span <= 24, `${at}: a span of ${level.span} semitones.`);
      say(level.cells.length > 0, `${at}: has no rhythms.`);
      for (const cell of level.cells) rhythm(cell, at, steps);
      say(
        level.shapes.some((shape) => shape.weight > 0),
        `${at}: has no shape with a weight.`,
      );
      for (const shape of level.shapes) {
        const letters = cells(shape.bars);
        say(
          letters.length === 4 && letters.every((letter) => "LER".includes(letter)),
          `${at}: shape "${shape.bars}" is not four bars of L, E and R.`,
        );
        say(letters.includes("E"), `${at}: shape "${shape.bars}" never lands (no E).`);
        say(shape.weight >= 0, `${at}: shape "${shape.bars}" has a negative weight.`);
      }
    }
    say(written.endings.length > 0, `${where}, endings: there are none.`);
    for (const cell of [...written.endings, written.peak]) {
      const symbols = rhythm(cell, `${where}, endings`, steps);
      say(
        !symbols.slice(steps - pulse).includes("x"),
        `${where}, endings: "${cell}" strikes a note in the last beat, which belongs to the next phrase.`,
      );
      const last = symbols.lastIndexOf("x");
      const held = symbols.slice(last + 1).filter((symbol) => symbol === "-").length + 1;
      say(held >= 4, `${where}, endings: "${cell}" does not finish on a long note.`);
    }
    for (const figure of written.pickups) rhythm(figure.beat, `${where}, pickup`, pulse);
  }

  return problems;
}
