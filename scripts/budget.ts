// Runs a command and fails if it exceeds a wall-clock budget in seconds.
// Usage: node scripts/budget.ts <seconds | engine | engine-full> <command> [args...]
//
// `engine` is the engine suite's budget on a push, which grows with what the
// band can play and with nothing else: 12 seconds for three styles, 2 more for
// each style after the third, and 2 more for each meter beyond 4/4 that the
// style with the most of them has written (the styles are tested side by side,
// so the suite takes as long as its longest style). `engine-full` is the same
// suite on six seeds: three times that (docs/TESTING.md, "Budgets").
import { spawnSync } from "node:child_process";
import { STYLES } from "../packages/styles/src/index.ts";

const [limitArg, ...words] = process.argv.slice(2);
const meters = Math.max(...STYLES.map((style) => Object.keys(style.drums.meters ?? {}).length));
const engine = 12 + 2 * Math.max(0, STYLES.length - 3) + 2 * meters;
const limit =
  limitArg === "engine" ? engine : limitArg === "engine-full" ? 3 * engine : Number(limitArg);
const command = words.join(" ");
if (!command || !Number.isFinite(limit)) {
  console.error("usage: budget.ts <seconds> <command> [args...]");
  process.exit(2);
}
const started = performance.now();
const result = spawnSync(command, { stdio: "inherit", shell: true });
const seconds = (performance.now() - started) / 1000;
if (result.status !== 0) process.exit(result.status ?? 1);
// A budget is kept on the machine the work is done on. Anywhere else (a shared runner, with
// half the cores and someone else's load) the time is said and not judged: `ENSEMBLE_BUDGET=report`.
const judged = process.env.ENSEMBLE_BUDGET !== "report";
if (seconds > limit && judged) {
  console.error(
    `\nBUDGET EXCEEDED: ${seconds.toFixed(1)}s > ${limit}s. Consolidate or delete; see docs/TESTING.md.`,
  );
  process.exit(1);
}
console.log(
  `\nbudget: ${seconds.toFixed(1)}s of ${limit}s${judged ? "" : " (reported, not judged)"}`,
);
