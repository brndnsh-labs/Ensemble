// What a pianist would say about the voicings of a comping part: where the
// hand sits, how the top of it moves from chord to chord, and what colour it
// carries. Measured strike by strike, and at the changes for the line on top.

import type { ChartChord } from "../../chart/types.ts";
import { arrivals } from "../../perform/harmony.ts";
import type { NoteEvent } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import { fingerings, positionOf } from "../../players/chords/guitar.ts";
import { MUTED, PICKED } from "../../players/chords/strike.ts";
import { LOW_LIMITS, RUB_FLOOR } from "../../players/chords/voicing.ts";
import type { StylePack } from "../../style/types.ts";
import type { Take } from "../../take.ts";
import { chordFamily, chordTones, chordToString } from "../../theory/chord.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import { barAt, chordAt, mean, notesOf, share } from "../read.ts";
import type { Measure } from "../types.ts";
import { EIGHTH, POCKET, pumping, states } from "./comping.ts";

/** One time the hand comes down: its pitches low to high, and the chord written under it. */
interface Struck {
  readonly tick: number;
  readonly pitches: readonly number[];
  readonly chord: ChartChord;
  readonly bar: PlanBar;
}

/**
 * The comp's strikes in order. Notes struck together are one chord, and the
 * chord a strike plays is the one written under it, unless it is struck in
 * the eighth before a change and is still sounding there: then it is the
 * chord coming, played early (X-B-07). A scratch is a stroke of the rhythm and
 * states no chord, so it is not a strike; nor is a plucked string, which is one
 * note of a grip: a voicing is read where the hand strums it.
 */
function strikes(take: Take): Struck[] {
  const byTick = new Map<number, { pitches: number[]; ends: number }>();
  for (const note of notesOf(take, "chords")) {
    if (note.voice === MUTED || note.voice === PICKED) continue;
    const hit = byTick.get(note.tick) ?? { pitches: [], ends: 0 };
    hit.pitches.push(note.pitch);
    hit.ends = Math.max(hit.ends, note.tick + note.offset + note.duration);
    byTick.set(note.tick, hit);
  }
  const harmony = arrivals(take.plan);
  let at = 0;
  const result: Struck[] = [];
  for (const [tick, { pitches, ends }] of [...byTick].sort((a, b) => a[0] - b[0])) {
    while ((harmony[at + 1]?.tick ?? Infinity) <= tick) at++;
    const next = harmony[at + 1];
    // Played early, and it is the chord coming: a groove's stab on the last sixteenth stops
    // at the barline too, and is the old chord.
    const early =
      next?.chord &&
      next.tick - tick <= EIGHTH &&
      ends >= next.tick - POCKET &&
      states(next.chord, pitches);
    const chord = early ? next.chord : chordAt(take, tick);
    const bar = barAt(take, tick);
    if (chord && bar) result.push({ tick, pitches: pitches.sort((a, b) => a - b), chord, bar });
  }
  return result;
}

/** Semitones the top voice moves at each change of chord: where a listener hears the line. */
function topMoves(take: Take): number[] {
  const moves: number[] = [];
  const list = strikes(take);
  for (let i = 1; i < list.length; i++) {
    const [before, now] = [list[i - 1]!, list[i]!];
    if (chordToString(before.chord) === chordToString(now.chord)) continue;
    moves.push(Math.abs(now.pitches.at(-1)! - before.pitches.at(-1)!));
  }
  return moves;
}

function topShare(take: Take, inBand: (move: number) => boolean) {
  const moves = topMoves(take);
  return share(moves.filter(inBand).length, moves.length);
}

/** Semitones above the root, 0 to 11. */
const above = (chord: ChartChord, pitch: number) => mod12(pitch - pitchClass(chord.root));

/** The highest bass note sounding as the hand comes down. */
function bassUnder(bass: readonly NoteEvent[], tick: number): number | null {
  let highest: number | null = null;
  for (const note of bass) {
    if (note.tick > tick) break;
    if (note.tick + note.duration > tick) highest = Math.max(highest ?? -1, note.pitch);
  }
  return highest;
}

/** A voicing fault from Q-03, or null. */
function fault(s: Struck): string | null {
  const { pitches, chord } = s;
  const dominant = chordFamily(chord.quality) === "dominant";
  const [low, next] = pitches;
  if (low !== undefined && next !== undefined && next - low === 1 && (!dominant || low < RUB_FLOOR))
    return "minor 2nd on the bottom";
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      const gap = pitches[j]! - pitches[i]!;
      if (!dominant && gap > 12 && gap % 12 === 1) return "minor 9th";
    }
    if (i > 0) {
      const gap = (pitches[i]! - pitches[i - 1]!) % 12;
      if (gap > 0 && pitches[i - 1]! < (LOW_LIMITS[gap] ?? 0))
        return "under its low-interval limit";
    }
  }
  const majorThird = chordTones(chord.quality).some((t) => t.role === "third" && t.interval === 4);
  if (dominant && majorThird) {
    const sharpNine = pitches.findIndex((p) => above(chord, p) === 3);
    const third = pitches.findIndex((p) => above(chord, p) === 4);
    if (sharpNine >= 0 && third >= 0 && sharpNine < third) return "#9 under the 3rd";
  }
  return null;
}

/** The tensions a symbol writes, as semitones above the root. A 7alt names a family, not tones. */
function writtenTensions(chord: ChartChord): number[] {
  if (chord.quality.base === "7alt") return [];
  const altered = new Set(
    ["b5", "#5"].filter((a) => chord.quality.alterations.includes(a as never)),
  );
  return chordTones(chord.quality)
    .filter(
      (t) =>
        t.role === "ninth" ||
        t.role === "eleventh" ||
        t.role === "thirteenth" ||
        (t.role === "fifth" && altered.size > 0),
    )
    .map((t) => mod12(t.interval));
}

const floorOf = (style: StylePack) => style.chords.register.floor;

/**
 * How far the hand travels along the neck at each change of chord, in frets.
 * Where a grip is fretted is the guitar's own rule (the place nearest the hand),
 * so this is the journey a guitarist playing these notes would make. Null on a keyboard.
 */
function neckMoves(take: Take, style: StylePack): number[] | null {
  const guitar = style.chords.idiom;
  if (guitar === "keys") return null;
  // The grip held through each stay on a chord: its fullest strike, since an upstroke
  // catches only the top strings of what the hand is holding.
  const grips: Struck[] = [];
  let chord = "";
  for (const s of strikes(take)) {
    const name = chordToString(s.chord);
    if (name !== chord) grips.push(s);
    else if (s.pitches.length > grips.at(-1)!.pitches.length) grips[grips.length - 1] = s;
    chord = name;
  }
  const places = fingerings(
    guitar,
    grips.map((s) => s.pitches),
  ).map((strings, i) => (strings ? positionOf(strings, grips[i]!.pitches) : null));
  const moves: number[] = [];
  for (let i = 1; i < places.length; i++) {
    const [from, to] = [places[i - 1]!, places[i]!];
    if (from !== null && to !== null) moves.push(Math.abs(to - from));
  }
  return moves;
}

export const chordMeasures: readonly Measure[] = [
  {
    id: "chords.top-holds",
    seat: "chords",
    says: "At a change of chord the top note sometimes stays where it is: a common tone held across.",
    unit: "share",
    of: (take) => topShare(take, (move) => move === 0),
  },
  {
    id: "chords.top-steps",
    seat: "chords",
    says: "At a change of chord the top note mostly moves by a half or whole step: the top of the comp is a line.",
    unit: "share",
    of: (take) => topShare(take, (move) => move >= 1 && move <= 2),
  },
  {
    id: "chords.top-small-leaps",
    seat: "chords",
    says: "At a change of chord the top note now and then moves a third or a fourth.",
    unit: "share",
    of: (take) => topShare(take, (move) => move >= 3 && move <= 5),
  },
  {
    id: "chords.top-leaps",
    seat: "chords",
    says: "At a change of chord the top note rarely jumps more than a fourth: no lurches in the line.",
    unit: "share",
    of: (take) => topShare(take, (move) => move > 5),
  },
  {
    id: "chords.top-movement",
    seat: "chords",
    says: "On average the top note moves only a small step at a change (read it beside the shares).",
    unit: "semitones",
    of: (take) => mean(topMoves(take)),
  },
  {
    id: "chords.floor-clearance",
    seat: "chords",
    says: "The lowest note the comp plays all take, in semitones above its floor: never under it.",
    unit: "semitones",
    of(take, style) {
      const list = strikes(take);
      if (list.length === 0) return null;
      const lowest = Math.min(...list.map((s) => s.pitches[0]!));
      return { value: lowest - floorOf(style), cases: list.length };
    },
  },
  {
    id: "chords.crowds-the-bass",
    seat: "chords",
    says: "The comp's bottom note is rarely within a fourth of the bass note sounding under it: each has its own room.",
    unit: "share",
    of(take) {
      const bass = notesOf(take, "bass");
      let measured = 0;
      let crowded = 0;
      for (const s of strikes(take)) {
        const under = bassUnder(bass, s.tick);
        if (under === null) continue;
        measured++;
        if (s.pitches[0]! - under < 5) crowded++;
      }
      return share(crowded, measured);
    },
  },
  {
    id: "chords.closest-to-bass",
    seat: "chords",
    says: "The nearest the comp's bottom note comes to the bass note under it, in semitones, all take: it never sits on or under the bass.",
    unit: "semitones",
    of(take) {
      const bass = notesOf(take, "bass");
      const gaps: number[] = [];
      for (const s of strikes(take)) {
        const under = bassUnder(bass, s.tick);
        if (under !== null) gaps.push(s.pitches[0]! - under);
      }
      return gaps.length === 0 ? null : { value: Math.min(...gaps), cases: gaps.length };
    },
  },
  {
    id: "chords.lowest-note",
    seat: "chords",
    says: "Where the bottom of the hand sits on average, as a MIDI note: too low crowds the bass, too high crowds the soloist.",
    unit: "pitch",
    of: (take) => mean(strikes(take).map((s) => s.pitches[0]!)),
  },
  {
    id: "chords.colour",
    seat: "chords",
    says: "Most chords carry a 9th or a 13th: the sound of a blues or jazz piano, not a rock one. Bars of the pump are left out: there the hand plays plain chords on purpose.",
    unit: "share",
    of(take) {
      // The pump hammers triads, 6ths and 7ths (ST-blues-32), eight to the bar: counted in, it
      // would swamp every other bar of a loud take.
      const pumped = pumping(take);
      const list = strikes(take).filter((s) => s.pitches.length >= 2 && !pumped.has(s.bar.index));
      const coloured = list.filter((s) => {
        const own = new Set(
          chordTones(s.chord.quality)
            .filter((t) => !["ninth", "eleventh", "thirteenth"].includes(t.role))
            .map((t) => mod12(t.interval)),
        );
        return s.pitches.some((p) => {
          const interval = above(s.chord, p);
          return !own.has(interval) && [1, 2, 3, 8, 9].includes(interval);
        });
      });
      return share(coloured.length, list.length);
    },
  },
  {
    id: "chords.written-tensions",
    seat: "chords",
    says: "A 9th, 11th, 13th or altered note the chart writes is heard in the comp's chord.",
    unit: "share",
    of(take) {
      let cases = 0;
      let heard = 0;
      for (const s of strikes(take)) {
        if (s.pitches.length < 2) continue;
        const sounding = new Set(s.pitches.map((p) => above(s.chord, p)));
        for (const tension of writtenTensions(s.chord)) {
          cases++;
          if (sounding.has(tension)) heard++;
        }
      }
      return share(heard, cases);
    },
  },
  {
    id: "chords.flat-13-against-the-fifth",
    seat: "chords",
    lowerIsBetter: true,
    says: "Where the comp holds a b13 over a dominant chord, the bass and the soloist are seldom holding that chord's natural fifth with it: a half step, or a minor ninth, between the hand and the band.",
    unit: "share",
    // X-B-11 gives the hand the b13 on the way to a minor chord and X-B-08 calls a held half
    // step from a chord tone a rub; the fifth is still a chord tone to the bass and the line.
    // Held is X-B-08's: the two sound together for longer than an eighth, while the chord lasts.
    of(take) {
      const harmony = arrivals(take.plan);
      const fifths = [...notesOf(take, "bass"), ...notesOf(take, "solo")]
        .map((note) => ({
          pitch: note.pitch,
          from: note.tick + note.offset,
          to: note.tick + note.offset + note.duration,
        }))
        .filter((note) => note.to - note.from > EIGHTH)
        .sort((a, b) => a.from - b.from);
      const longest = Math.max(0, ...fifths.map((note) => note.to - note.from));
      const comp = notesOf(take, "chords").filter(
        (note) => note.voice !== MUTED && note.voice !== PICKED,
      );
      let [at, first, held, against] = [0, 0, 0, 0];
      for (const s of strikes(take)) {
        if (chordFamily(s.chord.quality) !== "dominant") continue;
        // The chord lasts until the harmony moves to another: a strike played early is the
        // chord coming, and that chord's arrival is not its end.
        const under = chordAt(take, s.tick);
        const early = !under || chordToString(under) !== chordToString(s.chord);
        let from = s.tick;
        while (
          at < harmony.length &&
          (harmony[at]!.tick <= s.tick ||
            (harmony[at]!.chord && chordToString(harmony[at]!.chord!) === chordToString(s.chord)))
        ) {
          if (early && from === s.tick) from = Math.max(from, harmony[at]!.tick);
          at++;
        }
        const until = harmony[at]?.tick ?? Number.POSITIVE_INFINITY;
        const ends = Math.max(
          0,
          ...comp
            .filter((note) => note.tick === s.tick && above(s.chord, note.pitch) === 8)
            .map((note) => note.tick + note.offset + note.duration),
        );
        const to = Math.min(ends, until);
        if (to - from <= EIGHTH) continue;
        held++;
        while (first < fifths.length && fifths[first]!.from < from - longest) first++;
        for (let i = first; i < fifths.length && fifths[i]!.from < to; i++) {
          const note = fifths[i]!;
          if (above(s.chord, note.pitch) !== 7) continue;
          if (Math.min(to, note.to) - Math.max(from, note.from) > EIGHTH) {
            against++;
            break;
          }
        }
      }
      return share(against, held);
    },
  },
  {
    id: "chords.voicing-faults",
    seat: "chords",
    says: "Almost no chord has a fault a pianist would hear: a half step on the bottom, a minor 9th, a #9 under the 3rd, a muddy low interval.",
    unit: "share",
    of(take) {
      const list = strikes(take).filter((s) => s.pitches.length >= 2);
      return share(list.filter((s) => fault(s) !== null).length, list.length);
    },
  },
  {
    id: "chords.width-jumps",
    seat: "chords",
    says: "The hand keeps its size: no chord is twice as wide as the chords either side of it in the section.",
    unit: "share",
    of(take) {
      const list = strikes(take);
      const width = (s: Struck) => s.pitches.at(-1)! - s.pitches[0]!;
      let cases = 0;
      let jumps = 0;
      for (let i = 1; i + 1 < list.length; i++) {
        const [before, now, after] = [list[i - 1]!, list[i]!, list[i + 1]!];
        const section = now.bar.section.identity;
        if (before.bar.section.identity !== section || after.bar.section.identity !== section)
          continue;
        cases++;
        if (width(now) > 2 * width(before) && width(now) > 2 * width(after)) jumps++;
      }
      return share(jumps, cases);
    },
  },
  {
    id: "chords.neck-movement",
    seat: "chords",
    idiom: true,
    says: "At a change of chord the fretting hand moves a fret or two on average: the part is played in one position, not chased up and down the neck.",
    unit: "semitones",
    of: (take, style) => mean(neckMoves(take, style) ?? []),
  },
  {
    id: "chords.neck-jumps",
    seat: "chords",
    idiom: true,
    says: "The hand seldom has to shift more than a four-fret hand's width between one chord and the next.",
    unit: "share",
    of(take, style) {
      const moves = neckMoves(take, style) ?? [];
      return share(moves.filter((move) => move > 4).length, moves.length);
    },
  },
];
