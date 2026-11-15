// The bass seat. The line is built in the order a bassist thinks: where does
// this chord's root sit, how do I get there from the bar before, then what do
// I play on it. Every root is placed before the notes that lead to it are
// written, so a lead-in always lands on the note it promised (BA-05 to BA-07).

import type { Player, PlayerContext, WrittenNote } from "../../perform/notes.ts";
import { heldRng } from "../../perform/notes.ts";
import type { Rng } from "../../rng.ts";
import type { BassPick } from "./critique.ts";
import { byBassCritic } from "./critique.ts";
import { finalNotes, strikeBefore } from "./ending.ts";
import type { Piece } from "./form.ts";
import { pieces, tierAt } from "./form.ts";
import type { LeadIn, LeadInRequest } from "./leadin.ts";
import { applyLeadIn, leadIn, leadInChance, OCTAVE } from "./leadin.ts";
import type { LineNote } from "./line.ts";
import { lineOf, write } from "./line.ts";
import type { Performer } from "./phrase.ts";
import { playPhrases } from "./phrase.ts";
import { anchorOf, lowestRoot, placeRoot } from "./register.ts";
import type { BassStyle, LineShape, ToneSequence } from "./style.ts";
import { bassPitchClass, inHarmony, remember, sequenceFor, toneOf, tonePitch } from "./tones.ts";
import { walkInto } from "./walk.ts";

export const playBass: Player = (context) => bassPart(context);

/**
 * The seat's part, with the choice of each phrase left open: the player asks
 * the critic, and a report can ask for the first plan drawn, to show on the
 * same seeds what the critic's choice is worth.
 */
export function bassPart(context: PlayerContext, pick?: BassPick): WrittenNote[] {
  const { plan, style, rng } = context;
  const bass = style.bass;
  const form = pieces(plan);
  const parts = playPhrases(
    form,
    bass,
    rng,
    performer(form, bass, rng),
    pick ?? byBassCritic(style.critic.weights.bass ?? {}),
  );
  const written: WrittenNote[] = [];
  form.forEach((piece, i) => {
    // The look-ahead pass is read, never played.
    if (!piece.lookahead) written.push(...write(parts[i]!, piece, bass.lines[tierAt(piece)]));
  });
  return written;
}

/** Whether a piece is played at all: under a chord, and not a second strike of the final chord. */
function sounds(form: readonly Piece[], i: number): boolean {
  const piece = form[i]!;
  // The final chord is written once, where it first lands.
  return piece.chord !== null && !(piece.ending === "final" && form[i - 1]?.ending === "final");
}

export function performer(form: readonly Piece[], bass: BassStyle, rng: Rng): Performer {
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
  return {
    arrive(i, state, parts, into) {
      const piece = form[i]!;
      if (!sounds(form, i) || !piece.struck) return { state, walked: null };
      const anchor = remember(anchors, i, () => anchorOf(bass.register, rng, piece.bar));
      const own = placeRoot(bassPitchClass(piece.chord!), bass.register, anchor, state.line);
      // Only a line still in motion can be reshaped to lead in: not a rest, not the ending bar.
      const leaving = form[i - 1];
      const moving = leaving?.chord && leaving.ending === null ? leaving : null;
      const notes = parts[i - 1] ?? [];
      const before = moving ? soundingBefore(form, parts, i - 1) : null;
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
                ceiling: bass.lines[tierAt(moving)].ceiling,
              },
              bass.walks,
              into.walk,
            )
          : null;
      const walked = (target: number) => {
        const done = walk(target);
        if (!done) return null;
        parts[i - 1] = done.notes;
        return { state: { line: state.line, root: target }, walked: done.walk };
      };

      if (piece.ending === "final") {
        const rested = leaving === undefined || leaving.chord === null;
        const landing = land(
          lowestRoot(bassPitchClass(piece.chord!)),
          own,
          request(),
          rested ? null : state.line,
        );
        const arrival = walked(landing.pitch);
        if (arrival) return arrival;
        if (landing.lead) applyLeadIn(notes, landing.lead, piece.start);
        return { state: { line: state.line, root: landing.pitch }, walked: null };
      }

      if (!moving) return { state: { line: state.line, root: own }, walked: null };
      const arrival = walked(own);
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

    play(i, state, parts, choose) {
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
      } else if (piece.ending === "before" && ending) {
        // Caught at the line's own weight, and never louder than the final note.
        const weight = Math.min(bass.lines[tier].velocity.arrival, bass.ending.velocity);
        parts[i] = strikeBefore(piece, ending, state.root, weight);
      } else {
        const line = bass.lines[tier];
        const sequence = remember(sequences, i, () =>
          sequenceFor(line.tones, piece.chord!, piece.scale!),
        );
        const shape = choose ? choose(sequence, line.tones.indexOf(sequence)) : sequence;
        const key = (i * 128 + state.root) * 256 + idOf(shape);
        let notes = written.get(key);
        if (!notes) {
          notes = lineOf(piece, line, tier, state.root, rng, () => shape);
          written.set(key, notes);
        }
        parts[i] = notes.map((note) => ({ ...note }));
        origin.set(parts[i]!, key);
      }
      return { ...state, line: parts[i]!.findLast((note) => !note.echo)?.pitch ?? state.line };
    },
  };
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
  const policy = bass.leadIn;
  const tier = tierAt(piece);
  const chance = decided ?? leadInChance(bass, piece, next);
  const third =
    piece.chord && piece.scale && toneOf("3", piece.chord, piece.scale) !== null
      ? tonePitch("3", piece.chord, piece.scale, from.root, bass.lines[tier].ceiling)
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
