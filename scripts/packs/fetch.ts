// Fetch the sample libraries into `.sources/`, each at its pinned commit.
//   node scripts/packs/fetch.ts [id...]
// Only the folders a source names are downloaded. Run again to resume.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SOURCES } from "./sources.ts";

const ROOT = join(import.meta.dirname, "..", "..", ".sources");

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

const wanted = process.argv.slice(2);
mkdirSync(ROOT, { recursive: true });

for (const source of SOURCES) {
  if (wanted.length > 0 && !wanted.includes(source.id)) continue;
  const dir = join(ROOT, source.id);
  if (!existsSync(join(dir, ".git"))) {
    git(
      ROOT,
      "clone",
      "--quiet",
      "--filter=blob:none",
      "--no-checkout",
      `${source.repo}.git`,
      source.id,
    );
  }
  if (source.paths) git(dir, "sparse-checkout", "set", "--cone", ...source.paths);
  git(dir, "checkout", "--quiet", source.commit);
  console.log(`${source.id}: ${git(dir, "rev-parse", "HEAD").trim()}`);
}
