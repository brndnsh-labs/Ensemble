import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('Workspace Navigation Mobile @mobile', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('anchors the workspace nav to the bottom bar', async ({ page }) => {
        const nav = page.locator('.workspace-nav');
        await expect(nav).toBeVisible();
        await expect(nav).toContainText('Arranger');
        await expect(page.locator('.workspace-nav-description')).toHaveCount(0);

        const box = await nav.boundingBox();
        const viewport = page.viewportSize();

        expect(box).not.toBeNull();
        expect(viewport).not.toBeNull();
        expect(box.y).toBeGreaterThan(viewport.height - 160);
        expect(box.height).toBeLessThan(160);
    });
});
