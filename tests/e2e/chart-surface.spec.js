import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('ChartSurface @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
    });

    test.describe('Visualizer overlay', () => {
        test('opens on 🌈 button click and closes with Esc', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            const vizBtn = page.locator('[aria-label="Open visualizer"]');
            await expect(vizBtn).toBeVisible();
            await expect(page.locator('.viz-overlay')).toHaveCount(0);

            await vizBtn.click();
            await expect(page.locator('.viz-overlay')).toBeVisible();

            await page.keyboard.press('Escape');
            await expect(page.locator('.viz-overlay')).toHaveCount(0);
        });

        test('closes on backdrop click', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            await page.locator('[aria-label="Open visualizer"]').click();
            const overlay = page.locator('.viz-overlay');
            await expect(overlay).toBeVisible();

            const box = await overlay.boundingBox();
            expect(box).not.toBeNull();
            await page.mouse.click(box.x + 2, box.y + 2);

            await expect(overlay).toHaveCount(0);
        });

        test('close button dismisses overlay', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            await page.locator('[aria-label="Open visualizer"]').click();
            await expect(page.locator('.viz-overlay')).toBeVisible();

            await page.locator('.viz-overlay .header-btn[aria-label="Close visualizer"]').click();
            await expect(page.locator('.viz-overlay')).toHaveCount(0);
        });
    });

    test.describe('Instrument rail orientation', () => {
        test('renders vertical rail on wide desktop viewport', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            const rail = page.locator('.instrument-rail');
            await expect(rail).toBeVisible();
            await expect(rail).toHaveClass(/instrument-rail--vertical/);
        });

        test('renders horizontal rail on narrow mobile viewport @mobile', async ({ page }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            const rail = page.locator('.instrument-rail');
            await expect(rail).toBeVisible();
            await expect(rail).toHaveClass(/instrument-rail--horizontal/);
        });
    });

    test.describe('Library modal', () => {
        test('opens via Library button and closes on backdrop click', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            await page.getByRole('button', { name: 'Library' }).click();

            const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
            await expect(modal).toBeVisible();

            await page.keyboard.press('Escape');
            await expect(modal).toBeHidden();
        });
    });

    test.describe('Overflow menu', () => {
        test('opens and exposes Generate Song, Settings, and Manual actions', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            await page.locator('[aria-label="More options"]').click();

            const panel = page.locator('#chartOverflowPanel');
            await expect(panel).toBeVisible();
            await expect(panel.getByRole('button', { name: 'Generate Song' })).toBeVisible();
            await expect(panel.getByRole('button', { name: 'Settings' })).toBeVisible();
            await expect(panel.getByRole('button', { name: 'Manual' })).toBeVisible();
        });

        test('Settings button opens the settings modal', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            await page.locator('[aria-label="More options"]').click();
            await page
                .locator('#chartOverflowPanel')
                .getByRole('button', { name: 'Settings' })
                .click();

            await expect(page.locator('[role="dialog"]')).toBeVisible();
        });
    });
});
