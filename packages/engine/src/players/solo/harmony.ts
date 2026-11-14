// The notes a line may use over each chord, and the questions a soloist asks
// of them: is this a chord tone, would it rub if held, what is the next note
// up. The pool is the chord's own tones, the key's notes the style plays
// over everything (the blues scale), and the chord's scale where the style
// follows the changes; so the soloist reads the same harmony as the bass and
// the comp (X-B-10).

import { PPQ } from "../../chart/types.ts";
import type { Arrival } from "../../perform/harmony.ts";
import { contextOf } from "../../perform/harmony.ts";
import type { ToneRole } from "../../theory/chord.ts";
import { chordTones } from "../../theory/chord.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import { chordScale } from "../../theory/scale.ts";
import type { SoloInstrument, SoloStyle } from "./style.ts";

export const EIGHTH = PPQ / 2;

export interface Pool {
  readonly arrival: Arrival;
  /** The chord's tones as pitch classes, with their roles. */
  readonly tones: readonly { readonly role: ToneRole; readonly pc: number }[];
  readonly chord: ReadonlySet<number>;
  /** Pitch classes that may only pass: never held, never on a beat. */
  readonly passing: ReadonlySet<number>;
  /** Every pitch of the pool on the instrument, low to high: the ladder a line walks. */
  readonly ladder: readonly number[];
}

export function poolOf(
  arrival: Arrival,
  harmony: readonly Arrival[],
  solo: SoloStyle,
  instrument: SoloInstrument,
): Pool | null {
  const chord = arrival.chord;
  if (!chord) return null;
  const root = pitchClass(chord.root);
  const tones = chordTones(chord.quality).map((tone) => ({
    role: tone.role,
    pc: mod12(root + tone.interval),
  }));
  const chordPcs = new Set(tones.map((tone) => tone.pc));
  const scale = chordScale(chord, contextOf(harmony, arrival));
  const inScale = new Set(scale.intervals.map((interval) => mod12(root + interval)));

  const all = new Set(chordPcs);
  if (solo.notes.chordScale) for (const pc of inScale) all.add(pc);
  const tonic = pitchClass(arrival.key.tonic);
  const over = mod12(root - tonic);
  for (const degree of solo.notes.key[arrival.key.mode]) {
    const pc = mod12(tonic + degree);
    // A blue note is blue only over the chords the style names; elsewhere it is a wrong
    // note held, unless the chord's own scale has it (SO-30).
    const blue = solo.notes.blue.find((note) => note.degree === degree);
    if (blue && !blue.over.includes(over) && !inScale.has(pc)) continue;
    all.add(pc);
  }
  const passing = new Set<number>();
  for (const extra of solo.notes.passing) {
    const pc = mod12(root + extra.interval);
    if (extra.scale !== scale.name || all.has(pc)) continue;
    all.add(pc);
    passing.add(pc);
  }

  const ladder: number[] = [];
  for (let pitch = instrument.range[0]; pitch <= instrument.range[1]; pitch++) {
    if (all.has(mod12(pitch))) ladder.push(pitch);
  }
  return { arrival, tones, chord: chordPcs, passing, ladder };
}

export const isChordTone = (pool: Pool, pitch: number): boolean => pool.chord.has(mod12(pitch));

/** A held note a half step from a chord tone, and not one itself, is a rub, not a colour (X-B-08). */
export const rubs = (pool: Pool, pitch: number): boolean =>
  !isChordTone(pool, pitch) && (isChordTone(pool, pitch + 1) || isChordTone(pool, pitch - 1));

/**
 * The chord's tones as pitch classes in a ranking's order, then whatever the
 * ranking left out. A 6th stands in for the 7th and a suspension for the 3rd
 * (X-B-09).
 */
export function ranked(pool: Pool, ranking: readonly ToneRole[]): number[] {
  const stand: Partial<Record<ToneRole, ToneRole>> = { third: "sus", seventh: "sixth" };
  const order: number[] = [];
  const add = (role: ToneRole | undefined) => {
    for (const tone of pool.tones) {
      if (tone.role === role && !order.includes(tone.pc)) order.push(tone.pc);
    }
  };
  for (const role of ranking) {
    const before = order.length;
    add(role);
    if (order.length === before) add(stand[role]);
  }
  for (const tone of pool.tones) if (!order.includes(tone.pc)) order.push(tone.pc);
  return order;
}

/** Where a pitch stands on the ladder: the rung nearest it (the lower of two equally near). */
export function rung(pool: Pool, pitch: number): number {
  let best = 0;
  for (let i = 1; i < pool.ladder.length; i++) {
    if (Math.abs(pool.ladder[i]! - pitch) < Math.abs(pool.ladder[best]! - pitch)) best = i;
  }
  return best;
}

/** The pitch a number of rungs up the ladder (or down), stopping at its ends. */
export function climb(pool: Pool, pitch: number, rungs: number): number {
  const at = Math.min(pool.ladder.length - 1, Math.max(0, rung(pool, pitch) + rungs));
  return pool.ladder[at]!;
}

/**
 * The chord tone nearest a pitch inside a window, best of a ranking: each
 * place down the ranking costs a semitone and a quarter, so a better tone wins
 * unless the next is more than a step closer (SO-21). Pitches in `not` are
 * passed over while anything else will do.
 */
export function landing(
  pool: Pool,
  ideal: number,
  ranking: readonly ToneRole[],
  low: number,
  high: number,
  not: readonly number[] = [],
): number {
  const order = ranked(pool, ranking);
  const [bottom, top] = [pool.ladder[0]!, pool.ladder[pool.ladder.length - 1]!];
  const search = (avoid: readonly number[], from: number, to: number): number | null => {
    let best: number | null = null;
    let least = Number.POSITIVE_INFINITY;
    for (let pitch = Math.max(from, bottom); pitch <= Math.min(to, top); pitch++) {
      const place = order.indexOf(mod12(pitch));
      if (place < 0 || avoid.includes(pitch)) continue;
      const cost = Math.abs(pitch - ideal) + 1.25 * place;
      if (cost < least) {
        least = cost;
        best = pitch;
      }
    }
    return best;
  };
  return (
    search(not, low, high) ??
    search([], low, high) ??
    search([], bottom, top) ??
    Math.min(top, Math.max(bottom, Math.round(ideal)))
  );
}
