import { expect, test } from '@playwright/test';

test.describe('Performance Modal @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('Performance Modal Opens and Renders Correctly', async ({ page }) => {
        // Open performance modal from the Soloist panel
        await page.click('[data-id="soloist"] [aria-label="Open Performance Mode"]');

        // Wait for modal to be visible
        const modal = page.locator('.PerformanceSurfaceModal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('h2')).toContainText('Soloist Performance Mode');

        // Check if current chord and upcoming chord are rendered
        await expect(modal.locator('.active-chord')).toBeVisible();
        await expect(modal.locator('.upcoming-chord')).toBeVisible();

        // Verify visual layout
        await expect(modal).toHaveScreenshot('performance-modal-desktop.png');

        // Close modal
        await page.click('.PerformanceSurfaceModal .close-btn');
        await expect(modal).toBeHidden();
    });
});
