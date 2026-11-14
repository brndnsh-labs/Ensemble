// The chord seat. A part is made in three steps, in the order a comper
// thinks: where does the hand come down (the rhythm), what does it play there
// (the voicing, led from the chord before), and how does this instrument sound
// it (the idiom). This file only runs them in order.

import { arrivals } from "../../perform/harmony.ts";
import type { Player } from "../../perform/notes.ts";
import { endingStrikes } from "./ending.ts";
import { IDIOM_PLAYERS } from "./idiom.ts";
import { plainStrikes } from "./plain.ts";
import { voiceStrikes } from "./voicing.ts";

export const playChords: Player = ({ plan, style }) => {
  const chords = style.chords;
  const harmony = arrivals(plan);
  const idiom = IDIOM_PLAYERS[chords.idiom];

  // 1. Rhythm. The ending bar has its own gesture; every other bar plays the pad.
  const strikes = [
    ...plainStrikes(plan, harmony, chords),
    ...plan.bars.flatMap((bar) => endingStrikes(bar, harmony, chords)),
  ].sort((a, b) => a.tick - b.tick);

  // 2. Voicing.
  const voiced = voiceStrikes(strikes, harmony, chords, idiom, style.critic.weights.voicing ?? {});

  // 3. Idiom.
  return idiom.write(voiced);
};
