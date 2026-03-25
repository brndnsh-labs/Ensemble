// cspell:ignore labelledby
import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('Arranger Mobile Scaling @mobile', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('Donna Lee scrolls cleanly in the mobile arranger viewport', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 640 });
        await page.click('[data-workspace-nav="arranger"]');
        await page.click('button[aria-label="Open arranger actions"]');
        await page.click('.workspace-library-fab');

        await page.getByRole('button', { name: 'Donna Lee' }).click();

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
        expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 12);
        expect(metrics.width).toBeGreaterThan(0);
        expect(metrics.height).toBeGreaterThan(0);

        const before = await visualizer.evaluate((el) => ({
            scrollTop: el.scrollTop,
            pageScroll: window.scrollY,
        }));
        const box = await visualizer.boundingBox();

        expect(box).not.toBeNull();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, box.height * 1.25);

        await expect
            .poll(async () => visualizer.evaluate((el) => el.scrollTop))
            .toBeGreaterThan(before.scrollTop);
        await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(before.pageScroll);
    });
});
