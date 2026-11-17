// The guitar: a chord is found on the fretboard, never placed on a keyboard
// and hoped playable (CH-20). A grip is one note to a string on neighbouring
// strings, pitch rising string to string, every fretted note inside a
// four-fret hand. The strumming hand is a pendulum, so a stroke's direction is
// read from where it falls (CH-27); a stroke rolls across the strings (CH-29);
// and a scratch is the same stroke with the fretting hand let go (CH-28).

import { PPQ } from "../../chart/types.ts";
import { isCompound, onAnd } from "../../perform/meter.ts";
import type { WrittenNote } from "../../perform/notes.ts";
import type { Plan } from "../../plan/types.ts";
import type { Chord } from "../../theory/chord.ts";
import { chordFamily, toneInterval } from "../../theory/chord.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import type { InstrumentIdiom } from "./idiom.ts";
import type { VoicedStrike, Voicing } from "./strike.ts";
import { LOW_LIMITS, MUTED, PICKED } from "./strike.ts";
import type { Guitar, PickPlace } from "./style.ts";
import type { FittedTone } from "./tones.ts";
import { alterationsOf } from "./tones.ts";
import { growls } from "./voicing.ts";

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
  // With more strings than tones only the root or the fifth is doubled (CH-21). In open
  // position the third may be doubled too, once, with the copy on the top two strings (CH-24).
  const doubles = (tone: Tone, held: readonly Tone[]) =>
    tone === "R" ||
    tone === "5" ||
    (guitar.openPosition !== undefined &&
      tone === "3" &&
      held.length >= count - 2 &&
      held.filter((other) => other === "3").length === 1);
  const spare = count - tones.length;
  // A chord so dense that its root has given way to an alteration stands on what it has.
  const stands = guitar.rootOnBottom && tones.some((tone) => tone.tone === "R");
  const byPitches = new Map<string, number[][]>();
  for (const strings of stringSets(count, guitar.skip)) {
    const found = fretted(guitar, strings, (pitch, below) => {
      const tone = toneAt.get(mod12(pitch));
      if (pitch < floor || tone === undefined) return false;
      if (stands && below.length === 0 && tone !== "R") return false;
      // A grip that stands on its root is the bottom of its chord: its two lowest notes keep
      // the low-interval limits (X-B-04). On the two low strings only a fifth passes them, so
      // nothing sits under C3 but the root and the fifth over it (X-B-03): G is 3x0003.
      if (stands && below.length === 1) {
        const gap = (pitch - below[0]!) % 12;
        if (gap > 0 && below[0]! < (LOW_LIMITS[gap] ?? 0)) return false;
      }
      const held = below.map((other) => toneAt.get(mod12(other))!);
      const doubled = held.length - new Set(held).size;
      return !held.includes(tone) || (doubles(tone, held) && doubled < spare);
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

/** The grip's notes the chord is heard by: its third (or suspension), seventh (or sixth), and written alterations. */
function heardBy(voicing: Voicing, chord: Chord | null): number[] {
  const altered = chord
    ? alterationsOf(chord).map((interval) => mod12(pitchClass(chord.root) + interval))
    : [];
  return voicing.pitches.filter(
    (pitch, k) =>
      voicing.tones[k] === "3" || voicing.tones[k] === "7" || altered.includes(mod12(pitch)),
  );
}

/** One string sounding one note. */
interface Plucked {
  readonly string: number;
  readonly pitch: number;
}

const sameGrip = (a: Voicing, b: Voicing) =>
  a === b ||
  (a.pitches.length === b.pitches.length &&
    a.pitches.every((pitch, k) => pitch === b.pitches[k] && a.strings?.[k] === b.strings?.[k]));

/**
 * The thumb's alternate bass (CH-32): the chord's fifth a string under the
 * grip's bass at the same fret, which in standard tuning is the fourth below
 * (C3 on the fifth string with G2 beside it on the sixth; A2 with the open E),
 * where there is such a string and a hand holding the grip can hold that too.
 * Otherwise the fifth on one of the two strings over the bass (E2 with B2,
 * G2 with the open D), and with none there the bass again.
 */
function alternate(voicing: Voicing, chord: Chord | null): Plucked {
  const strings = voicing.strings ?? voicing.pitches.map((_, k) => k);
  const [string, bass] = [strings[0]!, voicing.pitches[0]!];
  const below = string - 1;
  const fifth = chord
    ? mod12(pitchClass(chord.root) + (toneInterval(chord.quality, "fifth") ?? 7))
    : -1;
  if (
    below >= 0 &&
    OPEN_STRINGS[string]! - OPEN_STRINGS[below]! === 5 &&
    mod12(bass - 5) === fifth &&
    fingered([bass - OPEN_STRINGS[string]!, ...fretsOf(strings, voicing.pitches)])
  ) {
    return { string: below, pitch: bass - 5 };
  }
  const over = [1, 2].find((k) => voicing.tones[k] === "5");
  const k = over ?? 0;
  return { string: strings[k]!, pitch: voicing.pitches[k]! };
}

/** The string a place of the picking hand is, in the grip the hand is holding. */
function placeIn(voicing: Voicing, chord: Chord | null, place: PickPlace): Plucked {
  const strings = voicing.strings ?? voicing.pitches.map((_, k) => k);
  const at = (k: number): Plucked => ({ string: strings[k]!, pitch: voicing.pitches[k]! });
  // A finger's string is counted from the top of the grip, as a guitarist numbers them.
  if (typeof place === "number") return at(Math.max(0, strings.length - place));
  if (place === "bass") return at(0);
  const other = alternate(voicing, chord);
  if (place === "alternate") return other;
  // The upper string: the next one of the grip over the bass and its alternate.
  const above = strings.findIndex((string) => string > Math.max(strings[0]!, other.string));
  return at(above < 0 ? strings.length - 1 : above);
}

/**
 * What each stroke of a part plucks, or null for a stroke that is strummed.
 * Under a new grip the thumb's first note is its bass, whichever of its
 * places the pattern writes there: a chord that arrives where the thumb would
 * alternate is still stated by its bass (CH-32).
 */
function plucked(part: readonly VoicedStrike[]): (readonly Plucked[] | null)[] {
  let holding: Voicing | null = null;
  let stated = false;
  return part.map(({ strike, voicing }) => {
    if (!holding || !sameGrip(holding, voicing)) stated = false;
    holding = voicing;
    if (!strike.pluck || strike.muted) {
      // A strum sounds the bass with everything else; a scratch sounds nothing.
      if (!strike.muted) stated = true;
      return null;
    }
    const thumbs = (place: PickPlace) => typeof place !== "number";
    const places = strike.pluck.map((place) => (!stated && thumbs(place) ? "bass" : place));
    if (places.includes("bass")) stated = true;
    const sounded: Plucked[] = [];
    for (const place of places) {
      const at = placeIn(voicing, strike.arrival.chord, place);
      if (!sounded.some((other) => other.string === at.string)) sounded.push(at);
    }
    return sounded;
  });
}

/**
 * How long a plucked string rings, in ticks: until it is plucked again, or
 * the hand strums or moves to another grip, and no longer than the hand goes
 * on holding the grip. Each stroke says how long its chord is written for from
 * where it falls, so while strokes on the same grip follow with no gap between
 * them the hand is still holding it: a string plucked late in a bar rings on
 * into the next bar of the same chord, and stops where the chord does.
 *
 * Nothing rings over the top of the form. A pass of an open jam is played
 * before the next is planned, and must come out the same when it is; what the
 * hand will pluck in a pass that does not exist yet cannot shorten a note.
 */
function rings(
  part: readonly VoicedStrike[],
  plucks: readonly (readonly Plucked[] | null)[],
  i: number,
  string: number,
  plan: Plan,
): number {
  const { strike, voicing } = part[i]!;
  const pass = plan.bars[strike.bar]?.pass;
  let held = strike.tick + strike.duration;
  for (let j = i + 1; j < part.length; j++) {
    const later = part[j]!;
    if (later.strike.tick <= strike.tick) continue;
    if (later.strike.tick > held || plan.bars[later.strike.bar]?.pass !== pass) break;
    const again = plucks[j];
    if (!again || !sameGrip(later.voicing, voicing)) return later.strike.tick - strike.tick;
    if (again.some((other) => other.string === string)) return later.strike.tick - strike.tick;
    held = Math.max(held, later.strike.tick + later.strike.duration);
  }
  return held - strike.tick;
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
      // A grip that stands on its root cannot give the root up.
      const givenUp = GIVEN_UP.filter((tone) => !(style.rootOnBottom && tone === "R"));
      const nut = style.openPosition;
      for (;;) {
        const most = Math.min(OPEN_STRINGS.length, Math.max(style.strings, wanted.length));
        // In open position the chord is whichever shape it has at the nut, on however many
        // strings that is (CH-24): every count is looked at, and a shape at the nut wins.
        const all: Voicing[] = [];
        for (let count = most; count >= wanted.length && count > 0; count--) {
          const found = grips(style, wanted, root, register.floor, count);
          if (nut === undefined && found.length > 0) return found.sort(tighter);
          all.push(...found);
        }
        if (nut !== undefined && all.length > 0) {
          const atNut = all.filter((grip) =>
            fretsOf(grip.strings ?? [], grip.pitches).every((fret) => fret <= nut),
          );
          return (atNut.length > 0 ? atNut : all).sort(tighter);
        }
        const spare = givenUp
          .map((tone) => wanted.findIndex((w) => w.tone === tone))
          .find((index) => index >= 0);
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
      const ticksPerMs = (plan.quarters * PPQ) / 60_000;
      const plucks = plucked(part);
      part.forEach(({ strike, voicing }, i) => {
        // A plucked stroke: each string sounds by itself, and rings on under the hand.
        const picked = plucks[i];
        if (picked) {
          for (const { string, pitch } of picked) {
            notes.push({
              seat: "chords",
              bar: strike.bar,
              tick: strike.tick,
              duration: Math.max(SHORTEST, rings(part, plucks, i, string, plan)),
              pitch,
              velocity: strike.velocity,
              voice: PICKED,
            });
          }
          return;
        }
        const next = part[i + 1]?.strike;
        const room = next && next.tick > strike.tick ? next.tick - strike.tick : Infinity;
        const duration = Math.max(SHORTEST, Math.min(strike.duration, room));
        // The pendulum: down on the beat side of each pair, up on the other (CH-27). A hand
        // swinging in eighths through a pulse of three goes down, down, up: the "and" is the
        // pulse's last eighth (DR-10, ST-acoustic-04), and the hand comes back up unheard
        // between the first two, so every pulse is a downstroke.
        const bar = plan.bars[strike.bar];
        const inBar = strike.tick - (bar?.start ?? 0);
        const dotted = grid === "eighth" && bar !== undefined && isCompound(bar.meter);
        const upstroke =
          !strike.down && (dotted ? onAnd(bar.meter, inBar) : inBar % pair >= pair / 2);
        const strings = voicing.strings ?? voicing.pitches.map((_, string) => string);
        // An upstroke catches only the top strings of the grip, and as many more under them
        // as it takes to sound every tone the chord is heard by (X-B-13), and to leave no
        // growl on the bottom of what it sounds: a grip with the 13th under the 7th is clean
        // from its root, and its top three strings are not (Q-03).
        let from = upstroke ? Math.max(0, voicing.pitches.length - up) : 0;
        if (from > 0) {
          const needed = heardBy(voicing, strike.arrival.chord);
          const family = strike.arrival.chord ? chordFamily(strike.arrival.chord.quality) : null;
          const caught = (pitch: number) =>
            voicing.pitches.slice(from).some((other) => mod12(other - pitch) === 0);
          const growl = () =>
            family !== null &&
            !growls(voicing, family) &&
            growls({ pitches: voicing.pitches.slice(from) }, family);
          while (from > 0 && (needed.some((pitch) => !caught(pitch)) || growl())) from--;
        }
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
