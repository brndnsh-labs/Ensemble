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
    const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
    await modal.getByRole('button', { name: presetName, exact: true }).click();
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
        await expect(visualizer.locator('.lead-sheet-row-marker')).toHaveCount(4);
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
        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();
        await expect(modal.locator('#workspaceLibraryTitle')).toHaveText('Progression Library');
        await expect(modal.getByTestId('preset-library-search')).toBeVisible();
        await expect(modal.getByTestId('preset-library-favorites-only')).toBeVisible();
        await expect(modal.locator('.preset-library-card-grid').first()).toBeVisible();
        await expect(modal.getByRole('button', { name: 'Jazz', exact: true })).toBeVisible();

        await modal.locator('.preset-library-card-button').first().click();
        await expect(modal).toBeHidden();
    });

    test('Progression library supports search, genre filters, favorites, and recents', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await openLibrary(page);
        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        const search = modal.getByTestId('preset-library-search');

        await search.fill('autumn');
        await expect(
            modal.getByRole('button', { name: 'Autumn Leaves', exact: true }),
        ).toBeVisible();
        await expect(
            modal.getByRole('button', { name: 'Pop (Standard)', exact: true }),
        ).toHaveCount(0);

        await modal.getByTestId('preset-library-clear').click();
        await modal.getByRole('button', { name: 'Jazz', exact: true }).click();
        await expect(
            modal.getByRole('button', { name: 'Autumn Leaves', exact: true }),
        ).toBeVisible();
        await expect(
            modal.getByRole('button', { name: 'Pop (Standard)', exact: true }),
        ).toHaveCount(0);

        await modal.getByTestId('preset-library-clear').click();
        await modal.getByRole('button', { name: 'Add Pop (Standard) to favorites' }).click();
        await expect(modal).toContainText('Pinned favorites');
        await expect(modal.locator('.preset-library-section').first()).toContainText(
            'Pop (Standard)',
        );

        await modal.getByTestId('preset-library-favorites-only').click();
        await expect(
            modal.getByRole('button', { name: 'Pop (Standard)', exact: true }),
        ).toBeVisible();
        await expect(modal.getByRole('button', { name: 'Autumn Leaves', exact: true })).toHaveCount(
            0,
        );

        await modal.getByTestId('preset-library-favorites-only').click();
        await choosePresetFromLibrary(page, 'Pop (Ballad)');
        await expect(modal).toBeHidden();

        await openLibrary(page);
        await expect(
            page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]'),
        ).toContainText('Recent picks');
        await expect(
            page
                .locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]')
                .getByRole('button', { name: 'Pop (Ballad)', exact: true })
                .first(),
        ).toBeVisible();
    });

    test('Progression library keeps sticky controls layered above scrolling results', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await openLibrary(page);

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        const toolbar = modal.getByTestId('preset-library-toolbar');
        const body = page.locator('.workspace-library-body');

        await body.evaluate((element) => {
            element.scrollTop = 650;
        });

        const toolbarOwnsProbe = await toolbar.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 8);
            return Boolean(hit?.closest('[data-testid="preset-library-toolbar"]'));
        });

        expect(toolbarOwnsProbe).toBe(true);
    });

    test('Progression library keeps card widths stable when search narrows results', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await openLibrary(page);

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        const firstCard = modal.locator('.preset-library-card').first();
        const search = modal.getByTestId('preset-library-search');

        const beforeWidth = await firstCard.evaluate(
            (element) => element.getBoundingClientRect().width,
        );
        await search.fill('autumn');
        const afterWidth = await firstCard.evaluate(
            (element) => element.getBoundingClientRect().width,
        );

        expect(afterWidth).toBeLessThanOrEqual(beforeWidth + 32);
        expect(afterWidth).toBeLessThanOrEqual(320);
    });

    test('Autumn Leaves stays readable without adding scroll at desktop size', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });

        await openLibrary(page);

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();

        await choosePresetFromLibrary(page, 'Autumn Leaves');
        await expect(modal).toBeHidden();

        const visualizer = page.locator('#chordVisualizer');
        const firstChord = visualizer.locator('.chord-card').first();

        await expect(firstChord).toBeVisible();
        await expect(visualizer.locator('.lead-sheet-row')).toHaveCount(8);
        await expect(visualizer.locator('.lead-sheet-row-marker')).toHaveCount(4);
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

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
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
        await expect(visualizer.locator('.lead-sheet-row-marker')).toHaveCount(7);
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

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
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
