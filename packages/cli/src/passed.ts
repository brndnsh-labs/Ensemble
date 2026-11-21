// What Brandon has passed by ear, as a range for each measure, and a change
// sorted against it.
//
// `scorecard/ear-cases.json` holds his verdicts, each with the commit that wrote
// his words down; the band he heard is the one before it, and its scorecard is
// in git. So each measure has a range over the bands he has passed, and a change
// either stays inside every range or takes some measure out of one. `ensemble
// ears` reports the ranges beside his verdicts; `ensemble score` sorts the change
// in hand. It reads git, so it wants the repository's history.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Baseline, BaselineLine } from "@ensemble/engine";
import { styleIds } from "@ensemble/styles";
import { UsageError } from "./command.ts";

export const CASES = "scorecard/ear-cases.json";

export type Kind = "passed" | "not-right" | "chose" | "left";

export interface EarCase {
  readonly id: string;
  /** The day he said it. */
  readonly date: string;
  /** His words, as written down at the time. */
  readonly words: string;
  /** True where the record gives his meaning in its own words, not his. */
  readonly reported?: boolean;
  /** Where they are written: a file and the section's heading. */
  readonly source: string;
  readonly seat: "soloist" | "bass" | "chords" | "drums" | "band" | "audio";
  /** Style ids, or "all". */
  readonly styles: readonly string[];
  readonly kind: Kind;
  /** Whether the notes carry what he judged, or only the sound does. */
  readonly medium: "notes" | "sound";
  readonly heard: string;
  /** The commit that wrote his words down. The band he heard is the one before it. */
  readonly recorded: string;
  /** For "not-right": what answered it. */
  readonly answered?: {
    readonly section: string;
    readonly note: string;
    /** The commit whose scorecards are the band that answered him; the one before it is the band he refused. */
    readonly commit?: string;
    /** Measures the record names for this fault. */
    readonly measures?: readonly string[];
    /** Numbers written down at the time that no scorecard holds. */
    readonly logged?: readonly string[];
    /** A property that holds the answer in place now, by how its name begins. A scorecard cannot show one. */
    readonly property?: string;
  };
}

/**
 * How far a mean must move, against the spread of takes the measure has, to
 * tell two bands apart; and how far outside the means he has passed a band
 * must sit to be outside what he passed.
 */
export const TELLS = 0.25;

/** A mean that moved by less than this did not move: the scorecard's own rule for "no movement". */
export const MOVED = 0.005;

/** The measures that are a seat's own, by the start of their names. The band's are everyone's. */
export const OWN: Readonly<Record<EarCase["seat"], string | null>> = {
  soloist: "solo.",
  bass: "bass.",
  chords: "chords.",
  drums: "drums.",
  band: null,
  audio: null,
};

export function readCases(): EarCase[] {
  const file = JSON.parse(readFileSync(CASES, "utf8")) as { cases: EarCase[] };
  const known = new Set(styleIds());
  for (const c of file.cases) {
    for (const style of c.styles) {
      if (style !== "all" && !known.has(style)) {
        throw new UsageError(`${CASES}: case "${c.id}" names a style "${style}" that is not one`);
      }
    }
    if (!(c.seat in OWN)) throw new UsageError(`${CASES}: case "${c.id}" has no seat "${c.seat}"`);
    // These go to git as arguments: a commit's name and nothing else.
    for (const commit of [c.recorded, c.answered?.commit]) {
      if (commit !== undefined && !/^[0-9a-f]{7,40}$/.test(commit)) {
        throw new UsageError(`${CASES}: case "${c.id}" names "${commit}", which is not a commit`);
      }
    }
  }
  return file.cases;
}

export const stylesOf = (c: EarCase): readonly string[] =>
  c.styles.includes("all") ? styleIds() : c.styles;

/**
 * Whether a measure is one a verdict was about: the seat's own, or one the record
 * names. A verdict on the whole band is about every measure, unless the record
 * names the ones it meant: then only those, since something always moves somewhere.
 */
export const isOwn = (c: EarCase, id: string): boolean => {
  const start = OWN[c.seat];
  const named = c.answered?.measures ?? [];
  if (named.includes(id)) return true;
  return start === null ? named.length === 0 : id.startsWith(start);
};

// ── the scorecards as they stood ────────────────────────────────────────────

export function git(args: readonly string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/** Whether there is history to read: a shallow clone of one commit has none. */
export const hasHistory = (): boolean =>
  git(["rev-parse", "--verify", "--quiet", "HEAD~1"]) !== null;

const read = new Map<string, Baseline | null>();

/** A style's accepted scorecard at a commit, or null where it had none yet. */
export function baselineAt(commit: string, style: string): Baseline | null {
  const key = `${commit}:scorecard/${style}.json`;
  if (!read.has(key)) {
    const text = git(["show", key]);
    read.set(key, text === null ? null : (JSON.parse(text) as Baseline));
  }
  return read.get(key) ?? null;
}

const times = new Map<string, number>();

/** When a commit was made, in seconds; 0 for one git does not know. */
export function madeAt(commit: string): number {
  if (!times.has(commit)) times.set(commit, Number(git(["log", "-1", "--format=%ct", commit])));
  return times.get(commit) || 0;
}

/**
 * The spread of takes a measure has, for judging a move against. A measure that
 * hardly varies (a share near nought, eight strokes in every bar) is given a
 * floor, so that a hundredth's drift in it does not tell two bands apart.
 */
export const spread = (line: BaselineLine): number =>
  Math.max(line.p90 - line.p10, Math.abs(line.mean) * 0.25, 0.05);

// ── what he has passed: the range of each measure over those bands ─────────

export interface Range {
  /** The lowest and highest mean over the bands that vouch for it, widened by what tells two bands apart. */
  readonly low: number;
  readonly high: number;
  /** How many of his passes vouch for it. */
  readonly passes: number;
}

export interface PassedBands {
  /** The verdicts that passed this style, each with the commit that wrote it down. */
  readonly passes: readonly {
    readonly id: string;
    readonly date: string;
    readonly commit: string;
  }[];
  /** A measure's range, or null where no band he has passed since its seat was last put right had it. */
  range(id: string): Range | null;
  /** The fences on a measure: one for each band he refused that it told from the answer. */
  fences(id: string): readonly Fence[];
}

/**
 * A band he refused, on a measure that told it from the band that answered him.
 * A range has slack either side, and the step he heard can be smaller than the
 * slack; so toward a band he refused there is none: past the nearest mean he
 * has passed is outside.
 */
export interface Fence {
  /** The verdict that refused the band. */
  readonly case: string;
  /** The measure's mean in the band he refused. */
  readonly refused: number;
  /** The mean nearest to it among the bands he has passed since (the answer's own, if none). */
  readonly nearest: number;
}

/**
 * A pass vouches for the measures of the seat it was about (a pass of the band,
 * for all of them), and only when it came after the last time he found that
 * seat not right: before that, he had passed the very band he then refused.
 * `before` leaves out what was said from that time on (in seconds), to read the
 * ranges as they stood on an earlier day.
 */
export function passedBands(
  style: string,
  cases: readonly EarCase[],
  before = Number.POSITIVE_INFINITY,
): PassedBands {
  const notes = cases.filter((c) => c.medium === "notes" && stylesOf(c).includes(style));
  const passes = notes
    .filter((c) => c.kind === "passed")
    .map((c) => ({ c, at: madeAt(c.recorded), baseline: baselineAt(`${c.recorded}^`, style) }))
    .filter((pass) => pass.baseline !== null && pass.at < before);
  /**
   * When each seat was last put right, by the start of its measures' names; "" is
   * the band as a whole. A fault in the band that names its measures puts only
   * those right, under their own names.
   */
  const putRight = new Map<string, number>();
  for (const c of notes) {
    if (c.kind !== "not-right" || !c.answered?.commit) continue;
    const start = OWN[c.seat];
    const named = c.answered.measures ?? [];
    const at = madeAt(c.answered.commit);
    if (at >= before) continue;
    for (const key of start === null && named.length > 0 ? named : [start ?? ""]) {
      putRight.set(key, Math.max(putRight.get(key) ?? 0, at));
    }
  }
  /** The bands that vouch for a measure: his passes of its seat since the seat was last put right. */
  const vouching = (id: string): BaselineLine[] => {
    const since = Math.max(
      putRight.get(id.slice(0, id.indexOf(".") + 1)) ?? 0,
      putRight.get(id) ?? 0,
      putRight.get("") ?? 0,
    );
    return passes
      .filter((pass) => pass.at > since && isOwn(pass.c, id))
      .map((pass) => pass.baseline?.[id])
      .filter((was) => was !== undefined);
  };
  const faults = notes
    .filter((c) => c.kind === "not-right" && c.answered?.commit !== undefined)
    .filter((c) => madeAt(c.answered!.commit!) < before);
  return {
    passes: passes.map((pass) => ({ id: pass.c.id, date: pass.c.date, commit: pass.c.recorded })),
    fences(id) {
      const fences: Fence[] = [];
      for (const c of faults) {
        if (!isOwn(c, id)) continue;
        const commit = c.answered!.commit!;
        const refused = baselineAt(`${commit}^`, style)?.[id];
        const answer = baselineAt(commit, style)?.[id];
        if (!refused || !answer) continue;
        // The same test that tells the two bands apart in `ensemble ears`.
        const delta = Math.abs(answer.mean - refused.mean);
        const named = c.answered!.measures?.includes(id) ?? false;
        if (named ? delta <= MOVED : delta / spread(refused) < TELLS) continue;
        const up = refused.mean > answer.mean;
        const means = [answer.mean, ...vouching(id).map((line) => line.mean)];
        const nearest = up ? Math.max(...means) : Math.min(...means);
        // He has since passed a band as far out as the one he refused: no fence there.
        if (up ? nearest >= refused.mean : nearest <= refused.mean) continue;
        fences.push({ case: c.id, refused: refused.mean, nearest });
      }
      return fences;
    },
    range(id) {
      const lines = vouching(id);
      if (lines.length === 0) return null;
      const slack = (TELLS * lines.reduce((sum, was) => sum + spread(was), 0)) / lines.length;
      return {
        low: Math.min(...lines.map((was) => was.mean)) - slack,
        high: Math.max(...lines.map((was) => was.mean)) + slack,
        passes: lines.length,
      };
    },
  };
}

// ── a change, sorted against what he has passed ─────────────────────────────

export interface Outside {
  readonly id: string;
  /** The mean with the change; null for a measure the change took away. */
  readonly now: number | null;
  /** The mean before the change; null for a measure the change brought. */
  readonly was: number | null;
  readonly range: Range | null;
  /**
   * toward: past the nearest band he has passed, back toward one he refused.
   * left: inside his range before, outside it now. further: outside before, and
   * further out now. unvouched: no pass of his covers the measure, and it moved
   * at all: with no range to hold it, a measure allowed a little each time would
   * be allowed anything. new: the change brought the measure, so no band he has
   * passed had it. gone: the change took the measure away (no take has anything
   * for it to read: a seat fell silent), which is as far from a passed band as
   * a band gets.
   */
  readonly why: "toward" | "left" | "further" | "unvouched" | "new" | "gone";
  /** For "toward": the band he refused. */
  readonly fence?: Fence;
}

export interface Sorted {
  readonly style: string;
  /** How many of his passes speak for this style. */
  readonly passes: number;
  /** How many measures the change moved at all. */
  readonly moved: number;
  /** The measures the change took outside what he has passed: these send it to his ear. */
  readonly outside: readonly Outside[];
  /** Outside his range before the change and no further out for it: not this change's doing. */
  readonly already: readonly string[];
}

/**
 * Sorts a change by measurement: `base` is the style's scorecard before it and
 * `now` the scorecard with it. Only what the change itself moved counts against
 * it; a measure that already sat outside his range is named and left.
 */
export function sortChange(
  style: string,
  cases: readonly EarCase[],
  base: Baseline,
  now: Baseline,
  before = Number.POSITIVE_INFINITY,
): Sorted {
  const bands = passedBands(style, cases, before);
  const outside: Outside[] = [];
  const already: string[] = [];
  let moved = 0;
  for (const [id, was] of Object.entries(base)) {
    if (!now[id]) outside.push({ id, now: null, was: was.mean, range: null, why: "gone" });
  }
  for (const [id, line] of Object.entries(now)) {
    const was = base[id];
    if (!was) {
      outside.push({ id, now: line.mean, was: null, range: null, why: "new" });
      continue;
    }
    const delta = Math.abs(line.mean - was.mean);
    if (delta > MOVED) moved++;
    const range = bands.range(id);
    const put = (why: Outside["why"], fence?: Fence) =>
      outside.push({ id, now: line.mean, was: was.mean, range, why, ...(fence && { fence }) });
    // How far a mean sits past a fence's nearest passed band, on the refused band's side.
    const past = (fence: Fence, mean: number) =>
      fence.refused > fence.nearest ? mean - fence.nearest : fence.nearest - mean;
    const fence = bands
      .fences(id)
      .find((f) => past(f, line.mean) > MOVED && past(f, line.mean) - past(f, was.mean) > MOVED);
    if (fence) {
      put("toward", fence);
      continue;
    }
    if (!range) {
      if (delta > MOVED) put("unvouched");
      continue;
    }
    const beyond = (mean: number) => Math.max(range.low - mean, mean - range.high, 0);
    if (beyond(line.mean) === 0) continue;
    if (beyond(was.mean) === 0) put("left");
    else if (beyond(line.mean) - beyond(was.mean) > MOVED) put("further");
    else already.push(id);
  }
  return { style, passes: bands.passes.length, moved, outside, already };
}
