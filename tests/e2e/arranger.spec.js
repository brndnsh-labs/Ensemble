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

    test('Progression Library Modal opens from FAB', async ({ page }) => {
        const actionTrigger = page.getByRole('button', { name: 'Open arranger actions' });
        await actionTrigger.click();

        const libraryFab = page.locator('.workspace-library-fab');
        await expect(libraryFab).toBeVisible();
        await libraryFab.click();

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();
        await expect(modal.locator('#workspaceLibraryTitle')).toHaveText('Progression Library');
        await expect(modal.locator('.preset-chip-grid').first()).toBeVisible();

        await modal.locator('.preset-chip').first().click();
        await expect(modal).toBeHidden();

        await expect(page.getByRole('button', { name: 'Open arranger actions' })).toBeVisible();
    });
});
