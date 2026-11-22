// Runs a command and fails if it goes over its budget.
// Usage: node scripts/budget.ts <engine | engine-full | cpu:<seconds> | <seconds>> <command> [args...]
//
// A budget for work the machine does (the engine suite, the scorecards) is counted in CPU
// seconds: the processor time the command and everything it started used, user and system.
// That figure is the work done, and it hardly moves with what else the machine is doing, where
// the time on the clock does (the suite measured alone, back to back, beside a scorecard run
// and two at once: the clock ranged over 53%, the CPU time over 4%). A budget for something
// that waits (the browser journeys) is a plain number of seconds on the clock.
//
// `engine` is the engine suite's budget on a push, which grows with what the band can play and
// with nothing else: a few CPU seconds for the files that read no style, and so many for each
// style, since every style is held to every rule in a process of its own. `engine-full` is the
// same suite on six seeds: three times that (docs/TESTING.md, "Budgets").
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { STYLES } from "../packages/styles/src/index.ts";

/**
 * The engine suite on a push, in CPU seconds: what the files that read no style cost, and what
 * a style costs with the others running beside it (22.6 measured, 2026-11-21), each with the
 * room the budget had on the clock.
 */
const ENGINE = { base: 4, style: 24 };

const [limitArg = "", ...words] = process.argv.slice(2);
const engine = ENGINE.base + ENGINE.style * STYLES.length;
const cpu = limitArg === "engine" || limitArg === "engine-full" || limitArg.startsWith("cpu:");
const limit =
  limitArg === "engine"
    ? engine
    : limitArg === "engine-full"
      ? 3 * engine
      : Number(limitArg.replace(/^cpu:/, ""));
const command = words.join(" ");
if (!command || !Number.isFinite(limit) || limit <= 0) {
  console.error(
    "usage: budget.ts <engine | engine-full | cpu:<seconds> | <seconds>> <command> [args...]",
  );
  process.exit(2);
}

/**
 * The CPU seconds used by the processes this one has waited for, and by theirs in turn (a
 * process is charged its children's time when it reaps them, so the whole tree is here once the
 * command has returned). Linux says so in /proc; anywhere else there is no figure.
 */
function childrenCpu(): number | undefined {
  try {
    const stat = readFileSync("/proc/self/stat", "utf8");
    // The name, in brackets, may hold spaces: the fields are counted from after it.
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const ticks = Number(execSync("getconf CLK_TCK", { encoding: "utf8" }));
    // cutime and cstime: the fourteenth and fifteenth after the name.
    const used = (Number(fields[13]) + Number(fields[14])) / ticks;
    return Number.isFinite(used) ? used : undefined;
  } catch {
    return undefined;
  }
}

const before = childrenCpu();
const started = performance.now();
const result = spawnSync(command, { stdio: "inherit", shell: true });
const clock = (performance.now() - started) / 1000;
const after = childrenCpu();
if (result.status !== 0) process.exit(result.status ?? 1);

const worked = before === undefined || after === undefined ? undefined : after - before;
if (cpu && worked === undefined) {
  // Nothing to judge by: said, and not failed, since the suite itself passed.
  console.log(
    `\nbudget: ${clock.toFixed(1)}s on the clock; this machine does not say how much CPU time was used, so the budget of ${limit} CPU seconds is not judged here.`,
  );
  process.exit(0);
}
const spent = cpu ? worked! : clock;
const unit = cpu ? " CPU seconds" : "s";
const beside = cpu ? ` (${clock.toFixed(1)}s on the clock)` : "";
// A budget is kept on the machine the work is done on. On a shared runner, whose processors are
// not this one's, the figure is said and not judged: `ENSEMBLE_BUDGET=report`.
const judged = process.env.ENSEMBLE_BUDGET !== "report";
if (spent > limit && judged) {
  console.error(
    `\nBUDGET EXCEEDED: ${spent.toFixed(1)} > ${limit}${unit}${beside}. Consolidate or delete; see docs/TESTING.md.`,
  );
  process.exit(1);
}
console.log(
  `\nbudget: ${spent.toFixed(1)} of ${limit}${unit}${beside}${judged ? "" : " (reported, not judged)"}`,
);
