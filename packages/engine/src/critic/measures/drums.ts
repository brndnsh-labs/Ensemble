// What a drummer would say about a drum part, bar by bar.

import { PPQ } from "../../chart/types.ts";
import type { NoteEvent } from "../../perform/notes.ts";
import { tierOf } from "../../style/types.ts";
import { musicBars, notesIn, notesOf, share } from "../read.ts";
import type { Measure } from "../types.ts";

/** A bar's part as text, so two bars can be compared: which piece, where. Levels are left out. */
function shape(notes: readonly NoteEvent[], barStart: number): string {
  return notes
    .map((note) => `${note.tick - barStart}:${note.voice}`)
    .sort()
    .join(" ");
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
];
