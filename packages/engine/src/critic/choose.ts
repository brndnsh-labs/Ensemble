// Choosing among candidates: the good output already exists in the
// distribution, and selection moves the average toward it.

import type { Feature } from "./types.ts";

export interface Scored<Candidate> {
  readonly candidate: Candidate;
  /** The weighted sum. Lower is better. */
  readonly cost: number;
  /** Each feature's raw value, for reports and for explaining a choice. */
  readonly features: Readonly<Record<string, number>>;
}

/** Score every candidate. A feature with no weight (or weight 0) is not computed. */
export function score<Candidate>(
  candidates: readonly Candidate[],
  features: readonly Feature<Candidate>[],
  weights: Readonly<Record<string, number>>,
): Scored<Candidate>[] {
  const active = features.filter((feature) => (weights[feature.id] ?? 0) !== 0);
  return candidates.map((candidate) => {
    const values: Record<string, number> = {};
    let cost = 0;
    for (const feature of active) {
      const value = feature.of(candidate);
      values[feature.id] = value;
      cost += value * weights[feature.id]!;
    }
    return { candidate, cost, features: values };
  });
}

/**
 * The candidate with the lowest cost. A tie goes to the earliest, so the order
 * candidates are offered in is the order of preference, and the result never
 * depends on anything but the candidates and the weights.
 */
export function choose<Candidate>(
  candidates: readonly Candidate[],
  features: readonly Feature<Candidate>[],
  weights: Readonly<Record<string, number>>,
): Scored<Candidate> | undefined {
  let best: Scored<Candidate> | undefined;
  for (const scored of score(candidates, features, weights)) {
    if (best === undefined || scored.cost < best.cost) best = scored;
  }
  return best;
}
