import playwright from '@playwright/test';

const { expect, test } = playwright;

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

        // 1. Verify title text is visible
        const title = header.locator('h1');
        await expect(title).toBeVisible();
        await expect(title).toHaveText('Ensemble');

        // 2. Verify Settings button is visible
        const settingsBtn = page.locator('#settingsBtn');
        await expect(settingsBtn).toBeVisible();
    });

    test('Desktop Header - Layout @desktop', async ({ page }) => {
        // This test targets desktop viewports
        const header = page.locator('header');

        await expect(header).toBeVisible();

        // Ensure title is present
        const title = header.locator('h1');
        await expect(title).toContainText('Ensemble');

        // Ensure Play button is visible in header area
        const playBtn = page.locator('#playBtn');
        await expect(playBtn).toBeVisible();
    });
});
