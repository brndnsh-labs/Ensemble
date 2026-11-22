// The line itself: a rhythm figure laid over one piece of a bar, with its tones
// fitted to the chord. The tones are the sequence's, or the figure's own where
// it names them (a riff, with its dead notes); a turn may be laid over the end
// of the bar, and a line that follows the kick puts a root under each one the
// figure leaves alone. A walked line takes its rhythm here and its pitches
// from `walking.ts`.

import { PPQ } from "../../chart/types.ts";
import { cells, STEP } from "../../perform/grid.ts";
import type { WrittenNote } from "../../perform/notes.ts";
import { heldRng } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { Rng } from "../../rng.ts";
import type { Tier } from "../../style/types.ts";
import type { Piece } from "./form.ts";
import { pulses } from "./form.ts";
import type { BassLine, Figure, LineShape, Tone, ToneSequence } from "./style.ts";
import { DEAD_NOTE, RIFF_TONES } from "./style.ts";
import { isChordTone, LOW_E, remember, sequenceFor, tonePitch } from "./tones.ts";

/** Which of a sequence's shapes a piece plays. Given nothing, the first. */
export type ShapeChoice = (sequence: ToneSequence, index: number) => LineShape;

/** No bass note is shorter than half a sixteenth (BA-14). */
export const SHORTEST = STEP / 2;
/** A note given this much room or more is a held note, and a held note is a chord tone (BA-15). */
export const HELD = PPQ * 2;

/** The name a dead note goes by, for a sampler that has the articulation (as the drums name a ghost stroke). */
export const DEAD_VOICE = "dead";

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
  /** A dead note: muted and struck, a thump where the pitch is written (BA-40). */
  dead?: boolean;
  /** A note of a walked line: made, not read from a shape. */
  walked?: boolean;
  /** A walked note that is not a tone of its chord: it passes. */
  passing?: boolean;
}

interface Onset {
  /** Ticks from the barline. */
  readonly tick: number;
  readonly space: number;
  readonly echo: boolean;
  /** The tone the figure names here. Without one, the next tone of the line's sequence. */
  readonly tone?: Tone;
  readonly dead?: boolean;
  /** The tone is taken under the root where the instrument has it. */
  readonly under?: boolean;
  /** The tone is taken in the octave nearest the note before it. */
  readonly near?: boolean;
}

/** What a piece is played with beyond its line: the plan's turn, and the drummer's kicks. */
export interface Played {
  /** The figure laid over the end of the bar, where the phrase turns here. */
  readonly turn?: Figure | null;
  /** Where the kicks the bass can lock to fall in this bar, in ticks from the barline (BA-13). */
  readonly kicks?: readonly number[];
}

/** A grid's strokes: where each note falls, how long the figure writes it, and what it names. */
function strokesOf(grid: readonly string[], from = 0, figure?: Figure): Onset[] {
  const notes: Onset[] = [];
  const under = figure?.under === true;
  const near = figure?.near === true;
  grid.forEach((symbol, step) => {
    const named = RIFF_TONES[symbol];
    const tone = named === "b7" && figure?.seventh === "own" ? "7" : named;
    if (symbol !== "x" && symbol !== "o" && symbol !== DEAD_NOTE && !tone) return;
    let length = 1;
    while (grid[step + length] === "-") length++;
    notes.push({
      tick: from + step * STEP,
      space: length * STEP,
      echo: symbol === "o",
      ...(tone ? { tone } : {}),
      // A named tone, or an `x`'s tone of the sequence: either is taken under the root.
      ...(under && symbol !== "o" && symbol !== DEAD_NOTE ? { under: true } : {}),
      ...(tone && tone !== "8" && near ? { near: true } : {}),
      ...(symbol === DEAD_NOTE ? { dead: true } : {}),
    });
  });
  return notes;
}

/** A bar's strokes with a turn laid over its end: the figure plays up to the turn and no further. */
function turned(notes: readonly Onset[], turn: Figure, bar: PlanBar): Onset[] {
  const grid = cells(turn.grid);
  const from = bar.ticks - grid.length * STEP;
  const kept = notes
    .filter((onset) => onset.tick < from)
    .map((onset) => ({ ...onset, space: Math.min(onset.space, from - onset.tick) }));
  return [...kept, ...strokesOf(grid, from, turn)];
}

type Onsets = { readonly notes: readonly Onset[]; readonly plain: boolean };

/** A bar's onsets, worked out once for each line and bar of a take (its generator). */
const ONSETS = new WeakMap<Rng, WeakMap<BassLine, Map<number, Onsets>>>();

/** Where this bar's notes fall, and whether the bar is played plainly (a meter the line is not written for, BA-16). */
function onsets(line: BassLine, tier: Tier, bar: PlanBar, rng: Rng): Onsets {
  const byLine = remember(ONSETS, rng, () => new WeakMap<BassLine, Map<number, Onsets>>());
  const byBar = remember(byLine, line, () => new Map<number, Onsets>());
  return remember(byBar, bar.index, () => onsetsOf(line, tier, bar, rng));
}

function onsetsOf(line: BassLine, tier: Tier, bar: PlanBar, rng: Rng): Onsets {
  const beats = pulses(bar);
  // A figure is a bar: the line is written for this bar if its figures are as long as it is.
  const steps = Math.round(bar.ticks / STEP);
  const figures = line.figures.options.filter(
    (figure) => figure.weight > 0 && cells(figure.grid).length === steps,
  );
  if (figures.length > 0) {
    // The figure is chosen whole and kept: a section keeps its lope (X-A-29, X-A-31).
    const held = heldRng(rng, `figure:${line.figures.draw ?? tier}`, line.figures.hold, bar);
    const figure = held.weighted(figures, (option) => option.weight);
    return { notes: strokesOf(cells(figure.grid), 0, figure), plain: false };
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
export function isStrong(bar: PlanBar, tickInBar: number): boolean {
  if (tickInBar === 0) return true;
  const beats = pulses(bar);
  if (beats.length < 4 || beats.length % 2 === 1) return false;
  const middle = beats.slice(0, beats.length / 2).reduce((sum, beat) => sum + beat, 0);
  return tickInBar === middle;
}

/** Whether a tick from the barline is the start of one of the bar's pulses. */
function onPulse(bar: PlanBar, tickInBar: number): boolean {
  let at = 0;
  for (const beat of pulses(bar)) {
    if (at >= tickInBar) break;
    at += beat;
  }
  return at === tickInBar;
}

/** The turn a line would play in a bar: the one its section (or pass, or phrase) keeps. Null in a bar played plainly. */
export function turnOf(line: BassLine, tier: Tier, bar: PlanBar, rng: Rng): Figure | null {
  const turns = line.turns;
  if (!turns || onsets(line, tier, bar, rng).plain) return null;
  const options = turns.options.filter((turn) => turn.weight > 0);
  if (options.length === 0) return null;
  return heldRng(rng, `turn:${tier}`, turns.hold, bar).weighted(options, (turn) => turn.weight);
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
  choose?: ShapeChoice,
  played?: Played,
): LineNote[] {
  const { chord, scale, bar } = piece;
  if (chord === null || scale === null) return [];
  const from = piece.start - bar.start;
  const to = piece.end - bar.start;
  const figure = onsets(line, tier, bar, rng);
  const strokes =
    played?.turn && !figure.plain ? turned(figure.notes, played.turn, bar) : figure.notes;
  let inside: Onset[] = strokes
    .filter((onset) => onset.tick >= from && onset.tick < to)
    .map((onset) => ({ ...onset, space: Math.min(onset.space, to - onset.tick) }));
  // A riff that keeps its hole on the One states a chord arriving at the barline with its
  // own first note in the bar (ST-reggae-14).
  const holeKept = line.keepsHole === true && from === 0 && inside.length > 0 && !figure.plain;
  if (piece.struck && inside[0]?.tick !== from && !holeKept) {
    inside.unshift({ tick: from, space: (inside[0]?.tick ?? to) - from, echo: false });
  }
  // The kick is a floor under the figure (BA-94): a root where the drummer's foot falls
  // and the figure says nothing, and the note before it makes way. A line that follows
  // only the kick on the One plays it for a beat at most, and the figure's notes inside
  // that beat give way (BA-47).
  const onlyOne = line.followsKick === "one";
  const kicks = line.followsKick
    ? (played?.kicks ?? []).filter((tick) => !onlyOne || tick === 0)
    : [];
  const added = kicks.filter(
    (tick) => tick >= from && tick < to && !inside.some((onset) => onset.tick === tick),
  );
  if (onlyOne && added.length > 0) {
    const beat = pulses(bar)[0] ?? PPQ;
    inside = inside.filter((onset) => onset.tick <= 0 || onset.tick >= beat);
  }
  const gap = line.length.gap;
  if (added.length > 0 || gap !== undefined) {
    const locked = new Set(added);
    const all = [
      ...inside,
      ...added.map((tick): Onset => ({ tick, space: 0, echo: false, tone: "R" })),
    ].sort((a, b) => a.tick - b.tick);
    inside = all.map((onset, i) => {
      const room = (all[i + 1]?.tick ?? to) - onset.tick;
      // With a gap the figure's rests are not written lengths: a note has until the next.
      const whole = gap !== undefined || locked.has(onset.tick);
      const space = whole ? room : Math.min(onset.space, room);
      return {
        ...onset,
        space: onlyOne && locked.has(onset.tick) ? Math.min(space, pulses(bar)[0] ?? PPQ) : space,
      };
    });
  }
  const offLevel = line.velocity.off !== undefined;

  const sequence = sequenceFor(line.tones, chord, scale);
  // A bar played plainly keeps to the first shape: the plain version of the style (BA-16).
  const shape = choose && !figure.plain ? choose(sequence, line.tones.indexOf(sequence)) : sequence;
  // Played plainly, the shape is read straight through from its top in every bar: in
  // three that is the box's way up, in five it carries on over the top (R 3 5 6 b7).
  const tones = figure.plain
    ? shape.bars.flat()
    : (shape.bars[piece.cycle % shape.bars.length] ?? []);
  const notes: LineNote[] = [];
  let count = 0;
  let pitch = root;
  inside.forEach((onset, i) => {
    // A re-strike needs a note to repeat: the first note of a piece is always a tone.
    const echo = onset.echo && i > 0;
    const arrival = piece.struck && i === 0;
    // A chord's arrival is its bass note, sounded, whatever the figure has there (BA-01).
    const dead = onset.dead === true && !arrival;
    if (!echo) {
      // A dead note is struck where the hand is: on the root.
      const own = dead ? "R" : onset.tone;
      const tone = arrival ? "R" : (own ?? tones[count % tones.length] ?? "R");
      const before = pitch;
      pitch = tonePitch(tone, chord, scale, root, line.ceiling);
      if (onset.near && !arrival) pitch = nearest(pitch, before, line.ceiling);
      if (onset.under && !arrival && pitch > root && pitch - 12 >= LOW_E) pitch -= 12;
      if (onset.space >= HELD && !isChordTone(chord, pitch)) {
        pitch = tonePitch("5", chord, scale, root, line.ceiling);
      }
      // A tone the figure names is not one of the sequence's.
      if (own === undefined) count++;
    }
    const note: LineNote = {
      tick: bar.start + onset.tick,
      space: onset.space,
      pitch,
      echo,
      level: echo
        ? "restrike"
        : arrival
          ? "arrival"
          : dead
            ? "dead"
            : !echo && onset.tone === "8" && line.velocity.octave !== undefined
              ? "octave"
              : isStrong(bar, onset.tick)
                ? "strong"
                : offLevel && !onPulse(bar, onset.tick)
                  ? "off"
                  : "weak",
    };
    if (dead) note.dead = true;
    notes.push(note);
  });
  return notes;
}

/** A pitch class in the octave nearest a note, inside the instrument and the line's ceiling. */
function nearest(pitch: number, to: number, ceiling: number): number {
  const options = [pitch - 24, pitch - 12, pitch, pitch + 12, pitch + 24].filter(
    (option) => option >= LOW_E && option <= ceiling,
  );
  if (options.length === 0) return pitch;
  return options.reduce((best, option) =>
    Math.abs(option - to) < Math.abs(best - to) ? option : best,
  );
}

/** A level as the line writes it: a note between the pulses is a weak one, and a dead note as quiet as a re-strike, unless the line says otherwise. */
function levelOf(line: BassLine, level: LineNote["level"]): number {
  const levels = line.velocity;
  if (level === "off") return levels.off ?? levels.weak;
  if (level === "dead") return levels.dead ?? levels.restrike;
  if (level === "octave") return levels.octave ?? levels.weak;
  return levels[level];
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
    // A gap is as much of the space as counts toward the note's length (ST-funk-18).
    const gap = line.length.gap;
    const room = gap === undefined ? note.space : Math.min(note.space, gap * STEP);
    // One voice: a note never rings into the next. A dead note is as short as a note gets.
    const duration =
      note.exact?.duration ??
      (note.dead ? SHORTEST : Math.min(note.space, Math.round(room * share)));
    const velocity = note.exact?.velocity ?? levelOf(line, note.level);
    written.push({
      seat: "bass",
      bar: piece.bar.index,
      tick: note.tick,
      duration: Math.max(SHORTEST, duration),
      pitch: note.pitch,
      velocity: Math.min(127, Math.max(1, Math.round(velocity))),
      ...(note.dead ? { voice: DEAD_VOICE } : {}),
    });
  });
  return written;
}
