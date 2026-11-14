// Checks a chord style's meaning. The compiler has already checked its shape;
// this reads it the way the comper will and says what he could not play.

import { cells } from "../../perform/grid.ts";
import type { Tier } from "../../style/types.ts";
import type { ChordFamily } from "../../theory/chord.ts";
import { FIGURE_STEPS, HELD } from "./figure.ts";
import type { ChordStyle, Voice } from "./style.ts";
import { IDIOMS, VOICE_TONES } from "./style.ts";

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

  say(
    IDIOMS.includes(chords.idiom),
    `idiom: "${chords.idiom}" is not an instrument the seat knows.`,
  );

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
      const tones = [
        ...recipe.voices.flatMap((voice: Voice) => (typeof voice === "string" ? [voice] : voice)),
        ...(recipe.when?.has ?? []),
        ...(recipe.when?.lacks ?? []),
      ];
      for (const tone of tones) say(VOICE_TONES.includes(tone), `${at}: "${tone}" is not a tone.`);
      for (const voice of recipe.voices) {
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
    say(floor >= ONE_HAND_FLOOR, `register: a floor of ${floor} is under E3, mud for one hand.`);
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

  const book = chords.rhythm;
  if (book) {
    say(
      book.hold > 0 && book.hold <= 1,
      `rhythm: a hold of ${book.hold} is not a share of a chord's length; write more than 0, up to 1.`,
    );
    say(
      Number.isInteger(book.candidates) && book.candidates >= 1,
      "rhythm: the comper weighs at least one plan for a phrase.",
    );
    say(book.forms.length > 0, "rhythm: there are no phrase forms.");
    for (const form of book.forms) {
      const letters = cells(form.bars);
      say(
        letters.length === 4 && letters.every((letter) => "abc".includes(letter)),
        `rhythm, form "${form.bars}": a form is four bars of a, b and c.`,
      );
      say(
        letters[0] === "a",
        `rhythm, form "${form.bars}": a phrase opens on the section's figure, a.`,
      );
      say(form.weight >= 0, `rhythm, form "${form.bars}": a weight cannot be negative.`);
    }
    say(
      book.forms.some((form) => form.weight > 0),
      "rhythm: no phrase form has a weight above zero.",
    );
    for (const tier of TIERS) {
      const vocabulary = book.tiers[tier];
      const where = `rhythm (${tier})`;
      for (const [symbol, attack] of Object.entries(vocabulary.articulation)) {
        level(attack.level, `${where}, "${symbol}"`);
      }
      say(
        stroke in vocabulary.articulation,
        `${where}: a push is played as "${stroke}", which this tier's articulation does not have.`,
      );
      level(vocabulary.arrival.level, `${where}, a chord struck where it arrives`);
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
        const symbols = cells(figure.grid);
        say(
          symbols.length === FIGURE_STEPS,
          `${at}: ${symbols.length} steps; a figure is one bar of ${FIGURE_STEPS} sixteenths.`,
        );
        say(
          symbols.some((symbol) => symbol in articulation),
          `${at}: the hand never comes down.`,
        );
        symbols.forEach((symbol, step) => {
          const known = symbol in articulation || symbol === HELD || symbol === ".";
          say(known, `${at}: "${symbol}" at step ${step + 1} is not in its articulation.`);
          const before = symbols[step - 1];
          say(
            symbol !== HELD || (before !== undefined && before !== "."),
            `${at}: step ${step + 1} holds a chord that was never struck.`,
          );
        });
        for (const [symbol, attack] of Object.entries(figure.articulation ?? {})) {
          level(attack.level, `${at}, "${symbol}"`);
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
    }
  }

  const ending = chords.ending;
  level(ending.velocity, "ending", LOUDEST - ending.accent);
  level(ending.soft, "soft ending");
  say(ending.accent >= 0, "ending: the button's accent cannot be negative.");
  return problems;
}
