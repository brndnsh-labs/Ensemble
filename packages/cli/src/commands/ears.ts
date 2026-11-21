// ensemble ears [--style S] [--json]: what Brandon has said by ear, set beside
// what the critic measured at the time.
//
// `scorecard/ear-cases.json` holds his verdicts, each with the commit that wrote
// his words down. The scorecards accepted along the way are in git, so for each
// verdict about the notes this reads the scorecard as it stood, and says:
//
//   - for a verdict of "not right": which measures tell the band he refused
//     from the band that answered him; whether the critic had them before he
//     spoke, and if it did, whether its target objected or allowed what he
//     refused;
//   - for each style: the span of every measure over the bands he has passed
//     since that seat was last put right, where today's scorecard sits against
//     it, and whether that span would have caught each band he refused.
//
// Reported, never asserted: it is the scorecard's kind of thing, not a test.
// A verdict about the sound (a sample, a level, how a move sounds on these
// recordings) is listed and left: the critic reads notes. It reads git, so it
// wants the repository's history (a shallow clone has none to read).
//
// First it checks that every verdict's `source` (and every one left out) names a
// file that exists and a `## ` or `### ` heading in it, word for word, and that
// an answer's `section` is a heading in the record; a miss fails the command,
// naming the case. `--check` does only that and reads no history, for CI.

import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Baseline, BaselineLine } from "@ensemble/engine";
import { styleById, styleIds } from "@ensemble/styles";
import type { Command } from "../command.ts";
import { UsageError } from "../command.ts";
import type { EarCase, Kind } from "../passed.ts";
import {
  baselineAt,
  CASES,
  hasHistory,
  isOwn,
  passedBands,
  readCases,
  spread,
  stylesOf,
  TELLS,
} from "../passed.ts";

/**
 * A target objected to the band he refused when the answer put more of the takes
 * inside it by more than this: the size of move that fails `score --check` the
 * other way.
 */
const OBJECTS = 0.05;

export const earsCommand: Command = {
  summary: "Brandon's verdicts by ear, beside what the critic measured at the time",
  usage: "[--style S] [--json] [--check]",
  run(args) {
    const { values } = parseArgs({
      args,
      options: {
        style: { type: "string", short: "s" },
        json: { type: "boolean", default: false },
        check: { type: "boolean", default: false },
      },
    });
    if (values.style && !styleById(values.style)) {
      throw new UsageError(`no style "${values.style}" (styles: ${styleIds().join(", ")})`);
    }
    if (!existsSync(CASES)) throw new UsageError(`no ${CASES}; run from the repository's root`);
    const misses = unsourced();
    for (const miss of misses) console.error(miss);
    if (misses.length > 0) return 1;
    if (values.check) return 0;
    if (!hasHistory()) {
      throw new UsageError("the scorecards' history is read from git, and there is none here");
    }
    const cases = readCases();
    const styles = values.style ? [values.style] : styleIds();
    const spans = styles.map((style) => passedSpan(style, cases));
    const faults = cases
      .filter((c) => c.kind === "not-right" && c.medium === "notes")
      .filter((c) => stylesOf(c).some((style) => styles.includes(style)))
      .map((c) => fault(c, styles, spans));
    if (values.json) console.log(JSON.stringify({ faults, spans }, null, 2));
    else console.log(report(cases, faults, spans));
    return 0;
  },
};

// ── where his words are written: every source names a heading that is there ──

/** The files whose headings an answer's `section` may name. */
const RECORD = ["DECISIONS.md"];

const headings = new Map<string, ReadonlySet<string> | null>();

/** A file's `## ` and `### ` headings, word for word; null where there is no such file. */
function headingsOf(path: string): ReadonlySet<string> | null {
  if (!headings.has(path)) {
    const text = existsSync(path) ? readFileSync(path, "utf8") : null;
    const found = text?.split("\n").flatMap((line) => {
      const m = /^#{2,3} (.+?)\s*$/.exec(line);
      return m ? [m[1]!] : [];
    });
    headings.set(path, found ? new Set(found) : null);
  }
  return headings.get(path)!;
}

/** Each source written as "<file>: <heading>" whose file or heading is not there, said with its case. */
function unsourced(): string[] {
  const file = JSON.parse(readFileSync(CASES, "utf8")) as {
    cases: readonly EarCase[];
    leftOut?: readonly { words: string; source: string }[];
  };
  const misses: string[] = [];
  const miss = (who: string, what: string, why: string) =>
    misses.push(`${CASES}: ${who}: ${what}: ${why}`);
  const named = [
    ...file.cases.map((c) => ({ who: `case "${c.id}"`, source: c.source })),
    ...(file.leftOut ?? []).map((l) => ({ who: `left out "${l.words}"`, source: l.source })),
  ];
  for (const { who, source } of named) {
    const at = source.indexOf(": ");
    const path = at < 0 ? source : source.slice(0, at);
    const heading = at < 0 ? "" : source.slice(at + 2);
    const there = headingsOf(path);
    if (!there) miss(who, `source "${source}"`, `no file ${path}`);
    else if (!there.has(heading)) miss(who, `source "${source}"`, `no heading in ${path} reads so`);
  }
  for (const c of file.cases) {
    const section = c.answered?.section;
    if (section !== undefined && !RECORD.some((path) => headingsOf(path)?.has(section))) {
      miss(
        `case "${c.id}"`,
        `answered.section "${section}"`,
        `no heading in ${RECORD.join(", ")} reads so`,
      );
    }
  }
  return misses;
}

// ── what he has passed: the span of each measure over those bands ──────────

interface Passed {
  readonly id: string;
  /** The lowest and highest mean over the bands that vouch for it, widened by what tells two bands apart. */
  readonly low: number;
  readonly high: number;
  /** How many of his passes vouch for it. */
  readonly passes: number;
  readonly today: number;
  readonly where: "inside" | "below" | "above";
}

interface Span {
  readonly style: string;
  /** The verdicts that passed this style, each with the commit that wrote it down. */
  readonly passes: readonly {
    readonly id: string;
    readonly date: string;
    readonly commit: string;
  }[];
  readonly measures: readonly Passed[];
  /** Measured today, and in no band he has passed since its seat was last put right. */
  readonly unheard: readonly string[];
}

/** Today's accepted scorecard for a style, set against the range of each measure over what he has passed. */
function passedSpan(style: string, cases: readonly EarCase[]): Span {
  const bands = passedBands(style, cases);
  const path = `scorecard/${style}.json`;
  const today = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Baseline) : {};
  const measures: Passed[] = [];
  const unheard: string[] = [];
  for (const [id, line] of Object.entries(today)) {
    const range = bands.range(id);
    if (!range) {
      unheard.push(id);
      continue;
    }
    const where =
      line.mean < range.low ? "below" : line.mean > range.high ? "above" : ("inside" as const);
    measures.push({ id, ...range, today: line.mean, where });
  }
  return { style, passes: bands.passes, measures, unheard };
}

// ── a fault he named: does anything measured tell it from its answer? ───────

interface Told {
  readonly id: string;
  readonly before: BaselineLine | null;
  readonly after: BaselineLine;
  /** What the critic thought of the band he refused: its target objected, allowed it, or there was none. */
  readonly critic: "objected" | "allowed" | "no target" | "new";
}

interface Fault {
  readonly case: EarCase;
  readonly styles: readonly {
    readonly style: string;
    /** The seat's own measures the critic already had, that moved between the two bands. */
    readonly had: readonly Told[];
    /** Measures that first appear with the answer: the critic gained them after he spoke. */
    readonly gained: readonly Told[];
    /** Other seats' measures that moved with the answer. */
    readonly elsewhere: readonly string[];
    /** Of the measures it had, those on which the band he refused sits outside what he has passed since. */
    readonly caught: readonly string[];
    /** Why nothing could be compared, when nothing could. */
    readonly unread?: string;
  }[];
}

function fault(c: EarCase, wanted: readonly string[], spans: readonly Span[]): Fault {
  const commit = c.answered?.commit;
  const named = new Set(c.answered?.measures ?? []);
  const styles = stylesOf(c)
    .filter((style) => wanted.includes(style))
    .map((style) => {
      const nothing = { style, had: [], gained: [], elsewhere: [], caught: [] };
      if (!commit) return { ...nothing, unread: "no commit recorded for the answer" };
      const after = baselineAt(commit, style);
      const before = baselineAt(`${commit}^`, style);
      if (!after) return { ...nothing, unread: `no scorecard at ${commit}` };
      if (!before) return { ...nothing, unread: `no scorecard before ${commit}` };
      const had: (Told & { by: number })[] = [];
      const gained: Told[] = [];
      const elsewhere: { id: string; by: number }[] = [];
      for (const [id, now] of Object.entries(after)) {
        const was = before[id];
        if (!was) {
          // Other measures added in the same commit say nothing of this fault.
          if (isOwn(c, id) && (named.size === 0 || named.has(id))) {
            gained.push({ id, before: null, after: now, critic: "new" });
          }
          continue;
        }
        const delta = Math.abs(now.mean - was.mean);
        const by = delta / spread(was);
        if (named.has(id) ? delta <= 0.005 : by < TELLS) continue;
        if (!isOwn(c, id)) {
          elsewhere.push({ id, by });
          continue;
        }
        const critic =
          was.inTarget === null || now.inTarget === null
            ? "no target"
            : now.inTarget > was.inTarget + OBJECTS
              ? "objected"
              : "allowed";
        had.push({ id, before: was, after: now, critic, by });
      }
      // The measures the record names first, then the ones the critic objected on, then by how far they moved.
      const first = (t: Told & { by: number }) =>
        (named.has(t.id) ? 2e6 : 0) + (t.critic === "objected" ? 1e6 : 0) + t.by;
      had.sort((a, b) => first(b) - first(a));
      elsewhere.sort((a, b) => b.by - a.by);
      const span = spans.find((s) => s.style === style);
      // Only on the measures that told the two bands apart: the band has changed in
      // other ways since, and those would catch any old band.
      const told = new Set(had.map((t) => t.id));
      const caught = (span?.measures ?? [])
        .filter((m) => told.has(m.id))
        .filter((m) => before[m.id]!.mean < m.low || before[m.id]!.mean > m.high)
        .map((m) => m.id);
      return { style, had, gained, elsewhere: elsewhere.map((t) => t.id), caught };
    });
  return { case: c, styles };
}

type Verdict = "objected" | "allowed" | "gained" | "by hand" | "nothing";

function verdict(f: Fault): Verdict {
  const had = f.styles.flatMap((s) => s.had);
  if (had.some((t) => t.critic === "objected")) return "objected";
  if (had.length > 0) return "allowed";
  if (f.styles.some((s) => s.gained.length > 0)) return "gained";
  return (f.case.answered?.logged?.length ?? 0) > 0 ? "by hand" : "nothing";
}

const VERDICT: Readonly<Record<Verdict, string>> = {
  objected: "separated by a measure the critic had, whose target objected to the band he refused",
  allowed:
    "separated by a measure the critic had, which did not object (a target that allowed it, or none)",
  gained: "separated only by measures added with the answer: the critic could not have said so",
  "by hand": "no measure separates this (it was measured by hand at the time)",
  nothing: "no measure separates this",
};

// ── the report ──────────────────────────────────────────────────────────────

const n = (value: number): string => value.toFixed(2);
const pct = (share: number): string => `${Math.round(share * 100)}%`;

function toldLine(t: Told): string {
  if (!t.before) return `${t.id}: ${n(t.after.mean)} (new)`;
  const target =
    t.before.inTarget !== null && t.after.inTarget !== null
      ? `, in target ${pct(t.before.inTarget)} -> ${pct(t.after.inTarget)}`
      : ", no target";
  return `${t.id}: ${n(t.before.mean)} -> ${n(t.after.mean)}${target}`;
}

const some = (ids: readonly string[], most: number): string =>
  ids.length <= most
    ? ids.join(", ")
    : `${ids.slice(0, most).join(", ")} and ${ids.length - most} more`;

function report(
  cases: readonly EarCase[],
  faults: readonly Fault[],
  spans: readonly Span[],
): string {
  const out: string[] = [];
  const count = (kind: Kind) => cases.filter((c) => c.kind === kind && c.medium === "notes").length;
  const sound = cases.filter((c) => c.medium === "sound");
  out.push(
    `${cases.length} verdicts by ear. About the notes: ${count("passed")} passed, ${count("not-right")} not right, ${count("chose")} chosen from a study, ${count("left")} left for later. About the sound: ${sound.length}.`,
  );

  out.push(
    "",
    "NOT RIGHT, ABOUT THE NOTES: the band he refused against the band that answered",
    "",
  );
  const tally = new Map<Verdict, number>();
  let caughtNow = 0;
  let held = 0;
  for (const f of faults) {
    const c = f.case;
    out.push(`${c.id}  (${c.date}, ${c.seat})`);
    out.push(c.reported ? `  ${c.words} (the record's words, not his)` : `  "${c.words}"`);
    if (c.answered) out.push(`  answered: ${c.answered.note}`);
    for (const line of c.answered?.logged ?? []) out.push(`  as logged: ${line}`);
    for (const s of f.styles) {
      if (s.unread) {
        out.push(`  ${s.style}: not read (${s.unread})`);
        continue;
      }
      for (const t of s.had.slice(0, 3)) out.push(`  ${s.style}: had, ${t.critic}: ${toldLine(t)}`);
      if (s.had.length > 3) out.push(`  ${s.style}: and ${s.had.length - 3} more it had`);
      for (const t of s.gained.slice(0, 3)) out.push(`  ${s.style}: gained: ${toldLine(t)}`);
      if (s.elsewhere.length > 0)
        out.push(`  ${s.style}: other seats moved: ${some(s.elsewhere, 3)}`);
    }
    const v = verdict(f);
    tally.set(v, (tally.get(v) ?? 0) + 1);
    out.push(`  => ${VERDICT[v]}`);
    if (c.answered?.property) {
      held++;
      out.push(`  => held now by a property: "${c.answered.property}"`);
    }
    const caught = f.styles.filter((s) => s.caught.length > 0);
    if (caught.length > 0) {
      caughtNow++;
      const where = caught.map((s) => `${s.style} (${some(s.caught, 2)})`);
      out.push(
        `  => today, what he has passed since would catch that band again: ${some(where, 3)}`,
      );
    } else {
      out.push("  => today, what he has passed since would not tell that band from a passed one");
    }
    out.push("");
  }
  out.push(`Of ${faults.length} faults he named in the notes:`);
  for (const [v, says] of Object.entries(VERDICT) as [Verdict, string][]) {
    if (tally.has(v)) out.push(`  ${tally.get(v)}: ${says}`);
  }
  out.push(
    `  ${caughtNow} of ${faults.length} would be caught today by the span of what he has passed.`,
  );
  out.push(`  ${held} of ${faults.length} are held today by a property, which no scorecard shows.`);

  out.push("", "WHAT HE HAS PASSED: each measure's span over the bands he passed, and today's", "");
  for (const span of spans) {
    if (span.passes.length === 0) {
      out.push(`${span.style}: no verdict of passed is recorded with a scorecard to read`);
      continue;
    }
    const outside = span.measures.filter((m) => m.where !== "inside");
    const last = span.passes.reduce((a, b) => (a.date >= b.date ? a : b));
    out.push(
      `${span.style}: passed ${span.passes.length} ${span.passes.length === 1 ? "time" : "times"}, last on ${last.date}; ${span.measures.length - outside.length} of ${span.measures.length} measures sit inside what he passed`,
    );
    for (const m of outside) {
      out.push(
        `  ${m.where}: ${m.id} is ${n(m.today)} today; passed from ${n(m.low)} to ${n(m.high)} (${m.passes} ${m.passes === 1 ? "pass" : "passes"})`,
      );
    }
    if (span.unheard.length > 0) out.push(`  never passed as they are: ${some(span.unheard, 6)}`);
  }

  out.push("", `OUTSIDE THE CRITIC: ${sound.length} verdicts about the sound`, "");
  for (const c of sound) out.push(`  ${c.date}  ${c.kind.padEnd(9)}  ${c.id}: "${c.words}"`);
  const chose = cases.filter((c) => c.kind === "chose" && c.medium === "notes");
  if (chose.length > 0) {
    out.push(
      "",
      "CHOSEN FROM A STUDY, about the notes (the clips were not takes; nothing ranks them)",
      "",
    );
    for (const c of chose) out.push(`  ${c.date}  ${c.id}: "${c.words}"`);
  }
  return out.join("\n");
}
