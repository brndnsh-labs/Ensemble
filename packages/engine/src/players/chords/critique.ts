// What the critic can say about a phrase of comping, and how the comper asks
// it. A candidate is one whole way of playing the phrase, already played out
// against the harmony, so everything here is judged on the strikes that would
// sound, beside what the drummer and the soloist actually played.

import { choose } from "../../critic/choose.ts";
import type { Feature } from "../../critic/types.ts";
import type { Heard } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import { GHOST_BELOW } from "../drums/kit.ts";
import type { BarRhythm } from "./rhythm.ts";
import { alike, samePhrase } from "./rhythm.ts";
import type { Strike } from "./strike.ts";
import type { CompFigure } from "./style.ts";

/** One way of playing a phrase, played out: what the critic chooses between. */
export interface PhraseCandidate {
  /** The bars of the phrase the piano comps in, in order. */
  readonly bars: readonly PlanBar[];
  /** The figure played in each of those bars: the plan as a musician would say it. */
  readonly figures: readonly CompFigure[];
  readonly strikes: readonly Strike[];
  /** Each bar's rhythm, as it will be heard. */
  readonly rhythm: readonly BarRhythm[];
  /** The rhythm of the phrase played before this one. Null at the very top. */
  readonly before: readonly BarRhythm[] | null;
  /** The rhythm played at this place in the section the last time through. Null the first time. */
  readonly lastTime: readonly BarRhythm[] | null;
  /** Strikes the hand aims for in each bar, at that bar's energy. */
  readonly busy: readonly number[];
  /** What the seats that played first wrote: the drummer, and from stage 3 the soloist. */
  readonly heard: Heard;
}

/** The drum strokes a comp can land with: kick and backbeat, not ghosts or a feathered kick. */
const LANDINGS: readonly string[] = ["kick", "snare", "crossStick"];

const strikesIn = (candidate: PhraseCandidate, bar: PlanBar) =>
  candidate.strikes.filter((strike) => strike.bar === bar.index).length;

/**
 * What the critic can say about a phrase of comping. The style's
 * `critic.weights.comping` says what each costs; the lowest sum is played.
 */
export const COMPING_FEATURES: readonly Feature<PhraseCandidate>[] = [
  {
    id: "off-the-drums",
    says: "The share of strikes with no kick or snare under them: a comp floating over the drummer.",
    of: ({ strikes, heard }) => {
      if (strikes.length === 0) return 0;
      const locked = strikes.filter((strike) =>
        heard.drums?.[strike.bar]?.some(
          (note) =>
            note.tick === strike.tick &&
            note.velocity >= GHOST_BELOW &&
            LANDINGS.includes(note.voice ?? ""),
        ),
      );
      return 1 - locked.length / strikes.length;
    },
  },
  {
    id: "under-the-soloist",
    says: "The share of strikes that come down while the soloist is sounding a note: talking over the line.",
    of: ({ strikes, heard }) => {
      const solo = heard.solo;
      if (!solo || strikes.length === 0) return 0;
      const under = strikes.filter((strike) =>
        [solo[strike.bar - 1], solo[strike.bar]].some((notes) =>
          notes?.some(
            (note) => note.tick <= strike.tick && strike.tick < note.tick + note.duration,
          ),
        ),
      );
      return under.length / strikes.length;
    },
  },
  {
    id: "off-the-energy",
    says: "How far a bar's strikes are from what the band's energy asks for, on average: too busy when quiet, too thin when loud.",
    of: (candidate) => {
      const { bars, busy } = candidate;
      const off = bars.map((bar, i) => Math.abs(strikesIn(candidate, bar) - busy[i]!));
      return off.reduce((sum, value) => sum + value, 0) / Math.max(1, bars.length);
    },
  },
  {
    id: "one-bar",
    says: "Every bar of the phrase is the same bar: a loop, with nothing that answers or turns.",
    of: ({ rhythm }) =>
      rhythm.length > 1 && rhythm.every((bar) => alike(bar, rhythm[0]!)) ? 1 : 0,
  },
  {
    id: "no-return",
    says: "The bar that opens the phrase never comes back in it: bars in a row, not a phrase.",
    of: ({ rhythm }) =>
      rhythm.length > 2 && !rhythm.slice(1).some((bar) => alike(bar, rhythm[0]!)) ? 1 : 0,
  },
  {
    id: "same-as-last",
    says: "The phrase is the phrase before it again, bar for bar.",
    of: ({ rhythm, before }) => (before !== null && samePhrase(before, rhythm) ? 1 : 0),
  },
  {
    id: "same-as-last-time",
    says: "The phrase is what was played at this place the last time through the section: a chorus copied.",
    of: ({ rhythm, lastTime }) => (lastTime !== null && samePhrase(lastTime, rhythm) ? 1 : 0),
  },
];

/** How a phrase is chosen from its candidates. The comper asks the critic; a report may ask otherwise. */
export type Pick = (candidates: readonly PhraseCandidate[]) => PhraseCandidate;

/** The candidate the critic prefers. With no weights at all it is the first one drawn. */
export const byCritic =
  (weights: Readonly<Record<string, number>>): Pick =>
  (candidates) =>
    choose(candidates, COMPING_FEATURES, weights)!.candidate;
