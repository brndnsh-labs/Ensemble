import { expect, test } from '@playwright/test';

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
});
