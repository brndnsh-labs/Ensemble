// Playing a phrase around the soloist (CH-68 to CH-71). The comper has drawn
// its plans for the phrase as always; where the soloist has the lead, each
// plan can also be played three more ways, and the critic hears them all:
//
// - laid out: what would come down under a sounding note of the line is left
//   out, except a chord's first strike in a bar and a push, so every chord is
//   still struck and the time is still kept (CH-34, CH-69);
// - laid out and answering: the same, and in the soloist's breaths the hand
//   speaks: what the figure already plays there a little harder, and one stab
//   in a breath the figure leaves empty (CH-71);
// - playing through: the plan as written, answering the breaths the same way.
//   A blues comp's figure already has a strike in nearly every breath (chops
//   two beats apart, breaths most often a bar long), so under a sparse line
//   the conversation is in the answers, not in what is left out (KF-B-35).
//
// Nothing here is drawn at random. Which way is played is the critic's call
// for the whole phrase, so the hand that lays out under a busy line and plays
// through a sparse one does so because of what the line is, not a coin.

import { PPQ } from "../../chart/types.ts";
import { STEP } from "../../perform/grid.ts";
import type { PlanBar } from "../../plan/types.ts";
import { EIGHTH } from "./bar.ts";
import type { Breath, LineNote } from "./line.ts";
import { breathsOf, sixteenths, soundsAt } from "./line.ts";
import type { Stretch } from "./plain.ts";
import type { Strike } from "./strike.ts";
import type { Listening } from "./style.ts";

/** What a phrase of comping hears of the soloist while it is being chosen. */
export interface Hearing {
  /** The soloist's notes, as far as the phrase hears them. */
  readonly line: readonly LineNote[];
  /**
   * The breaths that are the phrase's to answer: those that have lasted a
   * dotted quarter (the style's breath) by a tick inside the phrase, heard up
   * to its last barline.
   */
  readonly breaths: readonly Breath[];
  /** Strikes already played just before the phrase, which a breath may hold. */
  readonly before: readonly Strike[];
}

/** The ways a plan may be played. The first is always the plan as written. */
export type WayName = "as written" | "laid out" | "answering" | "playing through";

export interface Way {
  readonly name: WayName;
  readonly strikes: readonly Strike[];
}

/** What the comper knows of the bars of a phrase, to place an answer in them. */
export interface PhraseHarmony {
  /** The bar's harmony, a stretch per chord. */
  readonly own: (bar: PlanBar) => readonly Stretch[];
  /** Whether the next bar opens on a different chord. */
  readonly changesAfter: (bar: PlanBar) => boolean;
  /** How much of a chord's written length a strike may ring. */
  readonly hold: number;
  /** The voicing kind the hand plays in a bar, for a stab in a bar where the figure struck nothing. */
  readonly kind: (bar: PlanBar) => string;
}

/** What the phrase hears: the line up to its last barline, and the breaths that become breaths inside it. */
export function hear(
  bars: readonly PlanBar[],
  all: readonly PlanBar[],
  line: readonly LineNote[],
  listening: Listening,
  played: readonly Strike[],
): Hearing {
  const from = bars[0]!.start;
  const to = bars.at(-1)!.start + bars.at(-1)!.ticks;
  const shortest = sixteenths(listening.breath);
  // A breath reaches back at most through the bar before the one the soloist let go in.
  const reach = from - 3 * 4 * PPQ;
  const heard = line.filter((note) => note.ends > reach && note.tick < to);
  const breaths = breathsOf(all, heard, shortest, to).filter(
    (breath) => breath.from + shortest > from && breath.from + shortest <= to,
  );
  const before = played.filter((strike) => strike.tick >= reach && strike.tick < from);
  return { line: heard, breaths, before };
}

/** Whether a strike comes down while the soloist is sounding a note. */
export function underTheLine(strike: Strike, line: readonly LineNote[]): boolean {
  return line.some((note) => soundsAt(note, strike.tick));
}

/** Whether a tick falls in a breath. */
export const inBreath = (breath: Breath, tick: number) => breath.from <= tick && tick < breath.to;

/**
 * The plan laid out under the line: a strike that comes down under a sounding
 * note is left out, unless it is a push or the first strike of its chord in
 * its bar (CH-69). That floor of one strike per chord a bar is all this way
 * keeps; the critic keeps the time (CH-70), by what the energy asks and by
 * what a bar laid out below it costs (`thinned`).
 */
export function layOut(strikes: readonly Strike[], line: readonly LineNote[]): Strike[] {
  const first = new Set<string>();
  return strikes.filter((strike) => {
    const chord = `${strike.bar} ${strike.arrival.index}`;
    const opens = !first.has(chord);
    first.add(chord);
    const push = strike.arrival.tick > strike.tick;
    return opens || push || !underTheLine(strike, line);
  });
}

/**
 * The phrase answering the soloist's breaths (CH-71). What the hand already
 * plays inside a breath is played harder by the style's lift. A breath it
 * leaves empty gets one stab, on the first "and" that is:
 *
 * - at least an eighth after the soloist lets go, and done before it comes back in;
 * - a quarter note clear of every other strike (an "and" straight after a
 *   struck beat is a stutter, not an answer), and so never in a beat cleared
 *   for a push (KF-B-27);
 * - not in the eighth before a change of chord, which belongs to the chord coming;
 * - not in the phrase's last eighth, where the soloist may be coming back in on
 *   the next downbeat and the phrase cannot yet hear it.
 *
 * The stab is an eighth long at most, at the style's written level.
 */
export function answer(
  strikes: readonly Strike[],
  bars: readonly PlanBar[],
  hearing: Hearing,
  listening: Listening,
  harmony: PhraseHarmony,
): Strike[] {
  const lifted = strikes.map(
    (strike): Strike =>
      hearing.breaths.some((breath) => inBreath(breath, strike.tick))
        ? { ...strike, velocity: Math.min(127, strike.velocity + listening.lift), answers: true }
        : strike,
  );
  const placed = [...hearing.before, ...lifted];
  const stabs: Strike[] = [];
  const end = bars.at(-1)!.start + bars.at(-1)!.ticks;
  for (const breath of hearing.breaths) {
    if (placed.some((strike) => inBreath(breath, strike.tick))) continue;
    const stab = stabIn(breath, bars, end, placed, listening, harmony);
    if (stab) {
      stabs.push(stab);
      placed.push(stab);
    }
  }
  return [...lifted, ...stabs].sort((a, b) => a.tick - b.tick);
}

function stabIn(
  breath: Breath,
  bars: readonly PlanBar[],
  end: number,
  placed: readonly Strike[],
  listening: Listening,
  harmony: PhraseHarmony,
): Strike | null {
  for (const bar of bars) {
    const barEnd = bar.start + bar.ticks;
    if (barEnd <= breath.from || bar.start >= breath.to) continue;
    const own = harmony.own(bar);
    const kind = placed.find((strike) => strike.bar === bar.index)?.kind ?? harmony.kind(bar);
    for (let tick = bar.start + EIGHTH; tick < barEnd; tick += PPQ) {
      if (tick < breath.from + EIGHTH || tick >= breath.to) continue;
      // Not in the eighth before the soloist comes back in: the stab would still be sounding
      // as the line enters, and an answer that steps on the next phrase is not an answer.
      if (breath.back && tick + EIGHTH >= breath.to) continue;
      if (tick >= end - EIGHTH) return null;
      if (placed.some((strike) => Math.abs(strike.tick - tick) < PPQ)) continue;
      const at = own.findIndex((stretch) => stretch.start <= tick && tick < stretch.end);
      const stretch = own[at];
      if (!stretch?.chord) continue;
      if (tick + EIGHTH >= stretch.end) {
        const next = own[at + 1];
        const changes = next ? next.chord !== null : harmony.changesAfter(bar);
        if (changes) continue;
      }
      const length = Math.min(
        listening.answer.steps * STEP,
        Math.round((stretch.end - tick) * harmony.hold),
      );
      return {
        bar: bar.index,
        tick,
        duration: Math.max(1, length),
        velocity: listening.answer.level,
        arrival: stretch.arrival,
        kind,
        answers: true,
      };
    }
  }
  return null;
}

/** A strike list as music, to tell two ways that come out the same. */
const sound = (strikes: readonly Strike[]) =>
  strikes
    .map((strike) => strike.tick * 128 + strike.velocity)
    .sort((a, b) => a - b)
    .join(" ");

/**
 * Every way of playing a plan around the soloist, the plan as written first.
 * A way that comes out the same as one before it is not offered twice.
 */
export function waysOf(
  written: readonly Strike[],
  bars: readonly PlanBar[],
  hearing: Hearing | null,
  listening: Listening | null,
  harmony: PhraseHarmony,
): Way[] {
  const ways: Way[] = [{ name: "as written", strikes: written }];
  if (!hearing || !listening) return ways;
  const heard = new Set([sound(written)]);
  const offer = (name: WayName, strikes: readonly Strike[], key = sound(strikes)) => {
    if (heard.has(key)) return;
    heard.add(key);
    ways.push({ name, strikes });
  };
  const laid = layOut(
    [...written].sort((a, b) => a.tick - b.tick),
    hearing.line,
  );
  // The ways that talk before the one that only leans back, and the one with less under the
  // line first: where the critic cannot tell two apart, a tie goes to the earlier.
  const answered = answer(laid, bars, hearing, listening, harmony);
  const [answeredKey, laidKey] = [sound(answered), sound(laid)];
  if (answeredKey !== laidKey) offer("answering", answered, answeredKey);
  offer("playing through", answer(written, bars, hearing, listening, harmony));
  offer("laid out", laid, laidKey);
  return ways;
}
