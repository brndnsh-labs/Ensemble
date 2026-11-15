// Fetch the sample libraries into `.sources/`, each at its pinned version.
//   node scripts/packs/fetch.ts [id...]
// A git source is cloned and checked out at its commit, with only the folders
// it names. An archive is downloaded beside where it unpacks, its SHA-256
// checked, and unpacked with `7z` into `.sources/<id>/`. Run again to resume.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { type ArchiveSource, type GitSource, isArchive, SOURCES } from "./sources.ts";

const ROOT = join(import.meta.dirname, "..", "..", ".sources");

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function fetchGit(source: GitSource): string {
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
  return git(dir, "rev-parse", "HEAD").trim();
}

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

/**
 * Downloads the archive unless a copy with the right hash is already there,
 * then unpacks it over the folder. A download goes to a `.part` file first, so
 * an interrupted one is never taken for the archive.
 */
async function fetchArchive(source: ArchiveSource): Promise<string> {
  const dir = join(ROOT, source.id);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, decodeURIComponent(basename(new URL(source.archive).pathname)));
  if (existsSync(file) && (await sha256(file)) !== source.sha256) rmSync(file);
  if (!existsSync(file)) {
    const response = await fetch(source.archive);
    if (!response.ok || !response.body) {
      throw new Error(`${source.id}: ${source.archive} answered ${response.status}`);
    }
    const part = `${file}.part`;
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      createWriteStream(part),
    );
    const got = await sha256(part);
    if (got !== source.sha256) {
      rmSync(part);
      throw new Error(`${source.id}: the download's SHA-256 is ${got}, not ${source.sha256}`);
    }
    renameSync(part, file);
  }
  execFileSync("7z", ["x", "-y", `-o${dir}`, file], { stdio: ["ignore", "ignore", "inherit"] });
  return `${source.release}, ${basename(file)} sha256 ${source.sha256}`;
}

const wanted = process.argv.slice(2);
mkdirSync(ROOT, { recursive: true });

for (const source of SOURCES) {
  if (wanted.length > 0 && !wanted.includes(source.id)) continue;
  const version = isArchive(source) ? await fetchArchive(source) : fetchGit(source);
  console.log(`${source.id}: ${version}`);
}
