// Render a take to a WAV file through the real sampler and mixer, with no one
// at a browser: a headless Chrome opens the audition page, the page renders
// faster than real time and hands the file back.
//
//   node scripts/render-audio.ts <name> chart=jazz-blues-f.chart [style=jazz] [seed=1] \
//       [passes=4] [solo=alto-sax] [density=0..1] [fromtop=1] [breathe=1] [open=1 endafter=N toldat=T] \
//       [layers=1] [only=bass,drums] [energy=0.3] [song=1] [without=bass] [meter=12/8] \
//       [mix='{...}'] [live=1]
//
// The file is written to out/audio/<name>.wav, with <name>.json beside it.
// With `live=1` the take is played in real time instead, to no file, and the
// scheduler's counts of late and dropped notes come back in <name>.json.

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
  mode: "render" | "live" = "render",
): Promise<{ path: string; facts: Record<string, unknown> }> {
  let finish: (result: { path: string; facts: Record<string, unknown> }) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const done = new Promise<{ path: string; facts: Record<string, unknown> }>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  let facts: Record<string, unknown> = {};
  const server = await serve({
    // Any free port, or the one `RENDER_PORT` names where only some may be used.
    port: Number(process.env.RENDER_PORT ?? 0),
    host: "127.0.0.1",
    saved: (file, path) => {
      if (file.endsWith(".json")) {
        facts = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        if (facts.error) fail(new Error(String(facts.error)));
        // A live run sends only its counts.
        else if (mode === "live") finish({ path, facts });
      } else {
        finish({ path, facts });
      }
    },
  });
  const { port } = server.address() as AddressInfo;
  const url = new URL(`http://127.0.0.1:${port}/tools/audition/`);
  url.searchParams.set(mode, name);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const profile = mkdtempSync(join(tmpdir(), "ensemble-chrome-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      // Without this, Chrome asks the desktop's keyring for a key over D-Bus before its
      // first request, and on a machine with no desktop session waits 25 seconds for no answer.
      "--password-store=basic",
      // A live run starts playing with nobody there to tap.
      "--autoplay-policy=no-user-gesture-required",
      `--user-data-dir=${profile}`,
      url.href,
    ],
    { stdio: "ignore" },
  );
  const timer = setTimeout(() => fail(new Error(`no file after ${timeoutMs / 1000} s`)), timeoutMs);
  try {
    return await done;
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
    // Chrome writes to its profile until it is gone; wait for that before removing it.
    const gone = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await gone;
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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
  // `live=1` plays the take in real time instead and reports the scheduler's counts.
  const live = query.live !== undefined;
  delete query.live;
  const { path, facts } = live
    ? await renderAudio(name, query, 900_000, "live")
    : await renderAudio(name, query);
  console.log(path, JSON.stringify(facts));
}
