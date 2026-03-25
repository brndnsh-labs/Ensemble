// cspell:ignore labelledby
import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('Arranger Mobile Scaling @mobile', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('Autumn Leaves fits the mobile arranger viewport', async ({ page }) => {
        await page.click('[data-workspace-nav="arranger"]');
        await page.click('button[aria-label="Open arranger actions"]');
        await page.click('.workspace-library-fab');

        await page.getByRole('button', { name: 'Autumn Leaves' }).click();

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeHidden();

        const visualizer = page.locator('#chordVisualizer');
        await expect(visualizer).toBeVisible();

        const metrics = await visualizer.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return {
                width: rect.width,
                height: rect.height,
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
            };
        });

        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
        expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 12);
        expect(metrics.width).toBeGreaterThan(0);
        expect(metrics.height).toBeGreaterThan(0);
    });
});
