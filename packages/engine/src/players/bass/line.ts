// The line itself: a rhythm figure laid over one piece of a bar, with the
// sequence's tones fitted to the chord.

import { PPQ } from "../../chart/types.ts";
import { cells, STEP } from "../../perform/grid.ts";
import type { WrittenNote } from "../../perform/notes.ts";
import { heldRng } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { Rng } from "../../rng.ts";
import type { Tier } from "../../style/types.ts";
import type { Piece } from "./form.ts";
import { pulses } from "./form.ts";
import type { BassLine } from "./style.ts";
import { FIGURE_STEPS } from "./style.ts";
import { isChordTone, sequenceFor, tonePitch } from "./tones.ts";

/** No bass note is shorter than half a sixteenth (BA-14). */
export const SHORTEST = STEP / 2;
/** A note given this much room or more is a held note, and a held note is a chord tone (BA-15). */
const HELD = PPQ * 2;

/** One note of the line before it is written down. Lead-ins may still change it. */
export interface LineNote {
  /** Absolute tick. */
  tick: number;
  /** Ticks until the next note, a rest, or the end of the piece. */
  space: number;
  pitch: number;
  /** The same tone struck again: the short half of a long-short. */
  echo: boolean;
  level: keyof BassLine["velocity"];
  /** Set where the length and weight are not the line's own: the ending. */
  exact?: { duration: number; velocity: number };
}

interface Onset {
  /** Ticks from the barline. */
  readonly tick: number;
  readonly space: number;
  readonly echo: boolean;
}

/** Where this bar's notes fall, and whether the bar is played plainly (any meter but 4/4, BA-16). */
function onsets(
  line: BassLine,
  tier: Tier,
  bar: PlanBar,
  rng: Rng,
): { readonly notes: readonly Onset[]; readonly plain: boolean } {
  const beats = pulses(bar);
  const common = beats.length === 4 && beats.every((beat) => beat === PPQ);
  const figures = line.figures.options.filter(
    (figure) => figure.weight > 0 && cells(figure.grid).length === FIGURE_STEPS,
  );
  if (common && figures.length > 0) {
    // The figure is chosen whole and kept: a section keeps its lope (X-A-29, X-A-31).
    const held = heldRng(rng, `figure:${tier}`, line.figures.hold, bar);
    const grid = cells(held.weighted(figures, (figure) => figure.weight).grid);
    const notes: Onset[] = [];
    grid.forEach((symbol, step) => {
      if (symbol !== "x" && symbol !== "o") return;
      let length = 1;
      while (grid[step + length] === "-") length++;
      notes.push({ tick: step * STEP, space: length * STEP, echo: symbol === "o" });
    });
    return { notes, plain: false };
  }
  if (line.otherMeters === "downbeat") {
    return { notes: [{ tick: 0, space: bar.ticks, echo: false }], plain: true };
  }
  let tick = 0;
  const notes = beats.map((beat) => {
    const onset = { tick, space: beat, echo: false };
    tick += beat;
    return onset;
  });
  return { notes, plain: true };
}

/** The bar's first pulse and, in a bar that divides in two, its middle one. */
function isStrong(bar: PlanBar, tickInBar: number): boolean {
  if (tickInBar === 0) return true;
  const beats = pulses(bar);
  if (beats.length < 4 || beats.length % 2 === 1) return false;
  const middle = beats.slice(0, beats.length / 2).reduce((sum, beat) => sum + beat, 0);
  return tickInBar === middle;
}

/**
 * The notes of one piece, with the bass note of its chord at `root`. Where the
 * chord is struck the first note is that bass note, even if the figure rests
 * there (BA-01).
 */
export function lineOf(
  piece: Piece,
  line: BassLine,
  tier: Tier,
  root: number,
  rng: Rng,
): LineNote[] {
  const { chord, scale, bar } = piece;
  if (chord === null || scale === null) return [];
  const from = piece.start - bar.start;
  const to = piece.end - bar.start;
  const figure = onsets(line, tier, bar, rng);
  const inside: Onset[] = figure.notes
    .filter((onset) => onset.tick >= from && onset.tick < to)
    .map((onset) => ({ ...onset, space: Math.min(onset.space, to - onset.tick) }));
  if (piece.struck && inside[0]?.tick !== from) {
    inside.unshift({ tick: from, space: (inside[0]?.tick ?? to) - from, echo: false });
  }

  const sequence = sequenceFor(line.tones, chord, scale);
  // Played plainly, the sequence is read straight through from its top in every bar: in
  // three that is the box's way up, in five it carries on over the top (R 3 5 6 b7).
  const tones = figure.plain
    ? sequence.bars.flat()
    : (sequence.bars[piece.cycle % sequence.bars.length] ?? []);
  const notes: LineNote[] = [];
  let count = 0;
  let pitch = root;
  inside.forEach((onset, i) => {
    // A re-strike needs a note to repeat: the first note of a piece is always a tone.
    const echo = onset.echo && i > 0;
    const arrival = piece.struck && i === 0;
    if (!echo) {
      const tone = arrival ? "R" : (tones[count % tones.length] ?? "R");
      pitch = tonePitch(tone, chord, scale, root, line.ceiling);
      if (onset.space >= HELD && !isChordTone(chord, pitch)) {
        pitch = tonePitch("5", chord, scale, root, line.ceiling);
      }
      count++;
    }
    notes.push({
      tick: bar.start + onset.tick,
      space: onset.space,
      pitch,
      echo,
      level: echo
        ? "restrike"
        : arrival
          ? "arrival"
          : isStrong(bar, onset.tick)
            ? "strong"
            : "weak",
    });
  });
  return notes;
}

/** Write a piece's notes down: straight grid, written levels. The feel pass does the rest. */
export function write(notes: readonly LineNote[], piece: Piece, line: BassLine): WrittenNote[] {
  const written: WrittenNote[] = [];
  notes.forEach((note, i) => {
    if (note.space < SHORTEST && !note.exact) return;
    const share = note.echo
      ? line.length.short
      : notes[i + 1]?.echo
        ? line.length.long
        : line.length.note;
    // One voice: a note never rings into the next.
    const duration = note.exact?.duration ?? Math.min(note.space, Math.round(note.space * share));
    const velocity = note.exact?.velocity ?? line.velocity[note.level];
    written.push({
      seat: "bass",
      bar: piece.bar.index,
      tick: note.tick,
      duration: Math.max(SHORTEST, duration),
      pitch: note.pitch,
      velocity: Math.min(127, Math.max(1, Math.round(velocity))),
    });
  });
  return written;
}
