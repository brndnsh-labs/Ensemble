// The browser smoke journeys (docs/TESTING.md, kind 4): the built app, served
// as a static site, in the Chrome that is installed on this machine.

import { defineConfig } from "@playwright/test";

const PORT = 8767;

export default defineConfig({
  testDir: "smoke",
  // No retries: a flaky journey is fixed or deleted.
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 20_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    channel: "chrome",
    // Without the first, headless Chrome waits half a minute for a desktop keyring that is not there.
    launchOptions: { args: ["--password-store=basic"] },
  },
  webServer: {
    command: `pnpm --filter @ensemble/app build && pnpm --filter @ensemble/app exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
