// Checks a chord style's meaning. The compiler has already checked its shape;
// this reads it the way the comper will and says what he could not play.

import { cells } from "../../perform/grid.ts";
import { barSteps } from "../../perform/meter.ts";
import { readMeter } from "../../style/meters.ts";
import type { Tier } from "../../style/types.ts";
import type { ChordFamily } from "../../theory/chord.ts";
import { FIGURE_STEPS, HELD } from "./figure.ts";
import { OPEN_STRINGS, TOP_FRET } from "./guitar.ts";
import type { Articulation, Attack, ChordStyle, RhythmBook, Voice } from "./style.ts";
import { INSTRUMENTS, PICK_PLACES, VOICE_TONES } from "./style.ts";

const TIERS: readonly Tier[] = ["low", "mid", "high"];
const FAMILIES: readonly ChordFamily[] = [
  "major",
  "minor",
  "dominant",
  "diminished",
  "half-diminished",
  "augmented",
  "suspended",
  "power",
];
/** One hand on a keyboard plays nothing under E3 (X-B-02). */
const ONE_HAND_FLOOR = 52;
/** C3: as low as a left hand's shell goes under a two-handed spread (ST-neosoul-20). */
const TWO_HAND_FLOOR = 48;
/** The top of the keyboard comp's reach, E6 (CH-15). */
const HIGHEST = 88;
/** The button is this much harder than its chord, and must still be a MIDI level. */
const LOUDEST = 127;

/** Every problem in a chord style, in words. An empty list means the data is sound. */
export function validateChordStyle(chords: ChordStyle): string[] {
  const problems: string[] = [];
  const say = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };
  const level = (value: number, where: string, top = LOUDEST) =>
    say(value >= 1 && value <= top, `${where}: ${value} is not a level from 1 to ${top}.`);

  const instrument = typeof chords.idiom === "string" ? chords.idiom : chords.idiom.instrument;
  say(
    INSTRUMENTS.includes(instrument),
    `idiom: "${instrument}" is not an instrument the seat knows.`,
  );
  const guitar = typeof chords.idiom === "string" ? null : chords.idiom;
  // Every symbol the book writes that is a scratch, whichever tier or figure writes it.
  const books = [chords.rhythm, ...Object.values(chords.meters ?? {})].filter(
    (book): book is RhythmBook => !!book,
  );
  const scratches = books.some((book) =>
    TIERS.some((tier) => {
      const vocabulary = book.tiers[tier];
      const written: (Articulation | undefined)[] = [
        vocabulary.articulation,
        ...[...vocabulary.figures, ...vocabulary.answers].map((figure) => figure.articulation),
      ];
      return written.some((articulation) =>
        Object.values(articulation ?? {}).some((attack) => attack.muted),
      );
    }),
  );
  /** A plucked attack is a guitar's, names one or two places of the grip, and is not a scratch. */
  const plucks = (attack: Attack, where: string) => {
    if (attack.pluck === undefined) return;
    say(guitar !== null, `${where}: a plucked stroke needs a guitar in the seat.`);
    say(!attack.muted, `${where}: a stroke is plucked or deadened, not both.`);
    say(
      attack.pluck.length >= 1 && attack.pluck.length <= 2,
      `${where}: plucks ${attack.pluck.length} places; the hand picks one string, or two pinched together.`,
    );
    for (const place of attack.pluck) {
      say(PICK_PLACES.includes(place), `${where}: "${place}" is not a place of the picking hand.`);
    }
  };
  if (guitar) {
    const { strings, position, strum } = guitar;
    const most = OPEN_STRINGS.length;
    say(
      Number.isInteger(strings) && strings >= 2 && strings <= most,
      `guitar: a grip of ${strings} strings; write a whole number from 2 to ${most}.`,
    );
    say(
      position >= 0 && position <= TOP_FRET - 3,
      `guitar: the hand parked at fret ${position}; a four-fret hand sits between the nut and fret ${TOP_FRET - 3}.`,
    );
    say(
      strum.grid === "eighth" || strum.grid === "sixteenth",
      `guitar: "${strum.grid}" is not a grid the strumming hand swings on.`,
    );
    say(
      Number.isInteger(strum.up) && strum.up >= 1,
      `guitar: an upstroke catches ${strum.up} strings; write a whole number from 1.`,
    );
    say(
      Number.isInteger(strum.lighter) && strum.lighter >= 0,
      `guitar: an upstroke ${strum.lighter} lighter is not a whole number of velocity steps from 0.`,
    );
    say(
      strum.roll >= 0 && strum.roll <= 20,
      `guitar: ${strum.roll} ms a string is not a strum; a roll is between 0 and 20.`,
    );
    say(
      guitar.openPosition === undefined ||
        (Number.isInteger(guitar.openPosition) &&
          guitar.openPosition >= 1 &&
          guitar.openPosition <= TOP_FRET),
      `guitar: open position up to fret ${guitar.openPosition}; write a whole number from 1 to ${TOP_FRET}.`,
    );
    say(
      guitar.openPosition === undefined || guitar.open,
      "guitar: open position with no open strings; a chord at the nut is its open strings (CH-24).",
    );
    say(
      !(guitar.open && scratches),
      "guitar: open strings are allowed and the book writes scratches; an open string rings on through a hand that lets go (CH-23).",
    );
  }

  for (const [name, kind] of Object.entries(chords.kinds)) {
    const where = `voicing kind "${name}"`;
    say(kind.recipes.length > 0, `${where}: has no recipes.`);
    const last = kind.recipes[kind.recipes.length - 1];
    say(
      last === undefined || last.when === undefined,
      `${where}: the last recipe has a condition, so some chords have no voicing.`,
    );
    kind.recipes.forEach((recipe, i) => {
      const at = `${where}, recipe ${i + 1}`;
      say(recipe.voices.length > 0, `${at}: has no voices.`);
      say(
        recipe.also === undefined || kind.position === "spread",
        `${at}: only a spread stacks a chord more than one way.`,
      );
      const stacks = [recipe.voices, ...(recipe.also ?? [])];
      for (const voices of stacks) say(voices.length > 0, `${at}: a stacking has no voices.`);
      const tones = [
        ...stacks.flat().flatMap((voice: Voice) => (typeof voice === "string" ? [voice] : voice)),
        ...(recipe.when?.has ?? []),
        ...(recipe.when?.lacks ?? []),
      ];
      for (const tone of tones) say(VOICE_TONES.includes(tone), `${at}: "${tone}" is not a tone.`);
      for (const voice of stacks.flat()) {
        say(typeof voice === "string" || voice.length > 0, `${at}: a voice lists no tones.`);
      }
      for (const family of recipe.when?.family ?? []) {
        say(FAMILIES.includes(family), `${at}: "${family}" is not a chord family.`);
      }
    });
  }
  for (const tier of TIERS) {
    const name = chords.voicing[tier];
    say(name in chords.kinds, `voicing (${tier}): there is no voicing kind "${name}".`);
  }

  const { floor, ceiling, target, reach } = chords.register;
  say(reach >= 0, `register: a reach of ${reach} is less than nothing.`);
  if (chords.idiom === "keys") {
    const hands = Object.values(chords.kinds).some((kind) => kind.position === "spread") ? 2 : 1;
    if (hands === 1)
      say(floor >= ONE_HAND_FLOOR, `register: a floor of ${floor} is under E3, mud for one hand.`);
    else
      say(
        floor >= TWO_HAND_FLOOR,
        `register: a floor of ${floor} is under C3, mud even for a left hand's shell.`,
      );
  }
  if (guitar) {
    const [lowest, highest] = [OPEN_STRINGS[0]!, OPEN_STRINGS.at(-1)! + TOP_FRET];
    say(floor >= lowest, `register: a floor of ${floor} is under the guitar's low E string.`);
    say(
      ceiling <= highest,
      `register: a ceiling of ${ceiling} is over the 15th fret of the top string.`,
    );
  }
  say(
    ceiling - floor >= 12,
    "register: floor to ceiling is less than an octave, too little room to lead voices.",
  );
  say(ceiling <= HIGHEST, `register: a ceiling of ${ceiling} is over E6, out of the comp's reach.`);
  say(
    target > floor && target <= ceiling,
    `register: the top voice's target ${target} is not between the floor and the ceiling.`,
  );

  const plain = chords.plain;
  say(
    plain.length > 0 && plain.length <= 1,
    `plain rhythm: a length of ${plain.length} is not a share of the space; write more than 0, up to 1.`,
  );
  level(plain.velocity.beat, "plain rhythm, on the beat");
  level(plain.velocity.offbeat, "plain rhythm, off the beat");
  level(plain.velocity.restrike, "plain rhythm, struck again");

  const { barline, midBar, stroke } = chords.anticipation;
  for (const tier of TIERS) {
    say(
      barline[tier] >= 0 && barline[tier] <= 1,
      `anticipation (${tier}): ${barline[tier]} is not a chance from 0 to 1.`,
    );
  }
  say(
    midBar === "tie" || midBar === "wait",
    `anticipation: "${midBar}" is not a way to meet a change inside the bar.`,
  );

  say(
    chords.anticipation.otherwise === "rest" || chords.anticipation.otherwise === "stay",
    `anticipation: "${chords.anticipation.otherwise}" is not what a strike before a change does when the hand does not lean in.`,
  );

  // The bar the book being checked is written for, and what its problems are filed under.
  let figureSteps = FIGURE_STEPS;
  let label = "rhythm";
  /** A grid read as a bar of comping: its length, its symbols, and what it holds. */
  const readGrid = (grid: string, articulation: Articulation, at: string, bars = 1) => {
    const symbols = cells(grid);
    say(
      symbols.length === figureSteps * bars,
      bars === 1
        ? `${at}: ${symbols.length} steps; a figure is one bar of ${figureSteps} sixteenths.`
        : `${at}: ${symbols.length} steps; a figure of two bars is ${figureSteps * bars} sixteenths.`,
    );
    // A bar of rest is written all silence; anything else that never comes down is a mistake.
    say(
      symbols.some((symbol) => symbol in articulation) || symbols.every((symbol) => symbol === "."),
      `${at}: the hand never comes down, and the bar is not written as a rest.`,
    );
    symbols.forEach((symbol, step) => {
      const known = symbol in articulation || symbol === HELD || symbol === ".";
      say(known, `${at}: "${symbol}" at step ${step + 1} is not in its articulation.`);
      const before = symbols[step - 1];
      say(
        symbol !== HELD || (before !== undefined && before !== "."),
        `${at}: step ${step + 1} holds a chord that was never struck.`,
      );
      say(
        symbol !== HELD || before === undefined || !articulation[before]?.muted,
        `${at}: step ${step + 1} holds a scratch, which has nothing to ring.`,
      );
    });
  };
  const checkBook = (book: RhythmBook) => {
    say(
      book.hold > 0 && book.hold <= 1,
      `${label}: a hold of ${book.hold} is not a share of a chord's length; write more than 0, up to 1.`,
    );
    say(
      Number.isInteger(book.candidates) && book.candidates >= 1,
      `${label}: the comper weighs at least one plan for a phrase.`,
    );
    say(book.forms.length > 0, `${label}: there are no phrase forms.`);
    for (const form of book.forms) {
      const letters = cells(form.bars);
      say(
        letters.length === 4 && letters.every((letter) => "abc".includes(letter)),
        `${label}, form "${form.bars}": a form is four bars of a, b and c.`,
      );
      say(
        letters[0] === "a",
        `${label}, form "${form.bars}": a phrase opens on the section's figure, a.`,
      );
      say(form.weight >= 0, `${label}, form "${form.bars}": a weight cannot be negative.`);
    }
    say(
      book.forms.some((form) => form.weight > 0),
      `${label}: no phrase form has a weight above zero.`,
    );
    for (const tier of TIERS) {
      const vocabulary = book.tiers[tier];
      const where = `${label} (${tier})`;
      for (const [symbol, attack] of Object.entries(vocabulary.articulation)) {
        level(attack.level, `${where}, "${symbol}"`);
        plucks(attack, `${where}, "${symbol}"`);
        say(
          symbol !== HELD && symbol !== ".",
          `${where}: "${symbol}" already means held or silent.`,
        );
      }
      say(
        stroke in vocabulary.articulation,
        `${where}: a push is played as "${stroke}", which this tier's articulation does not have.`,
      );
      say(
        !vocabulary.articulation[stroke]?.muted,
        `${where}: a push is played as "${stroke}", a scratch; a chord is never played early as one (CH-36).`,
      );
      say(
        !vocabulary.articulation[stroke]?.pluck,
        `${where}: a push is played as "${stroke}", a plucked string; one string cannot state a chord early.`,
      );
      say(
        !vocabulary.arrival.muted,
        `${where}: a chord struck where it arrives cannot be a scratch (CH-34).`,
      );
      plucks(vocabulary.arrival, `${where}, a chord struck where it arrives`);
      level(vocabulary.arrival.level, `${where}, a chord struck where it arrives`);
      if (vocabulary.restrike !== undefined) {
        level(vocabulary.restrike, `${where}, a held chord struck again at the barline`);
      }
      say(
        vocabulary.arrival.steps > 0,
        `${where}: a chord struck where it arrives needs a length.`,
      );
      say(
        vocabulary.busy.from > 0 && vocabulary.busy.from <= vocabulary.busy.to,
        `${where}: strikes a bar run from ${vocabulary.busy.from} to ${vocabulary.busy.to}; write a rising range above zero.`,
      );
      say(
        vocabulary.figures.some((figure) => figure.weight > 0),
        `${where}: no figure a section could take as its own.`,
      );
      const all = [...vocabulary.figures, ...vocabulary.answers];
      const names = all.map((figure) => figure.name);
      say(new Set(names).size === names.length, `${where}: two figures share a name.`);
      for (const figure of all) {
        const at = `${where}, "${figure.name}"`;
        const articulation = figure.articulation ?? vocabulary.articulation;
        readGrid(figure.grid, articulation, at);
        if (figure.turn !== undefined) readGrid(figure.turn, articulation, `${at}, its turn`);
        if (figure.alone !== undefined)
          readGrid(figure.alone, articulation, `${at}, with no bassist`);
        if (figure.soloing !== undefined)
          readGrid(figure.soloing, articulation, `${at}, under the soloist`);
        say(
          !figure.ties || figure.groove === true,
          `${at}: only a groove need say it ties a pushed chord; any other figure does.`,
        );
        for (const [symbol, attack] of Object.entries(figure.articulation ?? {})) {
          level(attack.level, `${at}, "${symbol}"`);
          plucks(attack, `${at}, "${symbol}"`);
        }
        say(figure.weight >= 0, `${at}: a weight cannot be negative.`);
        say(
          figure.voicing === undefined || figure.voicing in chords.kinds,
          `${at}: there is no voicing kind "${figure.voicing}".`,
        );
      }
      for (const figure of vocabulary.answers) {
        say(!figure.groove, `${where}, "${figure.name}": a groove is never an answer.`);
      }
      const across = vocabulary.twoBars;
      if (across) {
        const figure = across.figure;
        const at = `${where}, the figure of two bars "${figure.name}"`;
        readGrid(figure.grid, figure.articulation ?? vocabulary.articulation, at, 2);
        say(!names.includes(figure.name), `${at}: another figure has its name.`);
        say(figure.groove === true, `${at}: a figure of two bars is a groove; say so.`);
        say(
          figure.turn === undefined && figure.alone === undefined && figure.soloing === undefined,
          `${at}: a figure of two bars has no turn, no bar alone and none under the soloist.`,
        );
        say(
          across.chance > 0 && across.chance <= 1,
          `${at}: a chance of ${across.chance} is not one a phrase could be drawn with; write more than 0, up to 1.`,
        );
      }
      say(
        vocabulary.figures.some(
          (figure) =>
            figure.weight > 0 &&
            cells(figure.grid).some(
              (symbol) => symbol in (figure.articulation ?? vocabulary.articulation),
            ),
        ),
        `${where}: every figure a section could take as its own is a rest.`,
      );
      for (const figure of all) {
        const rest = cells(figure.grid).every((symbol) => symbol === ".");
        say(!(rest && figure.groove), `${where}, "${figure.name}": a bar of rest is not a groove.`);
      }
    }
  };
  if (chords.rhythm) checkBook(chords.rhythm);
  for (const [name, book] of Object.entries(chords.meters ?? {})) {
    const meter = readMeter(name);
    if (!meter || !book) {
      problems.push(`meters: "${name}" is not a meter a chart can write, or is 4/4.`);
      continue;
    }
    figureSteps = barSteps(meter);
    label = `rhythm in ${name}`;
    checkBook(book);
  }

  const listening = chords.listening;
  if (listening) {
    say(
      Number.isInteger(listening.breath) && listening.breath >= 2,
      `listening: a breath of ${listening.breath} sixteenths is not a silence the hand could answer; write a whole number from 2.`,
    );
    level(listening.answer.level, "listening, the answer");
    say(
      listening.answer.pluck === undefined,
      "listening: the answer is a stab of the chord, not a plucked string.",
    );
    say(!listening.answer.muted, "listening: the answer cannot be a scratch.");
    say(
      listening.answer.steps > 0 && listening.answer.steps <= 2,
      `listening: an answer ${listening.answer.steps} sixteenths long; it is a stab, more than nothing and an eighth at most (CH-71).`,
    );
    say(
      listening.answer.steps <= listening.breath,
      "listening: the answer is longer than the shortest breath it goes into.",
    );
    say(
      Number.isInteger(listening.lift) && listening.lift >= 0 && listening.lift < LOUDEST,
      `listening: a strike played ${listening.lift} harder in a breath is not a whole number of velocity steps from 0.`,
    );
    say(
      listening.closes === undefined || listening.closes in chords.kinds,
      `listening: the hands close up to "${listening.closes}", which is no voicing kind.`,
    );
  }

  const ending = chords.ending;
  level(ending.velocity, "ending", LOUDEST - ending.accent);
  level(ending.soft, "soft ending");
  say(ending.accent >= 0, "ending: the button's accent cannot be negative.");
  return problems;
}
