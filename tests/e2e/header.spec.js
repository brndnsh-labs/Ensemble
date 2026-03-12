import { expect, test } from '@playwright/test';

test.describe('Header Visual Integrity', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the app before each test
        await page.goto('/');
        // Wait for the app to be fully hydrated
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('Mobile Header - Title and Settings Icon @mobile', async ({ page }) => {
        // This test specifically targets the mobile viewport defined in config
        const header = page.locator('header');

        // 1. Verify title text is visible and not truncated
        const title = header.locator('h1');
        await expect(title).toBeVisible();
        await expect(title).toHaveText('Ensemble');

        // 2. Verify Settings button is visible
        const settingsBtn = page.locator('#settingsBtn');
        await expect(settingsBtn).toBeVisible();

        // 3. Visual Snapshot Comparison
        // This will create a 'golden' baseline on first run
        await expect(header).toHaveScreenshot('mobile-header.png');
    });

    test('Desktop Header - Layout @desktop', async ({ page }) => {
        // This test targets desktop viewports
        const header = page.locator('header');

        await expect(header).toBeVisible();

        // Ensure title is present
        const title = header.locator('h1');
        await expect(title).toContainText('Ensemble');

        await expect(header).toHaveScreenshot('desktop-header.png');
    });
});
