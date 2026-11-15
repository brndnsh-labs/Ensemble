// Render a take to a WAV file through the real sampler and mixer, with no one
// at a browser: a headless Chrome opens the audition page, the page renders
// faster than real time and hands the file back.
//
//   node scripts/render-audio.ts <name> chart=jazz-blues-f.chart [style=jazz] [seed=1] \
//       [passes=4] [solo=alto-sax] [layers=1] [only=bass,drums] [mix='{...}']
//
// The file is written to out/audio/<name>.wav, with <name>.json beside it.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "./serve.ts";

const CHROME = process.env.CHROME ?? "google-chrome";

/** Render one take. Resolves with the WAV's path and what the page said about it. */
export async function renderAudio(
  name: string,
  query: Readonly<Record<string, string>>,
  timeoutMs = 180_000,
): Promise<{ path: string; facts: Record<string, unknown> }> {
  let finish: (result: { path: string; facts: Record<string, unknown> }) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const done = new Promise<{ path: string; facts: Record<string, unknown> }>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  let facts: Record<string, unknown> = {};
  const server = await serve({
    port: 0,
    host: "127.0.0.1",
    saved: (file, path) => {
      if (file.endsWith(".json")) {
        facts = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        if (facts.error) fail(new Error(String(facts.error)));
      } else {
        finish({ path, facts });
      }
    },
  });
  const { port } = server.address() as AddressInfo;
  const url = new URL(`http://127.0.0.1:${port}/tools/audition/`);
  url.searchParams.set("render", name);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const profile = mkdtempSync(join(tmpdir(), "ensemble-chrome-"));
  const chrome = spawn(
    CHROME,
    ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`, url.href],
    { stdio: "ignore" },
  );
  const timer = setTimeout(() => fail(new Error(`no file after ${timeoutMs / 1000} s`)), timeoutMs);
  try {
    return await done;
  } finally {
    clearTimeout(timer);
    chrome.kill();
    server.close();
    server.closeAllConnections();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }
}

if (import.meta.main) {
  const [name, ...rest] = process.argv.slice(2);
  if (!name) {
    console.error("usage: node scripts/render-audio.ts <name> chart=<file> [style=] [seed=] ...");
    process.exit(2);
  }
  const query = Object.fromEntries(
    rest.map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]),
  );
  const { path, facts } = await renderAudio(name, query);
  console.log(path, JSON.stringify(facts));
}
