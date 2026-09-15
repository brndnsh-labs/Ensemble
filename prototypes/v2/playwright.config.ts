import { defineConfig, devices } from '@playwright/test';

// The preview server is started PER WORKER by checks/fixtures.ts (its offline toggle is
// process-global, so workers cannot share one) — no `webServer` here. Against the live test
// host the fixture points `baseURL` at it instead and the suite stays serial.
const liveTest = process.env.V2_LIVE_TEST === '1';
export default defineConfig({
    testDir: './checks',
    timeout: 45_000,
    expect: { timeout: 15_000 },
    // ubuntu-latest has 4 vCPUs; measured 2026-09-15 (#1223) the 90-test suite went from
    // 8m19s on one worker to under 3m on three. Locally, Playwright's default (half the cores).
    workers: liveTest ? 1 : process.env.CI ? 3 : undefined,
    use: {
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'laptop',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1300, height: 940 } },
        },
        {
            name: 'webkit-phone',
            use: { ...devices['iPhone 13'], viewport: { width: 402, height: 874 } },
        },
    ],
});
