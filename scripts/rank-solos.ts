// Ranks seeds by how the solo went by the critic's own lights (`solo.cost`: the
// mean cost of the solo's phrases under the style's weights, lower is better),
// worst first. Gate 3 auditions the worst three beside ordinary seeds, because
// the floor matters more than the ceiling.
// Usage: node scripts/rank-solos.ts <chart> <passes> <seeds> [how many to print]

import { readFileSync } from "node:fs";
import { MEASURES, render } from "../packages/engine/src/index.ts";
import { styleById } from "../packages/styles/src/index.ts";

const [chart, passes = "5", seeds = "200", count] = process.argv.slice(2);
const blues = styleById("blues");
const cost = MEASURES.find((measure) => measure.id === "solo.cost");
if (!chart || !blues || !cost) throw new Error("usage: rank-solos.ts <chart> <passes> <seeds> [n]");

const text = readFileSync(chart, "utf8");
const ranked: { seed: number; cost: number }[] = [];
for (let seed = 1; seed <= Number(seeds); seed++) {
  const take = render(text, blues, { mode: "jam", passes: Number(passes), seed, solo: true });
  const measured = cost.of(take, blues);
  if (measured) ranked.push({ seed, cost: measured.value });
}
ranked.sort((a, b) => b.cost - a.cost || a.seed - b.seed);
for (const { seed, cost } of ranked.slice(0, count === undefined ? ranked.length : Number(count))) {
  console.log(`${seed} ${cost.toFixed(3)}`);
}
