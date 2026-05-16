// @ts-nocheck
import pkg from '@playwright/test';

const { expect, test } = pkg;

// Removed: `Mobile Header - Title and Settings Icon @mobile`
// The <header><h1> tagline markup was eliminated by the UI redesign (commit 3c5527ee).
// Transport/play-button layout is no longer a header concern; mobile topbar
// functionality is covered by chart-surface.spec.ts.

test.describe('Desktop Header - Layout @desktop', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
        await page.setViewportSize({ width: 1366, height: 900 });
    });

    test('topbar is visible and contains key controls @desktop', async ({ page }) => {
        const topbar = page.locator('.chart-surface__topbar');
        await expect(topbar).toBeVisible();

        // Play / transport control
        await expect(page.locator('#playBtn')).toBeVisible();

        // Action buttons present in the topbar
        await expect(topbar.getByRole('button', { name: 'Library' })).toBeVisible();
        await expect(topbar.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(topbar.locator('.chart-surface__share-btn')).toBeVisible();
        await expect(topbar.locator('.chart-surface__viz-btn')).toBeVisible();
        await expect(topbar.locator('.chart-surface__overflow-btn')).toBeVisible();
    });
});
