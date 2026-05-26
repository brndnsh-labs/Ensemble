// @ts-nocheck
// cspell:ignore labelledby
import type { Page } from '@playwright/test';
import pkg from '@playwright/test';
import {
    expectLocatorFitsViewport,
    expectOwnsInteriorProbe,
    expectWithinSurface,
} from './helpers/visibility.js';

const { expect, test } = pkg;

// Opens the Progression Library modal via the topbar Library button (desktop) or
// overflow menu (mobile — not used by these tests since all run at desktop/tablet sizes).
async function openLibrary(page: Page): Promise<void> {
    const libraryBtn = page.getByRole('button', { name: 'Library' });
    if (await libraryBtn.isVisible()) {
        await libraryBtn.click();
        return;
    }

    // Narrow viewports hide Library behind the overflow menu
    await page.locator('.chart-surface__overflow-btn').click();
    await page.getByRole('button', { name: 'Library' }).click();
}

async function choosePresetFromLibrary(page: Page, presetName: string): Promise<void> {
    const modal = page.locator('#surpriseMeOverlay');
    // Chips are always visible in the chip wall. Click the first matching chip by aria-label.
    await modal.locator(`.preset-library-chip-name[aria-label="${presetName}"]`).first().click();
}

test.describe('Arranger & Chord Visualizer @visual', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
    });

    test('Chord Visualizer - Default Layout', async ({ page }) => {
        const visualizer = page.locator('#chordVisualizer');
        await expect(visualizer).toBeVisible();

        await expect(visualizer.locator('.lead-sheet-row').first()).toBeVisible();
        await expect(visualizer.locator('.chord-card').first()).toBeVisible();
    });

    // Removed: "Arranger toolbar stretches across the header" — referenced #panel-arranger,
    // .workspace-arranger-controls-panel, #arrangerLibraryInlineBtn and other workspace-tab
    // selectors that no longer exist after the ChartSurface redesign (commit 3c5527ee).
    // Key-panel and seed-panel reachability are covered by the tests below.

    test('Chord Visualizer - Continuous lead-sheet rows', async ({ page }) => {
        await openLibrary(page);
        await choosePresetFromLibrary(page, 'Autumn Leaves');

        const visualizer = page.locator('#chordVisualizer');
        // Verify structural elements are present
        await expect(visualizer.locator('.lead-sheet-row')).toHaveCount(8);
        await expect(visualizer.locator('.section-strip--compact')).toHaveCount(4);
        await expect(visualizer).toHaveAttribute('data-measures-per-row', '4');
        await expect(visualizer).toHaveAttribute('data-scroll-mode', 'fit');
        await expect(visualizer.locator('.measure-box').first()).toBeVisible();
        await expect(visualizer.locator('.chord-card').first()).toBeVisible();
    });

    test('Chord Visualizer highlights the active chord during playback', async ({ page }) => {
        const visualizer = page.locator('#chordVisualizer');
        await expect(visualizer.locator('.chord-card.active')).toHaveCount(0);
        await expect(visualizer.locator('.lead-sheet-row--active')).toHaveCount(0);
        await expect(visualizer.locator('.measure-box--active')).toHaveCount(0);

        await page.locator('#playBtn').click();

        await expect(visualizer.locator('.chord-card.active').first()).toBeVisible({
            timeout: 10000,
        });
        await expect(visualizer.locator('.lead-sheet-row--active')).toHaveCount(1);
        await expect(visualizer.locator('.measure-box--active')).toHaveCount(1);
        await expect(visualizer.locator('.measure-box:has(.chord-card.active)')).toHaveCount(1);

        await page.locator('#playBtn').click();
    });

    test('Progression Library Modal opens from topbar', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await openLibrary(page);
        const modal = page.locator('#surpriseMeOverlay');
        await expect(modal).toBeVisible();
        await expect(modal.locator('#surprise-me-title')).toContainText('Library');
        await expect(modal.getByTestId('preset-library-search')).toBeVisible();
        await expect(modal.getByTestId('preset-library-result-summary')).toBeVisible();
        // Chip wall is the default view — Jazz row and a colored chip should be visible.
        await expect(
            modal.locator('[data-testid="preset-library-chip-row"][data-row-label="Jazz"]'),
        ).toBeVisible();
        await expect(
            modal.locator('.preset-library-chip[data-genre="Jazz"]').first(),
        ).toBeVisible();

        // Click the first Jazz chip to load it.
        await modal
            .locator(
                '[data-testid="preset-library-chip-row"][data-row-label="Jazz"] .preset-library-chip-name',
            )
            .first()
            .click();
        await expect(modal).toBeHidden();
    });

    test('Progression library supports search, pinning, and recents', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await openLibrary(page);
        const modal = page.locator('#surpriseMeOverlay');
        const search = modal.getByTestId('preset-library-search');

        // Search hides non-matching chips and collapses empty rows.
        await search.fill('autumn');
        await expect(
            modal.locator('.preset-library-chip-name[aria-label="Autumn Leaves"]').first(),
        ).toBeVisible();
        await expect(
            modal.locator('.preset-library-chip-name[aria-label="Pop (Standard)"]'),
        ).toHaveCount(0);
        await expect(
            modal.locator('[data-testid="preset-library-chip-row"][data-row-label="Pop/Rock"]'),
        ).toHaveCount(0);

        // Clear restores the full chip wall.
        await modal.getByTestId('preset-library-clear').click();
        await expect(
            modal.locator('.preset-library-chip-name[aria-label="Pop (Standard)"]'),
        ).toBeVisible();

        // Pinning a preset surfaces it in the always-visible Pinned row.
        await modal.getByRole('button', { name: 'Add Pop (Standard) to favorites' }).click();
        const pinnedRow = modal.locator(
            '[data-testid="preset-library-chip-row"][data-row-label="Pinned"]',
        );
        await expect(pinnedRow).toBeVisible();
        await expect(pinnedRow).toContainText('Pop (Standard)');

        // Loading a preset adds it to the Recent row on next open.
        await choosePresetFromLibrary(page, 'Pop (Ballad)');
        await expect(modal).toBeHidden();

        await openLibrary(page);
        const reopened = page.locator('#surpriseMeOverlay');
        const recentRow = reopened.locator(
            '[data-testid="preset-library-chip-row"][data-row-label="Recent"]',
        );
        await expect(recentRow).toBeVisible();
        await expect(recentRow).toContainText('Pop (Ballad)');
    });

    test('Progression library keeps sticky controls layered above scrolling results', async ({
        page,
    }) => {
        // Use a short viewport so the chip wall definitely overflows.
        await page.setViewportSize({ width: 1280, height: 600 });
        await openLibrary(page);

        const modal = page.locator('#surpriseMeOverlay');
        const toolbar = modal.getByTestId('preset-library-toolbar');
        const body = page.locator('#surpriseMeOverlay .settings-content');

        await body.evaluate((element) => {
            element.scrollTop = 400;
        });

        const toolbarOwnsProbe = await toolbar.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 8);
            return Boolean(hit?.closest('[data-testid="preset-library-toolbar"]'));
        });

        expect(toolbarOwnsProbe).toBe(true);
    });

    test('Autumn Leaves stays readable without adding scroll at desktop size', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });

        await openLibrary(page);

        const modal = page.locator('#surpriseMeOverlay');
        await expect(modal).toBeVisible();

        await choosePresetFromLibrary(page, 'Autumn Leaves');
        await expect(modal).toBeHidden();

        const visualizer = page.locator('#chordVisualizer');
        const firstChord = visualizer.locator('.chord-card').first();

        await expect(firstChord).toBeVisible();
        await expect(visualizer.locator('.lead-sheet-row')).toHaveCount(8);
        await expect(visualizer.locator('.section-strip--compact')).toHaveCount(4);
        await expect(visualizer).toHaveAttribute('data-vertical-fill', 'paper-fit');
        await expect
            .poll(async () =>
                firstChord.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
            )
            .toBeGreaterThan(18);
        await expect(visualizer).toHaveJSProperty(
            'scrollHeight',
            await visualizer.evaluate((el) => el.clientHeight),
        );
    });

    // Removed: "Short fit charts stay top-anchored instead of floating in the middle" —
    // .chart-surface__chart now uses `align-content: safe center`, so short charts are
    // intentionally vertically centred in the available space. The topGap < 60 assertion
    // directly contradicts the current design intent (commit 3c5527ee / chart-surface.css).

    test('All The Things You Are stays legible in guided compact mode', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });

        await openLibrary(page);

        const modal = page.locator('#surpriseMeOverlay');
        await expect(modal).toBeVisible();

        await choosePresetFromLibrary(page, 'All The Things You Are');
        await expect(modal).toBeHidden();

        const visualizer = page.locator('#chordVisualizer');
        const firstChord = visualizer.locator('.chord-card').first();
        const rowMeasureCounts = await visualizer
            .locator('.lead-sheet-row')
            .evaluateAll((rows) => rows.map((row) => row.querySelectorAll('.measure-box').length));

        await expect(visualizer).toHaveAttribute('data-total-measures', '36');
        await expect(visualizer).toHaveAttribute('data-density', 'compact');
        await expect(visualizer).toHaveAttribute('data-measures-per-row', '4');
        await expect(visualizer).toHaveAttribute('data-scroll-mode', 'guided');
        await expect(visualizer).toHaveAttribute('data-vertical-fill', 'paper-guided');
        await expect(visualizer.locator('.section-strip--compact')).toHaveCount(5);
        await expect(visualizer.locator('.lead-sheet-row')).toHaveCount(9);
        expect(rowMeasureCounts).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4]);
        await expect(firstChord).toBeVisible();
        await expect
            .poll(async () =>
                firstChord.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
            )
            .toBeGreaterThan(19);
        const scrollDelta = await visualizer.evaluate((el) => el.scrollHeight - el.clientHeight);
        expect(scrollDelta).toBeLessThanOrEqual(12);
    });

    test('Key panel stays fully visible after loading a short preset', async ({ page }) => {
        await page.setViewportSize({ width: 1024, height: 768 });
        await openLibrary(page);

        const modal = page.locator('#surpriseMeOverlay');
        await expect(modal).toBeVisible();

        await choosePresetFromLibrary(page, 'Pop (Standard)');
        await expect(modal).toBeHidden();

        const keyTrigger = page.locator('#keyMenuBtn');
        const keyPanel = page.locator('#arrangerKeyPanel');

        await page.mouse.click(5, 5);
        await page.waitForTimeout(150);
        await expect(keyPanel).toBeHidden();

        await keyTrigger.click();
        await page.waitForTimeout(250);
        await expect(keyPanel).toBeVisible();
        await expectLocatorFitsViewport(page, keyPanel);
        await expectOwnsInteriorProbe(keyPanel);
        await expectWithinSurface(keyPanel, page.locator('#keySelect'));
        await expectWithinSurface(keyPanel, page.locator('#transUpBtn'));

        await page.mouse.click(5, 5);
        await page.waitForTimeout(150);
        await expect(keyPanel).toBeHidden();
    });

    // Removed: seed-panel half of "Arranger key and seed panels stay fully visible" — the
    // #soloistSeedMenuBtn / #soloistSeedPanel toolbar triggers were removed with the workspace
    // tabs redesign (commit 3c5527ee). Seed control lives inside the instrument settings modal.

    test('Key panel stays reachable across desktop, tablet, and short mobile viewports', async ({
        page,
    }) => {
        const viewports = [
            { width: 1440, height: 900 },
            { width: 768, height: 1024 },
            { width: 1024, height: 768 },
            { width: 360, height: 640 },
        ];

        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await page.goto('/');
            await page.waitForSelector('html[data-hydrated="true"]', {
                state: 'attached',
                timeout: 15000,
            });

            const keyTrigger = page.locator('#keyMenuBtn');
            const keyPanel = page.locator('#arrangerKeyPanel');
            await keyTrigger.click();

            await expect(keyPanel).toBeVisible();
            await expectLocatorFitsViewport(page, keyPanel);
            await expectOwnsInteriorProbe(keyPanel);
            await expectWithinSurface(keyPanel, page.locator('#transDownBtn'));

            await page.mouse.click(5, 5);
        }
    });

    // Removed: seed-panel loop in "Arranger toolbar panels stay reachable" — #soloistSeedMenuBtn
    // and #soloistSeedPanel no longer exist in the topbar after the ChartSurface redesign.
    // #arrangerOverflowBtn likewise removed; overflow is now #chartOverflowPanel / .chart-surface__overflow-btn.
});
