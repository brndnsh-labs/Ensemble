// Checks a chord style's meaning. The compiler has already checked its shape;
// this reads it the way the comper will and says what he could not play.

import type { Tier } from "../../style/types.ts";
import type { ChordFamily } from "../../theory/chord.ts";
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

  const { floor, ceiling, target } = chords.register;
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

  const ending = chords.ending;
  level(ending.velocity, "ending", LOUDEST - ending.accent);
  level(ending.soft, "soft ending");
  say(ending.accent >= 0, "ending: the button's accent cannot be negative.");
  return problems;
}
