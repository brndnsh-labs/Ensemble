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
 * Since #1441 the home page reads only what it shows — at most eight songs by id and a `count()`
 * — so "rendered" is the home's eight rows plus the true "All N songs" count, and the whole
 * library is a separate number: `allSongsMsMedian`, the All songs page's lazy full read, measured
 * from the click on "All N songs →" to its last row.
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
 *
 * Follow-up CDP CPU profile (2026-09-26, laptop/Chromium only, N=2,000, 3 runs, measured —
 * not inferred): of JS self-time during a load, validation is ~59% and React render/commit is
 * ~1% — the opposite of the render-per-row guess this story's first commit made from the "no
 * windowing" observation alone. Nearly all of that 59% is
 * `inspectSongbookStructure`/`ownEnumerableKeys` (`public/songbook/structural-limits.ts`), a
 * structural/security walk that `prepareCandidate` (`public/songbook/codec.ts`) runs TWICE per
 * call (once on the raw candidate, once on its JSON-round-tripped copy) — and
 * `lib/documents.ts`'s `validateDocument` calls `prepareCandidate` twice more per document: once
 * via the doomed v1 attempt (every stored chart here is `schemaVersion: 2`, so
 * `validateChartDocument` always redirects to `validateChartDocumentV2`) and once via the v2
 * attempt that actually lands. That's 4 full-document structural walks plus 2
 * `JSON.stringify`/`JSON.parse` round trips per chart, for content that is `schemaVersion: 2`
 * every single time. Sort self-time didn't surface above the noise floor. This profiling pass
 * needed a `productionBrowserSourceMaps: true` build this harness's normal build doesn't make,
 * so it was not checked in as a spec — the run and its numbers are recorded on the #1442 issue.
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
        const allSongsMs: number[] = [];
        const readMs: number[] = [];
        let heap: number | null = null;
        let longTasks: LongTaskSample | null = null;

        for (let i = 0; i < ITERATIONS; i++) {
            const start = Date.now();
            await page.goto(appUrl());
            await expect(page.getByTestId('library-heading')).toBeVisible();
            await expect(page.locator('.home-table .song-row')).toHaveCount(Math.min(size, 8), {
                timeout: 60_000,
            });
            await expect(page.getByTestId('all-songs-link')).toHaveText(`All ${size} songs →`);
            totalMs.push(Date.now() - start);
            const opened = Date.now();
            await page.getByTestId('all-songs-link').click();
            await expect(page.locator('.all-songs-table .song-row')).toHaveCount(size, {
                timeout: 60_000,
            });
            allSongsMs.push(Date.now() - opened);
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
            allSongsMsMedian: median(allSongsMs),
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
