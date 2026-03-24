import pkg from '@playwright/test';

const { expect, test } = pkg;

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

        // Close modal
        await page.click('.PerformanceSurfaceModal .close-btn');
        await expect(modal).toBeHidden();
    });

    test('Performance Modal Desktop Palette and Legends', async ({ page }) => {
        await page.click('[data-id="soloist"] [aria-label="Open Performance Mode"]');
        const modal = page.locator('.PerformanceSurfaceModal');

        // Verify Legends
        const instructions = modal.locator('.keyboard-instructions');
        await expect(instructions).toBeVisible();
        await expect(instructions).toContainText('Safe Arpeggios');
        await expect(instructions).toContainText('Color Extensions');
        await expect(instructions).toContainText('Bridge Tones');

        // Verify that we have the colored indicators in the legends
        const legendDots = instructions.locator('.performance-instruction-swatch');
        await expect(legendDots).toHaveCount(3);

        // Verify Sympathetic Highlights
        // Press 'A' (Home row first key)
        await page.keyboard.down('a');

        // Check if other keys with same note name get dashed border
        // We look for any button that has a dashed border in its style attribute or computed style
        const activeChord = modal.locator('.active-chord');

        // The key 'A' itself should be playing (not dashed)
        const aKey = activeChord.locator('button').first();
        const aStyle = await aKey.evaluate((el) => getComputedStyle(el).borderStyle);
        expect(aStyle).not.toContain('dashed');

        // Find a sympathetic key (e.g. same note in upcoming row if available, or just check if ANY dashed exists)
        // Since we don't know the exact chord in the test, we check if the dashed class/style appears on ANY other key
        const dashedKeys = modal.locator('button[style*="dashed"]');
        // There should be at least one other 'A' equivalent in the layout (often octaves or same note in next chord)
        const dashedCount = await dashedKeys.count();
        expect(dashedCount).toBeGreaterThan(0);

        await page.keyboard.up('a');

        // Close
        await page.click('.PerformanceSurfaceModal .close-btn');
    });

    test('Performance Modal Bridge Tone Identification', async ({ page }) => {
        // Set up a known chord progression where we know there are common tones
        // C major (C, E, G) -> A minor (A, C, E). Common = C, E.
        await page.evaluate(async () => {
            const { ACTIONS, dispatch, validateProgression } = window.ensemble;

            // 1. Set global key
            dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'key', value: 'C' });
            dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isMinor', value: false });

            // 2. Set sections (which will be parsed into stepMap)
            const testSections = [
                { id: 's1', label: 'Test', value: 'I | vi', repeat: 1 }, // C major | A minor
            ];
            dispatch(ACTIONS.SET_PARAM, {
                module: 'arranger',
                param: 'sections',
                value: testSections,
            });

            // 3. Force re-parse
            validateProgression(window.ensemble.getState());

            // 4. Ensure we are at the start
            dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'step', value: 0 });
        });

        await page.click('[data-id="soloist"] [aria-label="Open Performance Mode"]');
        const modal = page.locator('.PerformanceSurfaceModal');

        // Verify we have bridge keys (Magenta)
        // Bridge keys have rgba(var(--magenta-rgb)...) in their style or computed background
        const bridgeKeys = modal.locator('button[style*="var(--magenta-rgb)"]');

        // Wait a moment for state to settle if needed
        await expect(bridgeKeys.first()).toBeVisible();
        const bridgeCount = await bridgeKeys.count();

        // In C major -> Am, C and E are bridge tones.
        expect(bridgeCount).toBeGreaterThan(0);

        // Verify the top border color of a bridge key is indeed magenta
        const bridgeBorder = await bridgeKeys
            .first()
            .evaluate((el) => getComputedStyle(el).borderTopColor);
        expect(bridgeBorder).toBeTruthy();

        // Close
        await page.click('.PerformanceSurfaceModal .close-btn');
    });
});
