// The walk home: the bar before a one-chord ending played as a run into the
// final root, every time and at any level, for a style whose bassist does
// (`WalkPolicy.ending`, EN-45 to EN-48). The run is counted from where it lands:
// the 5th, 6th and 7th of the landing's own scale on beats 2, 3 and 4, into
// its root, in the lowest octave whose 5th is on the instrument. In a bar of
// three the run is its last two notes, the 6th and 7th on 2 and 3, after the
// line's own note on 1.

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

/** Whether a bar is a bar of four quarters. */
const inFour = (piece: Piece) => piece.bar.meter.beats === 4 && piece.bar.meter.unit === 4;
/** Whether a bar is a bar of three quarters: a waltz's. */
const inThree = (piece: Piece) => piece.bar.meter.beats === 3 && piece.bar.meter.unit === 4;
/** Whether two pieces' bars are both of four quarters, or both of three. */
const walkable = (a: Piece, b: Piece) => (inFour(a) && inFour(b)) || (inThree(a) && inThree(b));

/**
 * The pieces of the bar before the final chord the walk replaces the notes of,
 * or null where there is no walk home: the ending must be one chord struck on
 * its downbeat, both bars in 4/4 or both in 3/4, and the bar before one chord
 * the bass plays, or in four two with the second struck on beat 3.
 */
export function walkedBar(form: readonly Piece[], i: number): readonly number[] | null {
  const final = form[i]!;
  const bar = final.bar;
  if (final.ending !== "final" || final.start !== bar.start || !final.chord) return null;
  if (
    form.some((piece) => piece.bar === bar && piece.chord && !sameChord(piece.chord, final.chord))
  )
    return null;
  const before: number[] = [];
  for (let j = i - 1; j >= 0 && form[j]!.bar.index === bar.index - 1; j--) before.unshift(j);
  const pieces = before.map((j) => form[j]!);
  if (pieces.length === 0 || pieces.some((piece) => !piece.chord || !piece.scale)) return null;
  const first = pieces[0]!;
  if (!walkable(first, final) || first.start !== first.bar.start || first.lookahead) return null;
  if (pieces.length === 1) return before;
  if (inThree(first)) return null;
  if (pieces.length === 2 && pieces[1]!.start - first.bar.start === 2 * BEAT) return before;
  return null;
}

/** A note a half step over a tone of the chord it is played on, and not one itself, rubs. */
const rubs = (chord: Chord, pitch: number) =>
  isChordTone(chord, pitch - 1) && !isChordTone(chord, pitch);

/** The widest move inside a walk home: a fourth. */
const FOURTH = 5;
/**
 * A V on beat 3 drops a fifth onto the final root (EN-47), and a walk of one note on beat 4 is
 * stepped onto from the line's own note by a fifth at most, as the boom moves.
 */
const FIFTH = 7;

/** One way to walk home into one landing: the walk's notes, and its path through them into it. */
interface Way {
  readonly notes: LineNote[];
  /** The walk's pitches, then the landing. Its first is moved to from the note before the bar. */
  readonly path: readonly number[];
  /** Whether the path's first note is the walk's own, placed by it, not the line's. */
  readonly placed: boolean;
  /** The widest move along the path. */
  readonly widest: number;
  /** The widest move onto the walk from the line's own note, where the path starts on one. */
  readonly enter?: number;
  /** A run the walk plays itself, wanted before any way in from the line's own notes. */
  readonly run?: boolean;
}

/**
 * The notes of the bar before the ending, walked home, and where the final
 * root lands: the lowest octave in which the walk played sits on the
 * instrument and inside the bass's register, moving a fourth at most (EN-48).
 * Null where no walk fits. `notes` are the piece's notes as the line played
 * them and `root` where its root sits; `before` is the note before them.
 */
export function walkHome(
  home: Home,
  piece: Piece,
  notes: readonly LineNote[],
  root: number,
  final: Piece,
  /** The piece is the bar's second chord, struck on beat 3. */
  half: boolean,
  before: number | null,
  register: { readonly lowest: number; readonly highest: number },
  /** The note before is struck within a beat of the piece: it may be leading into it. */
  led: boolean,
): { notes: LineNote[]; landing: number } | null {
  const chord = piece.chord!;
  const scale = final.scale!;
  // A degree of the landing's own scale, counted from its root.
  const degree = (interval: number) => scaleHas(scale, interval);
  const start = piece.bar.start;
  const [one, two, three, four] = home.velocity;
  // In three the run is its last two notes on 2 and 3, played at the levels of 3 and 4, after
  // the line's own note on 1: the root, or a waltz's fifth on a chord carried into the bar.
  const waltz = inThree(piece);
  const lastBeat = waltz ? 2 : 3;
  const own = notes.find((line) => line.tick === start && !line.echo)?.pitch ?? root;
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
  const pc = bassPitchClass(final.chord!);
  const motion = mod12(bassPitchClass(chord) - pc);
  const low = Math.max(LOW_E, register.lowest);
  const inside = (pitch: number) => pitch >= low && pitch <= register.highest;
  // Every note of the walk belongs to the chord's scale, or passes: a step on from the note
  // before and a step on to the next, the same way, or the half step onto the landing (X-A-26).
  const fits = (pitch: number) => inHarmony(chord, piece.scale!, pitch);
  const passes = (path: readonly number[]) =>
    path.every((pitch, i) => {
      if (i === 0 || i === path.length - 1 || fits(pitch)) return true;
      const prior = path[i - 1]!;
      const next = path[i + 1]!;
      if (i === path.length - 2 && Math.abs(next - pitch) === 1) return true;
      return (
        Math.abs(pitch - prior) <= 2 &&
        Math.abs(next - pitch) <= 2 &&
        (pitch - prior) * (next - pitch) > 0
      );
    });
  const stepAway = (from: number, to: number) => {
    const byName = Math.min(mod12(from - to), mod12(to - from));
    return (byName === 1 || byName === 2) && Math.abs(from - to) > 2;
  };
  const ok = (way: Way) =>
    way.path.every(inside) &&
    way.path.every(
      (pitch, i) =>
        i === 0 ||
        Math.abs(pitch - way.path[i - 1]!) <= (i === 1 && way.enter ? way.enter : way.widest),
    ) &&
    // Into the bar no leap wider than an octave (BA-21), and a note within a beat before it, a
    // step from its first by name, is a step from it in pitch: it led there (BA-05).
    (!way.placed || before === null || Math.abs(way.path[0]! - before) <= OCTAVE) &&
    (!way.placed || before === null || !led || !stepAway(before, way.path[0]!)) &&
    passes(way.path);

  /** A pitch class's places in the register, low to high. */
  const octaves = (pitchClass: number) => {
    const places: number[] = [];
    for (let pitch = lowestRoot(pitchClass); pitch <= register.highest; pitch += 12)
      if (inside(pitch)) places.push(pitch);
    return places;
  };
  // The ways to walk into one landing, in the order they are wanted.
  const ways = (landing: number): Way[] => {
    // The run under the landing: its 5th, its 6th and its 7th. The 7th is the chord's own tone a
    // whole step under the landing where the chord being played has one (C7 gives Bb), and the
    // leading tone otherwise (EN-46). The 6th is the major one where the landing's scale has it
    // and wherever the 7th is the leading tone, as the melodic minor goes up; the flat one where
    // the 7th is the chord's own flat seventh (docs/decisions/styles.md).
    const fifth = landing - 5;
    const seventh = isChordTone(chord, landing - 2) ? landing - 2 : landing - 1;
    const sixth = degree(9) || seventh === landing - 1 ? landing - 3 : landing - 4;
    // A note on 4 never rubs a half step over the chord, and is in its scale, or the half step
    // onto the landing.
    const into = (pitch: number) =>
      !rubs(chord, pitch) && (fits(pitch) || Math.abs(pitch - landing) === 1);
    const found: Way[] = [];
    if (half) {
      // A chord struck on beat 3 keeps its root there and adds at most one note on 4: a V
      // drops a fifth onto the final root; any other goes in by the 7th from below, or the 2nd
      // from above, or by nothing (EN-47). The root is where the line has it, or in another
      // octave where only that lets the walk in.
      const roots = [root, ...octaves(bassPitchClass(chord)).filter((pitch) => pitch !== root)];
      for (const at of roots) {
        const placed = at !== root;
        if (motion !== 7) {
          for (const pitch of [seventh, landing + 2].filter(into))
            found.push({
              notes: [note(2, 1, at, three), note(3, 1, pitch, four, true)],
              path: [at, pitch, landing],
              placed,
              widest: FOURTH,
              enter: FIFTH,
            });
        }
        // With no note on 4 the root drops onto the final one: a V by a fifth, any other chord
        // by no more than an octave (BA-21), where no note on 4 goes in to the low root. Only a
        // drop is that wide: a root under the landing rises onto it by a fifth at most.
        found.push({
          notes: [note(2, 2, at, three)],
          path: [at, landing],
          placed,
          widest: motion !== 7 && at > landing ? OCTAVE : FIFTH,
        });
      }
      return found;
    }
    // From the IV the line walks down: its root held, then the landing's 3rd and 2nd (EN-47).
    if (motion === 5 && into(landing + 2)) {
      const third = landing + (degree(4) ? 4 : 3);
      found.push({
        notes: waltz
          ? [
              note(0, 1, landing + 5, one),
              note(1, 1, third, three),
              note(2, 1, landing + 2, four, true),
            ]
          : [
              note(0, 2, landing + 5, one),
              note(2, 1, third, three),
              note(3, 1, landing + 2, four, true),
            ],
        path: [landing + 5, third, landing + 2, landing],
        placed: true,
        run: true,
        widest: FOURTH,
      });
    }
    // Over the V the 5th is already sounding: it holds through beat 2 (EN-46).
    if (motion === 7 && into(seventh)) {
      found.push({
        notes: waltz
          ? [note(0, 1, fifth, one), note(1, 1, sixth, three), note(2, 1, seventh, four, true)]
          : [note(0, 2, fifth, one), note(2, 1, sixth, three), note(3, 1, seventh, four, true)],
        path: [fifth, sixth, seventh, landing],
        placed: true,
        run: true,
        widest: FOURTH,
      });
    }
    // The run from the bar's root, played in the walk's octave: the 5th, 6th and 7th on 2, 3
    // and 4; in three the 6th and 7th on 2 and 3, from the line's own note on 1, and only in the
    // octave whose 5th is on the instrument, as in four, though the 5th is not played (EN-48):
    // into G, D2, E2-F#2, G2, never a drop from D2 to E1. A root already inside the run (the
    // bVI, the vi, the bVII) does not climb.
    if (motion <= 7 && into(seventh) && (!waltz || inside(fifth))) {
      // The root on 1 where the line has it, or in the run's own octave: onto the run's first
      // note from it, up or down, by an octave at most (EN-48), the run itself by steps.
      const from = waltz ? own : root;
      const runFrom = waltz ? sixth : fifth;
      let near = from;
      for (let pitch = lowestRoot(mod12(from)); pitch <= register.highest; pitch += 12)
        if (inside(pitch) && Math.abs(pitch - runFrom) < Math.abs(near - runFrom)) near = pitch;
      for (const at of [near, from])
        found.push({
          notes: waltz
            ? [note(0, 1, at, one), note(1, 1, sixth, three), note(2, 1, seventh, four, true)]
            : [
                note(0, 1, at, one),
                note(1, 1, fifth, two),
                note(2, 1, sixth, three),
                note(3, 1, seventh, four, true),
              ],
          path: waltz ? [at, sixth, seventh, landing] : [at, fifth, sixth, seventh, landing],
          placed: at !== from,
          run: true,
          widest: FOURTH,
          // In four onto the run's 5th by an octave at most; in three onto its 6th by a fourth,
          // as every move of the walk.
          enter: waltz ? FOURTH : OCTAVE,
        });
    }
    // Otherwise the bar keeps the line and goes in on beat 4 alone: a root inside the run from
    // the run's note above it, any other from the 7th, else the leading tone; where these would
    // rub a half step over the chord, the landing's 2nd from above (EN-47; docs/decisions/styles.md).
    const above =
      motion > 7
        ? [sixth, seventh, landing - 1].filter((pitch) => mod12(pitch - landing) > motion)
        : [seventh, landing - 1];
    const onFour = start + lastBeat * BEAT;
    const kept = notes
      .filter((line) => line.tick < onFour)
      .map((line) => ({ ...line, space: Math.min(line.space, onFour - line.tick) }));
    const last = kept.findLast((line) => !line.echo)?.pitch ?? before ?? root;
    const choices = [...new Set([...above, landing + 2])].filter(into);
    for (const pitch of choices)
      found.push({
        notes: [...kept, note(lastBeat, 1, pitch, four, true)],
        path: [last, pitch, landing],
        placed: false,
        widest: FOURTH,
        enter: FIFTH,
      });
    // Where the boom's fifth lies too far from every one of them, the root is held from 1 and
    // the line steps in on 4, as it does across a third (BA-53). In three, where the line's note
    // on 1 lies too far, it is taken in another octave: there is no note on 3 to bridge it
    // (from the bVII in A minor, G1, B1, A1 where the line had G2).
    const holds = waltz ? [own, ...octaves(mod12(own)).filter((pitch) => pitch !== own)] : [root];
    for (const at of holds)
      for (const pitch of choices)
        found.push({
          notes: [note(0, lastBeat, at, one), note(lastBeat, 1, pitch, four, true)],
          path: [at, pitch, landing],
          placed: at !== holds[0],
          widest: FOURTH,
        });
    return found;
  };

  // A run the walk places itself is taken in the first way that fits, in the lowest octave it
  // fits: only the rising run into E to Ab needs the octave over the open string's. A walk that
  // goes in from the line's own note lands on the lowest root it can go in to, by whichever of
  // its notes fits there (EN-47, EN-48). The ways come in the same order in every octave.
  const landings: number[] = [];
  for (let pitch = lowestRoot(pc); pitch <= register.highest; pitch += 12)
    if (pitch >= low) landings.push(pitch);
  const byOctave = landings.map(ways);
  const count = Math.max(0, ...byOctave.map((list) => list.length));
  for (let k = 0; k < count; k++) {
    for (const [i, list] of byOctave.entries()) {
      const way = list[k];
      if (way && !half && way.run && ok(way)) return { notes: way.notes, landing: landings[i]! };
    }
  }
  for (const [i, list] of byOctave.entries()) {
    for (const way of list) {
      if ((half || !way.run) && ok(way)) return { notes: way.notes, landing: landings[i]! };
    }
  }
  return null;
}
