// ensemble score [chart...] --style S --seeds N: the critic's scorecard.
//
// Each measure is reported as a distribution over many takes, with the share
// inside the style's target band and the worst takes named so they can be
// rendered and listened to. With --check, a drop past the tolerance fails.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Baseline, ScoredTake, ScoreLine, TakeOptions } from "@ensemble/engine";
import { MEASURES, regressions, render, scorecard, toBaseline } from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";
import type { Command } from "../command.ts";
import { UsageError } from "../command.ts";

/**
 * The kinds of take a seed is played as, in rotation. A timed jam goes through
 * the arc; the held levels make sure the quiet and the loud vocabulary are
 * measured too, since a jam on a plain form never goes quiet.
 */
const KINDS: readonly { name: string; options: Omit<TakeOptions, "seed"> }[] = [
  { name: "jam 3 min", options: { mode: "jam", minutes: 3 } },
  { name: "jam 4 passes", options: { mode: "jam", passes: 4 } },
  { name: "quiet", options: { mode: "jam", passes: 3, energy: 0.3 } },
  { name: "loud", options: { mode: "jam", passes: 3, energy: 0.85 } },
];

/** How far the share of takes in a target band may fall before --check fails. */
const TOLERANCE = 0.05;

export const scoreCommand: Command = {
  summary: "the critic's scorecard across many seeds",
  usage: "[chart...] [--style S] [--seeds N] [--baseline file.json] [--check | --update] [--json]",
  run(args) {
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        style: { type: "string", short: "s" },
        seeds: { type: "string", short: "n", default: "200" },
        baseline: { type: "string", short: "b" },
        check: { type: "boolean", default: false },
        update: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
      },
    });
    const styleId = values.style ?? STYLES[0]!.id;
    const style = styleById(styleId);
    if (!style) {
      throw new UsageError(`no style "${styleId}" (styles: ${STYLES.map((s) => s.id).join(", ")})`);
    }
    const seeds = Number(values.seeds);
    if (!Number.isInteger(seeds) || seeds < 1) throw new UsageError("--seeds is a whole number");

    // No charts named: every library chart written for this style.
    const charts = positionals.length > 0 ? positionals : libraryChartsFor(styleId);
    if (charts.length === 0) throw new UsageError(`no charts for style "${styleId}"`);
    const texts = charts.map((path) => ({ path, text: readFileSync(path, "utf8") }));

    // Seeds are spread across the charts, so the count is the number of takes.
    const takes: ScoredTake[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const chart = texts[(seed - 1) % texts.length]!;
      const kind = KINDS[Math.floor((seed - 1) / texts.length) % KINDS.length]!;
      takes.push({
        label: `${chart.path} seed ${seed} (${kind.name})`,
        take: render(chart.text, style, { ...kind.options, seed }),
      });
    }
    const lines = scorecard(takes, MEASURES, style);

    if (values.json) console.log(JSON.stringify(lines, null, 2));
    else console.log(report(style.name, takes.length, charts.length, lines));

    const baselinePath = values.baseline ?? `scorecard/${styleId}.json`;
    if (values.update) {
      writeFileSync(baselinePath, `${JSON.stringify(toBaseline(lines), null, 2)}\n`);
      console.log(`\nbaseline written: ${baselinePath}`);
      return 0;
    }
    if (existsSync(baselinePath)) {
      const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Baseline;
      console.log(`\n${movement(lines, baseline, baselinePath)}`);
      const problems = regressions(lines, baseline, TOLERANCE);
      if (values.check && problems.length > 0) {
        console.error(`\nworse than the accepted baseline (${baselinePath}):`);
        for (const problem of problems) console.error(`  ${problem}`);
        return 1;
      }
    } else if (values.check) {
      throw new UsageError(`no baseline at ${baselinePath}; write one with --update`);
    }
    return 0;
  },
};

function libraryChartsFor(styleId: string): string[] {
  const dir = "library";
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".chart"))
    .sort()
    .map((file) => `${dir}/${file}`)
    .filter((path) =>
      new RegExp(`^style:\\s*${styleId}\\s*$`, "m").test(readFileSync(path, "utf8")),
    );
}

function format(value: number, unit: ScoreLine["unit"]): string {
  return unit === "share" ? `${(value * 100).toFixed(0)}%` : value.toFixed(2);
}

function band(line: ScoreLine): string {
  const target = line.target;
  if (!target) return "(reported only)";
  const low = target.min === undefined ? "" : format(target.min, line.unit);
  const high = target.max === undefined ? "" : format(target.max, line.unit);
  const range = low && high ? `${low} to ${high}` : low ? `at least ${low}` : `at most ${high}`;
  return `${range} (${target.kind})`;
}

function report(style: string, takes: number, charts: number, lines: readonly ScoreLine[]): string {
  const out = [`${style}: ${takes} takes over ${charts} ${charts === 1 ? "chart" : "charts"}`, ""];
  for (const line of lines) {
    const f = (value: number) => format(value, line.unit);
    const inBand =
      line.inTarget === null
        ? ""
        : `   in target: ${(line.inTarget * 100).toFixed(0)}% of ${line.takes} takes`;
    out.push(`${line.id}`);
    out.push(`  ${line.says}`);
    out.push(`  target ${band(line)}${inBand}`);
    out.push(
      `  mean ${f(line.mean)}   lowest ${f(line.min)}   1 in 10 below ${f(line.p10)}   middle ${f(line.median)}   1 in 10 above ${f(line.p90)}   highest ${f(line.max)}`,
    );
    if (line.pooled !== null) out.push(`  all cases together: ${f(line.pooled)}`);
    if (line.inTarget !== null && line.inTarget < 1) {
      for (const worst of line.worst) out.push(`  worst: ${f(worst.value)}  ${worst.label}`);
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

function movement(lines: readonly ScoreLine[], baseline: Baseline, path: string): string {
  const out = [`against the accepted baseline (${path}):`];
  for (const line of lines) {
    const was = baseline[line.id];
    if (!was) {
      out.push(`  ${line.id}: new`);
      continue;
    }
    const moved = Math.abs(line.mean - was.mean) > 0.005;
    const share =
      was.inTarget !== null &&
      line.inTarget !== null &&
      Math.abs(line.inTarget - was.inTarget) > 0.005;
    if (!moved && !share) continue;
    const f = (value: number) => format(value, line.unit);
    const target =
      was.inTarget === null || line.inTarget === null
        ? ""
        : `, in target ${(was.inTarget * 100).toFixed(0)}% -> ${(line.inTarget * 100).toFixed(0)}%`;
    out.push(`  ${line.id}: mean ${f(was.mean)} -> ${f(line.mean)}${target}`);
  }
  if (out.length === 1) out.push("  no movement");
  return out.join("\n");
}
