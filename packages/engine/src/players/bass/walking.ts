// A walked line: the pitches of a stretch of one chord, made a note at a time
// in the order a bassist thinks them (BA-18). The arrival is the chord's bass
// note. The last note before the next chord is an approach to it, chosen
// first. The notes between move toward that approach, each a tone of the
// chord or of its scale, a fourth at most from the note before.
//
// Every note is one weighted draw from its own place in the music, so a walk
// is cheap to draw again: the bassist draws one for each plan he weighs for a
// phrase, and the critic picks the line (`phrase.ts`, `critique.ts`).

import { sameChord } from "../../perform/harmony.ts";
import type { Rng } from "../../rng.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import { scaleHas } from "../../theory/scale.ts";
import type { Piece } from "./form.ts";
import type { Landing } from "./leadin.ts";
import { knownAbove, OCTAVE, rootMotion } from "./leadin.ts";
import type { LineNote } from "./line.ts";
import { HELD } from "./line.ts";
import { lowestRoot } from "./register.ts";
import type { LeadInKind, LeadInPolicy, RegisterPolicy, WalkedLine } from "./style.ts";
import { LEAD_IN_KINDS } from "./style.ts";
import { bassPitchClass, HIGHEST_ROOT, isChordTone, LOW_E, TOP } from "./tones.ts";

export interface WalkedRequest {
  /** The stretch being walked: one chord, in one bar. */
  readonly piece: Piece;
  /** Its notes as the figure wrote them. The walk gives them their pitches. */
  readonly notes: readonly LineNote[];
  /** Where the chord's bass note sits. */
  readonly root: number;
  /** Whether the stretch opens on that bass note. Where the chord only carries on from the bar before, the line carries on too. */
  readonly arrives: boolean;
  /** The last pitch played before this stretch. Null after a rest. */
  readonly before: number | null;
  /** The next chord's bass note as it will be played. Null where the same chord carries on and there is nothing to arrive at. */
  readonly landing: Landing | null;
  readonly line: WalkedLine;
  /** How the approach is chosen, by the way the bass note moves. */
  readonly kinds: LeadInPolicy["kinds"];
  /** The highest note of the line. */
  readonly ceiling: number;
  /** The register's home and its pull: a bar with nowhere to go heads for home more often than away. */
  readonly home: number;
  readonly pull: number;
  /** This stretch's own generator. */
  readonly rng: Rng;
}

/** How far a bar with nowhere to go sets out: a fifth, up or down. */
const HEADING = 7;

/**
 * The pitch of each tone of the stretch, in order. A stretch with nowhere to
 * go (the same chord carries on) picks a heading and walks that way.
 */
export function walkedPitches(request: WalkedRequest): number[] {
  const { piece, landing, line, rng } = request;
  const chord = piece.chord!;
  const scale = piece.scale!;
  const strokes = request.notes.filter((note) => !note.echo);
  const count = strokes.length;
  if (count === 0) return [];
  const top = Math.min(request.ceiling, TOP);
  // What each of the twelve notes is over this chord: asked of every note the walk weighs.
  const rootPc = pitchClass(chord.root);
  const tones: boolean[] = [];
  const steps: boolean[] = [];
  for (let pc = 0; pc < 12; pc++) {
    tones.push(isChordTone(chord, pc));
    steps.push(scaleHas(scale, pc - rootPc));
  }
  const inChord = (pitch: number) => tones[pitch % 12]!;
  const inScale = (pitch: number) => steps[pitch % 12]!;
  const strong = (k: number) => strokes[k]!.level === "arrival" || strokes[k]!.level === "strong";
  // A note held a half note or more is a chord tone, and is never an approach (BA-15, BA-18).
  const held = (k: number) => strokes[k]!.space >= HELD;

  const pitches: number[] = [];
  // The note before the one the line stands on: a walk knows which way it was going.
  let prior: number | null = null;
  let from = request.before ?? request.root;
  if (request.arrives) {
    pitches.push(request.root);
    // The line came into the root from somewhere, and may carry on through it.
    prior = request.before;
    from = request.root;
  }
  const start = pitches.length;

  // The approach, chosen before the notes that lead to it (BA-18).
  let goal: number | null = null;
  if (landing && count > start && !held(count - 1)) {
    goal = approachTo(request, from, count - start, top, inScale);
  }
  const last = goal === null ? count : count - 1;

  // Where the line is heading: the approach; or, with no approach to be had, the landing
  // itself; or, with nowhere to go, a fifth up or down, more often toward the middle of
  // the instrument than away from it.
  let aim = goal ?? landing?.pitch ?? null;
  if (aim === null) {
    const up = Math.min(0.9, Math.max(0.1, 0.5 - (request.pull * (from - request.home)) / 12));
    aim = rng.fork("heading").chance(up) ? from + HEADING : from - HEADING;
    aim = Math.min(top, Math.max(LOW_E, aim));
  }
  const heading = aim;

  // The pitch class the line is about to arrive on, where that is a change of bass note.
  const arrival =
    landing && mod12(landing.pitch) !== bassPitchClass(chord) ? mod12(landing.pitch) : null;
  const playable = (k: number, pitch: number) =>
    pitch >= LOW_E && pitch <= top && (inChord(pitch) || (!held(k) && inScale(pitch)));
  // The note before the approach sits within a major third of it, is not it, and is not
  // the note the approach leads to, which would be heard early (BA-20, BA-34).
  const intoGoal = (k: number, pitch: number) =>
    goal !== null &&
    playable(k, pitch) &&
    pitch !== goal &&
    Math.abs(goal - pitch) <= line.intoApproach &&
    mod12(pitch) !== mod12(landing!.pitch);

  for (let k = start; k < last; k++) {
    // Moves left after this note to reach the approach.
    const left = goal === null ? 0 : count - 1 - k;
    const here = from;
    const reaches = (pitch: number): boolean => {
      if (goal === null) {
        // With no approach, the last note still lands within an octave (BA-21).
        return k < count - 1 || !landing || Math.abs(landing.pitch - pitch) <= OCTAVE;
      }
      if (left === 1) return intoGoal(k, pitch);
      if (Math.abs(goal - pitch) > line.reach * (left - 1) + line.intoApproach) return false;
      if (left > 2) return true;
      // Two moves out: there must be a note to play between this one and the approach.
      for (let next = goal - line.intoApproach; next <= goal + line.intoApproach; next++) {
        if (next !== pitch && Math.abs(next - pitch) <= line.reach && intoGoal(k + 1, next))
          return true;
      }
      return false;
    };
    const options: { pitch: number; weight: number }[] = [];
    const offer = (reach: number) => {
      for (let pitch = here - reach; pitch <= here + reach; pitch++) {
        if (pitch === here || !playable(k, pitch) || !reaches(pitch)) continue;
        const worth = (inChord(pitch) ? line.weights.chord : line.weights.scale)[
          strong(k) ? "strong" : "weak"
        ];
        const nearer = Math.abs(heading - pitch) - Math.abs(heading - here);
        const way = nearer < 0 ? line.toward : nearer > 0 ? line.away : 1;
        const carries =
          prior === null
            ? 1
            : pitch === prior
              ? line.back
              : Math.sign(pitch - here) === Math.sign(here - prior)
                ? line.onward
                : 1;
        const given = arrival !== null && pitch % 12 === arrival ? line.early : 1;
        const weight = (worth * way * carries * given) / Math.abs(pitch - here);
        if (weight > 0) options.push({ pitch, weight });
      }
    };
    offer(line.reach);
    // Nothing within reach gets there (the next root is far below a line that has climbed):
    // one wider move, an octave at most, and the walk carries on from it.
    if (options.length === 0) offer(OCTAVE);
    let pitch: number;
    if (options.length > 0) {
      pitch = rng.fork("note", k).weighted(options, (option) => option.weight).pitch;
    } else {
      // No note keeps every rule. Keep the ones a listener would miss first: a tone of
      // the harmony, within an octave, as near where the line is going as there is.
      const target = goal ?? heading;
      pitch = here;
      for (let other = here - OCTAVE; other <= here + OCTAVE; other++) {
        if (other === here || !playable(k, other)) continue;
        if (pitch === here || Math.abs(other - target) < Math.abs(pitch - target)) pitch = other;
      }
    }
    pitches.push(pitch);
    prior = from;
    from = pitch;
  }
  if (goal !== null) pitches.push(goal);
  return pitches;
}

/**
 * The approach into the landing: a kind drawn by the style's weights for the
 * way the bass note moves, among the kinds the line can reach in the moves it
 * has. Null when there is no note to approach from.
 */
function approachTo(
  request: WalkedRequest,
  from: number,
  moves: number,
  top: number,
  inScale: (pitch: number) => boolean,
): number | null {
  const { piece, line, rng } = request;
  const landing = request.landing!;
  const chord = piece.chord!;
  const target = landing.pitch;
  // The half step onto a change of chord is always there to play; onto the same chord
  // again it would be a note outside the scale that leads nowhere new (X-A-26).
  const changes = !sameChord(chord, landing.chord);
  const eligible = (pitch: number) =>
    pitch >= LOW_E &&
    pitch <= top &&
    pitch !== target &&
    // Two notes to a chord: the second is not the first again in another octave.
    !(moves === 1 && mod12(pitch) === mod12(from)) &&
    (inScale(pitch) || (changes && Math.abs(pitch - target) === 1));
  // With one move the root leaps straight to the approach, an octave at most (BA-21);
  // with more, the walk gets there by its own reach. Failing that, one move may be wide.
  const within = (pitch: number, first: number) =>
    (moves > 1 || pitch !== from) &&
    Math.abs(pitch - from) <=
      (moves === 1 ? first : first + line.reach * (moves - 2) + line.intoApproach);
  const nearLine = (a: number, b: number) => Math.abs(a - from) - Math.abs(b - from);
  // At the bottom of the instrument a lead-in comes down onto the string from above, and
  // the half step above must be a note the harmony knows (BA-08, BA-09).
  const floor = target <= LOW_E;
  const above = floor && !knownAbove(chord, landing) ? [] : [target + 1];
  const steps = (
    floor ? [target + 2, target + 1] : [target - 2, target + 2, target - 1, target + 1]
  )
    .filter(inScale)
    .sort(nearLine);
  const kinds: Readonly<Record<LeadInKind, readonly number[]>> = {
    below: floor ? above : [target - 1],
    above,
    scale: steps,
    // A fifth above the target or a fourth below it, whichever is nearer the line (BA-03).
    fifth: [target + 7, target - 5].sort(nearLine),
  };
  const weights = request.kinds[rootMotion(bassPitchClass(chord), mod12(target))];
  for (const first of [moves === 1 ? OCTAVE : line.reach, OCTAVE]) {
    const options = LEAD_IN_KINDS.map((kind) => {
      const pitch = kinds[kind].find((option) => eligible(option) && within(option, first));
      // Straight from the root to the approach (two beats to a chord), an approach on the
      // far side of the target is a move away from where the line is going.
      const past =
        pitch !== undefined && moves === 1 && Math.abs(pitch - from) > Math.abs(target - from);
      return { weight: weights[kind] * (past ? line.away : 1), pitch };
    }).filter(
      (option): option is { weight: number; pitch: number } =>
        option.weight > 0 && option.pitch !== undefined,
    );
    if (options.length > 0) {
      return rng.fork("approach").weighted(options, (option) => option.weight).pitch;
    }
    // No kind the style weights is in reach: any step onto the landing that is.
    const any = [...steps, ...kinds.below, ...kinds.above, ...kinds.fifth]
      .filter((pitch) => eligible(pitch) && within(pitch, first))
      .sort(nearLine)[0];
    if (any !== undefined) return any;
  }
  return null;
}

/**
 * Where a walked line puts the next root (BA-02, ST-jazz-18): nearest the
 * line, pulled toward home, as the register says, or, when the plan draws it
 * and the walk has the notes to get there, the other octave. `moves` is the
 * number of notes from where the line stands to the root, the root included.
 */
export function walkedRoot(
  pitchClassOf: number,
  register: RegisterPolicy,
  anchor: number,
  from: number,
  moves: number,
  line: WalkedLine,
  rng: Rng,
): number {
  const aim = from + register.pull * (anchor - from);
  const places: number[] = [];
  const highest = Math.min(register.highest, HIGHEST_ROOT);
  for (let pitch = lowestRoot(pitchClassOf); pitch <= highest; pitch += 12) {
    if (pitch >= register.lowest) places.push(pitch);
  }
  if (places.length === 0) return lowestRoot(pitchClassOf);
  // Straight from one root to the next with no note between, a root a step off by name
  // is a step off in pitch, wherever the register would rather have it (BA-07).
  if (moves <= 1) {
    const up = mod12(pitchClassOf - from);
    const beside = up <= 2 ? from + up : up >= 10 ? from - (12 - up) : null;
    if (beside !== null && beside !== from && beside >= LOW_E && beside <= HIGHEST_ROOT) {
      return beside;
    }
  }
  places.sort((a, b) => Math.abs(a - aim) - Math.abs(b - aim) || a - b);
  // How far the line can travel in the notes it has: straight to the root, an octave at
  // most; through an approach, a little further; otherwise by the walk's own reach.
  const span =
    moves <= 1 ? OCTAVE : moves === 2 ? OCTAVE : line.reach * (moves - 2) + line.intoApproach + 2;
  // A root reached in one or two notes is a leap, and a leap wider than a fifth is not chosen.
  const ease = moves <= 2 ? 7 : span;
  const near = places.find((pitch) => Math.abs(pitch - from) <= span) ?? places[0]!;
  const other = places.find((pitch) => pitch !== near && Math.abs(pitch - from) <= ease);
  if (other === undefined) return near;
  // A walk sent to the very bottom of the instrument has nowhere to go but back up, and
  // rocks on the open string: the root is taken an octave up where the line can get
  // there (BA-26). The last note of the tune is another matter, and is not placed here.
  if (near <= LOW_E + 1 && other > near) return other;
  return rng.fork("octave").chance(line.otherOctave) ? other : near;
}

/** How far a walk can fall or climb to the final note in the notes it has, one wide move allowed. */
export function finalSpan(moves: number, line: WalkedLine): number {
  if (moves <= 2) return OCTAVE;
  return OCTAVE + line.reach * (moves - 3) + line.intoApproach + 2;
}

/** Give a stretch's notes their walked pitches: a re-strike follows its tone. */
export function repitch(notes: LineNote[], pitches: readonly number[], piece: Piece): void {
  const chord = piece.chord!;
  let n = -1;
  let pitch = notes[0]?.pitch ?? 0;
  for (const note of notes) {
    if (!note.echo) {
      n++;
      pitch = pitches[n] ?? pitch;
    }
    note.pitch = pitch;
    note.walked = true;
    if (isChordTone(chord, pitch)) delete note.passing;
    else note.passing = true;
  }
}
