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
import { OCTAVE } from "./leadin.ts";
import type { LineNote } from "./line.ts";
import { lowestRoot } from "./register.ts";
import type { WalkPolicy } from "./style.ts";
import { bassPitchClass, inHarmony, isChordTone, LOW_E } from "./tones.ts";

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
  /** The last pitch played before the piece, if the line was not resting. */
  before: number | null,
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
  // Every note of the walk belongs to the chord's scale, or passes: a step on from the note
  // before and a step on to the next, the same way, or the half step onto the landing (X-A-26).
  // No move is wider than an octave, into the bar either (BA-21).
  const fits = (pitch: number) => inHarmony(chord, piece.scale!, pitch);
  const runs = (from: number | null, path: readonly number[]) =>
    path.every((pitch, i) => {
      const prior = i === 0 ? from : path[i - 1]!;
      if (prior !== null && Math.abs(pitch - prior) > OCTAVE) return false;
      if (i === 0 || i === path.length - 1 || fits(pitch)) return true;
      const next = path[i + 1]!;
      if (i === path.length - 2 && Math.abs(next - pitch) === 1) return true;
      return (
        Math.abs(pitch - prior!) <= 2 &&
        Math.abs(next - pitch) <= 2 &&
        (pitch - prior!) * (next - pitch) > 0
      );
    });
  // The note on 4 that goes in from beside the landing: the first of these that does not rub
  // over the chord being played and is in its scale, or is the half step onto the landing.
  const intoFour = (choices: readonly number[]) =>
    choices.find(
      (pitch) => !rubs(chord, pitch) && (fits(pitch) || Math.abs(pitch - landing) === 1),
    );
  const seventh = seventhOver(chord);

  if (half) {
    // A chord struck on beat 3 keeps its root there and adds at most one note on 4: a V
    // drops onto the low root from where it is; any other goes in by the 7th from below, or
    // the 2nd from above (EN-47).
    if (motion === 7) return runs(before, [root, landing]) ? [note(2, 2, root, three)] : null;
    const into = intoFour([seventh, landing + 2]);
    if (into === undefined || !runs(before, [root, into, landing])) return null;
    return [note(2, 1, root, three), note(3, 1, into, four, true)];
  }
  // From the IV the line walks down: its root held, then the landing's 3rd and 2nd (EN-47).
  if (motion === 5) {
    const down = [landing + 5, landing + (degree(4) ? 4 : 3), landing + 2];
    if (intoFour([down[2]!]) !== undefined && runs(before, [...down, landing]))
      return [
        note(0, 2, down[0]!, one),
        note(2, 1, down[1]!, three),
        note(3, 1, down[2]!, four, true),
      ];
  }
  // Over the V the 5th is already sounding: it holds through beat 2 (EN-46).
  if (motion === 7) {
    const held = [fifth, sixth, seventh];
    if (intoFour([seventh]) !== undefined && runs(before, [...held, landing]))
      return [note(0, 2, fifth, one), note(2, 1, sixth, three), note(3, 1, seventh, four, true)];
  }
  // The run from the bar's root where the line has it: the 5th, 6th and 7th on 2, 3 and 4.
  // A root already inside the run (the bVI, the vi, the bVII) does not climb.
  if (motion <= 7) {
    const climb = [root, fifth, sixth, seventh];
    if (intoFour([seventh]) !== undefined && runs(before, [...climb, landing]))
      return [
        note(0, 1, root, one),
        note(1, 1, fifth, two),
        note(2, 1, sixth, three),
        note(3, 1, seventh, four, true),
      ];
  }
  // Otherwise the bar keeps the line and goes in on beat 4 alone: a root inside the run from the
  // run's note above it, any other from the 7th, else the leading tone; where these would rub a
  // half step over the chord, the landing's 2nd from above (EN-47; docs/decisions/styles.md).
  const above =
    motion > 7
      ? [sixth, seventh, landing - 1].filter((pitch) => mod12(pitch - landing) > motion)
      : [seventh, landing - 1];
  const into = intoFour([...above, landing + 2]);
  if (into === undefined) return null;
  const onFour = start + 3 * BEAT;
  const kept = notes
    .filter((line) => line.tick < onFour)
    .map((line) => ({ ...line, space: Math.min(line.space, onFour - line.tick) }));
  const last = kept.findLast((line) => !line.echo)?.pitch ?? before;
  if (!runs(last, [into, landing])) return null;
  return [...kept, note(3, 1, into, four, true)];
}
