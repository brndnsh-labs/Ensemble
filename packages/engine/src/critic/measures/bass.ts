// What a bassist would say about a bass line, measured at the changes.

import { PPQ } from "../../chart/types.ts";
import type { NoteEvent } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import { tierOf } from "../../style/types.ts";
import type { Take } from "../../take.ts";
import { chordFamily } from "../../theory/chord.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import type { Change } from "../read.ts";
import { barAt, bassChanges, chordAt, mean, musicBars, notesIn, notesOf, share } from "../read.ts";
import type { Measure } from "../types.ts";

/** D3: above it a bass guitar is up the neck on its top string. */
const HIGH = 50;

/**
 * A bar (or two) as a shape: each note's place from the first barline and its
 * pitch above the first note. The box on the I and the box on the IV are one
 * shape; so are two bars that differ only in key.
 */
function shapeOf(notes: readonly NoteEvent[], from: number): string {
  const first = notes[0];
  if (!first) return "rest";
  return notes.map((note) => `${note.tick - from}:${note.pitch - first.pitch}`).join(" ");
}

/** The bass's tier in a bar, or null where it lays out. */
function bassTier(bar: PlanBar) {
  const energy = bar.seats.bass;
  return energy === null ? null : tierOf(energy);
}

/**
 * Each time through a body section, its bars short of the ending bar. A chorus
 * of the blues is one of these.
 */
function choruses(take: Take): PlanBar[][] {
  const result: PlanBar[][] = [];
  let at = -1;
  for (const bar of musicBars(take)) {
    if (bar.section.role !== "body" || bar.ending) continue;
    if (bar.section.occurrence !== at) result.push([]);
    at = bar.section.occurrence;
    result.at(-1)!.push(bar);
  }
  return result;
}

/** Choruses played wholly at the working level, eight bars or more. */
function workingChoruses(take: Take): PlanBar[][] {
  return choruses(take).filter(
    (bars) => bars.length >= 8 && bars.every((bar) => bassTier(bar) === "mid"),
  );
}

/** The mean count of different shapes per chorus, `size` bars to a unit. */
function shapesPerChorus(take: Take, size: number) {
  const bass = notesOf(take, "bass");
  const counts = workingChoruses(take).map((bars) => {
    const shapes = new Set<string>();
    for (let i = 0; i + size <= bars.length; i += size) {
      const unit = bars.slice(i, i + size);
      shapes.add(
        shapeOf(
          unit.flatMap((bar) => notesIn(bass, bar)),
          unit[0]!.start,
        ),
      );
    }
    return shapes.size;
  });
  return mean(counts);
}

/**
 * Each chorus past the quiet level beside the one just before it, as bar
 * shapes, over the bars both have.
 */
function chorusPairs(take: Take): [string[], string[]][] {
  const bass = notesOf(take, "bass");
  const shapes = (bars: readonly PlanBar[]) =>
    bars.map((bar) => shapeOf(notesIn(bass, bar), bar.start));
  const moving = choruses(take).filter((bars) =>
    bars.every((bar) => bassTier(bar) !== null && bassTier(bar) !== "low"),
  );
  const pairs: [string[], string[]][] = [];
  moving.forEach((bars, i) => {
    const before = moving[i - 1];
    if (!before || before[0]!.section.identity !== bars[0]!.section.identity) return;
    if (before.at(-1)!.index + 1 !== bars[0]!.index) return;
    const length = Math.min(before.length, bars.length);
    pairs.push([shapes(before.slice(0, length)), shapes(bars.slice(0, length))]);
  });
  return pairs;
}

type Approach = "walk" | "step" | "leap";

/**
 * How the bass arrived at a change. A walk is the bar before it in four
 * quarter notes, the first on that bar's own bass note, every move in the same
 * direction, a third at most into beat 2 and a step after that, into the
 * landing too. A step is the note in the last beat a half or whole step from
 * the landing. A lope's re-strike is the note before it, not a new one.
 */
function approachTo(take: Take, bass: readonly NoteEvent[], change: Change): Approach | null {
  const landing = bass.find((note) => note.tick === change.tick);
  if (!landing) return null;
  const struck = bass.filter(
    (note) => note.tick < change.tick && note.tick >= change.tick - 4 * PPQ,
  );
  const tones = struck.filter((note, i) => i === 0 || note.pitch !== struck[i - 1]!.pitch);
  const before = struck.at(-1);
  const bar = barAt(take, change.tick - 1);
  const chord = bar ? chordAt(take, bar.start) : null;
  if (
    bar &&
    chord &&
    change.tick === bar.start + bar.ticks &&
    tones.length === 4 &&
    tones.every((note, i) => note.tick === bar.start + i * PPQ) &&
    mod12(tones[0]!.pitch) === pitchClass(chord.bass ?? chord.root)
  ) {
    const path = [...tones.map((note) => note.pitch), landing.pitch];
    const moves = path.slice(1).map((pitch, i) => pitch - path[i]!);
    const oneWay = moves.every((move) => move > 0) || moves.every((move) => move < 0);
    const steps = moves.every((move, i) => Math.abs(move) <= (i === 0 ? 4 : 2));
    if (oneWay && steps) return "walk";
  }
  if (!before || change.tick - before.tick > PPQ) return "leap";
  const apart = Math.abs(before.pitch - landing.pitch);
  return apart === 1 || apart === 2 ? "step" : "leap";
}

/**
 * The changes where a line ends, that is, a phrase starts on a new bass note:
 * at the top of a chorus, or at the top of a line inside it.
 */
function lineEnds(take: Take, top: boolean): Change[] {
  return bassChanges(take).filter(
    (change) =>
      change.tick === change.bar.start &&
      change.bar.phrase.bar === 0 &&
      !change.bar.ending &&
      bassTier(change.bar) !== "low" &&
      (change.bar.barInSection === 0 && change.bar.section.role === "body") === top,
  );
}

function shareOf(take: Take, changes: readonly Change[], kind: Approach) {
  const bass = notesOf(take, "bass");
  const kinds = changes.map((change) => approachTo(take, bass, change)).filter((k) => k !== null);
  return share(kinds.filter((k) => k === kind).length, kinds.length);
}

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
  {
    id: "bass.register",
    seat: "bass",
    says: "The line sits where a bass guitar's does: its average note is in the instrument's bottom octave and a half, not up the neck.",
    unit: "pitch",
    of(take) {
      return mean(notesOf(take, "bass").map((note) => note.pitch));
    },
  },
  {
    id: "bass.high-notes",
    seat: "bass",
    says: "Few notes are above D3: the top of a line reaches up there, it does not live there.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      return share(bass.filter((note) => note.pitch > HIGH).length, bass.length);
    },
  },
  {
    id: "bass.bar-shapes-per-chorus",
    seat: "bass",
    says: "At the working level a chorus is more than one or two bars played over and over: the line has a few shapes, not one and not twelve.",
    unit: "ratio",
    of: (take) => shapesPerChorus(take, 1),
  },
  {
    id: "bass.two-bar-shapes-per-chorus",
    seat: "bass",
    says: "At the working level the two-bar units of a chorus are not all the same two bars.",
    unit: "ratio",
    of: (take) => shapesPerChorus(take, 2),
  },
  {
    id: "bass.chorus-same-as-last",
    seat: "bass",
    says: "Past the quiet level, a chorus is seldom the chorus before it again, bar for bar: the line is played, not pasted.",
    unit: "share",
    of(take) {
      const pairs = chorusPairs(take);
      return share(
        pairs.filter(([a, b]) => a.every((shape, n) => shape === b[n])).length,
        pairs.length,
      );
    },
  },
  {
    id: "bass.bars-same-as-last-chorus",
    seat: "bass",
    says: "Past the quiet level, a good part of each chorus is played as it was last chorus, bar for bar, and not all of it: the same line, told again with changes.",
    unit: "share",
    of(take) {
      let bars = 0;
      let same = 0;
      for (const [a, b] of chorusPairs(take)) {
        bars += a.length;
        same += a.filter((shape, n) => shape === b[n]).length;
      }
      return share(same, bars);
    },
  },
  {
    id: "bass.walks-into-the-top",
    seat: "bass",
    says: "Past the quiet level, the bass often walks the last bar of a chorus into the top of the next: the turnaround is where a walk matters most.",
    unit: "share",
    of: (take) => shareOf(take, lineEnds(take, true), "walk"),
  },
  {
    id: "bass.steps-into-the-top",
    seat: "bass",
    says: "Into the top of a chorus without a walk, the last beat is a half or whole step from the new root as often as not.",
    unit: "share",
    of: (take) => shareOf(take, lineEnds(take, true), "step"),
  },
  {
    id: "bass.walks-into-a-line",
    seat: "bass",
    says: "Inside a chorus, a line sometimes ends by walking into the next one, less often than into the top.",
    unit: "share",
    of: (take) => shareOf(take, lineEnds(take, false), "walk"),
  },
  {
    id: "bass.steps-into-a-line",
    seat: "bass",
    says: "Inside a chorus, a line that does not walk often ends a half or whole step from where the next begins.",
    unit: "share",
    of: (take) => shareOf(take, lineEnds(take, false), "step"),
  },
  {
    id: "bass.walks-inside-lines",
    seat: "bass",
    says: "A walk belongs at the end of a line: in the middle of one, into a change that does not start a phrase, it is rare.",
    unit: "share",
    of(take) {
      const inside = bassChanges(take).filter(
        (change) =>
          change.bar.phrase.bar !== 0 && !change.bar.ending && bassTier(change.bar) !== "low",
      );
      return shareOf(take, inside, "walk");
    },
  },
  {
    id: "bass.changes-by-step",
    seat: "bass",
    says: "Most changes are arrived at by a half or whole step in the octave played: the line leads to the next root rather than jumping to it.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let cases = 0;
      let steps = 0;
      for (const change of bassChanges(take)) {
        const landing = bass.find((note) => note.tick === change.tick);
        const before = bass.findLast((note) => note.tick < change.tick);
        if (!landing || !before) continue;
        cases++;
        const apart = Math.abs(before.pitch - landing.pitch);
        if (change.tick - before.tick <= PPQ && (apart === 1 || apart === 2)) steps++;
      }
      return share(steps, cases);
    },
  },
];
