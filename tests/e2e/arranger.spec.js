// cspell:ignore labelledby
import pkg from '@playwright/test';
import {
    expectLocatorFitsViewport,
    expectOwnsInteriorProbe,
    expectWithinSurface,
} from './helpers/visibility.js';

const { expect, test } = pkg;

async function openLibraryFromArranger(page) {
    const libraryButton = page.locator('#arrangerLibraryInlineBtn');
    if (await libraryButton.isVisible()) {
        await libraryButton.click();
        return;
    }

    throw new Error('Expected the arranger library button to be visible');
}

test.describe('Arranger & Chord Visualizer @visual', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('Chord Visualizer - Default Layout', async ({ page }) => {
        const visualizer = page.locator('#chordVisualizer');
        await expect(visualizer).toBeVisible();

        await expect(visualizer.locator('.lead-sheet-row').first()).toBeVisible();
        await expect(visualizer.locator('.chord-card').first()).toBeVisible();
    });

    test('Arranger toolbar stretches across the header and promotes direct key and action controls on desktop', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 900 });

        const arrangerPanel = page.locator('#panel-arranger');
        const controlsPanel = page.locator('.workspace-arranger-controls-panel');
        const libraryButton = page.locator('#arrangerLibraryInlineBtn');
        const editButton = page.locator('#editArrangementBtn');
        const shareButton = page.locator('#shareHubBtn');
        const keyButton = page.locator('#keyMenuBtn');
        const seedButton = page.locator('#soloistSeedMenuBtn');
        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');

        await expect(controlsPanel).toBeVisible();
        await expect(libraryButton).toBeVisible();
        await expect(editButton).toBeVisible();
        await expect(shareButton).toBeVisible();
        await expect(keyButton).toBeVisible();
        await expect(seedButton).toBeVisible();
        await expect(page.locator('#maximizeChordBtn')).toBeVisible();
        await expect(page.locator('#arrangerOverflowBtn')).toHaveCount(0);

        const [panelBox, controlsBox] = await Promise.all([
            arrangerPanel.boundingBox(),
            controlsPanel.boundingBox(),
        ]);

        expect(panelBox).not.toBeNull();
        expect(controlsBox).not.toBeNull();
        expect(controlsBox.width).toBeGreaterThan(panelBox.width * 0.85);

        await keyButton.click();
        await expect(page.locator('#arrangerKeyPanel')).toBeVisible();
        await expect(page.locator('#keySelect')).toBeVisible();
        await expect(page.locator('#relKeyBtn')).toBeVisible();
        await expect(page.locator('#transDownBtn')).toBeVisible();

        await page.mouse.click(8, 8);
        await seedButton.click();
        await expect(page.locator('#soloistSeedPanel')).toBeVisible();
        await expect(page.locator('#arrangerSoloistSeed')).toBeVisible();

        await page.mouse.click(8, 8);
        await libraryButton.click();
        await expect(modal).toBeVisible();
        await modal.locator('.workspace-library-close').click();
        await expect(modal).toBeHidden();
    });

    test('Chord Visualizer - Continuous lead-sheet rows', async ({ page }) => {
        await openLibraryFromArranger(page);
        await page.getByRole('button', { name: 'Autumn Leaves' }).click();

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

    test('Progression Library Modal opens from arranger toolbar', async ({ page }) => {
        await openLibraryFromArranger(page);
        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();
        await expect(modal.locator('#workspaceLibraryTitle')).toHaveText('Progression Library');
        await expect(modal.locator('.preset-chip-grid').first()).toBeVisible();

        await modal.locator('.preset-chip').first().click();
        await expect(modal).toBeHidden();

        await expect(page.locator('#keyMenuBtn')).toBeVisible();
        await expect(page.locator('#arrangerOverflowBtn')).toHaveCount(0);
    });

    test('Autumn Leaves stays readable without adding scroll at desktop size', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });

        await openLibraryFromArranger(page);

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();

        await page.getByRole('button', { name: 'Autumn Leaves' }).click();
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

    test('Short fit charts stay top-anchored instead of floating in the middle', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1440, height: 900 });

        for (const chartName of ['Pop (Standard)', 'Giant Steps']) {
            await openLibraryFromArranger(page);
            await page.getByRole('button', { name: chartName }).click();

            const visualizer = page.locator('#chordVisualizer');
            await expect(visualizer).toBeVisible();

            const spacing = await visualizer.evaluate((el) => {
                const rect = el.getBoundingClientRect();
                const rows = Array.from(el.querySelectorAll('.lead-sheet-row'));
                const first = rows[0]?.getBoundingClientRect();
                const last = rows.at(-1)?.getBoundingClientRect();
                return {
                    topGap: first ? first.top - rect.top : null,
                    bottomGap: last ? rect.bottom - last.bottom : null,
                };
            });

            expect(spacing.topGap).not.toBeNull();
            expect(spacing.bottomGap).not.toBeNull();
            expect(spacing.topGap).toBeLessThan(60);
            expect(spacing.bottomGap).toBeGreaterThan(spacing.topGap + 40);
        }
    });

    test('All The Things You Are stays legible in guided compact mode', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });

        await openLibraryFromArranger(page);

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();

        await page.getByRole('button', { name: 'All The Things You Are' }).click();
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

        const standardFontSize = await firstChord.evaluate((el) =>
            parseFloat(getComputedStyle(el).fontSize),
        );

        await page.click('#maximizeChordBtn');
        await expect(page.locator('body')).toHaveClass(/chord-maximized/);
        await expect
            .poll(async () =>
                visualizer
                    .locator('.chord-card')
                    .first()
                    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
            )
            .toBeGreaterThan(standardFontSize);
    });

    test('Arranger key and seed panels stay fully visible after loading a short preset', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1024, height: 768 });
        await openLibraryFromArranger(page);

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();

        await page.getByRole('button', { name: 'Pop (Standard)' }).click();
        await expect(modal).toBeHidden();

        const keyTrigger = page.locator('#keyMenuBtn');
        const keyPanel = page.locator('#arrangerKeyPanel');
        const seedTrigger = page.locator('#soloistSeedMenuBtn');
        const seedPanel = page.locator('#soloistSeedPanel');
        const viewport = await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
        }));

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

        await seedTrigger.click();
        await page.waitForTimeout(250);
        await expect(seedPanel).toBeVisible();
        await expectLocatorFitsViewport(page, seedPanel);
        await expectOwnsInteriorProbe(seedPanel);
        await expectWithinSurface(seedPanel, page.locator('#arrangerSoloistSeed'));
        await expect(page.locator('#arrangerOverflowBtn')).toHaveCount(0);

        const seedBox = await page.locator('#arrangerSoloistSeed').boundingBox();
        expect(seedBox).not.toBeNull();
        expect(seedBox.x + seedBox.width).toBeLessThanOrEqual(viewport.width);
        expect(seedBox.y + seedBox.height).toBeLessThanOrEqual(viewport.height);
    });

    test('Arranger toolbar panels stay reachable across desktop, tablet, and short mobile', async ({
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
            await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });

            const keyTrigger = page.locator('#keyMenuBtn');
            const keyPanel = page.locator('#arrangerKeyPanel');
            await keyTrigger.click();

            await expect(keyPanel).toBeVisible();
            await expectLocatorFitsViewport(page, keyPanel);
            await expectOwnsInteriorProbe(keyPanel);
            await expectWithinSurface(keyPanel, page.locator('#transDownBtn'));

            await page.mouse.click(5, 5);

            const seedTrigger = page.locator('#soloistSeedMenuBtn');
            const seedPanel = page.locator('#soloistSeedPanel');
            await seedTrigger.click();

            await expect(seedPanel).toBeVisible();
            await expectLocatorFitsViewport(page, seedPanel);
            await expectWithinSurface(seedPanel, page.locator('#arrangerSoloistSeed'));

            await expect(page.locator('#arrangerOverflowBtn')).toHaveCount(0);
        }
    });
});
