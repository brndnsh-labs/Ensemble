import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('Header Visual Integrity', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the app before each test
        await page.goto('/');
        // Wait for the app to be fully hydrated
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
    });

    test('Mobile Header - Title and Settings Icon @mobile', async ({ page }) => {
        // This test specifically targets the mobile viewport defined in config
        const header = page.locator('header');

        // 1. Verify title text is visible
        const title = header.locator('h1');
        await expect(title).toBeVisible();
        await expect(title).toHaveText('Ensemble');

        const playBtn = page.locator('#playBtn');
        const playBtnText = page.locator('#playBtnText');

        await expect(playBtn).toBeVisible();
        const startBox = await playBtn.boundingBox();
        if (!startBox) {
            throw new Error('Expected play button to have a bounding box before playback starts');
        }
        await playBtn.click();
        await expect(playBtnText).toHaveText(/STOP \(\d:\d{2}\)/);

        const [titleBox, playBtnBox] = await Promise.all([
            title.boundingBox(),
            playBtn.boundingBox(),
        ]);
        if (!titleBox || !playBtnBox) {
            throw new Error('Expected mobile header controls to be measurable');
        }
        expect(playBtnBox.width).toBeCloseTo(startBox.width, 1);
        expect(playBtnBox.height).toBeCloseTo(startBox.height, 1);
        expect(titleBox.x + titleBox.width).toBeLessThan(playBtnBox.x);

        // 2. Verify Settings button is visible
        const settingsBtn = page.locator('#settingsBtn');
        await expect(settingsBtn).toBeVisible();
    });

    test('Desktop Header - Layout @desktop', async ({ page }) => {
        // This test targets desktop viewports
        const header = page.locator('header');

        await expect(header).toBeVisible();

        // Ensure title is present
        const title = header.locator('h1');
        await expect(title).toContainText('Ensemble');

        // Ensure Play button is visible in header area
        const playBtn = page.locator('#playBtn');
        await expect(playBtn).toBeVisible();
    });
});
