// What the comper hears of the soloist: the notes of the line on the straight
// grid, where they sound over a strike, how low the line sits in a bar, and
// where it breathes. The soloist plays first and cannot hear the piano; the
// piano hears everything it wrote.
//
// The comper hears up to where it is deciding and no further: a phrase of
// comping is chosen from the line up to the phrase's last barline, and a
// strike is voiced from the line inside its own bar. That is what keeps an
// open jam unchanged when a pass is added after it: the line past the last
// barline is not there to be heard until it is played.

import { PPQ } from "../../chart/types.ts";
import type { Heard } from "../../perform/notes.ts";
import type { Plan, PlanBar } from "../../plan/types.ts";
import type { Strike } from "./strike.ts";

/** A soloist's note as the comper hears it. */
export interface LineNote {
  /** Absolute tick on the straight grid. */
  readonly tick: number;
  /** Where it stops sounding. */
  readonly ends: number;
  readonly pitch: number;
}

/** The soloist's notes in the order they start (or another seat's). Empty when nobody solos. */
export function lineOf(heard: Heard, seat: "solo" | "bass" = "solo"): LineNote[] {
  return (heard[seat] ?? [])
    .flat()
    .map((note) => ({ tick: note.tick, ends: note.tick + note.duration, pitch: note.pitch }))
    .sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
}

/** Whether a note is sounding at a tick. */
export const soundsAt = (note: LineNote, tick: number) => note.tick <= tick && tick < note.ends;

/** A soloist's note over a strike: its pitch, and how much of the strike's sounding time it fills. */
export interface Over {
  readonly pitch: number;
  /** Ticks of the strike's sounding time the note fills. */
  readonly ticks: number;
}

/** What one strike hears of the line. */
export interface StrikeLine {
  /** How long the strike sounds inside its own bar, in ticks. */
  readonly length: number;
  /** The soloist's notes sounding while it does. */
  readonly over: readonly Over[];
  /**
   * The lowest pitch the soloist sounds in the strike's bar or the bar before
   * it: the register the hand keeps out of. Judged by the bar, not the strike,
   * so the hand settles under a phrase and comes back up only after a bar of
   * silence (CH-65). Null when the line is silent through both bars.
   */
  readonly lowest: number | null;
  /**
   * The highest bass note sounding as the strike comes down: the floor of the
   * room the hand makes. A hand pressed down under the line must not crowd it.
   */
  readonly bass: number | null;
}

/**
 * What each strike hears of the line, in the order of the strikes, which are
 * sorted by tick. A strike sounds until the next one cuts it (one hand, CH-35),
 * and is judged only inside its own bar. Null where it hears nothing.
 */
export function strikeLines(
  strikes: readonly Strike[],
  plan: Plan,
  line: readonly LineNote[],
  bass: readonly LineNote[],
): (StrikeLine | null)[] {
  if (line.length === 0) return strikes.map(() => null);
  const lowest = lowestByBar(plan, line);
  // Every note before `first` has stopped sounding by the strike in hand: strikes come in order.
  const ended: number[] = [];
  for (const [i, note] of line.entries())
    ended.push(Math.max(ended[i - 1] ?? -Infinity, note.ends));
  let first = 0;
  let next = 0;
  let low = 0;
  return strikes.map((strike) => {
    const bar = plan.bars[strike.bar];
    if (!bar) return null;
    while (next < strikes.length && strikes[next]!.tick <= strike.tick) next++;
    const ends = Math.min(
      strike.tick + strike.duration,
      strikes[next]?.tick ?? Infinity,
      bar.start + bar.ticks,
    );
    while (first < line.length && ended[first]! <= strike.tick) first++;
    const over: Over[] = [];
    for (let i = first; i < line.length && line[i]!.tick < ends; i++) {
      const note = line[i]!;
      const ticks = Math.min(note.ends, ends) - Math.max(note.tick, strike.tick);
      if (ticks > 0) over.push({ pitch: note.pitch, ticks });
    }
    const under = lowest.get(strike.bar) ?? null;
    if (over.length === 0 && under === null) return null;
    while (low < bass.length && bass[low]!.tick < strike.tick - BASS_HELD) low++;
    let floor: number | null = null;
    for (let i = low; i < bass.length && bass[i]!.tick <= strike.tick; i++) {
      if (soundsAt(bass[i]!, strike.tick)) floor = Math.max(floor ?? 0, bass[i]!.pitch);
    }
    return { length: Math.max(1, ends - strike.tick), over, lowest: under, bass: floor };
  });
}

/** Longer than any bass note is held: how far back a bass note still sounding may have started. */
const BASS_HELD = 4 * 4 * PPQ;

/** The lowest pitch the soloist sounds in each bar or the bar before it, by bar index. */
function lowestByBar(plan: Plan, line: readonly LineNote[]): Map<number, number> {
  const lowest = new Map<number, number>();
  const mark = (bar: number, pitch: number) =>
    lowest.set(bar, Math.min(lowest.get(bar) ?? Infinity, pitch));
  const bars = plan.bars;
  let at = 0;
  for (const note of line) {
    while (bars[at + 1] && bars[at + 1]!.start <= note.tick) at++;
    for (let b = at; bars[b] && bars[b]!.start < note.ends; b++) {
      mark(b, note.pitch);
      mark(b + 1, note.pitch);
    }
  }
  return lowest;
}

/** A silence of the soloist long enough to be answered (CH-71). */
export interface Breath {
  /** Where the soloist let go. */
  readonly from: number;
  /** Where it comes back in, or where the comper stops hearing. */
  readonly to: number;
  /** Whether the return is heard: `to` is the soloist's next note. */
  readonly back: boolean;
}

/**
 * The soloist's breaths heard up to a tick: each silence of `shortest` ticks
 * or more after a note, counted across a barline. A bar the soloist sits out
 * straight after playing is part of a breath, wherever in the next bar it
 * comes back; two whole bars of silence are a rest, the soloist laying out,
 * and not a breath at all (CH-71). A silence the comper cannot yet hear the
 * end of is a breath as far as it is heard, so long as it has not already run
 * on into a rest.
 */
export function breathsOf(
  bars: readonly PlanBar[],
  line: readonly LineNote[],
  shortest: number,
  heardTo: number,
): Breath[] {
  const breaths: Breath[] = [];
  // Where a silence that starts at a tick has become a rest: when the second whole bar after
  // the one the soloist let go in is over.
  const restAfter = (tick: number) => {
    const bar = bars.findLast((candidate) => candidate.start <= tick - 1);
    const rest = bar && bars[bar.index + 2];
    return rest ? rest.start + rest.ticks : Infinity;
  };
  let ends = -Infinity;
  for (let i = 0; i <= line.length; i++) {
    const note = line[i];
    const heard = note !== undefined && note.tick < heardTo;
    if (ends > -Infinity && ends < heardTo) {
      const to = heard ? note.tick : heardTo;
      if (to - ends >= shortest && to < restAfter(ends)) {
        breaths.push({ from: ends, to, back: heard });
      }
    }
    if (!heard) break;
    ends = Math.max(ends, note.ends);
  }
  return breaths.filter((breath) => breath.to > breath.from);
}

/** A sixteenth count as ticks. */
export const sixteenths = (count: number) => Math.round((count * PPQ) / 4);
