// @ts-nocheck
import type { Locator, Page } from '@playwright/test';
import pkg from '@playwright/test';
import { gotoHydrated, openSettings } from './helpers/nav.js';

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
    const libraryModal = page.locator('#surpriseMeOverlay');
    await expect(libraryModal).toBeVisible();
    await libraryModal.getByRole('button', { name: 'All The Things You Are', exact: true }).click();

    // Unlock the chart (Edit button toggles chartLocked → false → InlineEditor renders).
    await openEditorFromSurface(page);
    await page.waitForSelector('.inline-editor', { state: 'visible' });
    return page.locator('.inline-editor');
}

test.describe('Modals Responsiveness @ui', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHydrated(page);
    });

    test('Settings Modal - Centering and Content', async ({ page }) => {
        // Open settings modal (via the topbar overflow menu)
        await openSettings(page);

        // Wait for modal to be visible
        await page.waitForSelector('#settingsOverlay', { state: 'visible' });
        const settingsModal = page.locator('#settingsOverlay .settings-content');
        await expect(settingsModal).toBeVisible();

        // Tabbed settings: the Appearance section hosts the theme picker.
        await settingsModal.getByRole('tab', { name: 'Appearance' }).click();
        await expect(settingsModal).toContainText('Theme');
        await expect(settingsModal.locator('.theme-picker')).toBeVisible();

        // Close modal
        await page.click('#closeSettingsBtn');
        await page.waitForSelector('#settingsOverlay', { state: 'hidden' });
    });

    test('Settings About tab - donate link is present, safe, and accessible', async ({ page }) => {
        await openSettings(page);
        const settingsModal = page.locator('#settingsOverlay .settings-content');
        await expect(settingsModal).toBeVisible();

        await settingsModal.getByRole('tab', { name: 'About' }).click();

        const donate = page.locator('#donateLink');
        await expect(donate).toBeVisible();
        // Opens the external Ko-fi page in a new tab, safely.
        await expect(donate).toHaveAttribute('href', /ko-fi\.com/);
        await expect(donate).toHaveAttribute('target', '_blank');
        await expect(donate).toHaveAttribute('rel', /noopener/);
        // Accessible name is present and the control is keyboard-focusable.
        await expect(donate).toHaveAttribute('aria-label', /Ko-fi/);
        await donate.focus();
        await expect(donate).toBeFocused();
    });

    test('Settings panel keeps scroll position when a control updates state', async ({ page }) => {
        // Regression: changing a setting (e.g. the session-timer stepper) used to
        // re-run the modal-a11y focus effect and snap the panel back to the top.
        await openSettings(page);
        const panel = page.locator('#settingsOverlay .settings-content');
        await expect(panel).toBeVisible();

        // Scroll to the bottom of the Playback tab, then toggle the last control.
        await panel.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
        });
        const before = await panel.evaluate((el) => el.scrollTop);
        expect(before).toBeGreaterThan(0);

        await page.locator('label.toggle-switch[for="applyPresetSettingsCheck"]').click();
        // Wait past the old 50ms focus-on-open timeout that caused the jump.
        await page.waitForTimeout(150);

        const after = await panel.evaluate((el) => el.scrollTop);
        expect(Math.abs(after - before)).toBeLessThan(5);
    });

    test('Inline editor — content layout', async ({ page }) => {
        const editor = await openEditorFromLibraryPreset(page);
        await expect(editor).toBeVisible();

        await expect(page.locator('.inline-editor .section-card')).toHaveCount(7);
        await expect(editor.getByRole('button', { name: /Add Section/ })).toBeVisible();
        await expect(editor.getByRole('button', { name: /Arrangement Tools Menu/ })).toBeVisible();

        await editor.getByRole('button', { name: /Arrangement Tools Menu/ }).click();
        const toolsMenu = page.locator('.editor-action-menu');
        await expect(toolsMenu).toBeVisible();
        await expect(toolsMenu).toContainText('Library');
        await expect(toolsMenu).toContainText('Clear All');
        await page.locator('.menu-click-away').dispatchEvent('click');

        const linkedGroup = page.locator('.inline-editor .section-group').first();
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
    });

    test('Inline editor — linked sections stack vertically on mobile @mobile', async ({ page }) => {
        const editor = await openEditorFromLibraryPreset(page);
        await expect(editor).toBeVisible();
        await expect(editor.getByRole('button', { name: /Add Section/ })).toBeVisible();

        const linkedGroup = page.locator('.inline-editor .section-group').first();
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

    test('Library — three modes accessible from the topbar', async ({ page }) => {
        // Topbar 📚 Library on desktop; overflow → Library on mobile.
        const topbarBtn = page
            .locator('.chart-surface__topbar')
            .getByRole('button', { name: /Library/ });
        if (await topbarBtn.isVisible()) {
            await topbarBtn.click();
        } else {
            await page.getByRole('button', { name: 'More options' }).click();
            await page
                .locator('#chartOverflowPanel')
                .getByRole('button', { name: /Library/ })
                .click();
        }

        await page.waitForSelector('#surpriseMeOverlay', { state: 'visible' });
        const modal = page.locator('#surpriseMeOverlay .modal-content');
        await expect(modal).toBeVisible();
        await expect(modal).toContainText('Library');

        // Library mode is default — verify the replace/append toggle is present.
        await expect(modal.getByRole('button', { name: /Replace chart/ })).toBeVisible();
        await expect(modal.getByRole('button', { name: /Append as section/ })).toBeVisible();

        // Switch to Templates and confirm the template grid renders.
        await modal.getByRole('button', { name: /Templates/ }).click();
        await expect(modal.locator('.template-card-btn').first()).toBeVisible();

        // Switch to Roll and verify the dice button (renamed to "Surprise Me"
        // in the wizard rebuild — commit 25a550e6).
        await modal.getByRole('button', { name: /Roll/ }).click();
        await expect(modal.getByRole('button', { name: /Surprise Me/ })).toBeVisible();
    });
});
