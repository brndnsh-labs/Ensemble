// The scorecard: every measure, taken over many takes, reported as a
// distribution. Musical quality is statistical, so it is reported, not asserted.

import type { StylePack } from "../style/types.ts";
import type { Take } from "../take.ts";
import type { Measure, Target } from "./types.ts";

export interface ScoredTake {
  /** Says which take this is, so the worst ones can be found and auditioned. */
  readonly label: string;
  readonly take: Take;
}

export interface ScoreLine {
  readonly id: string;
  readonly says: string;
  readonly unit: Measure["unit"];
  /** Takes that had enough cases to measure. */
  readonly takes: number;
  readonly mean: number;
  readonly min: number;
  /** The value one take in ten falls below. */
  readonly p10: number;
  readonly median: number;
  readonly p90: number;
  readonly max: number;
  /**
   * For a share: every case of every take counted together. A rate that is
   * about the population (one fill in three is a triplet) is read here; the
   * spread across takes says how even it is.
   */
  readonly pooled: number | null;
  readonly target: Target | null;
  /** Share of measured takes inside the target band. Null when the style sets no target. */
  readonly inTarget: number | null;
  /** True for a cost: the measure says less is better, so its worst takes are worth naming with no band. */
  readonly lowerIsBetter: boolean;
  /**
   * The takes furthest outside the band, worst first. With no band, the lowest;
   * or the highest, for a measure of which less is better.
   */
  readonly worst: readonly { readonly label: string; readonly value: number }[];
}

export function scorecard(
  takes: readonly ScoredTake[],
  measures: readonly Measure[],
  style: StylePack,
): ScoreLine[] {
  const lines: ScoreLine[] = [];
  for (const measure of measures) {
    const target = style.critic.targets[measure.id] ?? null;
    if (measure.idiom && !target) continue;
    const minCases = target?.minCases ?? 1;
    const values: { label: string; value: number }[] = [];
    let hits = 0;
    let cases = 0;
    // A measure of the run is one value, read over every take at once.
    const measuredAt = measure.across
      ? [
          {
            label: "the whole run",
            measured: measure.across(
              takes.map((t) => t.take),
              style,
            ),
          },
        ]
      : takes.map(({ label, take }) => ({ label, measured: measure.of(take, style) }));
    for (const { label, measured } of measuredAt) {
      if (!measured || !Number.isFinite(measured.value)) continue;
      hits += measured.value * measured.cases;
      cases += measured.cases;
      if (measured.cases >= minCases) values.push({ label, value: measured.value });
    }
    if (values.length === 0) continue;
    const sorted = values.map((v) => v.value).sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
    const miss = (value: number) =>
      target
        ? Math.max(0, (target.min ?? -Infinity) - value, value - (target.max ?? Infinity))
        : measure.lowerIsBetter
          ? value
          : -value;
    const worst = [...values].sort((a, b) => miss(b.value) - miss(a.value)).slice(0, 3);
    lines.push({
      id: measure.id,
      says: measure.says,
      unit: measure.unit,
      takes: values.length,
      mean: sorted.reduce((sum, v) => sum + v, 0) / sorted.length,
      min: sorted[0]!,
      p10: at(0.1),
      median: at(0.5),
      p90: at(0.9),
      max: sorted[sorted.length - 1]!,
      pooled: measure.unit === "share" && cases > 0 ? hits / cases : null,
      target,
      inTarget: target ? values.filter((v) => miss(v.value) === 0).length / values.length : null,
      lowerIsBetter: measure.lowerIsBetter === true,
      worst,
    });
  }
  return lines;
}

/** What a baseline file keeps for each measure. */
export interface BaselineLine {
  readonly mean: number;
  readonly p10: number;
  readonly p90: number;
  readonly inTarget: number | null;
}

export type Baseline = Readonly<Record<string, BaselineLine>>;

export function toBaseline(lines: readonly ScoreLine[]): Baseline {
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const baseline: Record<string, BaselineLine> = {};
  for (const line of lines) {
    baseline[line.id] = {
      mean: round(line.mean),
      p10: round(line.p10),
      p90: round(line.p90),
      inTarget: line.inTarget === null ? null : round(line.inTarget),
    };
  }
  return baseline;
}

/**
 * What got worse since the baseline was accepted: a measure that vanished, or
 * one whose share of takes in its target band fell by more than the tolerance.
 * Movement inside the tolerance, and any movement of a measure with no target,
 * is reported by the scorecard and fails nothing.
 */
export function regressions(
  lines: readonly ScoreLine[],
  baseline: Baseline,
  tolerance: number,
): string[] {
  const problems: string[] = [];
  const now = new Map(lines.map((line) => [line.id, line]));
  for (const [id, was] of Object.entries(baseline)) {
    const line = now.get(id);
    if (!line) {
      problems.push(`${id}: no longer measured`);
      continue;
    }
    if (
      was.inTarget !== null &&
      line.inTarget !== null &&
      line.inTarget < was.inTarget - tolerance
    ) {
      const pct = (n: number) => `${Math.round(n * 100)}%`;
      problems.push(`${id}: ${pct(line.inTarget)} of takes in target, was ${pct(was.inTarget)}`);
    }
  }
  return problems;
}
