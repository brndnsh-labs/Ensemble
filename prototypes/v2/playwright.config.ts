import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// The preview server is started PER WORKER by checks/fixtures.ts (its offline toggle is
// process-global, so workers cannot share one) — no `webServer` here. Against the live test
// host the fixture points `baseURL` at it instead and the suite stays serial.
const liveTest = process.env.V2_LIVE_TEST === '1';

// Passkey specs drive a CDP virtual authenticator, which only Chromium has.
const chromiumOnly = '**/*.chromium.spec.ts';

// CI splits each project's run into `V2_SHARD=<k>/<n>` legs by DURATION, not by Playwright's
// `--shard`, which divides by test COUNT into contiguous blocks and so keeps the heavy files
// together: measured on CI, `--shard=1/2` and `2/2` ran 50 tests each in 1.7m against 3.7m, and
// the job was no faster than not sharding. A hand-kept "heavy" list replaced it and drifted
// twice, because every new spec landed on the other leg (#1400) — until that leg held 80% of the
// seconds and was the whole critical path (#1463). So the split is computed: `shard-weights.json`
// holds each spec file's measured seconds per project (`npm run shard:weights` regenerates it),
// and every leg deals the files out longest first, each to the lighter leg. A file with no
// measurement yet weighs the median, so a new spec needs no change here and lands on the lighter
// leg anyway.
const shard = parseShard(process.env.V2_SHARD);

function parseShard(value: string | undefined): { index: number; total: number } | null {
    if (!value) {
        return null;
    }
    const match = /^(\d+)\/(\d+)$/.exec(value);
    const index = Number(match?.[1]);
    const total = Number(match?.[2]);
    if (!match || index < 1 || index > total) {
        throw new Error(`V2_SHARD must be <k>/<n> with 1 <= k <= n, got "${value}"`);
    }
    return { index, total };
}

/** This leg's spec files for one project, as `testMatch` globs; `undefined` runs them all. */
function shardFiles(project: string, specs: string[]): string[] | undefined {
    if (!shard) {
        return undefined;
    }
    const weights: { seconds: Record<string, Record<string, number>> } = JSON.parse(
        readFileSync(path.resolve(__dirname, 'shard-weights.json'), 'utf8'),
    );
    const measured = weights.seconds[project] ?? {};
    const known = Object.values(measured).sort((a, b) => a - b);
    const fallback = known.length > 0 ? known[Math.floor(known.length / 2)] : 1;
    const weigh = (file: string) => measured[file] ?? fallback;
    const loads: number[] = Array.from({ length: shard.total }, () => 0);
    const mine: string[] = [];
    // Sorted by weight, then name, so every leg computes the identical deal.
    for (const file of [...specs].sort((a, b) => weigh(b) - weigh(a) || a.localeCompare(b))) {
        const lightest = loads.indexOf(Math.min(...loads));
        loads[lightest] += weigh(file);
        if (lightest === shard.index - 1) {
            mine.push(`**/${file}`);
        }
    }
    return mine;
}

// Recursive, as Playwright's own discovery is: a spec in a subfolder that this list missed would
// run locally and silently never run in a sharded CI leg. Paths are `testDir`-relative with `/`,
// the same keys a JSON report (and so `shard-weights.json`) uses.
const specs = readdirSync(path.resolve(__dirname, 'checks'), { recursive: true })
    .map((file) => String(file).split(path.sep).join('/'))
    .filter((file) => file.endsWith('.spec.ts'));
const phoneSpecs = specs.filter((file) => !file.endsWith('.chromium.spec.ts'));

export default defineConfig({
    testDir: './checks',
    globalSetup: './checks/global-setup.ts',
    // Tests inside one file run in parallel too, not just files against each
    // other, so one heavy file spreads across a leg's workers instead of pinning
    // one of them. Verified independent: 100/100 green.
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
            testMatch: shardFiles('laptop', specs),
        },
        {
            name: 'webkit-phone',
            use: { ...devices['iPhone 13'], viewport: { width: 402, height: 874 } },
            testMatch: shardFiles('webkit-phone', phoneSpecs),
            testIgnore: chromiumOnly,
        },
    ],
});
