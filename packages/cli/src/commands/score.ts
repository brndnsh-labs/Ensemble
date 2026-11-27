// ensemble score [chart...] --style S --seeds N: the critic's scorecard.
//
// Each measure is reported as a distribution over many takes, with the share
// inside the style's target band and the worst takes named so they can be
// rendered and listened to. With --check, a drop past the tolerance fails.
//
// A run over a style's whole library also sorts the change in hand against what
// Brandon has passed by ear (`../passed.ts`): inside every measure's range, or
// the measures it took outside one, which is what sends a change to his ear.
// The change is what moved since the branch left main (or since --since).
//
// With --meter, the same takes are played in that meter (`ensemble render --meter`), on the
// style's 4/4 charts that read in it, and two measures more are set beside the same takes in
// 4/4: how often a seat's bar is the bar a pass earlier, and its strikes a pulse. That
// run is read, not kept: no baseline is compared or written in a meter asked for.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Baseline, Meter, ScoredTake, ScoreLine, TakeOptions } from "@ensemble/engine";
import {
  fits,
  MEASURES,
  METER_MEASURES,
  meterName,
  parse,
  parseMeterChoice,
  regressions,
  render,
  scorecard,
  toBaseline,
} from "@ensemble/engine";
import { STYLES, styleById, styleIds } from "@ensemble/styles";
import type { Command } from "../command.ts";
import { UsageError } from "../command.ts";
import type { EarCase, Sorted } from "../passed.ts";
import { baselineAt, CASES, git, hasHistory, readCases, sortChange } from "../passed.ts";

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
  // The same two jams with the soloist asked for: a three-chorus solo, a chorus of rest and
  // a one-chorus solo into the ending; and a three-chorus solo that runs to the ending.
  { name: "jam 3 min, solo", options: { mode: "jam", minutes: 3, solo: true } },
  { name: "jam 4 passes, solo", options: { mode: "jam", passes: 4, solo: true } },
];

/** How far the share of takes in a target band may fall before --check fails. */
const TOLERANCE = 0.05;

/** The count of takes the accepted scorecards are made with: only a run of this many is set against them by ear. */
const SEEDS = 200;

/** What a change is sorted against: his verdicts, and the commit the change is measured from. */
type Passed =
  | { readonly cases: readonly EarCase[]; readonly base: string }
  | { readonly unread: string };

export const scoreCommand: Command = {
  summary: "the critic's scorecard across many seeds",
  usage:
    "[chart...] [--style S] [--seeds N] [--meter 7/8] [--baseline file.json] [--since ref] [--check | --update] [--json]",
  run(args) {
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        style: { type: "string", short: "s" },
        seeds: { type: "string", short: "n", default: String(SEEDS) },
        meter: { type: "string" },
        baseline: { type: "string", short: "b" },
        since: { type: "string" },
        check: { type: "boolean", default: false },
        update: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
      },
    });
    const seeds = Number(values.seeds);
    if (!Number.isInteger(seeds) || seeds < 1) throw new UsageError("--seeds is a whole number");
    if (values.style && !styleById(values.style)) {
      throw new UsageError(`no style "${values.style}" (styles: ${styleIds().join(", ")})`);
    }
    const meter = values.meter === undefined ? undefined : parseMeterChoice(values.meter);
    if (meter === null) throw new UsageError(`--meter: "${values.meter}" is not a meter`);
    if (meter && (values.check || values.update || values.baseline))
      throw new UsageError(
        "--meter is read, not kept: it takes no --check, --update or --baseline",
      );
    // No style named: every style that ships, each on its own charts and against its own
    // baseline. Charts named without a style are scored as the first style plays them.
    const ids = values.style
      ? [values.style]
      : positionals.length > 0 || values.baseline
        ? [STYLES[0]!.id]
        : STYLES.map((style) => style.id);
    // Only the run the accepted scorecards are made from can be set against them.
    const whole =
      positionals.length === 0 && !values.baseline && seeds === SEEDS && !values.json && !meter;
    const passed = whole ? passedFrom(values.since) : null;
    let worst = 0;
    const sorted: Sorted[] = [];
    for (const id of ids) {
      if (id !== ids[0]) console.log("");
      const scored = scoreStyle(id, positionals, seeds, values, passed, meter);
      worst = Math.max(worst, scored.code);
      if (scored.sorted) sorted.push(scored.sorted);
    }
    if (passed && "unread" in passed) {
      console.log(`\nagainst what he has passed by ear: not read (${passed.unread})`);
    } else if (sorted.length > 1) {
      const out = sorted.filter((s) => s.outside.length > 0).map((s) => s.style);
      console.log(
        out.length === 0
          ? "\nby ear: every style inside what he has passed"
          : `\nby ear: outside what he has passed in ${out.join(", ")} (the measures are named above)`,
      );
    }
    return worst;
  },
};

/** His verdicts and the commit to measure from: where the branch left main, or the one named. */
function passedFrom(since: string | undefined): Passed {
  if (!existsSync(CASES)) return { unread: `no ${CASES} here` };
  if (!hasHistory()) return { unread: "git's history is not here to read" };
  const base = since
    ? git(["rev-parse", "--verify", "--quiet", "--end-of-options", `${since}^{commit}`])
    : git(["merge-base", "HEAD", "origin/main"]);
  if (!base) {
    if (since) throw new UsageError(`--since: no commit "${since}"`);
    return { unread: "no origin/main to measure from; name a commit with --since" };
  }
  return { cases: readCases(), base: base.trim() };
}

function scoreStyle(
  styleId: string,
  positionals: readonly string[],
  seeds: number,
  values: { baseline?: string; check: boolean; update: boolean; json: boolean },
  passed: Passed | null,
  meter?: Meter,
): { code: number; sorted?: Sorted } {
  const style = styleById(styleId)!;
  {
    // No charts named: every library chart written for this style.
    const named = positionals.length > 0 ? positionals : libraryChartsFor(styleId);
    if (named.length === 0) throw new UsageError(`no charts for style "${styleId}"`);
    const texts = named
      .map((path) => ({ path, text: readFileSync(path, "utf8") }))
      // In a meter asked for: the charts written in 4/4 that read in it, so the meter is set
      // beside four and nothing else.
      .filter(({ text }) => {
        if (!meter) return true;
        const chart = parse(text).chart;
        return meterName(chart.meter) === "4/4" && fits(chart, meter).ok;
      });
    const charts = texts.map(({ path }) => path);
    if (meter) {
      if (texts.length === 0)
        throw new UsageError(`no 4/4 chart for style "${styleId}" reads in ${meterName(meter)}`);
      return { code: inMeter(style, texts, seeds, meter, values.json) };
    }

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
    let code = 0;
    if (values.update) {
      writeFileSync(baselinePath, `${JSON.stringify(toBaseline(lines), null, 2)}\n`);
      console.log(`\nbaseline written: ${baselinePath}`);
    } else if (existsSync(baselinePath)) {
      const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Baseline;
      console.log(`\n${movement(lines, baseline, baselinePath)}`);
      const problems = regressions(lines, baseline, TOLERANCE);
      if (values.check && problems.length > 0) {
        console.error(`\nworse than the accepted baseline (${baselinePath}):`);
        for (const problem of problems) console.error(`  ${problem}`);
        code = 1;
      }
    } else if (values.check) {
      throw new UsageError(`no baseline at ${baselinePath}; write one with --update`);
    }
    if (!passed || "unread" in passed) return { code };
    // Measured from the scorecard in git, not the one on disk: accepting a new
    // baseline must not make the change it accepts look like no change.
    const before = baselineAt(passed.base, styleId) ?? {};
    const sorted = sortChange(styleId, passed.cases, before, toBaseline(lines));
    console.log(`\n${byEar(sorted, lines, passed.base)}`);
    return { code, sorted };
  }
}

/**
 * A style's scorecard on its 4/4 charts played in a meter, with the measures of a seat in a
 * meter beside the same takes in 4/4. Read, not kept.
 */
function inMeter(
  style: NonNullable<ReturnType<typeof styleById>>,
  texts: readonly { readonly path: string; readonly text: string }[],
  seeds: number,
  meter: Meter,
  json: boolean,
): number {
  const played: ScoredTake[] = [];
  const own: ScoredTake[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const chart = texts[(seed - 1) % texts.length]!;
    const kind = KINDS[Math.floor((seed - 1) / texts.length) % KINDS.length]!;
    const label = `${chart.path} seed ${seed} (${kind.name})`;
    played.push({ label, take: render(chart.text, style, { ...kind.options, seed, meter }) });
    own.push({ label, take: render(chart.text, style, { ...kind.options, seed }) });
  }
  const lines = scorecard(played, [...MEASURES, ...METER_MEASURES], style);
  const beside = scorecard(own, METER_MEASURES, style);
  if (json) {
    console.log(JSON.stringify({ meter: meterName(meter), lines, own: beside }, null, 2));
    return 0;
  }
  console.log(report(`${style.name} in ${meterName(meter)}`, played.length, texts.length, lines));
  const there = new Map(lines.map((line) => [line.id, line]));
  console.log(`\nin ${meterName(meter)}, beside the same takes in 4/4:`);
  for (const line of beside) {
    const now = there.get(line.id);
    const f = (value: number | undefined) =>
      value === undefined ? "not measured" : format(value, line.unit);
    console.log(`  ${line.id}: ${f(now?.mean)}, and ${f(line.mean)} in 4/4`);
  }
  console.log("\nnot set against a baseline: nothing is accepted in a meter asked for");
  return 0;
}

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
    // Worth naming: takes outside the band, or with no band the costliest takes.
    if (line.inTarget === null ? line.lowerIsBetter : line.inTarget < 1) {
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

/** The change in hand, sorted against what he has passed: inside, or the measures it took outside. */
function byEar(sorted: Sorted, lines: readonly ScoreLine[], base: string): string {
  const units = new Map(lines.map((line) => [line.id, line.unit]));
  const f = (id: string, value: number) => {
    const unit = units.get(id) ?? "ratio";
    // A share's range is widened past nought or the whole only on paper.
    return format(unit === "share" ? Math.min(1, Math.max(0, value)) : value, unit);
  };
  const out = [
    `against what he has passed by ear (${CASES}; the change is what moved since ${base.slice(0, 8)}):`,
  ];
  if (sorted.passes === 0) out.push("  no verdict of passed is recorded for this style");
  if (sorted.outside.length === 0) {
    out.push(
      sorted.moved === 0
        ? "  inside what was passed: nothing moved"
        : `  inside what was passed: ${sorted.moved} ${sorted.moved === 1 ? "measure" : "measures"} moved, none out of its range`,
    );
  } else {
    out.push("  outside what was passed, for his ear:");
    for (const o of sorted.outside) {
      const now = o.now === null ? "" : f(o.id, o.now);
      const passes = o.range ? `${o.range.passes} ${o.range.passes === 1 ? "pass" : "passes"}` : "";
      const range = o.range
        ? `${f(o.id, o.range.low)} to ${f(o.id, o.range.high)} (${passes})`
        : "";
      const was = o.was === null ? "" : f(o.id, o.was);
      const says = {
        toward: o.fence
          ? `${now}, back toward the ${f(o.id, o.fence.refused)} he refused (${o.fence.case}); the nearest he has passed is ${f(o.id, o.fence.nearest)}; was ${was}`
          : "",
        left: `${now}, passed from ${range}; was ${was}`,
        further: `${now}, further outside ${range}; was ${was}`,
        unvouched: `${now}, was ${was}; no pass of his covers this measure`,
        new: `${now}, new with this change: no band he has passed had it`,
        gone: `no longer measured (no take has it to read); was ${was}`,
      }[o.why];
      out.push(`    ${o.id}: ${says}`);
    }
  }
  if (sorted.already.length > 0) {
    out.push(`  outside before this change, and no further for it: ${sorted.already.join(", ")}`);
  }
  return out.join("\n");
}
