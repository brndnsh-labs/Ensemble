// What a recipe says about a pack: which recordings go in, how they are laid
// out in voices, layers and zones, and the numbers a listener will want to tune.
// The recipes are in `recipes/`; `cut.ts` turns one into a pack.

import type { PackLevel } from "../../packages/audio/src/pack.ts";
import type { SfzRegion } from "./sfz.ts";
import { velocities } from "./sfz.ts";

/** One source file going into a take, at a gain, from a point in it. */
export interface Part {
  readonly file: string;
  /** Gain in dB before the parts are added. */
  readonly db: number;
  /** Samples of the source file to skip, at the file's own rate (an SFZ `offset`). */
  readonly offset?: number;
}

export interface Take {
  /** Mixed sample by sample, keeping their timing as the source has it. */
  readonly parts: readonly Part[];
  /** The pitch the mapping gives the recording, as a MIDI number (with any `tune`). */
  readonly mapped?: number;
  /** Seconds the take may last at most. */
  readonly cap: number;
  /** Semitones to move the pitch by resampling when it is cut (the mid tom). */
  readonly shift?: number;
}

export interface Zone {
  readonly takes: readonly Take[];
}

export interface Layer {
  readonly top: number;
  readonly zones: readonly Zone[];
}

export interface Voice {
  readonly name: string;
  readonly layers: readonly Layer[];
  readonly trim?: number;
  readonly pan?: number;
  readonly oneShot?: boolean;
  readonly release?: number;
  readonly chokes?: readonly string[];
}

export interface Recipe {
  readonly id: string;
  readonly name: string;
  /** The folder under `.sources/`. */
  readonly source: string;
  readonly channels: 1;
  /** Opus bit rate. */
  readonly kbps: number;
  readonly level: PackLevel;
  /**
   * Where a take starts: the first sample within this many dB of its peak.
   * -50 unless a source's files open on noise that close to the peak.
   */
  readonly onsetDb?: number;
  /** Gain in dB for each channel when a stereo file is folded to mono. */
  readonly foldDb: number;
  /** Decoded size the pack must stay under, in MB of 32-bit floats. */
  readonly budgetMB: number;
  /**
   * Measure each take's pitch from the audio, starting `skip` seconds after the
   * onset, over `seconds`. Absent: the root is what the mapping says.
   */
  readonly roots?: { readonly skip: number; readonly seconds: number };
  /** Compare each stereo take's mono fold with its two channels, band by band. */
  readonly monoCheck?: boolean;
  /** What was done to the recordings, for `credit.changes`. */
  readonly changes: string;
  /** Reads the source's mappings and lays out the voices. */
  readonly voices: (dir: string) => readonly Voice[];
}

/** A length cap that falls in a straight line from the lowest note to the highest. */
export function capByNote(
  note: number,
  low: readonly [note: number, seconds: number],
  high: readonly [note: number, seconds: number],
): number {
  const t = Math.min(1, Math.max(0, (note - low[0]) / (high[0] - low[0])));
  return low[1] + t * (high[1] - low[1]);
}

/** Regions grouped by velocity range, softest first. */
export function byVelocity(regions: readonly SfzRegion[]): SfzRegion[][] {
  const groups = new Map<string, SfzRegion[]>();
  for (const r of regions) {
    const v = velocities(r);
    const key = `${String(v.lo).padStart(3, "0")}-${v.hi}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return [...groups.keys()].sort().map((k) => groups.get(k)!);
}

/** How far a velocity range sits from a layer's top: 0 when it holds it. */
function distance(group: readonly SfzRegion[], top: number): number {
  const v = velocities(group[0]!);
  return top < v.lo ? v.lo - top : top > v.hi ? top - v.hi : 0;
}

/**
 * Picks source layers for a pack's layer tops. With no more source layers
 * than tops, each source layer goes to the top nearest its own highest
 * velocity. With more, each top takes the source layer whose range is nearest
 * it. Either way, a layer comes back with up to `alternates` recordings: its
 * own alternates if it has them, or else other source layers recorded within
 * the velocities the layer plays, nearest its top first: in a library recorded
 * at many velocities and no alternates, those are the neighbouring hits. No
 * recording is in two layers. `alternates` may differ by layer: it is given the layer's
 * index and the number of layers.
 */
export function pickLayers(
  groups: readonly (readonly SfzRegion[])[],
  tops: readonly number[],
  alternates: number | ((layer: number, layers: number) => number),
): { top: number; regions: SfzRegion[] }[] {
  const count = (i: number, n: number) =>
    typeof alternates === "number" ? alternates : alternates(i, n);
  if (groups.length <= tops.length) {
    const free = tops.slice(0, -1);
    const picked = groups.map((g, i) => {
      const hi = velocities(g[0]!).hi;
      let top = 127;
      if (i < groups.length - 1) {
        top = free.reduce((a, b) => (Math.abs(b - hi) < Math.abs(a - hi) ? b : a));
        free.splice(free.indexOf(top), 1);
      }
      return { top, regions: g.slice(0, count(i, groups.length)) };
    });
    if (picked.some((p, i) => i > 0 && p.top <= picked[i - 1]!.top)) {
      throw new Error(`layer tops out of order: ${picked.map((p) => p.top).join(", ")}`);
    }
    return picked;
  }
  // Each top first takes the source layer nearest it.
  const rank = (top: number) =>
    groups.map((g, i) => ({ g, i, d: distance(g, top) })).sort((a, b) => a.d - b.d || a.i - b.i);
  const primary = tops.map((top) => rank(top)[0]!);
  const used = new Set(primary.map((p) => p.i));
  if (used.size < tops.length) throw new Error(`two layer tops share a source layer`);
  return tops.map((top, layer) => {
    const n = count(layer, tops.length);
    const first = primary[layer]!;
    if (first.g.length > 1) return { top, regions: first.g.slice(0, n) };
    // Then hits recorded within the velocities this layer plays, nearest its top.
    const floor = layer === 0 ? 0 : tops[layer - 1]!;
    const chosen = [first];
    for (const c of rank(top)) {
      if (chosen.length >= n) break;
      const v = velocities(c.g[0]!);
      if (used.has(c.i) || v.lo > top || v.hi <= floor) continue;
      used.add(c.i);
      chosen.push(c);
    }
    chosen.sort((a, b) => a.i - b.i);
    return { top, regions: chosen.flatMap((c) => c.g) };
  });
}
