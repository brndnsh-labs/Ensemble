import { expect, test } from '@playwright/test';

test.describe('Arranger & Chord Visualizer @visual', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('header h1', { timeout: 15000 });
    });

    test('Chord Visualizer - Default Layout', async ({ page }) => {
        // Scroll to panel-arranger if needed
        const visualizer = page.locator('#chordVisualizer');
        await expect(visualizer).toBeVisible();

        // Snapshot the initial state of the visualizer
        // This is useful to catch if the spacing between chord cards or measures changes
        await expect(visualizer).toHaveScreenshot('chord-visualizer-default.png', {
            maxDiffPixelRatio: 0.01,
        });
    });

    test('Chord Visualizer - Section Labels and Measures', async ({ page }) => {
        const visualizer = page.locator('#chordVisualizer');

        // Verify structural elements are present
        const measureBox = visualizer.locator('.measure-box').first();
        await expect(measureBox).toBeVisible();

        const chordCard = visualizer.locator('.chord-card').first();
        await expect(chordCard).toBeVisible();

        // Take a scoped snapshot of the first measure specifically
        await expect(measureBox).toHaveScreenshot('measure-box-baseline.png', {
            maxDiffPixelRatio: 0.01,
        });
    });
});
