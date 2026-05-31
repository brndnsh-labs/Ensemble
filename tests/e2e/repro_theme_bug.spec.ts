// @ts-nocheck
import pkg from '@playwright/test';
import { gotoHydrated, openSettings } from './helpers/nav.js';

const { expect, test } = pkg;

test.describe('Theme Reproduction Bug', () => {
    test.use({ colorScheme: 'light' });

    test('Auto mode should resolve to light when the system is light', async ({ page }) => {
        await gotoHydrated(page);

        // 1. Open settings (via the topbar overflow menu)
        await openSettings(page);

        // 2. Set mode to 'Auto' via the Appearance tab's mode toggle.
        await page.getByRole('tab', { name: 'Appearance' }).click();
        await page.getByRole('radio', { name: 'Auto' }).click();

        // 3. Verify the resolved attributes — the default palette is after-hours
        //    and 'auto' under a light system resolves to the light variant.
        const dataPalette = await page.getAttribute('html', 'data-palette');
        const dataMode = await page.getAttribute('html', 'data-mode');
        console.log('Current data-palette / data-mode:', dataPalette, dataMode);

        expect(dataPalette).toBe('after-hours');
        expect(dataMode).toBe('light');

        // 4. Verify background color matches the light variant's warm paper (--base3: #f6efe1)
        const bgColor = await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim(),
        );
        // --base3 is #f6efe1. Chromium resolves var(--base3) to its hex value.
        expect(bgColor.toLowerCase()).toBe('#f6efe1');
    });
});
