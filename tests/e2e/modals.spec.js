import { expect, test } from '@playwright/test';

test.describe('Modals Responsiveness @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('Settings Modal - Centering and Content', async ({ page }) => {
        // Open settings modal
        await page.click('#settingsBtn');

        // Wait for modal to be visible
        await page.waitForSelector('#settingsOverlay', { state: 'visible' });
        const settingsModal = page.locator('#settingsOverlay .settings-content');
        await expect(settingsModal).toBeVisible();

        // Verify content
        await expect(settingsModal).toContainText('Appearance');
        await expect(settingsModal).toContainText('Theme');

        // Close modal
        await page.click('#closeSettingsBtn');
        await page.waitForSelector('#settingsOverlay', { state: 'hidden' });
    });

    test('Editor Modal - Content Layout', async ({ page }) => {
        // Open editor modal (the 'Edit Arrangement' button)
        await page.click('#editArrangementBtn');

        await page.waitForSelector('#editorOverlay', { state: 'visible' });
        const editorModal = page.locator('#editorOverlay .settings-content');
        await expect(editorModal).toBeVisible();

        // Verify content
        await expect(editorModal).toContainText('Arrangement Editor');

        // Close modal
        await page.click('#closeEditorBtn');
        await page.waitForSelector('#editorOverlay', { state: 'hidden' });
    });
});
