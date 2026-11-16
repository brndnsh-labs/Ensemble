// Checks a style pack for mistakes the type system cannot see. The compiler
// guarantees the shape; this guarantees the data means something.

import { validateBassStyle } from "../players/bass/validate.ts";
import { validateChordStyle } from "../players/chords/validate.ts";
import { validateDrumStyle } from "../players/drums/validate.ts";
import { validateSoloStyle } from "../players/solo/validate.ts";
import { BASE_QUALITIES } from "../theory/chord.ts";
import type { StylePack } from "./types.ts";

/** Problems in plain words. An empty list means the pack is sound. */
export function validateStyle(style: StylePack): string[] {
  const problems: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };

  check(
    /^[a-z][a-z0-9-]*$/.test(style.id),
    `id "${style.id}" should be lowercase letters, digits, and hyphens`,
  );
  const { tempo, feel, arc, ending } = style;
  check(
    tempo.min <= tempo.default && tempo.default <= tempo.max && tempo.min > 0,
    "tempo: the default must lie between a positive min and the max",
  );
  check(feel.swing.amount >= 0 && feel.swing.amount <= 100, "feel: swing amount is 0 to 100");
  check(feel.humanize >= 0 && feel.humanize <= 100, "feel: humanize is 0 to 100");
  for (const [seat, ms] of Object.entries(feel.lean)) {
    check(Math.abs(ms) <= 60, `feel: a lean of ${ms} ms on ${seat} is latency, not a pocket`);
  }
  for (const [prefix, energy] of arc.levels) {
    check(prefix === prefix.toLowerCase(), `arc: level prefix "${prefix}" must be lowercase`);
    check(energy >= 0 && energy <= 1, `arc: level for "${prefix}" must be 0 to 1`);
  }
  check(arc.defaultLevel >= 0 && arc.defaultLevel <= 1, "arc: default level must be 0 to 1");
  check(arc.depth >= 0, "arc: depth cannot be negative");
  for (const [family, quality] of Object.entries(ending.finalChord)) {
    check(
      (BASE_QUALITIES as readonly string[]).includes(quality),
      `ending: "${quality}" is not a chord quality (final chord for a ${family} tonic)`,
    );
  }
  if (ending.gesture.kind === "hits") {
    check(ending.gesture.beats.length > 0, "ending: hits need at least one beat");
  }
  check(ending.tailBars >= 0 && ending.tailBars <= 4, "ending: tail is 0 to 4 bars");
  for (const [seat, program] of Object.entries(style.instruments)) {
    check(
      Number.isInteger(program) && program >= 0 && program <= 127,
      `instruments: ${seat} program must be 0 to 127`,
    );
  }

  for (const [seat, pack] of Object.entries(style.sound.packs)) {
    check(pack.length > 0, `sound: ${seat} needs a pack`);
  }
  for (const [seat, offered] of Object.entries(style.sound.choices ?? {})) {
    const own = style.sound.packs[seat as keyof typeof style.sound.packs];
    check(
      offered.length >= 2,
      `sound: ${seat} offers ${offered.length} instruments; a choice is two or more`,
    );
    check(
      offered[0]?.pack === own,
      `sound: the first instrument offered for ${seat} is the style's own, "${own}"`,
    );
    check(
      new Set(offered.map((choice) => choice.pack)).size === offered.length,
      `sound: ${seat} offers an instrument twice`,
    );
    for (const choice of offered) {
      check(
        choice.pack.length > 0 && choice.name.length > 0,
        `sound: an instrument offered for ${seat} needs a pack and a name`,
      );
      check(
        choice.level === undefined || Math.abs(choice.level) <= 12,
        `sound: "${choice.pack}" on ${seat} is levelled by ${choice.level} dB; within 12`,
      );
    }
    check(
      offered[0]?.level === undefined,
      `sound: the mix is set for ${seat}'s own instrument, which takes no level of its own`,
    );
  }
  for (const [seat, mix] of Object.entries(style.sound.mix.seats)) {
    check(mix.level >= -40 && mix.level <= 12, `sound: ${seat} level is -40 to 12 dB`);
    check(mix.pan === undefined || Math.abs(mix.pan) <= 1, `sound: ${seat} pan is -1 to 1`);
    check(
      mix.reverb === undefined || mix.reverb <= 0,
      `sound: ${seat} reverb send is 0 dB or less`,
    );
  }
  check(
    style.sound.mix.room.seconds > 0 && style.sound.mix.room.seconds <= 6,
    "sound: the room rings for up to 6 seconds",
  );

  problems.push(...validateDrumStyle(style.drums).map((problem) => `drums: ${problem}`));
  problems.push(...validateBassStyle(style.bass).map((problem) => `bass: ${problem}`));
  problems.push(...validateChordStyle(style.chords).map((problem) => `chords: ${problem}`));
  problems.push(...validateSoloStyle(style.solo).map((problem) => `solo: ${problem}`));
  return problems;
}
