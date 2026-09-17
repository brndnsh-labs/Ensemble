import { defineConfig, devices } from '@playwright/test';

// The preview server is started PER WORKER by checks/fixtures.ts (its offline toggle is
// process-global, so workers cannot share one) — no `webServer` here. Against the live test
// host the fixture points `baseURL` at it instead and the suite stays serial.
const liveTest = process.env.V2_LIVE_TEST === '1';

// CI splits the suite by DURATION, not by Playwright's `--shard`, which divides by test COUNT
// into contiguous blocks and so keeps the heavy cluster together: measured on CI, `--shard=1/2`
// and `2/2` ran 50 tests each in 1.7m against 3.7m, and the job was no faster than not sharding.
// `foundation.spec.ts` alone is 42% of the suite's seconds, so it gets its own runner and
// everything else — including any spec added later, which needs no change here — gets the other.
const heavy = '**/foundation.spec.ts';
const shard = process.env.V2_SHARD;
// Passkey specs drive a CDP virtual authenticator, which only Chromium has.
const chromiumOnly = '**/*.chromium.spec.ts';
export default defineConfig({
    testDir: './checks',
    globalSetup: './checks/global-setup.ts',
    testMatch: shard === 'heavy' ? heavy : undefined,
    testIgnore: shard === 'rest' ? heavy : undefined,
    // Tests inside one file run in parallel too, not just files against each
    // other. Without this a file+project is ONE indivisible unit of work, and
    // `foundation.spec.ts` is 42% of the suite's seconds — CI's two shards split
    // 50/50 by test COUNT and came out 1.5m against 4.0m, because that one group
    // cannot be divided. Playwright shards by group, so this is what makes
    // sharding worth anything at all. Verified independent: 100/100 green.
    fullyParallel: true,
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
            // A project-level `testIgnore` REPLACES the top-level one, so restate the shard's.
            testIgnore: shard === 'rest' ? [heavy, chromiumOnly] : chromiumOnly,
        },
    ],
});
