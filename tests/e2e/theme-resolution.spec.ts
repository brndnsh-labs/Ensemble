// @ts-nocheck
import pkg from '@playwright/test';
import { gotoHydrated, openSettings } from './helpers/nav.js';

const { expect, test } = pkg;

test.describe('Theme resolution @ui', () => {
    test.use({ colorScheme: 'light' });

    test('Auto mode resolves to the light variant when the system is light', async ({ page }) => {
        await gotoHydrated(page);

        // Open settings (via the topbar overflow menu) and switch the mode
        // toggle to 'Auto' on the Appearance tab.
        await openSettings(page);
        await page.getByRole('tab', { name: 'Appearance' }).click();
        await page.getByRole('radio', { name: 'Auto' }).click();

        // The contract: 'auto' under a light system resolves to the *light*
        // variant of whatever palette is active — that's the resolution this
        // guards (originally a repro for a bug where auto stuck to dark). We
        // assert the resolved `data-mode`, not a specific palette's hex value:
        // pinning `--bg-color` to a literal made a palette retune fail a
        // correct app, so it's the mode resolution that matters here.
        await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
    });
});
