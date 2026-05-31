// @ts-nocheck
import pkg from '@playwright/test';
import { gotoHydrated, openSettings } from './helpers/nav.js';

const { expect, test } = pkg;

test.describe('Theme Reproduction Bug', () => {
    test.use({ colorScheme: 'light' });

    test('Auto theme should apply light mode when system is light', async ({ page }) => {
        await gotoHydrated(page);

        // 1. Open settings (via the topbar overflow menu)
        await openSettings(page);

        // 2. Set theme to 'auto' via the Appearance tab's visual theme picker
        await page.getByRole('tab', { name: 'Appearance' }).click();
        await page.getByRole('radio', { name: 'Auto' }).click();

        // 3. Verify data-theme attribute — 'auto' under a light system resolves
        //    to the 'lead-sheet' (warm paper) theme.
        const dataTheme = await page.getAttribute('html', 'data-theme');
        console.log('Current data-theme:', dataTheme);

        expect(dataTheme).toBe('lead-sheet');

        // 4. Verify background color matches the light theme's warm paper (--base3: #f6efe1)
        const bgColor = await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim(),
        );
        // --base3 is #f6efe1. Chromium resolves var(--base3) to its hex value.
        expect(bgColor.toLowerCase()).toBe('#f6efe1');
    });
});
