// The bass seat. The line is built in the order a bassist thinks: where does
// this chord's root sit, how do I get there from the bar before, then what do
// I play on it. Every root is placed before the notes that lead to it are
// written, so a lead-in always lands on the note it promised (BA-05 to BA-07).

import { PPQ } from "../../chart/types.ts";
import { isCompound } from "../../perform/meter.ts";
import type { Player, PlayerContext, WrittenNote } from "../../perform/notes.ts";
import { heldRng } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { Rng } from "../../rng.ts";
import { GHOST_BELOW } from "../drums/kit.ts";
import type { BassPick } from "./critique.ts";
import { byBassCritic } from "./critique.ts";
import { bassLinesIn } from "./derive.ts";
import { finalNotes, strikeBefore } from "./ending.ts";
import type { Piece } from "./form.ts";
import { lineAt, pieces, tierAt } from "./form.ts";
import { walkedBar, walkHome } from "./home.ts";
import type { LeadIn, LeadInRequest } from "./leadin.ts";
import { applyLeadIn, leadIn, leadInChance, OCTAVE } from "./leadin.ts";
import type { LineNote } from "./line.ts";
import { lineOf, turnOf, write } from "./line.ts";
import type { Performer } from "./phrase.ts";
import { playPhrases } from "./phrase.ts";
import { anchorOf, lowestRoot, placeRoot } from "./register.ts";
import type { BassStyle, LineShape, ToneSequence } from "./style.ts";
import {
  bassPitchClass,
  HIGHEST_ROOT,
  inHarmony,
  LOW_E,
  remember,
  sequenceFor,
  toneOf,
  tonePitch,
} from "./tones.ts";
import { walkInto } from "./walk.ts";
import { finalSpan, repitch, walkedPitches, walkedRoot } from "./walking.ts";

export const playBass: Player = (context) => bassPart(context);

/**
 * The seat's part, with the choice of each phrase left open: the player asks
 * the critic, and a report can ask for the first plan drawn, to show on the
 * same seeds what the critic's choice is worth.
 */
export function bassPart(context: PlayerContext, pick?: BassPick): WrittenNote[] {
  const { plan, style, rng } = context;
  const bass = style.bass;
  const form = pieces(plan, bass.stepsUpEarly === true);
  const parts = playPhrases(
    form,
    bass,
    rng,
    performer(form, bass, rng, context.heard.drums),
    pick ?? byBassCritic(style.critic.weights.bass ?? {}),
  );
  const written: WrittenNote[] = [];
  form.forEach((piece, i) => {
    // The look-ahead pass is read, never played.
    if (!piece.lookahead) written.push(...write(parts[i]!, piece, lineAt(bass, piece)));
  });
  return written;
}

/** Whether a piece is played at all: under a chord, and not a second strike of the final chord. */
function sounds(form: readonly Piece[], i: number): boolean {
  const piece = form[i]!;
  // The final chord is written once, where it first lands.
  return piece.chord !== null && !(piece.ending === "final" && form[i - 1]?.ending === "final");
}

export function performer(
  form: readonly Piece[],
  bass: BassStyle,
  rng: Rng,
  /** The drummer's written notes by plan bar, where there is a drummer to hear. */
  drums?: readonly (readonly WrittenNote[])[],
): Performer {
  // The plans weighed for a phrase mostly share their bars, so a bar is written once for
  // each root and shape it is tried with, and handed out as a copy a lead-in may reshape.
  const written = new Map<number, readonly LineNote[]>();
  // Which written bar a piece's notes were copied from: the lead-in out of them is then the
  // same question whatever plan they came from.
  const origin = new WeakMap<readonly LineNote[], number>();
  const ids = new Map<LineShape, number>();
  const anchors = new Map<number, number>();
  const leads = new Map<number, LeadIn | null>();
  const sequences = new Map<number, ToneSequence>();
  const idOf = (shape: LineShape) => {
    if (!ids.has(shape)) ids.set(shape, ids.size);
    return ids.get(shape)!;
  };
  // The kicks to lock to: the ones the drummer actually played in the bar, a fill's
  // included, and not the ones he only feathers or ghosts (BA-13, DR-105).
  const kicks = new Map<number, readonly number[]>();
  const kicksIn = (bar: PlanBar): readonly number[] =>
    remember(kicks, bar.index, () =>
      (drums?.[bar.index] ?? [])
        .filter((note) => note.voice === "kick" && note.velocity >= GHOST_BELOW)
        .map((note) => note.tick - bar.start),
    );
  // A walk's draws belong to the plan that is weighing it and to the stretch's place.
  const walking = rng.fork("walking");
  const strideOf = (plan: Rng | null | undefined, piece: Piece) =>
    heldRng(plan ?? walking, "stride", "bar", piece.bar).fork(piece.start - piece.bar.start);
  /** Whether the piece after this one will walk this one into its landing. */
  const bound = (i: number) => {
    const next = form[i + 1];
    return next?.struck === true && sounds(form, i + 1) && form[i]!.ending === null;
  };
  /**
   * A chord that only passes (a beat or less) on its way to a root a step off
   * by name is played beside that root, where the instrument has the note:
   * E9 for a beat into F9 is the E under the F, not the one a seventh above it
   * (BA-07, said of the root itself). Only where every root has one place, so
   * the next root's is known before the line gets there.
   */
  const passing = (i: number, root: number): number => {
    const piece = form[i]!;
    const next = form[i + 1];
    if (bass.register.pull !== 1 || !next?.struck || !next.chord) return root;
    if (piece.end - piece.start > PPQ) return root;
    const home = remember(anchors, i + 1, () => anchorOf(bass.register, rng, next.bar));
    // The final chord lands on the lowest root there is (EN-27).
    const landing =
      next.ending === "final"
        ? lowestRoot(bassPitchClass(next.chord))
        : placeRoot(bassPitchClass(next.chord), bass.register, home, null);
    if (Math.abs(root - landing) <= 2) return root;
    const beside = [root - OCTAVE, root + OCTAVE].find(
      (pitch) => pitch >= LOW_E && pitch <= HIGHEST_ROOT && Math.abs(pitch - landing) <= 2,
    );
    return beside ?? root;
  };
  return {
    turn(i) {
      const piece = form[i]!;
      if (!sounds(form, i) || piece.ending !== null) return null;
      return turnOf(lineAt(bass, piece), tierAt(piece), piece.bar, rng);
    },

    arrive(i, state, parts, into) {
      const piece = form[i]!;
      if (!sounds(form, i) || !piece.struck) return { state, walked: null };
      const anchor = remember(anchors, i, () => anchorOf(bass.register, rng, piece.bar));
      const own = toTheEnd(
        form,
        i,
        passing(i, placeRoot(bassPitchClass(piece.chord!), bass.register, anchor, state.line)),
      );
      // Only a line still in motion can be reshaped to lead in: not a rest, not the ending bar.
      const leaving = form[i - 1];
      const moving = leaving?.chord && leaving.ending === null ? leaving : null;
      const notes = parts[i - 1] ?? [];
      const before = moving ? soundingBefore(form, parts, i - 1) : null;

      // A walked line is not reshaped to lead in: it is walked here, now that the place
      // it is going is known. The approach is the walk's own last note.
      const walked = moving ? lineAt(bass, moving).walked : undefined;
      if (moving && walked) {
        const from = moving.struck ? state.root : (before ?? state.root);
        const tones = notes.filter((note) => !note.echo).length;
        const moves = tones + (moving.struck ? 0 : 1);
        const stride = strideOf(into.walked, moving);
        const pc = bassPitchClass(piece.chord!);
        // The last note is the lowest root on the instrument where the walk can get down
        // to it; otherwise the line ends in its own octave (EN-27, EN-28).
        const low = lowestRoot(pc);
        const target =
          piece.ending === "final"
            ? Math.abs(low - from) <= finalSpan(moves, walked)
              ? low
              : own
            : toTheEnd(form, i, walkedRoot(pc, bass.register, anchor, from, moves, walked, stride));
        const pitches = walkedPitches({
          piece: moving,
          notes,
          root: state.root,
          arrives: moving.struck,
          before,
          landing: { tick: piece.start, pitch: target, chord: piece.chord!, key: piece.bar.key },
          line: walked,
          kinds: bass.leadIn.kinds,
          ceiling: lineAt(bass, moving).ceiling,
          home: anchor,
          pull: bass.register.pull,
          rng: stride,
        });
        repitch(notes, pitches, moving);
        return { state: { line: state.line, root: target }, walked: null };
      }
      const request = () =>
        moving
          ? approachFrom(
              { piece: moving, notes, before, root: state.root },
              piece,
              bass,
              rng,
              into.chance,
            )
          : null;
      const walk = (target: number) =>
        moving && into.walk
          ? walkInto(
              {
                piece: moving,
                notes,
                root: state.root,
                before,
                passing: chromaticBefore(form, parts, i - 1),
                landing: {
                  tick: piece.start,
                  pitch: target,
                  chord: piece.chord!,
                  key: piece.bar.key,
                },
                ceiling: lineAt(bass, moving).ceiling,
              },
              bass.walks,
              into.walk,
            )
          : null;
      const walkedTo = (target: number) => {
        const done = walk(target);
        if (!done) return null;
        parts[i - 1] = done.notes;
        return { state: { line: state.line, root: target }, walked: done.walk };
      };

      if (piece.ending === "final") {
        // A style that walks home walks every ending it can, whatever the plan offered (EN-46).
        const home = bass.walks?.ending;
        const walked = home ? walkedBar(form, i) : null;
        if (home && walked && moving) {
          const done = walkHome(
            home,
            moving,
            parts[i - 1] ?? [],
            state.root,
            piece,
            walked.length === 2,
            before,
            bass.register,
            leadsIn(form, parts, i - 1),
          );
          if (done) {
            parts[i - 1] = done.notes;
            return { state: { line: state.line, root: done.landing }, walked: null };
          }
        }
        const rested = leaving === undefined || leaving.chord === null;
        const landing = land(
          lowestRoot(bassPitchClass(piece.chord!)),
          own,
          request(),
          rested ? null : state.line,
        );
        const arrival = walkedTo(landing.pitch);
        if (arrival) return arrival;
        if (landing.lead) applyLeadIn(notes, landing.lead, piece.start);
        return { state: { line: state.line, root: landing.pitch }, walked: null };
      }

      if (!moving) return { state: { line: state.line, root: own }, walked: null };
      const arrival = walkedTo(own);
      if (arrival) return arrival;
      // The same lead-in question is asked of most plans weighed for a phrase: answered once.
      // Keyed by the bar the notes were written as (which holds the root they stand on), the
      // landing, the note before, and the decision: a number, since it is asked so often.
      const from = origin.get(notes) ?? -1;
      const key = ((from * 128 + own) * 130 + (before ?? -1) + 1) * 3 + (into.chance ?? 2);
      let lead = leads.get(key);
      if (lead === undefined) {
        const asked = request();
        lead = asked ? leadIn(asked(own)) : null;
        leads.set(key, lead);
      }
      if (lead) applyLeadIn(notes, lead, piece.start);
      return { state: { line: state.line, root: own }, walked: null };
    },

    play(i, state, parts, choose, how) {
      if (!sounds(form, i)) return state;
      const piece = form[i]!;
      const tier = tierAt(piece);
      const ending = piece.bar.ending;
      if (piece.ending === "final" && ending) {
        let end = i;
        while (form[end + 1]?.ending === "final") end++;
        const group = form.slice(i, end + 1);
        finalNotes(group, ending, state.root, bass.ending.velocity).forEach((notes, n) => {
          parts[i + n] = notes;
        });
        // A bass that walks home strikes the final root at least as hard as the note it walked
        // in on, as it is played (EN-46).
        const first = parts[i]![0];
        if (bass.walks?.ending && first) parts[i]![0] = { ...first, noSofter: true };
      } else if (piece.ending === "before" && ending) {
        // Caught at the line's own weight, and never louder than the final note.
        const weight = Math.min(lineAt(bass, piece).velocity.arrival, bass.ending.velocity);
        parts[i] = strikeBefore(piece, ending, state.root, weight);
      } else {
        const line = lineAt(bass, piece);
        const sequence = remember(sequences, i, () =>
          sequenceFor(line.tones, piece.chord!, piece.scale!),
        );
        const shape = choose ? choose(sequence, line.tones.indexOf(sequence)) : sequence;
        const turn = how?.turn ? turnOf(line, tier, piece.bar, rng) : null;
        const key = ((i * 128 + state.root) * 256 + idOf(shape)) * 2 + (turn ? 1 : 0);
        let notes = written.get(key);
        if (!notes) {
          const played = { turn, kicks: line.followsKick ? kicksIn(piece.bar) : [] };
          notes = lineOf(piece, line, tier, state.root, rng, () => shape, played);
          written.set(key, notes);
        }
        parts[i] = notes.map((note) => ({ ...note }));
        origin.set(parts[i]!, key);
        if (line.walked) {
          // The piece after this one walks it, once it knows where it lands; until then
          // the line stands where the stretch began.
          if (bound(i)) return { ...state, line: piece.struck ? state.root : state.line };
          // Nothing to arrive at (the chord carries on, or the music stops): walked as it is.
          // Into a rest the line stays where the roots are, so that wherever it comes back
          // in, it has not leapt.
          const resting = form[i + 1]?.chord === null;
          const pitches = walkedPitches({
            piece,
            notes: parts[i]!,
            root: state.root,
            arrives: piece.struck,
            before: soundingBefore(form, parts, i),
            landing: null,
            line: line.walked,
            kinds: bass.leadIn.kinds,
            ceiling: resting ? Math.min(line.ceiling, bass.register.highest + 1) : line.ceiling,
            home: remember(anchors, i, () => anchorOf(bass.register, rng, piece.bar)),
            pull: bass.register.pull,
            rng: strideOf(how?.walked, piece),
          });
          repitch(parts[i]!, pitches, piece);
        }
      }
      return { ...state, line: parts[i]!.findLast((note) => !note.echo)?.pitch ?? state.line };
    },
  };
}

/**
 * The last chord before the final one, and any chord struck on the way to it
 * in the ending bar, is played where the final low root can be reached from:
 * within an octave of it (EN-27, EN-28). Any other root stays where it was put.
 */
function toTheEnd(form: readonly Piece[], i: number, root: number): number {
  if (form[i]!.ending === "final") return root;
  let end = i + 1;
  while (form[end] && (form[end]!.ending === "before" || !form[end]!.struck)) end++;
  const final = form[end];
  if (final?.ending !== "final" || !final.chord) return root;
  const low = lowestRoot(bassPitchClass(final.chord));
  let pitch = root;
  while (pitch - low > OCTAVE && pitch - OCTAVE >= lowestRoot(pitch)) pitch -= OCTAVE;
  return pitch;
}

/** Whether the note just before a piece is a chromatic one over its own chord. */
function chromaticBefore(
  form: readonly Piece[],
  parts: readonly (readonly LineNote[])[],
  index: number,
): boolean {
  const piece = form[index - 1];
  const last = parts[index - 1]?.at(-1);
  if (!piece?.chord || !piece.scale || !last) return false;
  return !inHarmony(piece.chord, piece.scale, last.pitch);
}

/** Whether the note just before a piece is struck within a beat of it: it may be leading there. */
function leadsIn(
  form: readonly Piece[],
  parts: readonly (readonly LineNote[])[],
  index: number,
): boolean {
  const last = parts[index - 1]?.findLast((note) => !note.echo);
  return (
    form[index - 1]?.chord != null && last !== undefined && form[index]!.start - last.tick <= PPQ
  );
}

/** The pitch played just before a piece, as it will actually sound. Null after a rest. */
function soundingBefore(
  form: readonly Piece[],
  parts: readonly (readonly LineNote[])[],
  index: number,
): number | null {
  for (let i = index - 1; i >= 0 && form[i]!.chord !== null; i--) {
    const last = parts[i]![parts[i]!.length - 1];
    if (last) return last.pitch;
  }
  return null;
}

/**
 * The style's lead-in, in the bar it is played in: where a style has written its line for a
 * bar of dotted pulses and says the lead-in sits somewhere else there, it does.
 */
function leadInIn(bass: BassStyle, bar: PlanBar): BassStyle["leadIn"] {
  const policy = bass.leadIn;
  if (!policy.inDotted || !isCompound(bar.meter) || !bassLinesIn(bass, bar.meter)) return policy;
  return { ...policy, at: policy.inDotted };
}

/**
 * The question "how do I get from this piece into the next chord", ready to be
 * asked of any pitch the next chord's bass note might take.
 */
function approachFrom(
  from: {
    /** The piece being left, its notes, and the pitch that sounded just before them. */
    readonly piece: Piece;
    readonly notes: readonly LineNote[];
    readonly before: number | null;
    /** Where the bass note of the chord being left sits. */
    readonly root: number;
  },
  next: Piece,
  bass: BassStyle,
  rng: Rng,
  decided: number | null,
): (pitch: number) => LeadInRequest {
  const { piece, notes, before } = from;
  const policy = leadInIn(bass, piece.bar);
  const chance = decided ?? leadInChance(bass, piece, next);
  const third =
    piece.chord && piece.scale && toneOf("3", piece.chord, piece.scale) !== null
      ? tonePitch("3", piece.chord, piece.scale, from.root, lineAt(bass, piece).ceiling)
      : null;
  // The coin belongs to this change's place in the music, never to how many came before it.
  const place = heldRng(rng, "lead-in", policy.hold, piece.bar).fork(
    piece.bar.barInSection,
    next.start - piece.bar.start,
  );
  return (pitch) => ({
    piece,
    notes,
    before,
    landing: { tick: next.start, pitch, chord: next.chord!, key: next.bar.key },
    policy,
    chance,
    third,
    rng: place,
  });
}

/**
 * Where the last note lands. The lowest root on the instrument, under the
 * whole band, if the line can get there without a leap of more than an octave,
 * as it is or by the lead-in it would play (from an octave up, the root's own
 * fifth). Otherwise the line ends in its own octave (EN-27, EN-28).
 */
function land(
  low: number,
  own: number,
  request: ((pitch: number) => LeadInRequest) | null,
  previous: number | null,
): { pitch: number; lead: LeadIn | null } {
  if (!request) {
    const reachable = previous === null || Math.abs(previous - low) <= OCTAVE;
    return { pitch: reachable ? low : own, lead: null };
  }
  const asked = request(low);
  const lead = leadIn(asked);
  if (smooth(asked, lead)) return { pitch: low, lead };
  return { pitch: own, lead: leadIn(request(own)) };
}

/** Whether a lead-in (or none) reaches the landing with no leap wider than an octave. */
function smooth(request: LeadInRequest, lead: LeadIn | null): boolean {
  const notes = request.notes.map((note) => ({ ...note }));
  if (lead) applyLeadIn(notes, lead, request.landing.tick);
  const tones = notes.filter((note) => !note.echo).map((note) => note.pitch);
  const last = tones[tones.length - 1];
  if (last === undefined) return true;
  if (Math.abs(last - request.landing.pitch) > OCTAVE) return false;
  if (!lead) return true;
  const into = tones[tones.length - 2] ?? request.before;
  return into === null || Math.abs(last - into) <= OCTAVE;
}
