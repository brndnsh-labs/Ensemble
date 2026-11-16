// The browser smoke journeys (docs/TESTING.md, kind 4): the built app, served
// as a static site, in the Chrome that is installed on this machine.

import { defineConfig } from "@playwright/test";

const PORT = 8767;
/** Set to run the journeys against the app wherever it is already served: a container, or the real site. */
const elsewhere = process.env.SMOKE_URL;

export default defineConfig({
  testDir: "smoke",
  // No retries: a flaky journey is fixed or deleted.
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  // Over a real network a wait is given longer: the first Play after a release fetches the
  // band through an edge that has not kept the new build yet, and five seconds was not always
  // enough (it failed the first run after two releases and never a run after).
  timeout: elsewhere ? 40_000 : 20_000,
  expect: { timeout: elsewhere ? 15_000 : 5_000 },
  use: {
    baseURL: elsewhere ?? `http://127.0.0.1:${PORT}/`,
    channel: "chrome",
    // Without the first, headless Chrome waits half a minute for a desktop keyring that is not there.
    launchOptions: { args: ["--password-store=basic"] },
  },
  ...(elsewhere
    ? {}
    : {
        webServer: {
          command: `pnpm --filter @ensemble/app build && pnpm --filter @ensemble/app exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
          url: `http://127.0.0.1:${PORT}/`,
          reuseExistingServer: false,
          timeout: 30_000,
        },
      }),
});
