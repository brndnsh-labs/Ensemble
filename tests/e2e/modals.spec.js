import pkg from '@playwright/test';

const { expect, test } = pkg;

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
        await expect(settingsModal).toContainText('Visuals & Interface');
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

    test('Share & Export Modal - Content and Consolidation', async ({ page }) => {
        // Open share modal from the dashboard
        await page.click('#shareHubBtn');

        await page.waitForSelector('#shareOverlay', { state: 'visible' });
        const shareModal = page.locator('#shareOverlay .modal-content');
        await expect(shareModal).toBeVisible();

        // Verify consolidated content
        await expect(shareModal).toContainText('Share & Export');
        await expect(shareModal).toContainText('Configure Content');
        await expect(shareModal).toContainText('Select Destination');

        // Close modal
        await page.click('#shareOverlay .close-btn');
        await page.waitForSelector('#shareOverlay', { state: 'hidden' });
    });

    test('Inspiration Hub Modal - Layout and Actions', async ({ page }) => {
        // Open editor first
        await page.click('#editArrangementBtn');
        await page.waitForSelector('#editorOverlay', { state: 'visible' });

        // Open randomize menu
        await page.click('#arrangerActionTrigger');
        await page.click('#inspirationHubBtn');

        // Editor should close and generator should open
        await page.waitForSelector('#editorOverlay', { state: 'hidden' });
        await page.waitForSelector('#generateSongOverlay', { state: 'visible' });

        const generatorModal = page.locator('#generateSongOverlay .settings-content');
        await expect(generatorModal).toBeVisible();

        // Verify content
        await expect(generatorModal).toContainText('Inspiration Hub');

        // Switch to Randomize tab to see these settings
        await page.click('button:has-text("Randomize")');
        await expect(generatorModal).toContainText('Root Key');
        await expect(generatorModal).toContainText('Key Quality');
        await expect(generatorModal).toContainText('Structure');

        // Close modal
        await page.click('#closeGenerateSongBtn');
        await page.waitForSelector('#generateSongOverlay', { state: 'hidden' });
    });
});
