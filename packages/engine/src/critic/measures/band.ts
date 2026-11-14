// What a listener would say about the whole band over a take.

import { PPQ } from "../../chart/types.ts";
import { mean, musicBars, notesIn, notesOf, share } from "../read.ts";
import type { Measure } from "../types.ts";

export const bandMeasures: readonly Measure[] = [
  {
    id: "band.backbeat-swell",
    seat: "band",
    says: "A jam with an arc has dynamics: the backbeat in its loudest time through is clearly harder than in its quietest.",
    unit: "velocity",
    of(take) {
      // Measured on one comparable event, the snare on 2 and 4, because a mean over every
      // note falls when a louder band adds ghost notes.
      const drums = notesOf(take, "drums").filter((note) => note.voice === "snare");
      const byPass = new Map<number, { energy: number[]; level: number[] }>();
      for (const bar of musicBars(take)) {
        if (bar.section.role !== "body" || bar.ending || bar.fill) continue;
        const pass = byPass.get(bar.pass) ?? { energy: [], level: [] };
        pass.energy.push(bar.energy);
        for (const note of notesIn(drums, bar)) {
          const beat = (note.tick - bar.start) / PPQ;
          if (beat === 1 || beat === 3) pass.level.push(note.velocity);
        }
        byPass.set(bar.pass, pass);
      }
      const passes = [...byPass.values()].filter((pass) => pass.level.length > 0);
      const energies = passes.map((pass) => mean(pass.energy)?.value ?? 0);
      // A take held at one level has no arc to measure.
      if (passes.length < 2 || Math.max(...energies) - Math.min(...energies) < 0.05) return null;
      const levels = passes.map((pass) => mean(pass.level)?.value ?? 0);
      return { value: Math.max(...levels) - Math.min(...levels), cases: passes.length };
    },
  },
  {
    id: "band.backbeat-level",
    seat: "band",
    says: "The backbeat is played firmly, not slammed: there is room above it for the loudest chorus and the last hit.",
    unit: "velocity",
    of(take) {
      // The backbeat is the band's loudest steady event, so its level is how hard the band is
      // hitting. Heard at gate 1: around 110 slams through a sampled kit; around 95 does not.
      const snare = notesOf(take, "drums").filter((note) => note.voice === "snare");
      const levels: number[] = [];
      for (const bar of musicBars(take)) {
        if (bar.ending || bar.fill) continue;
        for (const note of notesIn(snare, bar)) {
          const beat = (note.tick - bar.start) / PPQ;
          if (beat === 1 || beat === 3) levels.push(note.velocity);
        }
      }
      return mean(levels);
    },
  },
  {
    id: "band.notes-near-the-top",
    seat: "band",
    says: "Almost nothing is played at the very top of the range: the hardest strokes are saved for where they mean something.",
    unit: "share",
    of(take) {
      const notes = take.events.filter((event) => event.kind === "note");
      return share(notes.filter((note) => note.velocity >= 115).length, notes.length);
    },
  },
];
