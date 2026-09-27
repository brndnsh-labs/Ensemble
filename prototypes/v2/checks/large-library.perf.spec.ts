import { appUrl, expect, test } from './fixtures';
import {
    heapBytes,
    type LongTaskSample,
    rawReadMs,
    scrollAndSampleLongTasks,
    seedGuestSongs,
} from './large-library';

/**
 * The songbook-at-scale measurement for #1442: what a large guest library costs on both
 * projects, against the budget of home rendered in <=1s at 2,000 songs on webkit-phone.
 *
 * Opt-in and SKIPPED by default (`ENSEMBLE_PERF` unset) — this is a measurement story, not a
 * regression gate: there is no product change to protect, sizes up to 2,000 songs are slow by
 * design, and the numbers are meant to be read by a person deciding #1440/#1441, not asserted
 * on in CI. Run explicitly:
 *
 *   npm run build --prefix prototypes/v2
 *   ENSEMBLE_PERF=1 npx playwright test checks/large-library.perf.spec.ts --project=laptop
 *   ENSEMBLE_PERF=1 npx playwright test checks/large-library.perf.spec.ts --project=webkit-phone
 *
 * Each size seeds once, then measures 3 navigations and reports the median — see
 * `docs/design/` / the #1442 issue for the recorded numbers and verdict.
 */
test.skip(
    () => process.env.ENSEMBLE_PERF !== '1',
    'Perf harness (#1442): set ENSEMBLE_PERF=1 to run — slow by design, not a CI gate.',
);

const SIZES = [20, 500, 1350, 2000];
const ITERATIONS = 3;

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

for (const size of SIZES) {
    test(`songbook at ${size} guest songs`, async ({ page }, testInfo) => {
        // 2,000 songs on webkit-phone, seeded once and navigated 3 times, is slow by design.
        test.setTimeout(Math.max(60_000, size * 150));

        await seedGuestSongs(page, size);

        const totalMs: number[] = [];
        const readMs: number[] = [];
        let heap: number | null = null;
        let longTasks: LongTaskSample | null = null;

        for (let i = 0; i < ITERATIONS; i++) {
            const start = Date.now();
            await page.goto(appUrl());
            await expect(page.getByTestId('library-heading')).toBeVisible();
            await expect(page.locator('.song-row')).toHaveCount(size, { timeout: 60_000 });
            totalMs.push(Date.now() - start);
            readMs.push(await rawReadMs(page));
            if (i === ITERATIONS - 1) {
                // Steady state after repeated loads, not the very first (possibly still-warming) one.
                heap = await heapBytes(page);
                longTasks = await scrollAndSampleLongTasks(page);
            }
        }

        const report = {
            size,
            project: testInfo.project.name,
            navigationToRenderedMsMedian: median(totalMs),
            rawIndexedDbReadMsMedian: median(readMs),
            heapBytes: heap,
            longTasks,
        };
        // This IS the deliverable for a measurement story — read by whoever runs it.
        console.log(`[large-library #1442] ${JSON.stringify(report)}`);
        await testInfo.attach('large-library-report.json', {
            body: JSON.stringify(report, null, 2),
            contentType: 'application/json',
        });
    });
}
