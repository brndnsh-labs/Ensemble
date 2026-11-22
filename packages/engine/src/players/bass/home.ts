// The walk home: the bar before a one-chord ending played as a run into the
// final root, every time and at any level, for a style whose bassist does
// (`WalkPolicy.ending`, EN-45 to EN-48). The run is counted from where it lands:
// the 5th, 6th and 7th of the landing's own scale on beats 2, 3 and 4, into
// its root, in the lowest octave whose 5th is on the instrument.

import { PPQ } from "../../chart/types.ts";
import { sameChord } from "../../perform/harmony.ts";
import type { Chord } from "../../theory/chord.ts";
import { mod12 } from "../../theory/pitch.ts";
import { scaleHas } from "../../theory/scale.ts";
import type { Piece } from "./form.ts";
import type { LineNote } from "./line.ts";
import { lowestRoot } from "./register.ts";
import type { WalkPolicy } from "./style.ts";
import { bassPitchClass, isChordTone, LOW_E } from "./tones.ts";

type Home = NonNullable<WalkPolicy["ending"]>;

const BEAT = PPQ;

/**
 * Where the final root is struck when the bass walks home: the lowest one on
 * the instrument, or the octave over it where the run's first note, a fourth
 * under it, would be lower than the instrument goes (landings on E to Ab, EN-48).
 */
export function homeRoot(pitchClass: number): number {
  const low = lowestRoot(pitchClass);
  return low - 5 >= LOW_E ? low : low + 12;
}

/** Whether a bar is a bar of four quarters. */
const inFour = (piece: Piece) => piece.bar.meter.beats === 4 && piece.bar.meter.unit === 4;

/**
 * The pieces of the bar before the final chord the walk replaces the notes of,
 * or null where there is no walk home: the ending must be one chord struck on
 * its downbeat, both bars in 4/4, and the bar before one chord the bass plays,
 * or two with the second struck on beat 3.
 */
export function walkedBar(form: readonly Piece[], i: number): readonly number[] | null {
  const final = form[i]!;
  const bar = final.bar;
  if (final.ending !== "final" || final.start !== bar.start || !final.chord || !inFour(final))
    return null;
  if (
    form.some((piece) => piece.bar === bar && piece.chord && !sameChord(piece.chord, final.chord))
  )
    return null;
  const before: number[] = [];
  for (let j = i - 1; j >= 0 && form[j]!.bar.index === bar.index - 1; j--) before.unshift(j);
  const pieces = before.map((j) => form[j]!);
  if (pieces.length === 0 || pieces.some((piece) => !piece.chord || !piece.scale)) return null;
  const first = pieces[0]!;
  if (!inFour(first) || first.start !== first.bar.start || first.lookahead) return null;
  if (pieces.length === 1) return before;
  if (pieces.length === 2 && pieces[1]!.start - first.bar.start === 2 * BEAT) return before;
  return null;
}

/** A note a half step over a tone of the chord it is played on, and not one itself, rubs. */
const rubs = (chord: Chord, pitch: number) =>
  isChordTone(chord, pitch - 1) && !isChordTone(chord, pitch);

/**
 * The notes of the bar before the ending, walked home to `landing`: the last
 * piece's notes, or null where nothing in the walk fits. `notes` are that
 * piece's notes as the line played them and `root` where its root sits.
 */
export function walkHome(
  home: Home,
  piece: Piece,
  notes: readonly LineNote[],
  root: number,
  final: Piece,
  landing: number,
  /** The piece is the bar's second chord, struck on beat 3. */
  half: boolean,
): LineNote[] | null {
  const chord = piece.chord!;
  const scale = final.scale!;
  // A degree of the landing's own scale, counted from its root.
  const degree = (interval: number) => scaleHas(scale, interval);
  const start = piece.bar.start;
  const [one, two, three, four] = home.velocity;
  const note = (
    beat: number,
    beats: number,
    pitch: number,
    velocity: number,
    last = false,
  ): LineNote => ({
    tick: start + beat * BEAT,
    space: beats * BEAT,
    pitch,
    echo: false,
    level: last ? "approach" : beat === 0 ? "arrival" : "strong",
    exact: { duration: Math.round(beats * BEAT * home.length), velocity },
  });
  // The run, as pitches under the landing: its 5th, its 6th (the b6 where its scale has it),
  // and its 7th, which is the chord's own tone a whole step under the landing where the chord
  // being played has one (C7 gives Bb), and the leading tone otherwise (EN-46).
  const fifth = landing - 5;
  const seventhOver = (over: Chord) => (isChordTone(over, landing - 2) ? landing - 2 : landing - 1);
  // Up through the leading tone the 6th is the major one, as the melodic minor climbs: the b6
  // would leave a step and a half before it (docs/decisions/styles.md).
  const sixthUnder = (seventh: number) =>
    degree(9) || seventh === landing - 1 ? landing - 3 : landing - 4;
  const sixth = sixthUnder(seventhOver(chord));
  const motion = mod12(bassPitchClass(chord) - mod12(landing));
  // The note on 4 that goes in from beside the landing, the first of these that does not rub
  // over the chord being played: where none fits, the walk is not played.
  const intoFour = (choices: readonly number[]) => choices.find((pitch) => !rubs(chord, pitch));

  if (half) {
    // A chord struck on beat 3 keeps its root there and adds at most one note on 4: a V
    // drops onto the low root from where it is; any other goes in by the 7th from below, or
    // the 2nd from above (EN-47).
    if (motion === 7) return [note(2, 2, root, three)];
    const into = intoFour([seventhOver(chord), landing + 2]);
    if (into === undefined) return null;
    return [note(2, 1, root, three), note(3, 1, into, four, true)];
  }
  // From the IV the line walks down: its root held, then the landing's 3rd and 2nd (EN-47).
  if (motion === 5) {
    const third = landing + (degree(4) ? 4 : 3);
    const into = intoFour([landing + 2]);
    if (into === undefined) return null;
    return [note(0, 2, landing + 5, one), note(2, 1, third, three), note(3, 1, into, four, true)];
  }
  // Over the V the 5th is already sounding: it holds through beat 2 (EN-46).
  if (motion === 7) {
    const into = intoFour([seventhOver(chord)]);
    if (into === undefined) return null;
    return [note(0, 2, fifth, one), note(2, 1, sixth, three), note(3, 1, into, four, true)];
  }
  // A root already inside the run (the bVI, the vi, the bVII) keeps the boom and goes in on
  // beat 4 alone: from the run's note above it, else the leading tone, and where either would
  // rub a half step over the chord, the landing's 2nd from above (EN-47; docs/decisions/styles.md).
  if (motion > 7) {
    const above = [sixth, seventhOver(chord), landing - 1].filter(
      (pitch) => mod12(pitch - landing) > motion,
    );
    const into = intoFour([...above, landing + 2]);
    if (into === undefined) return null;
    const onFour = start + 3 * BEAT;
    const kept = notes
      .filter((line) => line.tick < onFour)
      .map((line) => ({ ...line, space: Math.min(line.space, onFour - line.tick) }));
    return [...kept, note(3, 1, into, four, true)];
  }
  const into = intoFour([seventhOver(chord)]);
  if (into === undefined) return null;
  return [
    note(0, 1, root, one),
    note(1, 1, fifth, two),
    note(2, 1, sixth, three),
    note(3, 1, into, four, true),
  ];
}
