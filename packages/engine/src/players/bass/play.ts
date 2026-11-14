// The bass seat. The line is built in the order a bassist thinks: where does
// this chord's root sit, how do I get there from the bar before, then what do
// I play on it. Every root is placed before the notes that lead to it are
// written, so a lead-in always lands on the note it promised (BA-05 to BA-07).

import type { Player, WrittenNote } from "../../perform/notes.ts";
import { heldRng } from "../../perform/notes.ts";
import type { Rng } from "../../rng.ts";
import { tierOf } from "../../style/types.ts";
import { finalNotes, strikeBefore } from "./ending.ts";
import type { Piece } from "./form.ts";
import { pieces } from "./form.ts";
import type { LeadIn, LeadInRequest } from "./leadin.ts";
import { applyLeadIn, leadIn, OCTAVE } from "./leadin.ts";
import type { LineNote } from "./line.ts";
import { lineOf, write } from "./line.ts";
import { anchorOf, lowestRoot, placeRoot } from "./register.ts";
import type { BassStyle } from "./style.ts";
import { bassPitchClass, toneOf, tonePitch } from "./tones.ts";

export const playBass: Player = ({ plan, style, rng }) => {
  const bass = style.bass;
  const form = pieces(plan);
  const parts: LineNote[][] = form.map(() => []);
  const tierAt = (piece: Piece) => tierOf(piece.bar.seats.bass ?? piece.bar.energy);

  // What a bassist carries from note to note: where the line last was (before any lead-in
  // reshaped it), and the root of the chord he is on.
  let line: number | null = null;
  let root = 0;

  form.forEach((piece, i) => {
    if (piece.chord === null) return;
    // The final chord is written once, where it first lands.
    if (piece.ending === "final" && form[i - 1]?.ending === "final") return;

    if (piece.struck) {
      const anchor = anchorOf(bass.register, rng, piece.bar);
      const own = placeRoot(bassPitchClass(piece.chord), bass.register, anchor, line);
      // Only a line still in motion can be reshaped to lead in: not a rest, not the ending bar.
      const leaving = form[i - 1];
      const request =
        leaving?.chord && leaving.ending === null
          ? approachFrom(
              {
                piece: leaving,
                notes: parts[i - 1]!,
                before: soundingBefore(form, parts, i - 1),
                root,
              },
              piece,
              bass,
              rng,
            )
          : null;
      const rested = leaving === undefined || leaving.chord === null;
      const landing =
        piece.ending === "final"
          ? land(lowestRoot(bassPitchClass(piece.chord)), own, request, rested ? null : line)
          : { pitch: own, lead: request ? leadIn(request(own)) : null };
      root = landing.pitch;
      if (landing.lead) applyLeadIn(parts[i - 1]!, landing.lead, piece.start);
    }

    const tier = tierAt(piece);
    const ending = piece.bar.ending;
    if (piece.ending === "final" && ending) {
      let end = i;
      while (form[end + 1]?.ending === "final") end++;
      const group = form.slice(i, end + 1);
      finalNotes(group, ending, root, bass.ending.velocity).forEach((notes, n) => {
        parts[i + n] = notes;
      });
    } else if (piece.ending === "before" && ending) {
      // Caught at the line's own weight, and never louder than the final note.
      const weight = Math.min(bass.lines[tier].velocity.arrival, bass.ending.velocity);
      parts[i] = strikeBefore(piece, ending, root, weight);
    } else {
      parts[i] = lineOf(piece, bass.lines[tier], tier, root, rng);
    }
    line = parts[i]!.findLast((note) => !note.echo)?.pitch ?? line;
  });

  const written: WrittenNote[] = [];
  form.forEach((piece, i) => {
    // The look-ahead pass is read, never played.
    if (!piece.lookahead) written.push(...write(parts[i]!, piece, bass.lines[tierAt(piece)]));
  });
  return written;
};

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
): (pitch: number) => LeadInRequest {
  const { piece, notes, before } = from;
  const policy = bass.leadIn;
  const tier = tierOf(piece.bar.seats.bass ?? piece.bar.energy);
  const top = next.start === next.bar.start && next.bar.barInSection === 0;
  const chance = next.bar.ending
    ? policy.chance.intoEnding
    : top
      ? policy.chance.intoSection[tier]
      : policy.chance.inside[tier];
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
