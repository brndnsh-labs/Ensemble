// What a bassist would say about a bass line, measured at the changes.

import { PPQ } from "../../chart/types.ts";
import { STEP } from "../../perform/grid.ts";
import { pulseTicks, strongPulses } from "../../perform/meter.ts";
import type { NoteEvent } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import { tierOf } from "../../style/types.ts";
import type { Take } from "../../take.ts";
import { chordFamily, chordTones } from "../../theory/chord.ts";
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

/** A kick softer than this, as played, is feathered or ghosted: felt, and not a kick to lock to (BA-13). */
const HEARD_KICK = 40;
/**
 * A held note as it sounds: one written a half note long is played a little
 * short of it (a two-feel's half notes ring nine tenths of their length).
 */
const HELD = 1.6 * PPQ;

/** Bars where the bass is past its quiet part, short of the ending bar. */
function movingBars(take: Take): PlanBar[] {
  return musicBars(take).filter((bar) => {
    const tier = bassTier(bar);
    return !bar.ending && tier !== null && tier !== "low";
  });
}

/** A bar of six quarter-note beats: two threes. */
const inSix = (bar: PlanBar) => bar.meter.beats === 6 && bar.meter.unit === 4;

/** The bass's notes a bar in its bars of six at one level. */
function notesInSix(take: Take, tier: "mid" | "high") {
  const bass = notesOf(take, "bass");
  return mean(
    musicBars(take)
      .filter((bar) => inSix(bar) && !bar.ending && bassTier(bar) === tier)
      .map((bar) => notesIn(bass, bar).length),
  );
}

/** Whether a note is one of its chord's own (its slash bass included). */
function onTheChord(take: Take, note: NoteEvent): boolean | null {
  const chord = chordAt(take, note.tick);
  if (!chord) return null;
  const pc = mod12(note.pitch);
  if (pc === pitchClass(chord.bass ?? chord.root)) return true;
  const root = pitchClass(chord.root);
  return chordTones(chord.quality).some((tone) => mod12(root + tone.interval) === pc);
}

/** Whether a note is its chord's bass note (the root, or a slash bass) or its fifth. Null under no chord. */
function rootOrFifth(take: Take, note: NoteEvent): boolean | null {
  const chord = chordAt(take, note.tick);
  if (!chord) return null;
  const pc = mod12(note.pitch);
  const fifth = chordTones(chord.quality).find((tone) => tone.role === "fifth")?.interval ?? 7;
  return (
    pc === pitchClass(chord.bass ?? chord.root) ||
    pc === pitchClass(chord.root) ||
    pc === mod12(pitchClass(chord.root) + fifth)
  );
}

/**
 * The bass's moves, stretch by stretch: each run of bars past the quiet level
 * played one after another is a stretch, and a move is one pitched note
 * against the one before it.
 */
function movingStretches(take: Take): number[][] {
  const bass = notesOf(take, "bass");
  const stretches: number[][] = [];
  let last = -2;
  for (const bar of movingBars(take)) {
    if (bar.index !== last + 1) stretches.push([]);
    last = bar.index;
    for (const note of notesIn(bass, bar)) {
      if (note.voice === undefined) stretches.at(-1)!.push(note.pitch);
    }
  }
  return stretches;
}

/** A bar note for note: where each note falls, what it is, and whether it is a dead one. */
function barOf(notes: readonly NoteEvent[], bar: PlanBar): string {
  return notes.map((note) => `${note.tick - bar.start}:${note.voice ?? note.pitch}`).join(" ");
}

/**
 * Measures of one way of playing: a walk, a riff. Each is on the scorecard only
 * of a style that sets it a target.
 */
const idiomMeasures: readonly Measure[] = [
  {
    id: "bass.notes-per-beat-walking",
    seat: "bass",
    idiom: true,
    says: "Past the quiet level the bass is in four: a note on every beat, and no more.",
    unit: "per beat",
    of(take) {
      const bass = notesOf(take, "bass");
      // A bar of six beats is a waltz twice, and a waltz bass does not walk every beat:
      // that is measured by itself, below.
      const rates = movingBars(take)
        .filter((bar) => !inSix(bar))
        .map((bar) => notesIn(bass, bar).length / pulseTicks(bar.meter).length);
      return mean(rates);
    },
  },
  {
    id: "bass.notes-per-bar-in-six",
    seat: "bass",
    idiom: true,
    says: "In six at the working level the bass plays the two strong beats and a pickup or two: about three notes a bar, not a note a beat (AU-93).",
    unit: "per bar",
    of: (take) => notesInSix(take, "mid"),
  },
  {
    id: "bass.notes-per-bar-in-six-hot",
    seat: "bass",
    idiom: true,
    says: "In six when the band is hot the bass is nearly walking: about five notes a bar (AU-93).",
    unit: "per bar",
    of: (take) => notesInSix(take, "high"),
  },
  {
    id: "bass.strong-beats-in-six",
    seat: "bass",
    idiom: true,
    says: "In six the bass plays both of the bar's strong beats, 1 and 4.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      const bars = musicBars(take).filter(
        (bar) => inSix(bar) && !bar.ending && bassTier(bar) !== null,
      );
      const both = bars.filter((bar) => {
        const ticks = new Set(notesIn(bass, bar).map((note) => note.tick - bar.start));
        return strongPulses(bar.meter).every((tick) => ticks.has(tick));
      });
      return share(both.length, bars.length);
    },
  },
  {
    id: "bass.semitones-per-move-walking",
    seat: "bass",
    idiom: true,
    says: "A walking line moves mostly by step, with a third or a fourth now and then.",
    unit: "semitones",
    of(take) {
      const moves: number[] = [];
      for (const stretch of movingStretches(take)) {
        for (let i = 1; i < stretch.length; i++) {
          const move = Math.abs(stretch[i]! - stretch[i - 1]!);
          if (move > 0) moves.push(move);
        }
      }
      return mean(moves);
    },
  },
  {
    id: "bass.repeated-notes",
    seat: "bass",
    idiom: true,
    says: "A walking line never says a note twice running: it keeps moving.",
    unit: "share",
    of(take) {
      let moves = 0;
      let repeats = 0;
      for (const stretch of movingStretches(take)) {
        for (let i = 1; i < stretch.length; i++) {
          moves++;
          if (stretch[i] === stretch[i - 1]) repeats++;
        }
      }
      return share(repeats, moves);
    },
  },
  {
    id: "bass.strong-beats-on-the-chord",
    seat: "bass",
    idiom: true,
    says: "On beats 1 and 3 a walking line plays the chord; the notes that pass fall on 2 and 4.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let strong = 0;
      let tones = 0;
      for (const bar of movingBars(take)) {
        if (bar.meter.beats !== 4 || bar.meter.unit !== 4) continue;
        for (const note of notesIn(bass, bar)) {
          const at = note.tick - bar.start;
          if (at !== 0 && at !== 2 * PPQ) continue;
          const tone = onTheChord(take, note);
          if (tone === null) continue;
          strong++;
          if (tone) tones++;
        }
      }
      return share(tones, strong);
    },
  },
  {
    id: "bass.run-length",
    seat: "bass",
    idiom: true,
    says: "A walking line goes somewhere: it keeps on the same way for a few notes before it turns, where a line that wanders round one note turns at every step.",
    unit: "ratio",
    of(take) {
      let moves = 0;
      let runs = 0;
      for (const stretch of movingStretches(take)) {
        let way = 0;
        for (let i = 1; i < stretch.length; i++) {
          const move = Math.sign(stretch[i]! - stretch[i - 1]!);
          if (move === 0) continue;
          moves++;
          if (move !== way) runs++;
          way = move;
        }
      }
      return runs === 0 ? null : { value: moves / runs, cases: runs };
    },
  },
  {
    id: "bass.rocking",
    seat: "bass",
    idiom: true,
    says: "A walking line does not mark time on two notes: it seldom goes straight back to the note it has just left.",
    unit: "share",
    of(take) {
      let moves = 0;
      let back = 0;
      for (const stretch of movingStretches(take)) {
        for (let i = 2; i < stretch.length; i++) {
          if (stretch[i - 1] === stretch[i - 2]) continue;
          moves++;
          if (stretch[i] === stretch[i - 2]) back++;
        }
      }
      return share(back, moves);
    },
  },
  {
    id: "bass.half-steps-into-changes-walking",
    seat: "bass",
    idiom: true,
    says: "Walking, the bass comes into a good half of its changes by a half step, from under or from over, and into the rest by a scale step or from the fifth.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let changes = 0;
      let halfSteps = 0;
      for (const change of bassChanges(take)) {
        const leaving = barAt(take, change.tick - 1);
        const tier = leaving ? bassTier(leaving) : null;
        if (!leaving || leaving.ending || tier === null || tier === "low") continue;
        const landing = bass.find((note) => note.tick === change.tick);
        const before = bass.findLast((note) => note.tick < change.tick);
        if (!landing || !before || change.tick - before.tick > PPQ * 1.5) continue;
        changes++;
        if (Math.abs(before.pitch - landing.pitch) === 1) halfSteps++;
      }
      return share(halfSteps, changes);
    },
  },
  {
    id: "bass.bar-same-as-the-bar-before",
    seat: "bass",
    idiom: true,
    says: "A walking line does not play the same bar twice running, note for note.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      const bars = movingBars(take);
      let pairs = 0;
      let same = 0;
      bars.forEach((bar, i) => {
        const before = bars[i - 1];
        if (!before || before.index !== bar.index - 1) return;
        pairs++;
        if (barOf(notesIn(bass, bar), bar) === barOf(notesIn(bass, before), before)) same++;
      });
      return share(same, pairs);
    },
  },
  {
    id: "bass.held-notes-on-the-chord",
    seat: "bass",
    idiom: true,
    says: "A note held a half note or more is a tone of its chord: a passing tone passes.",
    unit: "share",
    of(take) {
      let held = 0;
      let tones = 0;
      for (const note of notesOf(take, "bass")) {
        if (note.duration < HELD) continue;
        const tone = onTheChord(take, note);
        if (tone === null) continue;
        held++;
        if (tone) tones++;
      }
      return share(tones, held);
    },
  },
  {
    id: "bass.syncopated-sixteenths",
    seat: "bass",
    idiom: true,
    says: 'Some of a funk line sits on the sixteenths between the eighths, the "e"s and the "a"s: enough to push, not so much that the beat is lost.',
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let notes = 0;
      let off = 0;
      for (const bar of musicBars(take)) {
        if (bar.ending) continue;
        for (const note of notesIn(bass, bar)) {
          notes++;
          if (((note.tick - bar.start) / STEP) % 2 === 1) off++;
        }
      }
      return share(off, notes);
    },
  },
  {
    id: "bass.kicks-doubled",
    seat: "bass",
    idiom: true,
    says: "The bass is locked to the kick: where the drummer's foot falls, the bass plays with it.",
    unit: "share",
    of(take) {
      const struck = new Set(notesOf(take, "bass").map((note) => note.tick));
      const kicks = notesOf(take, "drums").filter((note) => {
        if (note.voice !== "kick" || note.velocity < HEARD_KICK) return false;
        const bar = barAt(take, note.tick);
        return (
          bar?.kind === "music" && bar.seats.bass !== null && chordAt(take, note.tick) !== null
        );
      });
      return share(kicks.filter((kick) => struck.has(kick.tick)).length, kicks.length);
    },
  },
  {
    id: "bass.on-the-one",
    seat: "bass",
    idiom: true,
    says: "The One is always there: every bar opens with the bass on its downbeat.",
    unit: "share",
    of(take) {
      const struck = new Set(notesOf(take, "bass").map((note) => note.tick));
      const bars = musicBars(take).filter(
        (bar) => bar.seats.bass !== null && chordAt(take, bar.start) !== null,
      );
      return share(bars.filter((bar) => struck.has(bar.start)).length, bars.length);
    },
  },
  {
    id: "bass.riff-held",
    seat: "bass",
    idiom: true,
    says: "A riff is the same riff in every bar: through one time round a section, the front half of the bar (where no turn, fill or lead-in reaches) keeps one rhythm.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      const fronts = new Map<string, Map<string, number>>();
      let bars = 0;
      for (const bar of musicBars(take)) {
        const tier = bassTier(bar);
        if (bar.ending || tier === null || bar.meter.beats !== 4 || bar.meter.unit !== 4) continue;
        // A chord that lands inside the front half is stated there, riff or no riff.
        if (bar.spans.some((span) => !span.tied && span.start > 0 && span.start < 2 * PPQ))
          continue;
        if (bar.spans.some((span) => span.chord === null)) continue;
        const front = notesIn(bass, bar)
          .filter((note) => note.tick - bar.start < 2 * PPQ)
          .map((note) => `${note.tick - bar.start}${note.voice ?? ""}`)
          .join(" ");
        const key = `${bar.section.occurrence}/${tier}`;
        const known = fronts.get(key) ?? new Map<string, number>();
        known.set(front, (known.get(front) ?? 0) + 1);
        fronts.set(key, known);
        bars++;
      }
      let usual = 0;
      for (const known of fronts.values()) usual += Math.max(...known.values());
      return share(usual, bars);
    },
  },
  {
    id: "bass.dead-notes",
    seat: "bass",
    idiom: true,
    says: "Past the quiet level a funk line has dead notes in it: thumps between the notes, a few to the bar and not a bar of them.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let notes = 0;
      let dead = 0;
      for (const bar of movingBars(take)) {
        for (const note of notesIn(bass, bar)) {
          notes++;
          if (note.voice === "dead") dead++;
        }
      }
      return share(dead, notes);
    },
  },
  {
    id: "bass.note-length",
    seat: "bass",
    idiom: true,
    says: "Funk notes are short: on average well under an eighth note, in sixteenths.",
    unit: "ratio",
    of(take) {
      const bass = notesOf(take, "bass");
      const lengths: number[] = [];
      for (const bar of musicBars(take)) {
        if (bar.ending) continue;
        for (const note of notesIn(bass, bar)) lengths.push(note.duration / STEP);
      }
      return mean(lengths);
    },
  },
  {
    id: "bass.roots-and-fifths",
    seat: "bass",
    idiom: true,
    says: "On beats 1 and 3 the bass plays the chord's root or its fifth: a line that adds notes as the band comes up, never harmony.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let strong = 0;
      let plain = 0;
      for (const bar of musicBars(take)) {
        if (bar.ending || bar.meter.beats !== 4 || bar.meter.unit !== 4) continue;
        for (const note of notesIn(bass, bar)) {
          const at = note.tick - bar.start;
          if (at !== 0 && at !== 2 * PPQ) continue;
          const tone = rootOrFifth(take, note);
          if (tone === null) continue;
          strong++;
          if (tone) plain++;
        }
      }
      return share(plain, strong);
    },
  },
  {
    id: "bass.passing-tones",
    seat: "bass",
    idiom: true,
    says: "A few notes are neither the root nor the fifth: a step on the last beat into a new root, and nothing else.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let notes = 0;
      let passing = 0;
      for (const bar of musicBars(take)) {
        if (bar.ending) continue;
        for (const note of notesIn(bass, bar)) {
          const tone = rootOrFifth(take, note);
          if (tone === null) continue;
          notes++;
          if (!tone) passing++;
        }
      }
      return share(passing, notes);
    },
  },
  {
    id: "bass.note-length-quiet",
    seat: "bass",
    idiom: true,
    says: "When the band is quiet the bass lets its notes ring into the next: a half note or longer on average, in sixteenths.",
    unit: "ratio",
    of(take) {
      const bass = notesOf(take, "bass");
      const lengths: number[] = [];
      for (const bar of musicBars(take)) {
        if (bar.ending || bassTier(bar) !== "low") continue;
        for (const note of notesIn(bass, bar)) lengths.push(note.duration / STEP);
      }
      return mean(lengths);
    },
  },
  {
    id: "bass.silence",
    seat: "bass",
    idiom: true,
    says: "A line with room in it: some of every bar is silence, so the kick has room to speak, and most of it is not.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let steps = 0;
      let silent = 0;
      for (const bar of musicBars(take)) {
        if (bar.ending || bar.seats.bass === null) continue;
        const sounding = new Array<boolean>(Math.round(bar.ticks / STEP)).fill(false);
        for (const note of bass) {
          if (note.tick >= bar.start + bar.ticks || note.tick + note.duration <= bar.start)
            continue;
          for (let step = 0; step < sounding.length; step++) {
            const at = bar.start + step * STEP + STEP / 2;
            if (note.tick <= at && at < note.tick + note.duration) sounding[step] = true;
          }
        }
        steps += sounding.length;
        silent += sounding.filter((on) => !on).length;
      }
      return share(silent, steps);
    },
  },
  {
    id: "bass.approaches-from-below",
    seat: "bass",
    idiom: true,
    says: "A change reached by a half step is mostly slid up into from below, not fallen into from above.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let halfSteps = 0;
      let below = 0;
      for (const change of bassChanges(take)) {
        const landing = bass.find((note) => note.tick === change.tick);
        const before = bass.findLast((note) => note.tick < change.tick);
        if (!landing || !before || change.tick - before.tick > PPQ) continue;
        if (Math.abs(before.pitch - landing.pitch) !== 1) continue;
        halfSteps++;
        if (before.pitch < landing.pitch) below++;
      }
      return share(below, halfSteps);
    },
  },
];

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
    idiom: true,
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
    idiom: true,
    says: "When the band is quiet the bass plays in two: about a note every other beat.",
    unit: "per beat",
    of(take) {
      const bass = notesOf(take, "bass");
      const rates = musicBars(take)
        // In four only: in three a bass in two has one note to play, and that is not "two".
        .filter(
          (bar) =>
            tierOf(bar.energy) === "low" &&
            !bar.ending &&
            bar.meter.unit === 4 &&
            bar.meter.beats === 4,
        )
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
    idiom: true,
    says: "At the working level a chorus is more than one or two bars played over and over: the line has a few shapes, not one and not twelve.",
    unit: "ratio",
    of: (take) => shapesPerChorus(take, 1),
  },
  {
    id: "bass.two-bar-shapes-per-chorus",
    seat: "bass",
    idiom: true,
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
    idiom: true,
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
    idiom: true,
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
  ...idiomMeasures,
  {
    id: "bass.boom-chick",
    seat: "bass",
    idiom: true,
    says: "The two-beat bass: in a bar of four on one chord, its root on 1 and on 3 its fifth (over a chord standing on its fifth, the chord's own root), or the first note of a walk into the next chord: the root held and a step on 4, a step on 3 before it or not. 2 and 4 are left to the chick.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let bars = 0;
      let boom = 0;
      for (const bar of fourOnOneChord(take)) {
        const chord = bar.spans[0]!.chord!;
        const notes = notesIn(bass, bar);
        const on = (beat: number) => notes.find((note) => note.tick === bar.start + beat * PPQ);
        const [one, three, four] = [on(0), on(2), on(3)];
        bars++;
        const root = pitchClass(chord.root);
        const standsOn = pitchClass(chord.bass ?? chord.root);
        const fifth =
          chordTones(chord.quality).find((tone) => tone.role === "fifth")?.interval ?? 7;
        const other = standsOn !== root ? root : mod12(root + fifth);
        if (!one || mod12(one.pitch) !== standsOn) continue;
        if (three && mod12(three.pitch) === other) {
          boom++;
          continue;
        }
        // A walk (BA-53): the note on 4 a step from the next bar's first, the one on 3 (if any)
        // a step from it, and nothing else in the bar but the root.
        const landing = bass.find((note) => note.tick === bar.start + bar.ticks);
        const step = (a: number, b: number) => a !== b && Math.abs(a - b) <= 2;
        const walks =
          four !== undefined &&
          landing !== undefined &&
          step(four.pitch, landing.pitch) &&
          (three === undefined || step(three.pitch, four.pitch)) &&
          notes.length === (three ? 3 : 2);
        if (walks) boom++;
      }
      return share(boom, bars);
    },
  },
  {
    id: "bass.notes-per-beat",
    seat: "bass",
    idiom: true,
    says: "How busy the line is, in notes a beat over its bars of four: two a bar is a two-beat bass, a walk adds one or two.",
    unit: "per beat",
    of(take) {
      const bass = notesOf(take, "bass");
      let beats = 0;
      let notes = 0;
      for (const bar of musicBars(take)) {
        if (bar.ending || bar.seats.bass === null || bar.meter.beats !== 4 || bar.meter.unit !== 4)
          continue;
        beats += 4;
        notes += notesIn(bass, bar).length;
      }
      return beats === 0 ? null : { value: notes / beats, cases: beats };
    },
  },
  {
    id: "bass.changes-walked",
    seat: "bass",
    idiom: true,
    says: "Above the quiet level, some changes of bass note at a barline are walked into from the bar before: the root held, and a step on 4 (and on 3) into the new root; most are not.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let cases = 0;
      let walked = 0;
      for (const change of bassChanges(take)) {
        if (change.tick !== change.bar.start || change.bar.ending) continue;
        const before = take.plan.bars[change.bar.index - 1];
        if (before?.kind !== "music" || before.meter.beats !== 4) continue;
        const tier = bassTier(before);
        if (tier === null || tier === "low" || before.spans.length !== 1) continue;
        const landing = bass.find((note) => note.tick === change.tick);
        if (!landing) continue;
        cases++;
        const notes = notesIn(bass, before);
        const on = (beat: number) => notes.find((note) => note.tick === before.start + beat * PPQ);
        const [three, four] = [on(2), on(3)];
        const step = (a: number, b: number) => a !== b && Math.abs(a - b) <= 2;
        if (four && step(four.pitch, landing.pitch) && (!three || step(three.pitch, four.pitch)))
          walked++;
      }
      return share(walked, cases);
    },
  },
];

/** Bars of four on one chord, struck on the downbeat, with the bass in and short of the ending. */
function fourOnOneChord(take: Take): PlanBar[] {
  return musicBars(take).filter(
    (bar) =>
      !bar.ending &&
      bar.seats.bass !== null &&
      bar.meter.beats === 4 &&
      bar.meter.unit === 4 &&
      bar.spans.length === 1 &&
      bar.spans[0]!.chord !== null &&
      bar.spans[0]!.start === 0,
  );
}
