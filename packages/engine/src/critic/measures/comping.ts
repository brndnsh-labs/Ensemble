// What a pianist would say about the rhythm of a comping part: how busy it
// is, whether it sits with the drummer, how often it leans into a change, and
// the question the old band never asked: does the rhythm have a shape over a
// phrase, or is it a loop, or a scatter? (ME-29, Q-48.)
//
// Everything is read from the notes played. Bars are compared as rhythms by
// `alike`, the same test the comper applies to the plans it weighs.

import { PPQ } from "../../chart/types.ts";
import { energyGain } from "../../perform/feel.ts";
import { arrivals, sameChord } from "../../perform/harmony.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { BarRhythm } from "../../players/chords/rhythm.ts";
import { alike, barRhythm, samePhrase } from "../../players/chords/rhythm.ts";
import { GHOST_BELOW } from "../../players/drums/kit.ts";
import type { Tier } from "../../style/types.ts";
import { tierOf } from "../../style/types.ts";
import type { Take } from "../../take.ts";
import { mean, notesOf, share } from "../read.ts";
import type { Measure, Measurement } from "../types.ts";

export const EIGHTH = PPQ / 2;
/** Slack, in ticks, for "still sounding at the change": the pocket moves a note's end a little. */
export const POCKET = 10;

/** One time the hand comes down: where on the grid, and when it stops sounding. */
interface Hit {
  readonly tick: number;
  readonly ends: number;
}

/** One phrase of comping as it was played: its bars and their rhythms. */
interface Phrase {
  readonly bars: readonly PlanBar[];
  readonly rhythm: readonly BarRhythm[];
}

interface Reading {
  /** The bars the piano comps in: 4/4, playing, short of the ending bar. */
  readonly bars: readonly PlanBar[];
  readonly hits: ReadonlyMap<number, readonly Hit[]>;
  readonly rhythm: ReadonlyMap<number, BarRhythm>;
  /** Phrases the piano comps every bar of, in the order played. */
  readonly phrases: readonly Phrase[];
}

const readings = new WeakMap<Take, Reading>();

function read(take: Take): Reading {
  const known = readings.get(take);
  if (known) return known;

  const all = take.plan.bars;
  const bars = all.filter(
    (bar) =>
      bar.kind === "music" &&
      bar.seats.chords !== null &&
      !bar.ending &&
      bar.meter.beats === 4 &&
      bar.meter.unit === 4,
  );
  const byTick = new Map<number, number>();
  for (const note of notesOf(take, "chords")) {
    const ends = note.tick + note.offset + note.duration;
    byTick.set(note.tick, Math.max(byTick.get(note.tick) ?? 0, ends));
  }
  const struck = [...byTick]
    .map(([tick, ends]) => ({ tick, ends }))
    .sort((a, b) => a.tick - b.tick);

  // A change at the barline: the bar opens on a different chord from the one before it ended on.
  const changes = (before: PlanBar | undefined, bar: PlanBar | undefined) => {
    const from = before?.kind === "music" ? before.spans.at(-1)?.chord : null;
    const to = bar?.kind === "music" ? bar.spans[0]?.chord : null;
    return !!from && !!to && !sameChord(from, to);
  };
  const hits = new Map<number, Hit[]>();
  const rhythm = new Map<number, BarRhythm>();
  for (const bar of bars) {
    const own = struck.filter((hit) => hit.tick >= bar.start && hit.tick < bar.start + bar.ticks);
    hits.set(bar.index, own);
    rhythm.set(
      bar.index,
      barRhythm(
        own.map((hit) => hit.tick),
        bar.start,
        changes(all[bar.index - 1], bar),
        changes(bar, all[bar.index + 1]),
      ),
    );
  }

  const groups = new Map<string, PlanBar[]>();
  for (const bar of bars) {
    const place = `${bar.section.occurrence}/${bar.phrase.index}`;
    groups.set(place, [...(groups.get(place) ?? []), bar]);
  }
  const phrases = [...groups.values()]
    .filter((group) => group.length === group[0]!.phrase.length)
    .map((group) => ({ bars: group, rhythm: group.map((bar) => rhythm.get(bar.index)!) }));

  const reading = { bars, hits, rhythm, phrases };
  readings.set(take, reading);
  return reading;
}

const tierAt = (bar: PlanBar) => tierOf(bar.seats.chords ?? bar.energy);

/**
 * A bar that strikes every eighth is a groove (the boogie pump), not a
 * conversation: it is meant to be the same bar, so the questions about
 * shape are asked of the other bars and the pump has its own.
 */
const hammered = (rhythm: BarRhythm) => rhythm.steps.filter((step) => step % 2 === 0).length >= 7;

/** The bars in which the piano pumps. */
export function pumping(take: Take): Set<number> {
  const { bars, rhythm } = read(take);
  return new Set(bars.filter((bar) => hammered(rhythm.get(bar.index)!)).map((bar) => bar.index));
}

/** The phrases that are a conversation: three bars or more, none of them hammered. */
const spoken = (take: Take) =>
  read(take).phrases.filter(
    (phrase) => phrase.bars.length >= 3 && !phrase.rhythm.some((bar) => hammered(bar)),
  );

function strikesPerBar(take: Take, tier: Tier): Measurement | null {
  const { bars, hits } = read(take);
  return mean(bars.filter((bar) => tierAt(bar) === tier).map((bar) => hits.get(bar.index)!.length));
}

/** The grid ticks in the bars the piano comps where a kick or a backbeat is struck, ghosts apart. */
function drumLandings(take: Take): Set<number> {
  const { bars } = read(take);
  const comped = new Map(bars.map((bar) => [bar.index, bar]));
  const landings = new Set<number>();
  for (const note of notesOf(take, "drums")) {
    if (note.voice !== "kick" && note.voice !== "snare" && note.voice !== "crossStick") continue;
    const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick);
    if (!bar || !comped.has(bar.index)) continue;
    // A feathered kick is felt, not heard: judged by the level it was written at.
    const written = note.velocity / energyGain(bar.seats.drums ?? bar.energy);
    if (written >= GHOST_BELOW) landings.add(note.tick);
  }
  return landings;
}

function phraseShape(take: Take, has: (rhythm: readonly BarRhythm[]) => boolean) {
  const phrases = spoken(take);
  return share(phrases.filter((phrase) => has(phrase.rhythm)).length, phrases.length);
}

const returns = (rhythm: readonly BarRhythm[]) =>
  rhythm.slice(1).some((bar) => alike(bar, rhythm[0]!));
const turns = (rhythm: readonly BarRhythm[]) => rhythm.some((bar) => !alike(bar, rhythm[0]!));

export const compingMeasures: readonly Measure[] = [
  {
    id: "chords.strikes-per-bar-quiet",
    seat: "chords",
    says: "When the band is quiet the piano is a pad: about one chord a bar.",
    unit: "per bar",
    of: (take) => strikesPerBar(take, "low"),
  },
  {
    id: "chords.strikes-per-bar-mid",
    seat: "chords",
    says: "At the working level the piano chops: two or three strikes a bar, with room between them.",
    unit: "per bar",
    of: (take) => strikesPerBar(take, "mid"),
  },
  {
    id: "chords.strikes-per-bar-loud",
    seat: "chords",
    says: "When the band is hot the piano is busy: four stabs a bar, or the pump's eight.",
    unit: "per bar",
    of: (take) => strikesPerBar(take, "high"),
  },
  {
    id: "chords.with-the-drums",
    seat: "chords",
    says: "More of the piano's strikes land with a kick or a backbeat than a hand placed at random would (read it against chords.drums-by-chance).",
    unit: "share",
    of(take) {
      const landings = drumLandings(take);
      const struck = [...read(take).hits.values()].flat();
      return share(struck.filter((hit) => landings.has(hit.tick)).length, struck.length);
    },
  },
  {
    id: "chords.drums-by-chance",
    seat: "chords",
    says: "The share of eighth-note places in the piano's bars that carry a kick or a backbeat: what a hand placed at random would score with the drums.",
    unit: "share",
    of(take) {
      const landings = drumLandings(take);
      const { bars } = read(take);
      const onEighths = [...landings].filter((tick) => tick % EIGHTH === 0).length;
      return share(onEighths, bars.length * 8);
    },
  },
  {
    id: "chords.with-the-drums-over-chance",
    seat: "chords",
    says: "The piano lands with the kick and the backbeat more often than a hand placed at random on the eighths would: above zero it is locking with the drummer, below it is sitting between his strokes.",
    unit: "share",
    of(take) {
      // The two measures above, as one number a target can hold: a floor on the share alone
      // sits under chance and cannot fail (ME-09).
      const landings = drumLandings(take);
      const { bars, hits } = read(take);
      const struck = [...hits.values()].flat();
      if (struck.length === 0 || bars.length === 0) return null;
      const withDrums = struck.filter((hit) => landings.has(hit.tick)).length / struck.length;
      const chance = [...landings].filter((tick) => tick % EIGHTH === 0).length / (bars.length * 8);
      return { value: withDrums - chance, cases: struck.length };
    },
  },
  {
    id: "chords.off-the-beat",
    seat: "chords",
    says: "A good part of the piano's strikes are off the beat, and a good part are on it: syncopated, not floating.",
    unit: "share",
    of(take) {
      const struck = [...read(take).hits.values()].flat();
      return share(struck.filter((hit) => hit.tick % PPQ !== 0).length, struck.length);
    },
  },
  {
    id: "chords.changes-anticipated",
    seat: "chords",
    says: "The piano leans into some changes and lets others land: the new chord is struck an eighth early at around half of them.",
    unit: "share",
    of(take) {
      const { bars, hits } = read(take);
      const comped = new Set(bars.map((bar) => bar.index));
      const harmony = arrivals(take.plan);
      let changes = 0;
      let early = 0;
      for (const arrival of harmony) {
        const before = harmony[arrival.index - 1];
        // A change the piano plays into: from a chord to a different chord, both in bars it comps.
        if (!arrival.changed || !arrival.chord || !before?.chord) continue;
        if (!comped.has(arrival.bar) || !comped.has(before.bar)) continue;
        changes++;
        const leaning = [...(hits.get(before.bar) ?? []), ...(hits.get(arrival.bar) ?? [])];
        const pushed = leaning.some(
          (hit) =>
            hit.tick >= arrival.tick - EIGHTH &&
            hit.tick < arrival.tick &&
            hit.ends >= arrival.tick - POCKET,
        );
        if (pushed) early++;
      }
      return share(early, changes);
    },
  },
  {
    id: "chords.bar-same-as-last",
    seat: "chords",
    says: "About half the time a bar's rhythm is the bar before it again: the figure is there to be heard, and it does not go round like a loop.",
    unit: "share",
    of(take) {
      const { bars, rhythm } = read(take);
      let pairs = 0;
      let same = 0;
      for (const bar of bars) {
        const now = rhythm.get(bar.index)!;
        const before = rhythm.get(bar.index - 1);
        const last = take.plan.bars[bar.index - 1];
        if (!before || last?.section.occurrence !== bar.section.occurrence) continue;
        if (hammered(now) || hammered(before)) continue;
        pairs++;
        if (alike(now, before)) same++;
      }
      return share(same, pairs);
    },
  },
  {
    id: "chords.phrase-same-as-last",
    seat: "chords",
    says: "Now and then a phrase is the phrase before it again, bar for bar; mostly it is not.",
    unit: "share",
    of(take) {
      const phrases = spoken(take);
      let pairs = 0;
      let same = 0;
      for (let i = 1; i < phrases.length; i++) {
        const [before, now] = [phrases[i - 1]!, phrases[i]!];
        if (before.bars.length !== now.bars.length) continue;
        pairs++;
        if (samePhrase(before.rhythm, now.rhythm)) same++;
      }
      return share(same, pairs);
    },
  },
  {
    id: "chords.phrase-same-as-last-chorus",
    seat: "chords",
    says: "A phrase is seldom the very phrase that was played at this place the last time through at this level: the choruses are not copies.",
    unit: "share",
    of(take) {
      // The same figure coming back in the same place is the honest count of repetition (ME-22).
      const last = new Map<string, { tier: Tier; rhythm: readonly BarRhythm[] }>();
      let pairs = 0;
      let same = 0;
      for (const phrase of spoken(take)) {
        const first = phrase.bars[0]!;
        const place = `${first.section.identity}/${first.phrase.index}`;
        const tier = tierAt(first);
        const before = last.get(place);
        if (before && before.tier === tier) {
          pairs++;
          if (samePhrase(before.rhythm, phrase.rhythm)) same++;
        }
        last.set(place, { tier, rhythm: phrase.rhythm });
      }
      return share(same, pairs);
    },
  },
  {
    id: "chords.phrases-shaped",
    seat: "chords",
    says: "Most phrases have a shape: the bar that opens the phrase comes back in it, and some bar answers or turns.",
    unit: "share",
    of: (take) => phraseShape(take, (rhythm) => returns(rhythm) && turns(rhythm)),
  },
  {
    id: "chords.phrases-one-bar",
    seat: "chords",
    says: "Few phrases are one bar played over and over: that is a loop.",
    unit: "share",
    of: (take) => phraseShape(take, (rhythm) => !turns(rhythm)),
  },
  {
    id: "chords.phrases-unrelated",
    seat: "chords",
    says: "Few phrases never come back to the bar they opened with: that is bars in a row, not a phrase.",
    unit: "share",
    of: (take) => phraseShape(take, (rhythm) => !returns(rhythm)),
  },
];
