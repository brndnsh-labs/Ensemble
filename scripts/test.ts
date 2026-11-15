// Runs the engine suite: the properties once for each style that ships, side by
// side, and the style-free files (the chart corpus, the goldens) once.
//
// Each style gets its own processes because a take is rendered once per
// process: holding three styles to every property in one process renders three
// times as much on one core. `ENSEMBLE_STYLES=funk node scripts/test.ts` runs
// the properties for a style that is still being written.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { STYLES } from "../packages/styles/src/index.ts";

/** Files that read no style: they run once. */
const STYLE_FREE = new Set(["chart.test.ts", "goldens.test.ts"]);

const files = readdirSync(new URL("../test/", import.meta.url)).filter((file) =>
  file.endsWith(".test.ts"),
);
const perStyle = files.filter((file) => !STYLE_FREE.has(file)).map((file) => `test/${file}`);
const once = files.filter((file) => STYLE_FREE.has(file)).map((file) => `test/${file}`);

const styles = process.env.ENSEMBLE_STYLES
  ? process.env.ENSEMBLE_STYLES.split(",").map((id) => id.trim())
  : STYLES.map((style) => style.id);

interface Run {
  readonly name: string;
  readonly code: number;
  readonly output: string;
}

function run(name: string, paths: readonly string[], styleId?: string): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", ...paths], {
      env: { ...process.env, ...(styleId ? { ENSEMBLE_STYLES: styleId } : {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk));
    child.on("close", (code) => resolve({ name, code: code ?? 1, output }));
  });
}

const runs = await Promise.all([
  run("charts and goldens", once),
  ...styles.map((id) => run(id, perStyle, id)),
]);

let failed = false;
for (const { name, code, output } of runs) {
  const count = (label: string) => Number(new RegExp(`^ℹ ${label} (\\d+)`, "m").exec(output)?.[1]);
  if (code === 0) {
    console.log(`✔ ${name}: ${count("pass")} passed, ${count("skipped")} skipped`);
  } else {
    failed = true;
    console.log(`\n✖ ${name}\n${output}`);
  }
}
process.exit(failed ? 1 : 0);
