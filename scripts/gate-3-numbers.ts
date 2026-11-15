// The numbers gate 3 reports, on the same seeds each way:
//
// - the soloist as built against the soloist taking its first candidate
//   (the critic's weights for the solo emptied, so nothing is chosen);
// - the piano as built against a piano deaf to the soloist, and against a
//   piano taking the first phrase plan drawn, as written.
//
// Every figure is a mean over takes of a scorecard measure, judged by the
// style as shipped whichever band played.
// Usage: node scripts/gate-3-numbers.ts [seeds]

import { readdirSync, readFileSync } from "node:fs";
import type { StylePack, TakeOptions } from "../packages/engine/src/index.ts";
import { MEASURES, render } from "../packages/engine/src/index.ts";
import { styleById } from "../packages/styles/src/index.ts";
import { deaf } from "./deaf-piano.ts";

const seeds = Number(process.argv[2] ?? 96);
const blues = styleById("blues");
if (!blues) throw new Error("no blues style");
const withWeights = (seat: "solo" | "comping", weights: Record<string, number>): StylePack => ({
  ...blues,
  critic: { ...blues.critic, weights: { ...blues.critic.weights, [seat]: weights } },
});
const bands: Record<string, StylePack> = {
  built: blues,
  "first solo candidate": withWeights("solo", {}),
  "deaf piano": deaf(blues),
  "first piano plan": withWeights("comping", {}),
};
const kinds: Omit<TakeOptions, "seed">[] = [
  { mode: "jam", minutes: 3, solo: true },
  { mode: "jam", passes: 4, solo: true },
];
const charts = readdirSync("library")
  .filter((file) => file.endsWith(".chart"))
  .sort()
  .map((file) => readFileSync(`library/${file}`, "utf8"));

const columns: Record<string, Map<string, number[]>> = {};
for (const [name, style] of Object.entries(bands)) {
  const values = new Map<string, number[]>();
  for (let seed = 1; seed <= seeds; seed++) {
    const text = charts[(seed - 1) % charts.length]!;
    const kind = kinds[Math.floor((seed - 1) / charts.length) % kinds.length]!;
    const take = render(text, style, { ...kind, seed });
    for (const measure of MEASURES) {
      if (measure.seat !== "solo" && measure.seat !== "chords") continue;
      const measured = measure.of(take, blues);
      if (measured) values.set(measure.id, [...(values.get(measure.id) ?? []), measured.value]);
    }
  }
  columns[name] = values;
}

const mean = (values: readonly number[] | undefined) =>
  values && values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : Number.NaN;
const worstTenth = (values: readonly number[] | undefined) => {
  if (!values || values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => b - a);
  return mean(sorted.slice(0, Math.max(1, Math.round(sorted.length / 10))));
};
const row = (id: string, names: readonly string[], of = mean) =>
  `${id.padEnd(40)} ${names.map((name) => of(columns[name]!.get(id)).toFixed(3).padStart(22)).join("")}`;

console.log(`${seeds} takes, each played by every band on the same seed\n`);
const soloBands = ["built", "first solo candidate"];
console.log(`${"the soloist".padEnd(40)} ${soloBands.map((n) => n.padStart(22)).join("")}`);
console.log(row("solo.cost", soloBands));
console.log(
  `${"solo.cost, worst tenth of takes".padEnd(40)} ${soloBands.map((n) => worstTenth(columns[n]!.get("solo.cost")).toFixed(3).padStart(22)).join("")}`,
);
for (const measure of MEASURES) {
  if (measure.seat === "solo" && measure.id !== "solo.cost")
    console.log(row(measure.id, soloBands));
}
const pianoBands = ["built", "deaf piano", "first piano plan"];
console.log(
  `\n${"the piano under the soloist".padEnd(40)} ${pianoBands.map((n) => n.padStart(22)).join("")}`,
);
for (const measure of MEASURES) {
  if (measure.seat === "chords") console.log(row(measure.id, pianoBands));
}
const [built, unheard] = [
  columns.built!.get("chords.overlap")!,
  columns["deaf piano"]!.get("chords.overlap")!,
];
const lower = built.filter((value, i) => value < unheard[i]!).length;
const higher = built.filter((value, i) => value > unheard[i]!).length;
console.log(
  `\nchords.overlap, take by take: lower than the deaf piano in ${lower} of ${built.length}, higher in ${higher}`,
);
