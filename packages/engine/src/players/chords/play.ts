// The chord seat. A part is made in three steps, in the order a comper
// thinks: where does the hand come down (the rhythm), what does it play there
// (the voicing, led from the chord before), and how does this instrument sound
// it (the idiom). This file only runs them in order.

import { arrivals } from "../../perform/harmony.ts";
import type { Player, PlayerContext, WrittenNote } from "../../perform/notes.ts";
import type { Pick } from "./critique.ts";
import { byCritic } from "./critique.ts";
import { endingStrikes } from "./ending.ts";
import { IDIOM_PLAYERS } from "./idiom.ts";
import { compStrikes, comps } from "./phrase.ts";
import { plainStrikes } from "./plain.ts";
import { voiceStrikes } from "./voicing.ts";

/**
 * The seat's part, with the comper's choice of phrase left open: the player
 * asks the critic, and a gate report can ask for the first plan drawn, or any
 * plan, to show on the same seeds what the critic's choice is worth.
 */
export function chordPart(context: PlayerContext, pick?: Pick): WrittenNote[] {
  const { plan, style } = context;
  const chords = style.chords;
  const harmony = arrivals(plan);
  const idiom = IDIOM_PLAYERS[chords.idiom];

  // 1. Rhythm. Bars of 4/4 are comped phrase by phrase from the style's book; any other
  // meter plays the pad; the ending bar has its own gesture.
  const strikes = [
    ...compStrikes(context, harmony, pick ?? byCritic(style.critic.weights.comping ?? {})),
    ...plainStrikes(plan, harmony, chords, (bar) => comps(bar, chords)),
    ...plan.bars.flatMap((bar) => endingStrikes(bar, harmony, chords)),
  ].sort((a, b) => a.tick - b.tick);

  // 2. Voicing.
  const voiced = voiceStrikes(strikes, harmony, chords, idiom, style.critic.weights.voicing ?? {});

  // 3. Idiom.
  return idiom.write(voiced);
}

export const playChords: Player = (context) => chordPart(context);
