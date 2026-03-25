import pkg from '@playwright/test';

const { expect, test } = pkg;

async function openWorkspace(page, name) {
    await page.getByRole('button', { name }).click();
    await expect(page.locator(`section[data-workspace="${name.toLowerCase()}"]`)).toBeVisible();
}

test.describe('Workspace surfaces @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('studio keeps the controls split on wide screens and stacked on narrow screens', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await openWorkspace(page, 'Studio');

        const studio = page.locator('[data-workspace="studio"]');
        await expect(studio.locator('.workspace-panel-copy')).toHaveCount(0);
        await expect(studio.locator('#panel-grooves')).toBeVisible();
        await expect(studio.locator('#panel-chords')).toBeVisible();
        await expect(studio.locator('#panel-bass')).toBeVisible();
        await expect(studio.locator('#panel-soloist')).toBeVisible();
        await expect(studio.locator('#panel-harmonies')).toBeVisible();
        await expect(studio.locator('.workspace-studio-genre-strip')).toBeVisible();
        await expect(studio.locator('.workspace-genre-pill')).toHaveCount(13);
        await expect(studio.locator('.workspace-group-header')).toHaveCount(2);

        const wideGroove = await studio.locator('#panel-grooves').boundingBox();
        const wideSoloist = await studio.locator('#panel-soloist').boundingBox();

        expect(wideGroove).not.toBeNull();
        expect(wideSoloist).not.toBeNull();
        expect(Math.abs(wideGroove.x - wideSoloist.x)).toBeGreaterThan(100);

        await page.setViewportSize({ width: 768, height: 1024 });
        await page.reload();
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
        await openWorkspace(page, 'Studio');

        const tabletGroove = await page.locator('#panel-grooves').boundingBox();
        const tabletSoloist = await page.locator('#panel-soloist').boundingBox();

        expect(tabletGroove).not.toBeNull();
        expect(tabletSoloist).not.toBeNull();
        expect(Math.abs(tabletGroove.x - tabletSoloist.x)).toBeGreaterThan(80);

        await page.setViewportSize({ width: 640, height: 960 });
        await page.reload();
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
        await openWorkspace(page, 'Studio');

        const mobileGroove = await page.locator('#panel-grooves').boundingBox();
        const mobileSoloist = await page.locator('#panel-soloist').boundingBox();

        expect(mobileGroove).not.toBeNull();
        expect(mobileSoloist).not.toBeNull();
        expect(Math.abs(mobileGroove.x - mobileSoloist.x)).toBeLessThan(40);
    });

    test('perform launches and dismisses the live modals', async ({ page }) => {
        await openWorkspace(page, 'Perform');

        const perform = page.locator('[data-workspace="perform"]');
        await expect(perform.locator('.workspace-panel-copy')).toHaveCount(0);
        await expect(perform.getByRole('button', { name: 'Open Performance Mode' })).toBeVisible();
        await expect(perform.getByRole('button', { name: 'Open Drum Pad' })).toBeVisible();

        await perform.getByRole('button', { name: 'Open Performance Mode' }).click();
        const performanceModal = page.locator('.PerformanceSurfaceModal');
        await expect(performanceModal).toBeVisible();
        await expect(performanceModal.locator('h2')).toContainText('Soloist Performance Mode');

        await performanceModal.locator('button[aria-label="Close"]').first().click();
        await expect(performanceModal).toBeHidden();

        await perform.getByRole('button', { name: 'Open Drum Pad' }).click();
        const drumPadModal = page.locator('.PerformanceSurfaceModal').filter({
            hasText: 'Drum Performance Mode',
        });
        await expect(drumPadModal).toBeVisible();
        await expect(drumPadModal.locator('h2')).toContainText('Drum Performance Mode');

        await drumPadModal.locator('button[aria-label="Close"]').first().click();
        await expect(drumPadModal).toBeHidden();
    });

    test('visuals keeps the visualizer visible and roomy', async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 900 });
        await openWorkspace(page, 'Visuals');

        const visuals = page.locator('[data-workspace="visuals"]');
        await expect(visuals.locator('.workspace-panel-copy')).toHaveCount(0);
        await expect(visuals.locator('.workspace-kicker')).toHaveCount(0);
        await expect(visuals.locator('.workspace-status-grid')).toHaveCount(0);
        await expect(page.locator('.app-subtitle')).toHaveCount(0);

        const panel = visuals.locator('#panel-visualizer');
        await expect(panel.locator('#vizPowerBtn')).toHaveCount(0);
        await expect(panel).not.toHaveClass(/collapsed/);

        const canvas = panel.locator('canvas').first();
        await expect(canvas).toBeVisible();

        const panelBox = await panel.boundingBox();
        const canvasBox = await canvas.boundingBox();

        expect(panelBox).not.toBeNull();
        expect(canvasBox).not.toBeNull();
        expect(panelBox.height).toBeGreaterThan(220);
        expect(canvasBox.height).toBeGreaterThanOrEqual(150);
    });
});
