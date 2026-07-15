// @ts-nocheck
import pkg from '@playwright/test';
import { gotoHydrated } from './helpers/nav.js';

const { expect, test } = pkg;

test.describe('UI polish consistency @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 900 });
        await gotoHydrated(page);
    });

    test('genre picker is a labeled toggle group, not an invalid list (#812)', async ({ page }) => {
        await page.getByRole('button', { name: 'Choose genre' }).click();

        // The grid is a single-select toggle group (aria-pressed buttons), so it
        // must be role="group" with a label — never role="list" (whose required
        // owned element is listitem, which the genre buttons aren't).
        const grid = page.locator('.workspace-studio-genre-grid');
        await expect(grid).toBeVisible();
        await expect(grid).toHaveAttribute('role', 'group');
        await expect(grid).toHaveAttribute('aria-label', 'Genre');
        await expect(page.locator('.workspace-studio-genre-grid[role="list"]')).toHaveCount(0);

        // The options still announce as pressed/unpressed toggle buttons.
        await expect(
            grid.locator('.workspace-studio-genre-option[aria-pressed]').first(),
        ).toBeVisible();
    });
});
