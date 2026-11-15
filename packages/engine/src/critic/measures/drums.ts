// What a drummer would say about a drum part, bar by bar.

import { PPQ } from "../../chart/types.ts";
import { pulseTicks } from "../../perform/meter.ts";
import type { NoteEvent } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import { tierOf } from "../../style/types.ts";
import type { Take } from "../../take.ts";
import { musicBars, notesIn, notesOf, share } from "../read.ts";
import type { Measure } from "../types.ts";

/** A bar's part as text, so two bars can be compared: which piece, where. Levels are left out. */
function shape(notes: readonly NoteEvent[], barStart: number): string {
  return notes
    .map((note) => `${note.tick - barStart}:${note.voice}`)
    .sort()
    .join(" ");
}

/** The drummer's tier in a bar: his own energy, which is the bar's unless he lays out. */
function drumTier(bar: PlanBar) {
  return tierOf(bar.seats.drums ?? bar.energy);
}

/** Bars of plain time: no fill, no crash, not the ending, the drummer playing. */
function timeBars(take: Take): PlanBar[] {
  return musicBars(take).filter(
    (bar) => !bar.ending && !bar.fill && !bar.crash && bar.seats.drums !== null,
  );
}

/**
 * The answer bars that can be heard against their statement: the second bar of
 * each pair (DR-05), in plain time, after a bar of plain time at the same tier
 * in the same time through the section.
 */
function answerPairs(take: Take): [PlanBar, PlanBar][] {
  const plain = new Map(timeBars(take).map((bar) => [bar.index, bar]));
  const pairs: [PlanBar, PlanBar][] = [];
  for (const bar of plain.values()) {
    if (bar.phrase.bar % 2 !== 1) continue;
    const before = plain.get(bar.index - 1);
    if (!before || before.section.occurrence !== bar.section.occurrence) continue;
    if (drumTier(before) !== drumTier(bar)) continue;
    pairs.push([before, bar]);
  }
  return pairs;
}

export const drumMeasures: readonly Measure[] = [
  {
    id: "drums.kick-on-one",
    seat: "drums",
    says: "The kick is on beat 1 of the bar.",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      const bars = musicBars(take).filter((bar) => !bar.ending);
      const hits = bars.filter((bar) =>
        drums.some((note) => note.tick === bar.start && note.voice === "kick"),
      );
      return share(hits.length, bars.length);
    },
  },
  {
    id: "drums.backbeat",
    seat: "drums",
    says: "The snare (or cross-stick) is on 2 and 4, except where a long fill takes the hands away.",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      const bars = musicBars(take).filter(
        (bar) => !bar.ending && !bar.fill && bar.meter.beats === 4 && bar.meter.unit === 4,
      );
      const on = (tick: number) =>
        drums.some(
          (note) => note.tick === tick && (note.voice === "snare" || note.voice === "crossStick"),
        );
      const hits = bars.filter((bar) => on(bar.start + PPQ) && on(bar.start + PPQ * 3));
      return share(hits.length, bars.length);
    },
  },
  {
    id: "drums.same-groove",
    seat: "drums",
    says: "A section keeps its groove: a bar of time is the same bar the section usually plays.",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      // Bars that should match: one time through a section, at one tier, on the same side of
      // the two-bar pair (a groove may answer itself every second bar).
      const groups = new Map<string, string[]>();
      for (const bar of musicBars(take)) {
        if (bar.ending || bar.fill || bar.crash) continue;
        const key = [bar.section.occurrence, tierOf(bar.energy), bar.phrase.bar % 2].join("/");
        const group = groups.get(key) ?? [];
        group.push(shape(notesIn(drums, bar), bar.start));
        groups.set(key, group);
      }
      let bars = 0;
      let usual = 0;
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const counts = new Map<string, number>();
        for (const bar of group) counts.set(bar, (counts.get(bar) ?? 0) + 1);
        bars += group.length;
        usual += Math.max(...counts.values());
      }
      return share(usual, bars);
    },
  },
  {
    id: "drums.triplet-fills",
    seat: "drums",
    says: "Some fills are triplets and some are eighths: neither all the time.",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      const fills = musicBars(take).filter(
        (bar) => bar.fill && bar.meter.beats === 4 && bar.meter.unit === 4,
      );
      // In a shuffle the middle of the triplet is the written "e" of the beat.
      const triplets = fills.filter((bar) =>
        notesIn(drums, bar).some((note) => (note.tick - bar.start) % PPQ === PPQ / 4),
      );
      return share(triplets.length, fills.length);
    },
  },
  {
    id: "drums.fills-that-repeat",
    seat: "drums",
    says: "Two fills in a row are not the same fill.",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      const fills = musicBars(take)
        .filter((bar) => bar.fill)
        .map((bar) => {
          // The fill is the back of the bar: compare the last two beats.
          const from = bar.start + bar.ticks - PPQ * 2;
          return shape(
            notesIn(drums, bar).filter((note) => note.tick >= from),
            from,
          );
        });
      let repeats = 0;
      for (let i = 1; i < fills.length; i++) if (fills[i] === fills[i - 1]) repeats++;
      return share(repeats, fills.length - 1);
    },
  },
  {
    id: "drums.cymbal-under-backbeat",
    seat: "drums",
    says: "The cymbal that keeps time sits under the backbeat, however loud the band is.",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      let bars = 0;
      let under = 0;
      for (const bar of musicBars(take)) {
        if (bar.ending || bar.fill) continue;
        const played = notesIn(drums, bar);
        const backbeat = played.filter((note) => note.voice === "snare" && note.tick % PPQ === 0);
        const cymbal = played.filter((note) => note.voice === "closedHat" || note.voice === "ride");
        if (backbeat.length === 0 || cymbal.length === 0) continue;
        bars++;
        const hardest = Math.max(...cymbal.map((note) => note.velocity));
        if (hardest < Math.min(...backbeat.map((note) => note.velocity))) under++;
      }
      return share(under, bars);
    },
  },
  {
    id: "drums.ghosts",
    seat: "drums",
    says: "From the working level up, a bar of time has one to five ghost notes round the backbeat: enough to move, not a roll.",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      const bars = timeBars(take).filter((bar) => drumTier(bar) !== "low");
      const hits = bars.filter((bar) => {
        const ghosts = notesIn(drums, bar).filter((note) => note.voice === "ghostSnare").length;
        return ghosts >= 1 && ghosts <= 5;
      });
      return share(hits.length, bars.length);
    },
  },
  {
    id: "drums.answer-bars",
    seat: "drums",
    says: "The second bar of a pair answers the first: it turns round, it is not a copy.",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      const pairs = answerPairs(take);
      const differ = pairs.filter(
        ([before, bar]) =>
          shape(notesIn(drums, before), before.start) !== shape(notesIn(drums, bar), bar.start),
      );
      return share(differ.length, pairs.length);
    },
  },
  {
    id: "drums.turn-held",
    seat: "drums",
    says: "A section turns its answer bars round the same way every time.",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      // The turn is the back half of the bar; group a time through a section at one tier.
      const groups = new Map<string, string[]>();
      for (const [, bar] of answerPairs(take)) {
        const half = bar.start + bar.ticks / 2;
        const back = notesIn(drums, bar).filter((note) => note.tick >= half);
        const key = `${bar.section.occurrence}/${drumTier(bar)}`;
        groups.set(key, [...(groups.get(key) ?? []), shape(back, half)]);
      }
      let bars = 0;
      let usual = 0;
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const counts = new Map<string, number>();
        for (const turn of group) counts.set(turn, (counts.get(turn) ?? 0) + 1);
        bars += group.length;
        usual += Math.max(...counts.values());
      }
      return share(usual, bars);
    },
  },
  {
    id: "drums.ride-every-beat",
    seat: "drums",
    says: "Once the band has opened up, the ride is on every beat, through the fills (a crash counts on its beat).",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      const bars = musicBars(take).filter(
        (bar) => !bar.ending && bar.seats.drums !== null && drumTier(bar) !== "low",
      );
      const cymbals = new Set(["ride", "rideBell", "crash"]);
      const hits = bars.filter((bar) => {
        const played = notesIn(drums, bar).filter((note) => cymbals.has(note.voice ?? ""));
        let beat = bar.start;
        return pulseTicks(bar.meter).every((pulse) => {
          const on = played.some((note) => note.tick === beat);
          beat += pulse;
          return on;
        });
      });
      return share(hits.length, bars.length);
    },
  },
  {
    id: "drums.phrase-end-shot",
    seat: "drums",
    says: 'Once the band has opened up, some phrase ends get the shot, not all: snare and bass drum together on the "and" of the last beat, "ba-BOP".',
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      // Under the light head a phrase end only whispers (DR-38): the shot is not asked for there.
      const ends = musicBars(take).filter(
        (bar) =>
          !bar.ending &&
          bar.seats.drums !== null &&
          drumTier(bar) !== "low" &&
          bar.phrase.bar === bar.phrase.length - 1,
      );
      // The "and" of the last pulse: its last eighth when the pulse is dotted.
      const shots = ends.filter((bar) => {
        const at = drums.filter((note) => note.tick === bar.start + bar.ticks - PPQ / 2);
        return (
          at.some((note) => note.voice === "snare") && at.some((note) => note.voice === "kick")
        );
      });
      return share(shots.length, ends.length);
    },
  },
  {
    id: "drums.snare-with-piano",
    seat: "drums",
    says: "The snare comps where the piano strikes: the two read the same chart (DR-39).",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      const piano = new Set(notesOf(take, "chords").map((note) => note.tick));
      if (piano.size === 0) return null;
      // Comping strokes: off the beat, in bars of time that are not a phrase's set-up.
      const strokes = timeBars(take)
        .filter((bar) => bar.phrase.bar !== bar.phrase.length - 1)
        .flatMap((bar) => notesIn(drums, bar))
        .filter(
          (note) =>
            (note.voice === "snare" || note.voice === "ghostSnare") && note.tick % PPQ !== 0,
        );
      const together = strokes.filter((note) => piano.has(note.tick));
      return share(together.length, strokes.length);
    },
  },
  {
    id: "drums.on-the-eighths",
    seat: "drums",
    says: "Nothing is played on a sixteenth that is not an eighth: swung, it would land between the eighths and flam.",
    unit: "share",
    of(take) {
      const drums = notesOf(take, "drums");
      const bars = musicBars(take).filter((bar) => bar.seats.drums !== null);
      const clean = bars.filter((bar) =>
        notesIn(drums, bar).every((note) => (note.tick - bar.start) % (PPQ / 2) === 0),
      );
      return share(clean.length, bars.length);
    },
  },
];
