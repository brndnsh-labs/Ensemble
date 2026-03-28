// cspell:ignore labelledby
import pkg from '@playwright/test';

const { expect, test } = pkg;

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

    test('Chord Visualizer - Continuous lead-sheet rows', async ({ page }) => {
        await page.getByRole('button', { name: 'Open arranger actions' }).click();
        await page.locator('.workspace-library-fab').dispatchEvent('click');
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

    test('Progression Library Modal opens from FAB', async ({ page }) => {
        const actionTrigger = page.getByRole('button', { name: 'Open arranger actions' });
        await actionTrigger.click();

        const libraryFab = page.locator('.workspace-library-fab');
        await expect(libraryFab).toBeVisible();
        await libraryFab.dispatchEvent('click');

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();
        await expect(modal.locator('#workspaceLibraryTitle')).toHaveText('Progression Library');
        await expect(modal.locator('.preset-chip-grid').first()).toBeVisible();

        await modal.locator('.preset-chip').first().click();
        await expect(modal).toBeHidden();

        await expect(page.getByRole('button', { name: 'Open arranger actions' })).toBeVisible();
    });

    test('Autumn Leaves stays readable without adding scroll at desktop size', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });

        await page.getByRole('button', { name: 'Open arranger actions' }).click();
        await page.locator('.workspace-library-fab').dispatchEvent('click');

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();

        await page.getByRole('button', { name: 'Autumn Leaves' }).click();
        await expect(modal).toBeHidden();

        const visualizer = page.locator('#chordVisualizer');
        const firstChord = visualizer.locator('.chord-card').first();

        await expect(firstChord).toBeVisible();
        await expect(visualizer.locator('.lead-sheet-row')).toHaveCount(8);
        await expect(visualizer.locator('.lead-sheet-row-marker')).toHaveCount(4);
        await expect(visualizer).toHaveAttribute('data-vertical-fill', 'expanded-readable');
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
            await page.getByRole('button', { name: 'Open arranger actions' }).click();
            await page.locator('.workspace-library-fab').dispatchEvent('click');
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

    test('All The Things You Are stays legible in ultra-compact mode', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });

        await page.getByRole('button', { name: 'Open arranger actions' }).click();
        await page.locator('.workspace-library-fab').dispatchEvent('click');

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
        await expect(visualizer).toHaveAttribute('data-density', 'ultra-compact');
        await expect(visualizer).toHaveAttribute('data-measures-per-row', '4');
        await expect(visualizer).toHaveAttribute('data-scroll-mode', 'guided');
        await expect(visualizer.locator('.lead-sheet-row-marker')).toHaveCount(7);
        await expect(visualizer.locator('.lead-sheet-row')).toHaveCount(9);
        expect(rowMeasureCounts).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4]);
        await expect(firstChord).toBeVisible();
        await expect
            .poll(async () =>
                firstChord.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
            )
            .toBeGreaterThan(16);
        await expect(visualizer).toHaveJSProperty(
            'scrollHeight',
            await visualizer.evaluate((el) => el.clientHeight),
        );

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

    test('Arranger action menu stays fully visible after loading a short preset', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.getByRole('button', { name: 'Open arranger actions' }).click();
        await page.locator('.workspace-library-fab').dispatchEvent('click');

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
        await expect(modal).toBeVisible();

        await page.getByRole('button', { name: 'Pop (Standard)' }).click();
        await expect(modal).toBeHidden();

        const actionMenu = page.locator('.workspace-fab-menu');
        const trigger = page.getByRole('button', { name: 'Open arranger actions' });
        const items = actionMenu.locator('.workspace-fab-items');
        const viewport = await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
        }));

        await page.mouse.click(5, 5);
        await page.waitForTimeout(150);
        await expect(actionMenu).not.toHaveClass(/is-open/);

        await trigger.click();
        await page.waitForTimeout(250);
        await page.mouse.move(16, 16);
        await page.waitForTimeout(250);

        await expect(actionMenu).toHaveClass(/is-open/);
        await expect(items).toBeVisible();
        await expect(page.locator('#arrangerSoloistSeed')).toBeVisible();

        const clickBox = await items.boundingBox();
        const seedBox = await page.locator('#arrangerSoloistSeed').boundingBox();
        const seedButtonBox = await page
            .locator('.workspace-fab-item--seed .icon-btn')
            .boundingBox();

        expect(clickBox).not.toBeNull();
        expect(seedBox).not.toBeNull();
        expect(seedButtonBox).not.toBeNull();
        expect(clickBox.x).toBeGreaterThanOrEqual(0);
        expect(clickBox.y).toBeGreaterThanOrEqual(0);
        expect(clickBox.x + clickBox.width).toBeLessThanOrEqual(viewport.width);
        expect(clickBox.y + clickBox.height).toBeLessThanOrEqual(viewport.height);
        expect(seedBox.y + seedBox.height).toBeLessThanOrEqual(clickBox.y + clickBox.height);
        expect(seedButtonBox.y + seedButtonBox.height).toBeLessThanOrEqual(
            clickBox.y + clickBox.height,
        );

        await page.mouse.click(5, 5);
        await page.waitForTimeout(150);
        await expect(actionMenu).not.toHaveClass(/is-open/);

        await trigger.hover();
        await page.waitForTimeout(250);
        await expect(actionMenu).not.toHaveClass(/is-open/);
        await expect
            .poll(async () => items.evaluate((el) => getComputedStyle(el).opacity))
            .toBe('0');
        await expect
            .poll(async () => items.evaluate((el) => getComputedStyle(el).pointerEvents))
            .toBe('none');
    });
});
