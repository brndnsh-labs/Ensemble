// Reading a take the way a listener meets it: notes in order, bars of music,
// and the moments where the harmony moves.

import type { ChartChord } from "../chart/types.ts";
import type { NoteEvent } from "../perform/notes.ts";
import type { PlanBar } from "../plan/types.ts";
import type { Seat } from "../style/types.ts";
import type { Take } from "../take.ts";
import { pitchClass } from "../theory/pitch.ts";

/** A seat's notes in the order they sound. */
export function notesOf(take: Take, seat: Seat): NoteEvent[] {
  return take.events.filter(
    (event): event is NoteEvent => event.kind === "note" && event.seat === seat,
  );
}

/** The bars the band plays: no count-in, no tail. */
export function musicBars(take: Take): PlanBar[] {
  return take.plan.bars.filter((bar) => bar.kind === "music");
}

/** A seat's notes that start in a bar. */
export function notesIn(notes: readonly NoteEvent[], bar: PlanBar): NoteEvent[] {
  return notes.filter((note) => note.tick >= bar.start && note.tick < bar.start + bar.ticks);
}

export interface Change {
  readonly tick: number;
  readonly chord: ChartChord;
  /** Pitch class of the note the bass owes: the slash note, or the root. */
  readonly bass: number;
  readonly bar: PlanBar;
}

/** Every place the harmony's bass note changes. A chord restated is not a change. */
export function bassChanges(take: Take): Change[] {
  const changes: Change[] = [];
  let sounding = -1;
  for (const bar of musicBars(take)) {
    for (const span of bar.spans) {
      if (span.tied) continue;
      const chord = span.chord;
      const bass = chord ? pitchClass(chord.bass ?? chord.root) : -1;
      if (chord && sounding >= 0 && bass !== sounding) {
        changes.push({ tick: bar.start + span.start, chord, bass, bar });
      }
      sounding = bass;
    }
  }
  return changes;
}

/** The bar a tick falls in. */
export function barAt(take: Take, tick: number): PlanBar | undefined {
  return take.plan.bars.findLast((candidate) => candidate.start <= tick);
}

/** The chord written under a tick, or null under a rest or outside the music. */
export function chordAt(take: Take, tick: number): ChartChord | null {
  const bar = take.plan.bars.findLast((candidate) => candidate.start <= tick);
  if (bar?.kind !== "music") return null;
  const span = bar.spans.findLast((candidate) => bar.start + candidate.start <= tick);
  return span?.chord ?? null;
}

export const share = (hits: number, cases: number) =>
  cases === 0 ? null : { value: hits / cases, cases };

export const mean = (values: readonly number[]) =>
  values.length === 0
    ? null
    : { value: values.reduce((sum, v) => sum + v, 0) / values.length, cases: values.length };
