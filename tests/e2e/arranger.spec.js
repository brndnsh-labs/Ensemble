// cspell:ignore labelledby
import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('Arranger & Chord Visualizer @visual', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('Chord Visualizer - Default Layout', async ({ page }) => {
        // Scroll to panel-arranger if needed
        const visualizer = page.locator('#chordVisualizer');
        await expect(visualizer).toBeVisible();

        // Verify some chord cards are rendered
        const chordCard = visualizer.locator('.chord-card').first();
        await expect(chordCard).toBeVisible();
    });

    test('Chord Visualizer - Section Labels and Measures', async ({ page }) => {
        const visualizer = page.locator('#chordVisualizer');

        // Verify structural elements are present
        const measureBox = visualizer.locator('.measure-box').first();
        await expect(measureBox).toBeVisible();

        const chordCard = visualizer.locator('.chord-card').first();
        await expect(chordCard).toBeVisible();
    });

    test('Chord Visualizer highlights the active chord during playback', async ({ page }) => {
        const visualizer = page.locator('#chordVisualizer');
        await expect(visualizer.locator('.chord-card.active')).toHaveCount(0);

        await page.locator('#playBtn').click();

        await expect(visualizer.locator('.chord-card.active').first()).toBeVisible({
            timeout: 10000,
        });
        await expect(visualizer.locator('.measure-box:has(.chord-card.active)')).toHaveCount(1);

        await page.locator('#playBtn').click();
    });

    test('Progression Library Modal opens from FAB', async ({ page }) => {
        const actionTrigger = page.getByRole('button', { name: 'Open arranger actions' });
        await actionTrigger.click();

        const libraryFab = page.locator('.workspace-library-fab');
        await expect(libraryFab).toBeVisible();
        await libraryFab.dispatchEvent('click');

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();
        await expect(modal.locator('#workspaceLibraryTitle')).toHaveText('Progression Library');
        await expect(modal.locator('.preset-chip-grid').first()).toBeVisible();

        await modal.locator('.preset-chip').first().click();
        await expect(modal).toBeHidden();

        await expect(page.getByRole('button', { name: 'Open arranger actions' })).toBeVisible();
    });

    test('Arranger action menu stays fully visible after loading a short preset', async ({
        page,
    }) => {
        await page.getByRole('button', { name: 'Open arranger actions' }).click();
        await page.locator('.workspace-library-fab').dispatchEvent('click');

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();

        await page.getByRole('button', { name: 'Pop (Standard)' }).click();
        await expect(modal).toBeHidden();

        const actionMenu = page.locator('.workspace-fab-menu');
        await page.getByRole('button', { name: 'Open arranger actions' }).click();

        const viewportHeight = await page.evaluate(() => window.innerHeight);
        const seedBox = await actionMenu.locator('.workspace-fab-item--seed').boundingBox();

        expect(seedBox).not.toBeNull();
        expect(seedBox.y).toBeGreaterThanOrEqual(0);
        expect(seedBox.y + seedBox.height).toBeLessThanOrEqual(viewportHeight - 8);

        await expect(actionMenu.locator('.workspace-fab-item--seed')).toBeVisible();
    });
});
