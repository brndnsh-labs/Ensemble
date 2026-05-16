// @ts-nocheck
import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('ChartSurface @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
    });

    test.describe('Visualizer overlay', () => {
        test('opens on 🌈 button click and closes with Esc', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            const vizBtn = page.locator('[aria-label="Open visualizer"]');
            await expect(vizBtn).toBeVisible();
            await expect(page.locator('.viz-overlay')).toHaveCount(0);

            await vizBtn.click();
            await expect(page.locator('.viz-overlay')).toBeVisible();

            await page.keyboard.press('Escape');
            await expect(page.locator('.viz-overlay')).toHaveCount(0);
        });

        test('closes on backdrop click', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            await page.locator('[aria-label="Open visualizer"]').click();
            const overlay = page.locator('.viz-overlay');
            await expect(overlay).toBeVisible();

            const box = await overlay.boundingBox();
            expect(box).not.toBeNull();
            await page.mouse.click(box.x + 2, box.y + 2);

            await expect(overlay).toHaveCount(0);
        });

        test('close button dismisses overlay', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            await page.locator('[aria-label="Open visualizer"]').click();
            await expect(page.locator('.viz-overlay')).toBeVisible();

            await page.locator('.viz-overlay .header-btn[aria-label="Close visualizer"]').click();
            await expect(page.locator('.viz-overlay')).toHaveCount(0);
        });
    });

    test.describe('Instrument rail orientation', () => {
        test('renders vertical rail on wide desktop viewport', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            const rail = page.locator('.instrument-rail');
            await expect(rail).toBeVisible();
            await expect(rail).toHaveClass(/instrument-rail--vertical/);
        });

        test('renders bottom action bar on narrow mobile viewport @mobile', async ({ page }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            await expect(page.locator('.mobile-action-bar')).toBeVisible();
            await expect(page.locator('.chart-surface__rail')).toHaveCount(0);
        });

        test('mobile topbar hides Library/Edit/Share/Viz buttons @mobile', async ({ page }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            const topbar = page.locator('.chart-surface__topbar');
            await expect(topbar.locator('.chart-surface__share-btn')).toHaveCount(0);
            await expect(topbar.locator('.chart-surface__viz-btn')).toHaveCount(0);
            // Library/Edit no longer in topbar; reachable via overflow
            await expect(topbar.getByRole('button', { name: 'Library' })).toHaveCount(0);
            await expect(topbar.getByRole('button', { name: 'Edit' })).toHaveCount(0);
            // Overflow trigger is still there
            await expect(page.locator('.chart-surface__overflow-btn')).toBeVisible();
        });

        test('Mix action opens a sheet containing instrument rows @mobile', async ({ page }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            const mixBtn = page.locator('.mobile-action-bar__btn', { hasText: 'Mix' });
            await mixBtn.click();

            const sheet = page.locator('.mobile-mix-sheet');
            await expect(sheet).toBeVisible();
            await expect(sheet.locator('.workspace-studio-mix-row')).toHaveCount(5);
            await expect(
                sheet.locator('.workspace-studio-mixer-button-label', { hasText: 'Mixer' }),
            ).toBeVisible();

            // Closes via the sheet's close button
            await sheet.locator('.workspace-studio-surface-close').click();
            await expect(sheet).toBeHidden();
        });
    });

    test.describe('Library modal', () => {
        test('opens via Library button and closes on backdrop click', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            await page.getByRole('button', { name: 'Library' }).click();

            const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
            await expect(modal).toBeVisible();

            await page.keyboard.press('Escape');
            await expect(modal).toBeHidden();
        });
    });

    test.describe('Overflow menu', () => {
        test('opens and exposes Generate Song, Settings, and Manual actions', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            await page.getByRole('button', { name: 'More options' }).click();

            const panel = page.locator('#chartOverflowPanel');
            await expect(panel).toBeVisible();
            await expect(panel.getByRole('button', { name: 'Generate Song' })).toBeVisible();
            await expect(panel.getByRole('button', { name: 'Settings' })).toBeVisible();
            await expect(panel.getByRole('button', { name: 'Manual' })).toBeVisible();
        });

        test('Settings button opens the settings modal', async ({ page }) => {
            await page.setViewportSize({ width: 1366, height: 900 });
            await page.getByRole('button', { name: 'More options' }).click();
            await page
                .locator('#chartOverflowPanel')
                .getByRole('button', { name: 'Settings' })
                .click();

            await expect(page.locator('#settingsOverlay')).toBeVisible();
        });
    });

    test.describe('Editor mobile UX @mobile', () => {
        test('shows sticky symbol row above textarea in editor on touch viewport @mobile', async ({
            page,
        }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            await page.locator('.chart-surface__overflow-btn').click();
            await page.getByRole('button', { name: 'Edit' }).click();

            const editor = page.locator('#editorOverlay');
            await expect(editor).toBeVisible();

            // Symbol row should be visible (touch device = coarse pointer via emulation)
            const symbolRow = editor.locator('.symbol-row').first();
            await expect(symbolRow).toBeVisible();
        });

        test('editor modal fills viewport on mobile @mobile', async ({ page }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            await page.locator('.chart-surface__overflow-btn').click();
            await page.getByRole('button', { name: 'Edit' }).click();

            const content = page.locator('#editorOverlay .settings-content');
            await expect(content).toBeVisible();
            const box = await content.boundingBox();
            expect(box).not.toBeNull();
            // Full-bleed: content should span nearly the full viewport width (allows for scrollbar)
            expect(box.width).toBeGreaterThanOrEqual(360);
        });
    });

    test.describe('Sharing prominence', () => {
        test('shows "Shared with you" pill when URL has a chart payload', async ({ page }) => {
            // A minimal valid ?s= payload (base64 of a section array)
            const s = btoa(JSON.stringify([{ id: 'x', label: 'A', value: 'C Am F G' }]));
            await page.goto(`/?s=${encodeURIComponent(s)}`);
            await page.waitForSelector('html[data-hydrated="true"]', {
                state: 'attached',
                timeout: 15000,
            });

            const pill = page.locator('.chart-surface__shared-pill');
            await expect(pill).toBeVisible();
            await expect(pill).toContainText('Shared with you');
        });

        test('dismisses "Shared with you" pill on button click', async ({ page }) => {
            const s = btoa(JSON.stringify([{ id: 'x', label: 'A', value: 'C Am F G' }]));
            await page.goto(`/?s=${encodeURIComponent(s)}`);
            await page.waitForSelector('html[data-hydrated="true"]', {
                state: 'attached',
                timeout: 15000,
            });

            await page.locator('[aria-label="Dismiss shared notice"]').click();
            await expect(page.locator('.chart-surface__shared-pill')).toHaveCount(0);
        });

        test('Share button is visible at mobile breakpoint @mobile', async ({ page }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            const shareBtn = page.locator('.mobile-action-bar__btn', { hasText: 'Share' });
            await expect(shareBtn).toBeVisible();
        });
    });

    test.describe('Responsive layout', () => {
        test('topbar and chart are visible at 375px @mobile', async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await expect(page.locator('.chart-surface__topbar')).toBeVisible();
            await expect(page.locator('.chart-surface__chart')).toBeVisible();
        });

        test('renders horizontal rail on tablet breakpoint @ipad', async ({ page }) => {
            await page.setViewportSize({ width: 768, height: 1024 });
            const rail = page.locator('.instrument-rail');
            await expect(rail).toBeVisible();
            await expect(rail).toHaveClass(/instrument-rail--horizontal/);
        });
    });
});
