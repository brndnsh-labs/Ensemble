// @ts-nocheck
import type { Locator, Page } from '@playwright/test';
import pkg from '@playwright/test';

const { expect, test } = pkg;

async function openEditorFromSurface(page: Page): Promise<void> {
    // On desktop the Edit button is in the topbar; on mobile it lives inside the overflow panel.
    const topbarEdit = page.locator('.chart-surface__topbar').getByRole('button', { name: 'Edit' });
    if (await topbarEdit.isVisible()) {
        await topbarEdit.click();
        return;
    }
    await page.getByRole('button', { name: 'More options' }).click();
    await page.locator('#chartOverflowPanel').getByRole('button', { name: 'Edit' }).click();
}

async function openLibrary(page: Page): Promise<void> {
    // On desktop the Library button is in the topbar; on mobile it lives inside the overflow panel.
    const topbarLibrary = page
        .locator('.chart-surface__topbar')
        .getByRole('button', { name: 'Library' });
    if (await topbarLibrary.isVisible()) {
        await topbarLibrary.click();
        return;
    }
    await page.getByRole('button', { name: 'More options' }).click();
    await page.locator('#chartOverflowPanel').getByRole('button', { name: 'Library' }).click();
}

async function openEditorFromLibraryPreset(page: Page): Promise<Locator> {
    // Load preset via Library modal
    await openLibrary(page);
    const libraryModal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
    await expect(libraryModal).toBeVisible();
    await libraryModal.getByRole('button', { name: 'All The Things You Are', exact: true }).click();

    // Open editor (topbar button on desktop, overflow on mobile)
    await openEditorFromSurface(page);
    await page.waitForSelector('#editorOverlay', { state: 'visible' });
    return page.locator('#editorOverlay .settings-content');
}

test.describe('Modals Responsiveness @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
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

        await page.click('#arrangerActionTrigger');
        const toolsMenu = page.locator('#arrangerActionMenu');
        await expect(toolsMenu).toBeVisible();
        await expect(toolsMenu).toContainText('Inspiration Hub');
        await expect(toolsMenu).toContainText('Clear All');
        await page.locator('.menu-click-away').dispatchEvent('click');

        const viewport = page.viewportSize();
        const editorBox = await editorModal.boundingBox();
        expect(viewport).not.toBeNull();
        expect(editorBox).not.toBeNull();
        expect(editorBox.width).toBeGreaterThan(viewport.width * 0.9);
        expect(editorBox.height).toBeGreaterThan(viewport.height * 0.8);

        const linkedGroup = page.locator('#editorOverlay .section-group').first();
        await expect(linkedGroup).toBeVisible();
        await expect(linkedGroup.locator('.section-card')).toHaveCount(2);
        const [leftCard, rightCard] = await Promise.all([
            linkedGroup.locator('.section-card').nth(0).boundingBox(),
            linkedGroup.locator('.section-card').nth(1).boundingBox(),
        ]);

        expect(leftCard).not.toBeNull();
        expect(rightCard).not.toBeNull();
        expect(Math.abs(leftCard.y - rightCard.y)).toBeLessThan(16);
        expect(rightCard.x).toBeGreaterThan(leftCard.x + leftCard.width * 0.45);

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

        const linkedGroup = page.locator('#editorOverlay .section-group').first();
        await expect(linkedGroup).toBeVisible();
        await expect(linkedGroup.locator('.section-card')).toHaveCount(2);
        const [topCard, bottomCard] = await Promise.all([
            linkedGroup.locator('.section-card').nth(0).boundingBox(),
            linkedGroup.locator('.section-card').nth(1).boundingBox(),
        ]);

        expect(topCard).not.toBeNull();
        expect(bottomCard).not.toBeNull();
        expect(Math.abs(topCard.x - bottomCard.x)).toBeLessThan(16);
        expect(bottomCard.y).toBeGreaterThan(topCard.y + topCard.height * 0.55);

        await page.click('#closeEditorBtn');
        await page.waitForSelector('#editorOverlay', { state: 'hidden' });
    });

    test('Share & Export Modal - Content and Consolidation', async ({ page }) => {
        // Open share modal via the Share button in the topbar
        await page.locator('.chart-surface__share-btn').click();

        await page.waitForSelector('#shareOverlay', { state: 'visible' });
        const shareModal = page.locator('#shareOverlay .modal-content');
        await expect(shareModal).toBeVisible();

        // Verify consolidated content
        await expect(shareModal).toContainText('Share & Export');
        await expect(shareModal).toContainText('1. Configure Content');
        await expect(shareModal).toContainText('2. Select Destination');

        // Close modal
        await page.click('#closeShareBtn');
        await page.waitForSelector('#shareOverlay', { state: 'hidden' });
    });

    test('Inspiration Hub Modal - Layout and Actions', async ({ page }) => {
        // Open the Inspiration Hub via the overflow panel → Generate Song
        await page.getByRole('button', { name: 'More options' }).click();
        await page
            .locator('#chartOverflowPanel')
            .getByRole('button', { name: 'Generate Song' })
            .click();

        await page.waitForSelector('#generateSongOverlay', { state: 'visible' });

        const generatorModal = page.locator('#generateSongOverlay .settings-content');
        await expect(generatorModal).toBeVisible();

        // Verify content
        await expect(generatorModal).toContainText('Inspiration Hub');

        // Switch to Randomize tab to see these settings
        await page.getByRole('button', { name: /Randomize/ }).click();
        await expect(generatorModal).toContainText('Root Key');
        await expect(generatorModal).toContainText('Key Quality');
        await expect(generatorModal).toContainText('Structure');

        // Close modal
        await page.click('#closeGenerateSongBtn');
        await page.waitForSelector('#generateSongOverlay', { state: 'hidden' });
    });
});
