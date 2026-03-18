import playwright from '@playwright/test';

const { expect, test } = playwright;

test.describe('Theme Reproduction Bug', () => {
    test.use({ colorScheme: 'light' });

    test('Auto theme should apply light mode when system is light', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]');

        // 1. Open settings
        await page.click('#settingsBtn');
        await page.waitForSelector('#settingsOverlay.active');

        // 2. Set theme to 'auto' (it might already be auto by default, but let's be explicit)
        await page.selectOption('#themeSelect', 'auto');

        // 3. Verify data-theme attribute
        // Based on the current bug report, it likely stays 'auto' or 'dark' instead of 'light'
        const dataTheme = await page.getAttribute('html', 'data-theme');
        console.log('Current data-theme:', dataTheme);

        // According to the bug report, we expect it to be 'light' but it will probably be 'auto' or 'dark'
        expect(dataTheme).toBe('light');

        // 4. Verify background color matches Solarized Light (--base3: #fdf6e3)
        const bgColor = await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim(),
        );
        // --base3 is #fdf6e3. Chromium might resolve var(--base3) to its hex value.
        expect(bgColor.toLowerCase()).toBe('#fdf6e3');
    });
});
