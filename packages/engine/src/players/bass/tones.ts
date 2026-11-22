// Fitting a line's tones to the chord that is sounding, and the instrument's
// range. "Third" is the chord's own third or its suspension; "fifth" is the
// chord's own fifth; under a slash chord the line stands on the slash note
// while its other tones are still measured from the real root (X-A-23, X-A-24).

import type { Chord } from "../../theory/chord.ts";
import { chordFamily, chordTones, toneInterval } from "../../theory/chord.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import type { ChordScale } from "../../theory/scale.ts";
import { scaleHas } from "../../theory/scale.ts";
import type { ChordCondition, LineShape, Tone, ToneSequence } from "./style.ts";

/** A value worked out once and kept: `known` answers for `key` from then on. */
export function remember<K, V>(
  known: { get(key: K): V | undefined; set(key: K, value: V): unknown },
  key: K,
  make: () => V,
): V {
  const had = known.get(key);
  if (had !== undefined) return had;
  const value = make();
  known.set(key, value);
  return value;
}

/** The open low E string: a note under it is a note the instrument does not have (X-A-01). */
export const LOW_E = 28;
/** The highest root of any line, E3 (X-A-02). */
export const HIGHEST_ROOT = 52;
/** The highest ornament above a root, A3 (X-A-02). */
export const TOP = 57;

/** The pitch class the bass stands on: the slash note, or the root. */
export function bassPitchClass(chord: Chord): number {
  return pitchClass(chord.bass ?? chord.root);
}

export function isSlash(chord: Chord): boolean {
  return chord.bass !== null && pitchClass(chord.bass) !== pitchClass(chord.root);
}

/**
 * A tone as semitones above the chord's root, or null when the chord cannot
 * give it. The third and fifth are read from the chord itself. The fourth,
 * sixth and flat seventh are played as written unless the chord's scale holds
 * a different note in that place: a minor sixth where the major sixth would
 * go (a dominant on its way to a minor chord), a major seventh where the flat
 * seventh would go (a plain major chord).
 */
export function toneOf(tone: Tone, chord: Chord, scale: ChordScale): number | null {
  const quality = chord.quality;
  const displaced = (interval: number, rival: number) =>
    scaleHas(scale, rival) && !scaleHas(scale, interval);
  switch (tone) {
    case "R":
      return 0;
    case "8":
      return 12;
    case "1":
      return 0;
    case "3": {
      // A chord with no third is played on what stands in its place: the suspension,
      // or the eleventh of an eleventh chord.
      const third =
        toneInterval(quality, "third") ??
        toneInterval(quality, "sus") ??
        toneInterval(quality, "eleventh");
      return third === null ? null : mod12(third);
    }
    case "5":
      return toneInterval(quality, "fifth") ?? 7;
    case "2":
      return displaced(2, 1) ? null : 2;
    // The chromatic tones are always there to pass through (see `playable`).
    case "b3":
      return 3;
    case "#4":
      return 6;
    case "b6":
      return 8;
    case "4":
      return displaced(5, 6) ? null : 5;
    case "6":
      return displaced(9, 8) ? null : 9;
    case "b7":
      return displaced(10, 11) ? null : 10;
    case "7": {
      // The chord's own seventh, or the sixth that stands in for it; on a chord with neither,
      // the major sixth where the scale has one (ST-neosoul-14).
      const seventh = toneInterval(quality, "seventh") ?? toneInterval(quality, "sixth");
      if (seventh !== null) return mod12(seventh);
      return scaleHas(scale, 9) ? 9 : null;
    }
  }
}

/** What is played in place of a tone the chord cannot give. */
const FALLBACK: Readonly<Record<Tone, Tone>> = {
  R: "R",
  "2": "R",
  b3: "3",
  "#4": "5",
  b6: "5",
  "8": "8",
  "5": "5",
  "3": "R",
  "4": "3",
  "6": "5",
  b7: "8",
  "7": "R",
  "1": "R",
};

/**
 * The pitch of a tone over a chord whose bass note sits at `bass`. Tones are
 * stacked above the bass note; one that would pass the ceiling is played an
 * octave lower (the fifth under a high root).
 */
export function tonePitch(
  tone: Tone,
  chord: Chord,
  scale: ChordScale,
  bass: number,
  ceiling: number,
): number {
  const pitch = bass + aboveBass(tone, chord, scale);
  return pitch > Math.min(ceiling, TOP) && pitch - 12 >= LOW_E ? pitch - 12 : pitch;
}

/** Semitones a tone sits above the chord's bass note, 0 to 12, after any fallback. */
export function aboveBass(tone: Tone, chord: Chord, scale: ChordScale): number {
  // Asked of the same chord again and again while the plans for a phrase are weighed.
  const byScale = remember(ABOVE, chord, () => new WeakMap<ChordScale, Map<Tone, number>>());
  const byTone = remember(byScale, scale, () => new Map<Tone, number>());
  return remember(byTone, tone, () => fittedAbove(tone, chord, scale));
}

const ABOVE = new WeakMap<Chord, WeakMap<ChordScale, Map<Tone, number>>>();

function fittedAbove(tone: Tone, chord: Chord, scale: ChordScale): number {
  let fitted = tone;
  let interval = toneOf(fitted, chord, scale);
  while (interval === null) {
    fitted = FALLBACK[fitted];
    interval = toneOf(fitted, chord, scale);
  }
  if (fitted === "R") return 0;
  if (fitted === "8") return 12;
  return mod12(pitchClass(chord.root) + interval - bassPitchClass(chord));
}

/** Whether a pitch is in the chord's scale or is one of its own notes: anything but a chromatic tone. */
export function inHarmony(chord: Chord, scale: ChordScale, pitch: number): boolean {
  return isChordTone(chord, pitch) || scaleHas(scale, pitch - pitchClass(chord.root));
}

/**
 * Whether a shape can be played over a chord: every chromatic tone in it is a
 * passing tone, a half or whole step on from the note before and a step on to
 * the note after, in the same direction. The bars repeat, so the last note of
 * the last bar passes on to the first of the first.
 */
export function playable(shape: LineShape, chord: Chord, scale: ChordScale): boolean {
  // Asked for every bar of every plan weighed: answered once per shape, chord and scale.
  const key = `${pitchClass(chord.root)}/${bassPitchClass(chord)}/${chord.quality.base}/${chord.quality.alterations.join()}/${scale.intervals.join()}`;
  const known = remember(PLAYABLE, shape, () => new Map<string, boolean>());
  return remember(known, key, () => fits(shape, chord, scale));
}

const PLAYABLE = new WeakMap<LineShape, Map<string, boolean>>();

function fits(shape: LineShape, chord: Chord, scale: ChordScale): boolean {
  const steps = shape.bars.flat().map((tone) => aboveBass(tone, chord, scale));
  const bass = bassPitchClass(chord);
  return steps.every((step, i) => {
    if (inHarmony(chord, scale, bass + step)) return true;
    const before = steps[(i - 1 + steps.length) % steps.length]!;
    const after = steps[(i + 1) % steps.length]!;
    const into = step - before;
    const on = after - step;
    return (
      into !== 0 && Math.abs(into) <= 2 && Math.abs(on) <= 2 && Math.sign(into) === Math.sign(on)
    );
  });
}

/** A sequence's shapes, its own first. */
export function shapesIn(sequence: ToneSequence): readonly LineShape[] {
  return [sequence, ...(sequence.others ?? [])];
}

/** Whether a pitch is one of the chord's own notes (its slash bass included). */
export function isChordTone(chord: Chord, pitch: number): boolean {
  // Asked of every note a walk weighs: a chord's twelve answers are worked out once.
  return remember(CHORD_TONES, chord, () => {
    const own = new Array<boolean>(12).fill(false);
    own[bassPitchClass(chord)] = true;
    const root = pitchClass(chord.root);
    for (const tone of chordTones(chord.quality)) own[mod12(root + tone.interval)] = true;
    return own;
  })[mod12(pitch)]!;
}

const CHORD_TONES = new WeakMap<Chord, boolean[]>();

export function meets(when: ChordCondition | undefined, chord: Chord, scale: ChordScale): boolean {
  if (!when) return true;
  if (when.family && !when.family.includes(chordFamily(chord.quality))) return false;
  if (when.slash !== undefined && when.slash !== isSlash(chord)) return false;
  if (when.has?.some((tone) => toneOf(tone, chord, scale) === null)) return false;
  if (when.lacks?.some((tone) => toneOf(tone, chord, scale) !== null)) return false;
  return true;
}

/** The first sequence whose condition the chord meets. With none, the bass stays on the root. */
export function sequenceFor(
  sequences: readonly ToneSequence[],
  chord: Chord,
  scale: ChordScale,
): ToneSequence {
  // Asked for every bar of every plan weighed: answered once for each line, chord and scale.
  const byChord = remember(
    SEQUENCES,
    sequences,
    () => new WeakMap<Chord, WeakMap<ChordScale, ToneSequence>>(),
  );
  const byScale = remember(byChord, chord, () => new WeakMap<ChordScale, ToneSequence>());
  return remember(
    byScale,
    scale,
    () => sequences.find((sequence) => meets(sequence.when, chord, scale)) ?? { bars: [["R"]] },
  );
}

const SEQUENCES = new WeakMap<
  readonly ToneSequence[],
  WeakMap<Chord, WeakMap<ChordScale, ToneSequence>>
>();
