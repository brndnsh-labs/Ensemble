// Lead-ins: the last note before a chord change, aimed at the exact note the
// arrival will play. The arrival's pitch is decided before this is asked, so a
// lead-in that promises a landing by step always gets it (BA-05, X-A-34).

import type { ChartChord } from "../../chart/types.ts";
import { PPQ } from "../../chart/types.ts";
import { STEP } from "../../perform/grid.ts";
import type { Rng } from "../../rng.ts";
import { chordTones } from "../../theory/chord.ts";
import type { Key } from "../../theory/pitch.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import { scaleHas } from "../../theory/scale.ts";
import type { Piece } from "./form.ts";
import { pulses, tierAt } from "./form.ts";
import type { LineNote } from "./line.ts";
import type { BassStyle, LeadInKind, LeadInPolicy, RootMotion } from "./style.ts";
import { LEAD_IN_KINDS } from "./style.ts";
import { bassPitchClass, inHarmony, LOW_E, TOP } from "./tones.ts";

/** The note a lead-in aims at. */
export interface Landing {
  readonly tick: number;
  readonly pitch: number;
  readonly chord: ChartChord;
  readonly key: Key;
}

export interface LeadInRequest {
  /** The piece being left, and its notes as the line wrote them. */
  readonly piece: Piece;
  readonly notes: readonly LineNote[];
  /** The last pitch played before this piece, if the line was not resting. */
  readonly before: number | null;
  readonly landing: Landing;
  readonly policy: LeadInPolicy;
  /** How likely the bassist is to lead in where the line does not already. */
  readonly chance: number;
  /** The chord's third in the line's register, or null on a chord with none. */
  readonly third: number | null;
  /** This change's own generator. */
  readonly rng: Rng;
}

/** What to do to the line: change the pitch of its last note, or add a note after it. */
export type LeadIn =
  | {
      readonly how: "replace";
      readonly index: number;
      readonly pitch: number;
      readonly chosen: boolean;
    }
  | { readonly how: "add"; readonly tick: number; readonly pitch: number };

/** No lead-in is reached by a leap wider than this (BA-21, EN-29). */
export const OCTAVE = 12;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export function rootMotion(from: number, to: number): RootMotion {
  switch (mod12(to - from)) {
    case 0:
      return "same";
    case 5:
      return "fallFifth";
    case 7:
      return "riseFifth";
    case 1:
    case 2:
      return "stepUp";
    case 10:
    case 11:
      return "stepDown";
    case 6:
      return "tritone";
    default:
      return "third";
  }
}

/** How far before the change a lead-in sits, in ticks. A beat is the bar's last pulse. */
function roomOf(at: LeadInPolicy["at"], piece: Piece): number {
  if (at === "eighth") return PPQ / 2;
  if (at === "sixteenth") return STEP;
  const beats = pulses(piece.bar);
  return beats[beats.length - 1]!;
}

/** How likely the style is to lead into a change where the line does not already. */
export function leadInChance(bass: BassStyle, leaving: Piece, next: Piece): number {
  const chance = bass.leadIn.chance;
  const tier = tierAt(leaving);
  const top = next.start === next.bar.start && next.bar.barInSection === 0;
  return next.bar.ending ? chance.intoEnding : top ? chance.intoSection[tier] : chance.inside[tier];
}

/** Decide the lead-in out of a piece, or null to leave the line as it is. */
export function leadIn(request: LeadInRequest): LeadIn | null {
  const { piece, notes, landing, policy } = request;
  if (piece.chord === null || notes.length === 0) return null;
  const room = roomOf(policy.at, piece);
  const position = landing.tick - room;

  // The last tone of the line: a re-strike follows its tone wherever that goes.
  let index = notes.length - 1;
  while (index > 0 && notes[index]!.echo) index--;
  const last = notes[index]!;
  // The arrival's own note is never given away or moved: the lead-in before it was promised
  // that pitch. And a lead-in is a beat or shorter (BA-18).
  const arrival = piece.struck && index === 0;
  const replaces = last.tick >= position && !arrival;
  // A longer note is split instead, when that leaves it at least as long as the lead-in.
  const adds = !replaces && last.tick <= position - room;
  if (!replaces && !adds) return null;

  const beforeLast = notes[index - 1]?.pitch ?? request.before;
  const previous = replaces ? beforeLast : last.pitch;
  const target = landing.pitch;
  const motion = rootMotion(bassPitchClass(piece.chord), mod12(target));
  const weights = policy.kinds[motion];
  const draw = (): LeadInKind | null =>
    LEAD_IN_KINDS.some((kind) => weights[kind] > 0)
      ? request.rng.fork("kind").weighted(LEAD_IN_KINDS, (kind) => weights[kind])
      : null;

  const coin = (): boolean => request.rng.fork("whether").chance(request.chance);

  // A chromatic note the line passes through is never left hanging before a change: it
  // stays only as the half step onto the landing (X-A-26).
  const stray = () =>
    piece.scale !== null &&
    !inHarmony(piece.chord!, piece.scale, last.pitch) &&
    Math.abs(last.pitch - target) !== 1;

  let kind: LeadInKind | null = null;
  if (motion !== "same") {
    const apart = Math.min(mod12(last.pitch - target), mod12(target - last.pitch));
    if (apart === 0) {
      // The line's last note is the next chord's bass note: played, the arrival would be
      // heard early (BA-34). A box note becomes the half step below. A held note (the
      // two-feel's fifth, going from the IV home) is split by a lead-in if the bassist was
      // going to play one anyway, and otherwise traded for the chord's third.
      if (replaces) kind = "below";
      else if (request.third === null || coin()) kind = draw() ?? "below";
      else return { how: "replace", index, pitch: request.third, chosen: false };
    } else if (apart <= 2) {
      // The line already leads in by step. Keep the note, beside the root it leads to
      // (BA-07). The open E under an F is a step on the instrument, so it stays too.
      const beside = target + (mod12(last.pitch - target) <= 2 ? apart : -apart);
      // A chromatic note a whole step away is no lead-in (X-A-26): it is replaced below.
      const passing = apart === 1 || !stray();
      if (beside === last.pitch && passing) return null;
      const reachable = beforeLast === null || Math.abs(beside - beforeLast) <= OCTAVE;
      if (!arrival && beside >= LOW_E && reachable && passing)
        return { how: "replace", index, pitch: beside, chosen: false };
      // It cannot move there (it would lie under the open E, or a leap from the note before,
      // or it is the chord's own arrival): take a step the line can reach instead, a half
      // step if it was one, coming down onto the string at the bottom (BA-08).
      kind = apart === 1 ? "below" : "scale";
    } else if (coin()) {
      kind = draw();
    }
  }
  // Left alone, the line would leap more than an octave onto the arrival: the box has
  // climbed and the next root sits low. A lead-in bridges it. When the bass note is not
  // moving at all, the root's own fifth is the classic way down an octave (EN-28).
  const leaps = Math.abs(last.pitch - target) > OCTAVE;
  if (kind === null && leaps) kind = draw() ?? "fifth";
  if (kind === null && replaces && stray()) kind = draw() ?? "scale";
  if (kind === null) return null;
  // Coming back to a note through the half step above it is a turn, not an approach: when
  // the line is already on the target's pitch, lean into it from below.
  if (kind === "above" && previous === target) kind = "below";

  const pitch = approach(kind, request, previous, leaps);
  if (pitch === null) return null;
  return replaces
    ? { how: "replace", index, pitch, chosen: true }
    : { how: "add", tick: position, pitch };
}

/** The pitch of a lead-in of one kind, or null when the instrument has no such note. */
function approach(
  kind: LeadInKind,
  request: LeadInRequest,
  previous: number | null,
  bridging: boolean,
): number | null {
  const { piece, landing } = request;
  const chord = piece.chord!;
  const target = landing.pitch;
  const root = pitchClass(chord.root);
  const inScale = (pitch: number) => piece.scale !== null && scaleHas(piece.scale, pitch - root);
  const nearLine = (a: number, b: number) =>
    previous === null ? 0 : Math.abs(a - previous) - Math.abs(b - previous);
  // At the bottom of the instrument a lead-in comes down onto the string from above (BA-08).
  // That is the open E alone: under an F the open E is the half step below, and is there.
  const floor = target <= LOW_E;

  /** Scale steps of the chord being left within a whole step of the target, nearest the line first. */
  const scaleSteps = (): number[] => {
    const around = floor
      ? [target + 2, target + 1]
      : [target - 2, target + 2, target - 1, target + 1];
    const steps = around.filter(inScale).sort(nearLine);
    // With no scale step there (a sus or power chord): the whole step above, then the half steps.
    return [...steps, target + 2, target + 1, ...(floor ? [] : [target - 1])];
  };

  /** From above at the floor (BA-09): the half step only if the harmony knows it. */
  const fromAbove = (): number[] => (knownAbove(chord, landing) ? [target + 1] : []);

  /**
   * A fifth above the target or a fourth below it, whichever is nearer the line: a V to I
   * in miniature (BA-03). Always the perfect fifth, the dominant of the note being
   * approached, whatever fifth the chord on it has.
   */
  const fifths = (): number[] => [target + 7, target - 5].sort(nearLine);

  // A half step the line cannot reach from where it is (the box has climbed and the next
  // root sits at the bottom, so the half step under it is more than an octave down) is taken
  // from the other side: still a half step, from where the hand is.
  const wanted =
    kind === "fifth"
      ? fifths()
      : kind === "scale"
        ? []
        : floor
          ? fromAbove()
          : kind === "below"
            ? [target - 1, target + 1]
            : [target + 1, target - 1];
  // The kind asked for first, then the scale steps, then the fifth: a lead-in the line would
  // have to leap more than an octave to reach is no lead-in, so one it can reach is played.
  // Every kind answers to the scale of the chord being left: a passing or approach tone comes
  // from it, the one exception being the chromatic half step onto the landing note (X-A-26).
  // So the fifth of the chord coming, say E over F7 into Am7, is not a candidate there.
  const eligible = (pitch: number) => inScale(pitch) || Math.abs(pitch - target) === 1;
  const playable = [...wanted, ...scaleSteps(), ...fifths()].filter(
    (pitch) => pitch >= LOW_E && pitch <= TOP && pitch !== target && eligible(pitch),
  );
  let candidates = playable.filter(
    (pitch) => previous === null || Math.abs(pitch - previous) <= OCTAVE,
  );
  // Nothing in reach, and the line is about to leap further still: break the fall where it can.
  if (candidates.length === 0 && bridging) candidates = [...playable].sort(nearLine).slice(0, 1);
  // A lead-in that repeats the note before it is a repeat, not a lead-in (BA-10), unless
  // it is the only way onto the string.
  return candidates.find((pitch) => pitch !== previous) ?? candidates[0] ?? null;
}

/**
 * Whether the half step above a landing at the bottom of the instrument belongs
 * to the chord being left, the chord coming, or the key (BA-09): over B7 into E
 * the half step above is F natural, which is none of them.
 */
export function knownAbove(leaving: ChartChord, landing: Landing): boolean {
  const root = pitchClass(leaving.root);
  const tonic = pitchClass(landing.key.tonic);
  const known = new Set([
    ...chordTones(leaving.quality).map((tone) => mod12(root + tone.interval)),
    ...chordTones(landing.chord.quality).map((tone) =>
      mod12(pitchClass(landing.chord.root) + tone.interval),
    ),
    ...(landing.key.mode === "minor" ? MINOR : MAJOR).map((degree) => mod12(tonic + degree)),
  ]);
  return known.has(mod12(landing.pitch + 1));
}

/** Carry out a lead-in on the notes of the piece being left. */
export function applyLeadIn(notes: LineNote[], lead: LeadIn, landingTick: number): void {
  if (lead.how === "replace") {
    const note = notes[lead.index]!;
    note.pitch = lead.pitch;
    if (lead.chosen) note.level = "approach";
    // The lope never moves to a new note on the "and" (BA-31): re-strikes follow their tone.
    for (let i = lead.index + 1; i < notes.length && notes[i]!.echo; i++) {
      notes[i]!.pitch = lead.pitch;
    }
    return;
  }
  while (notes.length > 0 && notes[notes.length - 1]!.tick >= lead.tick) notes.pop();
  const cut = notes[notes.length - 1];
  if (cut) cut.space = Math.min(cut.space, lead.tick - cut.tick);
  notes.push({
    tick: lead.tick,
    space: landingTick - lead.tick,
    pitch: lead.pitch,
    echo: false,
    level: "approach",
  });
}
