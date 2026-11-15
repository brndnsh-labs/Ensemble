// Runs a command and fails if it exceeds a wall-clock budget in seconds.
// Usage: node scripts/budget.ts <seconds | engine> <command> [args...]
//
// `engine` is the engine suite's budget, which grows with the styles that ship
// and with nothing else: 10 seconds for three, and 2 more for each style after
// the third (docs/TESTING.md, "Budgets").
import { spawnSync } from "node:child_process";
import { STYLES } from "../packages/styles/src/index.ts";

const [limitArg, ...words] = process.argv.slice(2);
const limit = limitArg === "engine" ? 10 + 2 * Math.max(0, STYLES.length - 3) : Number(limitArg);
const command = words.join(" ");
if (!command || !Number.isFinite(limit)) {
  console.error("usage: budget.ts <seconds> <command> [args...]");
  process.exit(2);
}
const started = performance.now();
const result = spawnSync(command, { stdio: "inherit", shell: true });
const seconds = (performance.now() - started) / 1000;
if (result.status !== 0) process.exit(result.status ?? 1);
if (seconds > limit) {
  console.error(
    `\nBUDGET EXCEEDED: ${seconds.toFixed(1)}s > ${limit}s. Consolidate or delete; see docs/TESTING.md.`,
  );
  process.exit(1);
}
console.log(`\nbudget: ${seconds.toFixed(1)}s of ${limit}s`);
