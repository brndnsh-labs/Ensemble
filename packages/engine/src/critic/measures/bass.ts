// What a bassist would say about a bass line, measured at the changes.

import { PPQ } from "../../chart/types.ts";
import { tierOf } from "../../style/types.ts";
import { chordFamily } from "../../theory/chord.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import { barAt, bassChanges, chordAt, mean, musicBars, notesIn, notesOf, share } from "../read.ts";
import type { Measure } from "../types.ts";

export const bassMeasures: readonly Measure[] = [
  {
    id: "bass.changes-stated",
    seat: "bass",
    says: "Every change of chord gets its bass note from the bass, where it lands.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      const changes = bassChanges(take);
      const stated = changes.filter((change) =>
        bass.some((note) => note.tick === change.tick && mod12(note.pitch) === change.bass),
      );
      return share(stated.length, changes.length);
    },
  },
  {
    id: "bass.half-step-approaches",
    seat: "bass",
    says: "Some changes are approached by a half step, and some are left to land plainly.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      const changes = bassChanges(take);
      let halfSteps = 0;
      for (const change of changes) {
        const landing = bass.find((note) => note.tick === change.tick);
        const before = bass.findLast((note) => note.tick < change.tick);
        if (!landing || !before || change.tick - before.tick > PPQ) continue;
        if (Math.abs(before.pitch - landing.pitch) === 1) halfSteps++;
      }
      return share(halfSteps, changes.length);
    },
  },
  {
    id: "bass.lead-ins-that-leap",
    seat: "bass",
    says: "A note that is a step from the next root by name is a step from it in pitch: no leading tones an octave away.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let leadIns = 0;
      let leaps = 0;
      for (const change of bassChanges(take)) {
        const landing = bass.find((note) => note.tick === change.tick);
        const before = bass.findLast((note) => note.tick < change.tick);
        if (!landing || !before || change.tick - before.tick > PPQ) continue;
        const byName = Math.min(
          mod12(before.pitch - change.bass),
          mod12(change.bass - before.pitch),
        );
        if (byName !== 1 && byName !== 2) continue;
        leadIns++;
        if (Math.abs(before.pitch - landing.pitch) > 2) leaps++;
      }
      return share(leaps, leadIns);
    },
  },
  {
    id: "bass.sixths-on-dominants",
    seat: "bass",
    says: "Once the band is past quiet, the line rocks through the sixth over a dominant chord: the boogie sound, present but not constant.",
    unit: "share",
    of(take) {
      let notes = 0;
      let sixths = 0;
      for (const note of notesOf(take, "bass")) {
        const chord = chordAt(take, note.tick);
        if (!chord || chordFamily(chord.quality) !== "dominant") continue;
        // The quiet two-feel is roots and fifths by design; the sixth belongs to the moving line.
        const bar = barAt(take, note.tick);
        if (!bar || tierOf(bar.energy) === "low" || bar.ending) continue;
        notes++;
        if (mod12(note.pitch - pitchClass(chord.root)) === 9) sixths++;
      }
      return share(sixths, notes);
    },
  },
  {
    id: "bass.notes-per-beat-when-quiet",
    seat: "bass",
    says: "When the band is quiet the bass plays in two: about a note every other beat.",
    unit: "per beat",
    of(take) {
      const bass = notesOf(take, "bass");
      const rates = musicBars(take)
        .filter((bar) => tierOf(bar.energy) === "low" && !bar.ending && bar.meter.unit === 4)
        .map((bar) => notesIn(bass, bar).length / bar.meter.beats);
      return mean(rates);
    },
  },
  {
    id: "bass.semitones-per-move",
    seat: "bass",
    says: "The line moves mostly by small intervals, with a leap now and then.",
    unit: "semitones",
    of(take) {
      const bass = notesOf(take, "bass");
      const moves: number[] = [];
      for (let i = 1; i < bass.length; i++) {
        const move = Math.abs(bass[i]!.pitch - bass[i - 1]!.pitch);
        if (move > 0) moves.push(move);
      }
      return mean(moves);
    },
  },
];
