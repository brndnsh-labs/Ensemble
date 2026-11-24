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
  /** Damped from its onset: at full for `hold` seconds, then 60 dB down over `decay`, then silent. */
  readonly damp?: { readonly hold: number; readonly decay: number };
  /** The beater's click brought up: everything over `hz` lifted by `db` (a high shelf). */
  readonly click?: { readonly hz: number; readonly db: number };
  /** In a pack with an amp: how hard this take drives it, as a multiple of the amp's drive. Default 1. */
  readonly push?: number;
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
  /**
   * False: each zone's root is the pitch the recipe gives its takes (`mapped`),
   * not one measured from the audio, though the recipe measures roots. For a
   * sound whose pitch is not the note's: a bass's ghost note, a muted stroke.
   */
  readonly measureRoots?: false;
  /**
   * This voice's own level, in place of the pack's. For strokes too short for
   * a loudness to mean much: a loudness is read over 400 ms, and a 90 ms
   * stroke brought up to it comes out far over full scale.
   */
  readonly level?: PackLevel;
}

/** One source library a pack draws on, and what was done to its recordings. */
export interface Credit {
  /** The folder under `.sources/`. */
  readonly source: string;
  /** What was done to the recordings, and which voices they are, for the pack's credit. */
  readonly changes: string;
}

/** An amplifier the takes are played through before they are levelled (`amp.ts`). */
export interface Amp {
  /** Hz. The guitar is thinned below this before the clip, or the low strings turn to mud. */
  readonly lowCut: number;
  /** A take at full scale is multiplied by this before the soft clip: the main knob. */
  readonly drive: number;
  /** Added before the clip and taken out after: an uneven clip, for warmth. */
  readonly bias: number;
  /** The speaker: where it rolls off, in Hz, and its peaks as frequency, dB and sharpness. */
  readonly speaker: {
    readonly rollOff: number;
    readonly peaks: readonly (readonly [hz: number, db: number, q: number])[];
  };
}

export interface Recipe {
  readonly id: string;
  readonly name: string;
  /** Every take goes through this amplifier. Mono packs only. */
  readonly amp?: Amp;
  /** The libraries the pack draws on, the one most of it is cut from first. */
  readonly credits: readonly Credit[];
  /**
   * 1: stereo sources are folded to mono. 2: a stereo source keeps its two
   * channels, cut and levelled alike; where it starts, where it ends and how
   * loud it is are still judged on the fold.
   */
  readonly channels: 1 | 2;
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
  /**
   * Reads the sources' mappings and lays out the voices. `dir` is the first
   * source's folder; `dirOf` gives the folder of any source the recipe credits.
   */
  readonly voices: (dir: string, dirOf: (source: string) => string) => readonly Voice[];
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
