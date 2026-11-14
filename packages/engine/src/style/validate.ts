// Checks a style pack for mistakes the type system cannot see. The compiler
// guarantees the shape; this guarantees the data means something.

import { validateDrumStyle } from "../players/drums/validate.ts";
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

  problems.push(...validateDrumStyle(style.drums).map((problem) => `drums: ${problem}`));
  return problems;
}
