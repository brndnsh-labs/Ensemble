// The guitar: a chord is found on the fretboard, never placed on a keyboard
// and hoped playable (CH-20). A grip is one note to a string on neighbouring
// strings, pitch rising string to string, every fretted note inside a
// four-fret hand. The strumming hand is a pendulum, so a stroke's direction is
// read from where it falls (CH-27); a stroke rolls across the strings (CH-29);
// and a scratch is the same stroke with the fretting hand let go (CH-28).

import { PPQ } from "../../chart/types.ts";
import type { WrittenNote } from "../../perform/notes.ts";
import { mod12 } from "../../theory/pitch.ts";
import type { InstrumentIdiom } from "./idiom.ts";
import type { Voicing } from "./strike.ts";
import { MUTED } from "./strike.ts";
import type { Guitar } from "./style.ts";
import type { FittedTone } from "./tones.ts";

/** Standard tuning, low string first: E2 A2 D3 G3 B3 E4. */
export const OPEN_STRINGS: readonly number[] = [40, 45, 50, 55, 59, 64];
/** Nothing is fretted above this (CH-20). */
export const TOP_FRET = 15;
/** A four-fret hand: three frets between its lowest and highest fretted note (CH-20). */
export const HAND_SPAN = 3;
/** A hand has four fingers; the first may lie across several strings at one fret. */
const FINGERS = 4;
/** The shortest note the comp plays: half a sixteenth (CH-35), which is a scratch (CH-28). */
const SHORTEST = 60;

type Tone = FittedTone["tone"];

/** The fret each note of a grip is at: 0 is an open string. */
export function fretsOf(strings: readonly number[], pitches: readonly number[]): number[] {
  return pitches.map((pitch, i) => pitch - OPEN_STRINGS[strings[i]!]!);
}

/** Where the hand is on the neck: the fret under its first finger. An all-open grip is at the nut. */
export function positionOf(strings: readonly number[], pitches: readonly number[]): number {
  const fretted = fretsOf(strings, pitches).filter((fret) => fret > 0);
  return fretted.length === 0 ? 0 : Math.min(...fretted);
}

/** A grip as a guitarist writes it, low string first: `x x 6 7 7 x`. */
export function tab(strings: readonly number[], pitches: readonly number[]): string {
  const frets = fretsOf(strings, pitches);
  return OPEN_STRINGS.map((_, string) => {
    const at = strings.indexOf(string);
    return at < 0 ? "x" : String(frets[at]);
  }).join(" ");
}

/** Sets of strings a grip of `count` notes may use: neighbours, or neighbours with one muted inside. */
function stringSets(count: number, skip: boolean): number[][] {
  const sets: number[][] = [];
  const all = OPEN_STRINGS.length;
  for (let low = 0; low + count <= all; low++) {
    sets.push(Array.from({ length: count }, (_, i) => low + i));
  }
  if (skip) {
    for (let low = 0; low + count < all; low++) {
      for (let muted = 1; muted < count; muted++) {
        const run = Array.from({ length: count + 1 }, (_, i) => low + i);
        sets.push(run.filter((_, i) => i !== muted));
      }
    }
  }
  return sets;
}

/** Whether four fingers can hold these frets, the first lying across the lowest fret where it can (CH-24). */
function fingered(frets: readonly number[]): boolean {
  const fretted = frets.filter((fret) => fret > 0);
  if (fretted.length <= FINGERS) return true;
  const lowest = Math.min(...fretted);
  const first = frets.indexOf(lowest);
  const last = frets.lastIndexOf(lowest);
  // A bar never crosses an open string: the finger would stop it (CH-24).
  const bars = !frets.slice(first, last + 1).includes(0);
  const atBar = fretted.filter((fret) => fret === lowest).length;
  return fretted.length - (bars ? atBar - 1 : 0) <= FINGERS;
}

/**
 * Every way to fret a note on each of these strings, low string first: pitch
 * rising, the hand inside four frets, nothing over the 15th. `takes` says
 * whether a string may play a pitch, given the notes under it.
 */
function fretted(
  guitar: Guitar,
  strings: readonly number[],
  takes: (pitch: number, below: readonly number[]) => boolean,
): number[][] {
  const found: number[][] = [];
  const first = guitar.open ? 0 : 1;
  const place = (pitches: number[], low: number, high: number) => {
    const string = strings[pitches.length];
    if (string === undefined) {
      if (fingered(fretsOf(strings, pitches))) found.push([...pitches]);
      return;
    }
    for (let fret = first; fret <= TOP_FRET; fret++) {
      const pitch = OPEN_STRINGS[string]! + fret;
      if (pitches.length > 0 && pitch <= pitches.at(-1)!) continue;
      const [lowest, highest] =
        fret === 0 ? [low, high] : [Math.min(low, fret), Math.max(high, fret)];
      if (highest - lowest > HAND_SPAN) continue;
      if (!takes(pitch, pitches)) continue;
      pitches.push(pitch);
      place(pitches, lowest, highest);
      pitches.pop();
    }
  };
  place([], Infinity, -Infinity);
  return found;
}

/**
 * Places on the neck in the order a hand with no chord in it would take them:
 * the one nearer where the style parks the hand first; of two as near, the one
 * on the higher strings, which is brighter.
 */
function nearer(guitar: Guitar, pitches: readonly number[]) {
  const away = (strings: readonly number[]) =>
    Math.abs(positionOf(strings, pitches) - guitar.position);
  return (a: readonly number[], b: readonly number[]) => away(a) - away(b) || b[0]! - a[0]!;
}

/**
 * How much the place the style parks the hand still pulls on a hand that has
 * a chord in it, against the distance from where it is. At a half, a grip one
 * fret away is taken over one four frets away on the home side, so a vamp
 * stays put; and a hand that has followed the chords up the neck comes back
 * when the two places are about as far, instead of living on the low strings.
 */
const HOME_PULL = 0.5;

/** Of the places listed, the one the hand goes to from where it is; of two as good, the earlier. */
function nearest<Place>(
  guitar: Guitar,
  places: readonly Place[],
  at: (place: Place) => number,
  hand: number,
) {
  const reach = (place: Place) =>
    Math.abs(at(place) - hand) + HOME_PULL * Math.abs(at(place) - guitar.position);
  let best = places[0];
  for (const place of places) {
    if (best !== undefined && reach(place) < reach(best)) best = place;
  }
  return best;
}

/**
 * Where on the neck this guitar plays these pitches (low to high): the string
 * for each, or null when no hand could hold them. The same notes can usually
 * be fretted in two places, five frets and a string apart, and the hand takes
 * the one nearest where it already is (`hand`, the fret under the first
 * finger), leaning toward home; with no chord in it, the one nearest where
 * the style parks it.
 */
export function fingering(
  guitar: Guitar,
  pitches: readonly number[],
  hand: number | null = null,
): number[] | null {
  const places = stringSets(pitches.length, guitar.skip)
    .filter(
      (strings) =>
        fretted(guitar, strings, (pitch, below) => pitch === pitches[below.length]).length > 0,
    )
    .sort(nearer(guitar, pitches));
  if (hand === null) return places[0] ?? null;
  return nearest(guitar, places, (strings) => positionOf(strings, pitches), hand) ?? null;
}

/**
 * A part's grips as they are fingered, in order: each where the hand reaches
 * it most easily from the grip before. This is the guitar's own rule, so a
 * part can be read back from its pitches: a reader that knows only the notes
 * finds the strings they were played on.
 */
export function fingerings(
  guitar: Guitar,
  grips: readonly (readonly number[])[],
): (number[] | null)[] {
  let hand: number | null = null;
  return grips.map((pitches) => {
    const strings = fingering(guitar, pitches, hand);
    if (strings) hand = positionOf(strings, pitches);
    return strings;
  });
}

/** The tones a grip gives up, first to last, when no hand can hold them all (X-B-13: never a guide tone). */
const GIVEN_UP: readonly Tone[] = ["R", "5", "13", "11", "9"];

/** Every grip of exactly these tones on `count` strings. */
function grips(
  guitar: Guitar,
  tones: readonly FittedTone[],
  root: number,
  floor: number,
  count: number,
): Voicing[] {
  const toneAt = new Map(tones.map((tone) => [mod12(root + tone.interval), tone.tone]));
  // With more strings than tones only the root or the fifth is doubled (CH-21).
  const doubles = (tone: Tone) => tone === "R" || tone === "5";
  const spare = count - tones.length;
  const byPitches = new Map<string, number[][]>();
  for (const strings of stringSets(count, guitar.skip)) {
    const found = fretted(guitar, strings, (pitch, below) => {
      const tone = toneAt.get(mod12(pitch));
      if (pitch < floor || tone === undefined) return false;
      if (guitar.rootOnBottom && below.length === 0 && tone !== "R") return false;
      const held = below.map((other) => toneAt.get(mod12(other))!);
      const doubled = held.length - new Set(held).size;
      return !held.includes(tone) || (doubles(tone) && doubled < spare);
    });
    for (const pitches of found) {
      if (new Set(pitches.map((pitch) => mod12(pitch))).size < tones.length) continue;
      const key = pitches.join(" ");
      byPitches.set(key, [...(byPitches.get(key) ?? []), [...strings]]);
    }
  }
  return [...byPitches].map(([key, ways]) => {
    const pitches = key.split(" ").map(Number);
    const tones = pitches.map((pitch) => toneAt.get(mod12(pitch))!);
    const places = ways
      .sort(nearer(guitar, pitches))
      .map((strings): Voicing => ({ pitches, tones, strings }));
    for (const place of places) PLACES.set(place, places);
    return places[0]!;
  });
}

/** Every place on the neck a grip's notes can be held, the grip itself among them. */
const PLACES = new WeakMap<Voicing, readonly Voicing[]>();

/**
 * The order grips are offered in, which settles a tie: the tighter grip first
 * (a 13th a half step under the 7th, not a minor ninth under it), then the
 * lower hand, by the bottom note and the next up.
 */
function tighter(a: Voicing, b: Voicing): number {
  const width = (voicing: Voicing) => voicing.pitches.at(-1)! - voicing.pitches[0]!;
  if (width(a) !== width(b)) return width(a) - width(b);
  for (const [i, pitch] of a.pitches.entries()) {
    const gap = pitch - (b.pitches[i] ?? pitch);
    if (gap !== 0) return gap;
  }
  return 0;
}

const idioms = new WeakMap<Guitar, InstrumentIdiom>();

/** The guitar a style describes, as the chord seat plays it. */
export function guitar(style: Guitar): InstrumentIdiom {
  const known = idioms.get(style);
  if (known) return known;
  const idiom: InstrumentIdiom = {
    // A guitarist holds a grip until the chord changes and moves only then (CH-31).
    holds: true,

    /**
     * Every grip of the tones in the style's window, the tightest first. A chord
     * with more tones than the style has strings takes a string for each
     * before any is given up (CH-21); a chord no hand can hold whole gives up
     * its root, then its fifth, then colour, never a guide tone (X-B-13).
     */
    candidates(tones, root, register) {
      let wanted = [...tones];
      for (;;) {
        const most = Math.min(OPEN_STRINGS.length, Math.max(style.strings, wanted.length));
        for (let count = most; count >= wanted.length && count > 0; count--) {
          const found = grips(style, wanted, root, register.floor, count);
          if (found.length > 0) return found.sort(tighter);
        }
        const spare = GIVEN_UP.map((tone) => wanted.findIndex((w) => w.tone === tone)).find(
          (index) => index >= 0,
        );
        if (spare === undefined) return [];
        wanted = wanted.filter((_, i) => i !== spare);
      }
    },

    /**
     * The same notes where the hand reaches them most easily from the grip
     * it is holding. With no chord in the hand, the grip as first offered:
     * nearest where the style parks it.
     */
    placed(voicing, from) {
      const places = PLACES.get(voicing);
      if (!places || !from?.strings) return voicing;
      const at = (place: Voicing) => positionOf(place.strings ?? [], place.pitches);
      return nearest(style, places, at, at(from)) ?? voicing;
    },

    write(part, plan) {
      const notes: WrittenNote[] = [];
      const { grid, up, lighter, roll } = style.strum;
      const pair = grid === "eighth" ? PPQ : PPQ / 2;
      // The roll is a time, not a share of the beat: the same at every tempo (CH-29).
      const ticksPerMs = (plan.tempo * PPQ) / 60_000;
      part.forEach(({ strike, voicing }, i) => {
        const next = part[i + 1]?.strike;
        const room = next && next.tick > strike.tick ? next.tick - strike.tick : Infinity;
        const duration = Math.max(SHORTEST, Math.min(strike.duration, room));
        // The pendulum: down on the beat side of each pair, up on the other (CH-27).
        const inBar = strike.tick - (plan.bars[strike.bar]?.start ?? 0);
        const upstroke = !strike.down && inBar % pair >= pair / 2;
        const strings = voicing.strings ?? voicing.pitches.map((_, string) => string);
        // An upstroke catches only the top strings of the grip.
        const from = upstroke ? Math.max(0, voicing.pitches.length - up) : 0;
        const [lowest, highest] = [strings[from]!, strings.at(-1)!];
        const across = (highest - lowest) * roll;
        for (let k = from; k < voicing.pitches.length; k++) {
          // Low string first going down, high string first coming up (CH-29), the whole
          // stroke centred on its place in the grid. Feel adds the nudge to the pocket.
          const reached = (upstroke ? highest - strings[k]! : strings[k]! - lowest) * roll;
          const nudge = (reached - across / 2) * ticksPerMs;
          notes.push({
            seat: "chords",
            bar: strike.bar,
            tick: strike.tick,
            duration,
            pitch: voicing.pitches[k]!,
            velocity: Math.max(1, strike.velocity - (upstroke ? lighter : 0)),
            ...(strike.muted ? { voice: MUTED } : {}),
            ...(nudge === 0 ? {} : { nudge }),
          });
        }
      });
      return notes;
    },
  };
  idioms.set(style, idiom);
  return idiom;
}
