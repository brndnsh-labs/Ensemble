import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';
import { seedGuestSongs } from './large-library';

/**
 * The tighter songbook home (#1459): two-line rows, one Continue label and shorter standards
 * cards, measured against a realistic library rather than the three-song starter fixture. The
 * fold this guards is the acceptance itself — Continue plus a handful of rows visible without
 * scrolling — not any single element's pixel height, which is free to move as the design does.
 */

/** Rows whose full box sits inside the current viewport — not just scrolled into view. */
async function rowsFullyInViewport(page: Page): Promise<number> {
    return page.evaluate(() => {
        const vh = window.innerHeight;
        return [...document.querySelectorAll('.home-table .song-row')].filter((row) => {
            const box = row.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= vh;
        }).length;
    });
}

test('phone fold: 40 songs shows Continue and at least 3 rows without scrolling', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-phone', 'phone fold, webkit-phone only');
    await seedGuestSongs(page, 40);
    await page.goto(appUrl());
    await expect(page.getByTestId('continue-card')).toBeVisible();
    await expect(page.locator('.home-table .song-row')).toHaveCount(8);
    const continueBox = await page.getByTestId('continue-card').boundingBox();
    expect(continueBox).not.toBeNull();
    expect(continueBox?.y).toBeGreaterThanOrEqual(0);
    expect((continueBox?.y ?? 0) + (continueBox?.height ?? 0)).toBeLessThanOrEqual(
        (await page.viewportSize())?.height ?? Number.POSITIVE_INFINITY,
    );
    expect(await rowsFullyInViewport(page)).toBeGreaterThanOrEqual(3);
    // Measured 2026-09-27 at 402x874 with 40 songs: ~1,430px total (was ~1,959px pre-#1459) — a
    // generous ceiling, not a pixel assertion, since the design is free to move within it.
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight).toBeLessThan(1700);
});

test('laptop fold: 40 songs shows Continue and at least 6 rows without scrolling', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'laptop fold, laptop only');
    await seedGuestSongs(page, 40);
    await page.goto(appUrl());
    await expect(page.getByTestId('continue-card')).toBeVisible();
    await expect(page.locator('.home-table .song-row')).toHaveCount(8);
    const continueBox = await page.getByTestId('continue-card').boundingBox();
    expect(continueBox).not.toBeNull();
    expect(continueBox?.y).toBeGreaterThanOrEqual(0);
    expect((continueBox?.y ?? 0) + (continueBox?.height ?? 0)).toBeLessThanOrEqual(
        (await page.viewportSize())?.height ?? Number.POSITIVE_INFINITY,
    );
    expect(await rowsFullyInViewport(page)).toBeGreaterThanOrEqual(6);
    // Measured 2026-09-27 at 1300x940 with 40 songs: ~1,175px total (was ~1,464px pre-#1459).
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight).toBeLessThan(1500);
});
