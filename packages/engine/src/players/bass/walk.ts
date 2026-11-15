// A walk into a change: the last bar before it played as four steps to the
// next root, the thing a bassist does at the end of a line. The next root's
// pitch is placed before the walk is fitted to it, so the walk arrives where
// the bar after will play (BA-05), and the walk's last note answers to every
// rule a lead-in does.

import type { Rng } from "../../rng.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import { scaleHas } from "../../theory/scale.ts";
import type { Piece } from "./form.ts";
import type { Landing } from "./leadin.ts";
import { knownAbove, OCTAVE, rootMotion } from "./leadin.ts";
import type { LineNote } from "./line.ts";
import { HELD } from "./line.ts";
import type { Walk, WalkPolicy } from "./style.ts";
import { bassPitchClass, inHarmony, isChordTone, LOW_E, meets, TOP, toneOf } from "./tones.ts";

/** The first move of a walk may be a third (R up to the 3rd); every move after it is a step. */
const FIRST_MOVE = 4;
const STEP = 2;

export interface WalkRequest {
  /** The bar being left: a whole bar on one chord. */
  readonly piece: Piece;
  /** Its notes as the line wrote them. */
  readonly notes: readonly LineNote[];
  /** Where the bass note of the chord being left sits. */
  readonly root: number;
  /** The last pitch played before this bar, if the line was not resting. */
  readonly before: number | null;
  /** That note is a chromatic one, passing on to what was to follow it. */
  readonly passing: boolean;
  readonly landing: Landing;
  /** The highest note of the line. */
  readonly ceiling: number;
}

/**
 * The bar walked into the landing, and the walk, or null when no walk the style knows for
 * this move fits: the bar must be a whole bar on one chord, struck in as many
 * tones as the walk has notes, and the walk must reach a step from the landing
 * in the octave it is played, moving one way all the bar.
 */
export function walkInto(
  request: WalkRequest,
  policy: WalkPolicy | undefined,
  rng: Rng,
): { notes: LineNote[]; walk: Walk } | null {
  const { piece, notes, landing } = request;
  const { chord, scale, bar } = piece;
  if (!policy || chord === null || scale === null) return null;
  if (piece.start !== bar.start || piece.end !== bar.start + bar.ticks) return null;
  if (landing.tick !== piece.end) return null;
  const motion = rootMotion(bassPitchClass(chord), mod12(landing.pitch));
  const tones = notes.filter((note) => !note.echo);
  const fitted = (policy.kinds[motion] ?? [])
    .filter((walk) => walk.weight > 0 && walk.tones.length + 1 === tones.length)
    .filter((walk) => meets(walk.when, chord, scale))
    .map((walk) => ({ walk, pitches: pitchesOf(walk, request) }))
    .filter(
      (option): option is { walk: Walk; pitches: number[] } =>
        option.pitches !== null && heldTonesFit(option.pitches, tones, request),
    );
  if (fitted.length === 0) return null;
  const { walk, pitches } = rng.weighted(fitted, (option) => option.walk.weight);

  // The bar keeps its rhythm; a lope's re-strike repeats the note it follows (BA-31).
  let n = -1;
  const walked = notes.map((note): LineNote => {
    if (!note.echo) n++;
    const last = n === pitches.length - 1;
    return { ...note, pitch: pitches[n]!, level: last && !note.echo ? "approach" : note.level };
  });
  return { notes: walked, walk };
}

/** The walk's pitches from the root, or null where it does not reach the landing by step. */
function pitchesOf(walk: Walk, request: WalkRequest): number[] | null {
  const { piece, root, landing, before } = request;
  const chord = piece.chord!;
  const scale = piece.scale!;
  const target = landing.pitch;
  const up = walk.toward === "up";
  if (walk.tones[0] !== "R") return null;
  const pitches = [root];
  for (const tone of walk.tones.slice(1)) {
    const interval = toneOf(tone, chord, scale);
    if (interval === null) return null;
    const pc = mod12(pitchClass(chord.root) + interval);
    const from = pitches[pitches.length - 1]!;
    const move = up ? mod12(pc - from) : -mod12(from - pc);
    if (move === 0) return null;
    pitches.push(from + move);
  }
  // The last note: beside the landing on the side the walk comes from.
  const apart = walk.last === "half" ? 1 : 2;
  pitches.push(up ? target - apart : target + apart);

  const path = [...pitches, target];
  const moves = path.slice(1).map((pitch, i) => pitch - path[i]!);
  if (!moves.every((move) => (up ? move > 0 : move < 0))) return null;
  if (!moves.every((move, i) => Math.abs(move) <= (i === 0 ? FIRST_MOVE : STEP))) return null;
  // The landing's own note is never heard early (BA-34).
  if (pitches.some((pitch) => mod12(pitch) === mod12(target))) return null;
  const top = Math.min(request.ceiling, TOP);
  if (pitches.some((pitch) => pitch < LOW_E || pitch > top)) return null;
  // Into the bar no leap wider than an octave (BA-21), and a chromatic note before it still
  // passes on by step (X-A-26).
  if (before !== null && Math.abs(root - before) > OCTAVE) return null;
  if (before !== null && request.passing && Math.abs(root - before) > STEP) return null;
  // A chromatic note is a passing tone: reached by a step, as it is left by one.
  const reached = pitches.every(
    (pitch, i) => i === 0 || inHarmony(chord, scale, pitch) || Math.abs(moves[i - 1]!) <= STEP,
  );
  if (!reached) return null;
  // The last note leads in as a lead-in does: from the chord's scale, or the half step onto
  // the landing (X-A-26); from above at the bottom of the instrument only if the harmony
  // knows it (BA-09).
  const last = pitches[pitches.length - 1]!;
  const rootPc = pitchClass(chord.root);
  if (apart === 2 && !scaleHas(scale, last - rootPc)) return null;
  if (apart === 1 && !up && target === LOW_E && !knownAbove(chord, landing)) return null;
  return pitches;
}

/** A note held a half note or more is a chord tone (BA-15). */
function heldTonesFit(
  pitches: readonly number[],
  tones: readonly LineNote[],
  request: WalkRequest,
): boolean {
  const chord = request.piece.chord!;
  return tones.every((note, i) => note.space < HELD || isChordTone(chord, pitches[i]!));
}
