// Runs a command and fails if it exceeds a wall-clock budget in seconds.
// Usage: node scripts/budget.ts <seconds> <command> [args...]
import { spawnSync } from "node:child_process";

const [limitArg, ...words] = process.argv.slice(2);
const limit = Number(limitArg);
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
