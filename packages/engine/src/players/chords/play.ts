// The chord seat. A part is made in three steps, in the order a comper
// thinks: where does the hand come down (the rhythm), what does it play there
// (the voicing, led from the chord before), and how does this instrument sound
// it (the idiom). This file only runs them in order.

import { arrivals } from "../../perform/harmony.ts";
import type { Player, PlayerContext, WrittenNote } from "../../perform/notes.ts";
import type { Plan } from "../../plan/types.ts";
import type { Pick } from "./critique.ts";
import { byCritic } from "./critique.ts";
import { endingStrikes } from "./ending.ts";
import { idiomOf } from "./idiom.ts";
import type { LineNote } from "./line.ts";
import { lineOf, strikeLines } from "./line.ts";
import { compStrikes, comps } from "./phrase.ts";
import { plainStrikes } from "./plain.ts";
import type { Strike, VoicedStrike } from "./strike.ts";
import { voiceStrikes } from "./voicing.ts";

/**
 * The seat's part, with the comper's choice of phrase left open: the player
 * asks the critic, and a gate report can ask for the first plan drawn, or any
 * plan, to show on the same seeds what the critic's choice is worth.
 */
export function chordPart(context: PlayerContext, pick?: Pick): WrittenNote[] {
  return idiomOf(context.style.chords.idiom).write(chordStrikes(context, pick), context.plan);
}

/**
 * The part before the instrument sounds it: where the hand comes down and what
 * it holds there (on a guitar, on which strings). A report reads this to print
 * a part the way its player would write it.
 */
export function chordStrikes(context: PlayerContext, pick?: Pick): VoicedStrike[] {
  const { plan, style } = context;
  const chords = style.chords;
  const harmony = arrivals(plan);
  const idiom = idiomOf(chords.idiom);

  // 1. Rhythm. Bars of 4/4 are comped phrase by phrase from the style's book; any other
  // meter plays the pad; the ending bar has its own gesture.
  const written = [
    ...compStrikes(context, harmony, pick ?? byCritic(style.critic.weights.comping ?? {})),
    ...plainStrikes(plan, harmony, chords, (bar) => comps(bar, chords)),
    ...plan.bars.flatMap((bar) => endingStrikes(bar, harmony, chords)),
  ]
    // With no bassist the chord is voiced whole: a free tone is free only over a bass (CH-24).
    .map((strike) =>
      plan.bars[strike.bar]?.seats.bass === null && !strike.whole
        ? { ...strike, whole: true as const }
        : strike,
    )
    .sort((a, b) => a.tick - b.tick);

  // 2. Voicing. Where the seat listens, each strike hears what the soloist plays over it.
  // When the solo is over the hand is led on from where the line left it, and the pull
  // of its own register brings it home by steps: it does not jump back.
  const line = chords.listening ? lineOf(context.heard) : [];
  const closes = chords.listening?.closes;
  const strikes = closes && line.length > 0 ? closedUnder(written, plan, line, closes) : written;
  // 3. Idiom: `chordPart` hands these to the instrument.
  return voiceStrikes(
    strikes,
    harmony,
    chords,
    idiom,
    style.critic.weights.voicing ?? {},
    line.length === 0 ? [] : strikeLines(strikes, plan, line, lineOf(context.heard, "bass")),
  );
}

/**
 * Every strike in a bar the soloist sounds in, played in the kind the hands
 * close up to (ST-neosoul-21). The comper hears the bar it is playing in.
 */
function closedUnder(
  strikes: readonly Strike[],
  plan: Plan,
  line: readonly LineNote[],
  kind: string,
): Strike[] {
  const sounding = new Set<number>();
  for (const bar of plan.bars) {
    const end = bar.start + bar.ticks;
    if (line.some((note) => note.tick < end && note.ends > bar.start)) sounding.add(bar.index);
  }
  return strikes.map((strike) => (sounding.has(strike.bar) ? { ...strike, kind } : strike));
}

export const playChords: Player = (context) => chordPart(context);
