import pkg from '@playwright/test';

const { expect, test } = pkg;

async function openEditorFromLibraryPreset(page) {
    await page.click('button[aria-label="Open arranger actions"]');
    await page.locator('.workspace-library-fab').dispatchEvent('click');
    await page.getByRole('button', { name: 'All The Things You Are' }).click();
    await page.click('button[aria-label="Open arranger actions"]');
    await page.locator('#editArrangementBtn').dispatchEvent('click');
    await page.waitForSelector('#editorOverlay', { state: 'visible' });
    return page.locator('#editorOverlay .settings-content');
}

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
        const editorModal = await openEditorFromLibraryPreset(page);
        await expect(editorModal).toBeVisible();

        await expect(editorModal).toContainText('Arrangement Editor');
        await expect(editorModal).toContainText('7 sections');
        await expect(page.locator('#editorOverlay .section-card')).toHaveCount(7);
        await expect(page.locator('#addSectionBtn')).toBeVisible();
        await expect(page.locator('#arrangerActionTrigger')).toBeVisible();

        const viewport = page.viewportSize();
        const editorBox = await editorModal.boundingBox();
        expect(viewport).not.toBeNull();
        expect(editorBox).not.toBeNull();
        expect(editorBox.width).toBeGreaterThan(viewport.width * 0.9);
        expect(editorBox.height).toBeGreaterThan(viewport.height * 0.8);

        await page.click('#closeEditorBtn');
        await page.waitForSelector('#editorOverlay', { state: 'hidden' });
    });

    test('Editor Modal - Mobile fullscreen shell @mobile', async ({ page }) => {
        const editorModal = await openEditorFromLibraryPreset(page);
        await expect(editorModal).toBeVisible();
        await expect(editorModal).toContainText('Arrangement Editor');
        await expect(page.locator('#addSectionBtn')).toBeVisible();
        await expect(page.locator('#closeEditorBtn')).toBeVisible();

        const viewport = page.viewportSize();
        const editorBox = await editorModal.boundingBox();
        const computedShell = await editorModal.evaluate((el) => ({
            width: parseFloat(getComputedStyle(el).width),
            height: parseFloat(getComputedStyle(el).height),
        }));
        expect(viewport).not.toBeNull();
        expect(editorBox).not.toBeNull();
        expect(editorBox.x).toBeGreaterThanOrEqual(0);
        expect(editorBox.y).toBeGreaterThanOrEqual(0);
        expect(editorBox.x + editorBox.width).toBeLessThanOrEqual(viewport.width);
        expect(editorBox.y + editorBox.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(computedShell.width).toBeGreaterThanOrEqual(viewport.width - 2);
        expect(computedShell.height).toBeGreaterThanOrEqual(viewport.height - 2);

        await page.click('#closeEditorBtn');
        await page.waitForSelector('#editorOverlay', { state: 'hidden' });
    });

    test('Share & Export Modal - Content and Consolidation', async ({ page }) => {
        // Open share modal from the dashboard
        await page.click('button[aria-label="Open arranger actions"]');
        await page.locator('#shareHubBtn').dispatchEvent('click');

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
        await page.click('button[aria-label="Open arranger actions"]');
        await page.locator('#editArrangementBtn').dispatchEvent('click');
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
