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

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Baseline, BaselineLine } from "@ensemble/engine";
import { styleById, styleIds } from "@ensemble/styles";
import type { Command } from "../command.ts";
import { UsageError } from "../command.ts";

const CASES = "scorecard/ear-cases.json";

type Kind = "passed" | "not-right" | "chose" | "left";

interface EarCase {
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
  };
}

/**
 * How far a mean must move, against the spread of takes the measure has, to
 * tell two bands apart; and how far outside the means he has passed a band
 * must sit to be outside what he passed.
 */
const TELLS = 0.25;
/**
 * A target objected to the band he refused when the answer put more of the takes
 * inside it by more than this: the size of move that fails `score --check` the
 * other way.
 */
const OBJECTS = 0.05;

/** The measures that are a seat's own, by the start of their names. The band's are everyone's. */
const OWN: Readonly<Record<EarCase["seat"], string | null>> = {
  soloist: "solo.",
  bass: "bass.",
  chords: "chords.",
  drums: "drums.",
  band: null,
  audio: null,
};

export const earsCommand: Command = {
  summary: "Brandon's verdicts by ear, beside what the critic measured at the time",
  usage: "[--style S] [--json]",
  run(args) {
    const { values } = parseArgs({
      args,
      options: {
        style: { type: "string", short: "s" },
        json: { type: "boolean", default: false },
      },
    });
    if (values.style && !styleById(values.style)) {
      throw new UsageError(`no style "${values.style}" (styles: ${styleIds().join(", ")})`);
    }
    if (!existsSync(CASES)) throw new UsageError(`no ${CASES}; run from the repository's root`);
    if (git(["rev-parse", "--verify", "--quiet", "HEAD~1"]) === null) {
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

function readCases(): EarCase[] {
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

const stylesOf = (c: EarCase): readonly string[] =>
  c.styles.includes("all") ? styleIds() : c.styles;

/**
 * Whether a measure is one a verdict was about: the seat's own, or one the record
 * names. A verdict on the whole band is about every measure, unless the record
 * names the ones it meant: then only those, since something always moves somewhere.
 */
const isOwn = (c: EarCase, id: string): boolean => {
  const start = OWN[c.seat];
  const named = c.answered?.measures ?? [];
  if (named.includes(id)) return true;
  return start === null ? named.length === 0 : id.startsWith(start);
};

// ── the scorecards as they stood ────────────────────────────────────────────

function git(args: readonly string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

const read = new Map<string, Baseline | null>();

/** A style's accepted scorecard at a commit, or null where it had none yet. */
function baselineAt(commit: string, style: string): Baseline | null {
  const key = `${commit}:scorecard/${style}.json`;
  if (!read.has(key)) {
    const text = git(["show", key]);
    read.set(key, text === null ? null : (JSON.parse(text) as Baseline));
  }
  return read.get(key) ?? null;
}

const times = new Map<string, number>();

/** When a commit was made, in seconds; 0 for one git does not know. */
function madeAt(commit: string): number {
  if (!times.has(commit)) times.set(commit, Number(git(["log", "-1", "--format=%ct", commit])));
  return times.get(commit) || 0;
}

/**
 * The spread of takes a measure has, for judging a move against. A measure that
 * hardly varies (a share near nought, eight strokes in every bar) is given a
 * floor, so that a hundredth's drift in it does not tell two bands apart.
 */
const spread = (line: BaselineLine): number =>
  Math.max(line.p90 - line.p10, Math.abs(line.mean) * 0.25, 0.05);

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

/**
 * A pass vouches for the measures of the seat it was about (a pass of the band,
 * for all of them), and only when it came after the last time he found that
 * seat not right: before that, he had passed the very band he then refused.
 */
function passedSpan(style: string, cases: readonly EarCase[]): Span {
  const notes = cases.filter((c) => c.medium === "notes" && stylesOf(c).includes(style));
  const passes = notes
    .filter((c) => c.kind === "passed")
    .map((c) => ({ c, at: madeAt(c.recorded), baseline: baselineAt(`${c.recorded}^`, style) }))
    .filter((pass) => pass.baseline !== null);
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
    for (const key of start === null && named.length > 0 ? named : [start ?? ""]) {
      putRight.set(key, Math.max(putRight.get(key) ?? 0, at));
    }
  }
  const path = `scorecard/${style}.json`;
  const today = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Baseline) : {};
  const measures: Passed[] = [];
  const unheard: string[] = [];
  for (const [id, line] of Object.entries(today)) {
    const since = Math.max(
      putRight.get(id.slice(0, id.indexOf(".") + 1)) ?? 0,
      putRight.get(id) ?? 0,
      putRight.get("") ?? 0,
    );
    const lines = passes
      .filter((pass) => pass.at > since && isOwn(pass.c, id))
      .map((pass) => pass.baseline?.[id])
      .filter((was) => was !== undefined);
    if (lines.length === 0) {
      unheard.push(id);
      continue;
    }
    const slack = (TELLS * lines.reduce((sum, was) => sum + spread(was), 0)) / lines.length;
    const low = Math.min(...lines.map((was) => was.mean)) - slack;
    const high = Math.max(...lines.map((was) => was.mean)) + slack;
    const where = line.mean < low ? "below" : line.mean > high ? "above" : ("inside" as const);
    measures.push({ id, low, high, passes: lines.length, today: line.mean, where });
  }
  return {
    style,
    passes: passes.map((pass) => ({ id: pass.c.id, date: pass.c.date, commit: pass.c.recorded })),
    measures,
    unheard,
  };
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
