// @ts-nocheck
// cspell:ignore labelledby

import type { Page } from '@playwright/test';
import pkg from '@playwright/test';

const { expect, test } = pkg;

// Opens the preset library via the overflow button (mobile pattern).
async function openLibraryFromArranger(page: Page): Promise<void> {
    await page.locator('.chart-surface__overflow-btn').click();
    await page
        .locator('#chartOverflowPanel')
        .getByRole('button', { name: /Library/ })
        .click();
}

async function choosePresetFromLibrary(page: Page, presetName: string): Promise<void> {
    const modal = page.locator('#surpriseMeOverlay');
    await modal.getByRole('button', { name: presetName, exact: true }).click();
}

// Removed: workspace surface was eliminated by UI redesign
// (tests "Compact mobile toolbar keeps key, library, share, and seed as direct controls"
//  and "Tablet-sized viewport keeps the key menu fully visible" asserted on
//  #arrangerLibraryInlineBtn, #soloistSeedMenuBtn, #editArrangementBtn, #arrangerOverflowBtn,
//  #shareHubBtn and #arrangerKeyPanel pop-over behavior — all removed with the arranger surface)

test.describe('Arranger Mobile Scaling @mobile @ipad', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
    });

    test('Donna Lee renders cleanly in the mobile arranger viewport', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 640 });
        await openLibraryFromArranger(page);

        const modal = page.locator('#surpriseMeOverlay');
        await expect(modal.getByTestId('preset-library-search')).toBeVisible();
        await modal.getByTestId('preset-library-search').fill('Donna');
        await choosePresetFromLibrary(page, 'Donna Lee');
        await expect(modal).toBeHidden();

        const visualizer = page.locator('#chordVisualizer');
        await expect(visualizer).toBeVisible();

        const metrics = await visualizer.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return {
                width: rect.width,
                height: rect.height,
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
            };
        });

        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
        expect(metrics.width).toBeGreaterThan(0);
        expect(metrics.height).toBeGreaterThan(0);

        await expect(visualizer.locator('.lead-sheet-row')).toHaveCount(8);
        await expect(visualizer.locator('.section-strip--compact')).toHaveCount(4);
        await expect(visualizer).toHaveAttribute('data-measures-per-row', '4');
        await expect
            .poll(async () =>
                visualizer
                    .locator('.chord-card')
                    .first()
                    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
            )
            .toBeGreaterThan(12);

        if (metrics.scrollHeight > metrics.clientHeight + 12) {
            const before = await visualizer.evaluate((el) => ({
                scrollTop: el.scrollTop,
                pageScroll: window.scrollY,
            }));
            const box = await visualizer.boundingBox();

            expect(box).not.toBeNull();

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.wheel(0, box.height * 1.25);

            await expect
                .poll(async () => visualizer.evaluate((el) => el.scrollTop))
                .toBeGreaterThan(before.scrollTop);
            await expect
                .poll(async () => page.evaluate(() => window.scrollY))
                .toBe(before.pageScroll);
        } else {
            expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 12);
        }
    });

    test('Progression library uses a full-bleed compact sheet on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openLibraryFromArranger(page);

        const modal = page.locator('#surpriseMeOverlay');

        await expect(modal).toBeVisible();

        const viewport = await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
        }));
        const modalBox = await modal.boundingBox();
        expect(modalBox).not.toBeNull();
        expect(Math.abs(modalBox.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(modalBox.y)).toBeLessThanOrEqual(1);
        expect(modalBox.width).toBeGreaterThanOrEqual(viewport.width - 4);
        expect(modalBox.height).toBeGreaterThanOrEqual(viewport.height - 4);

        // Chip rows stack with their genre label as a top-aligned anchor on mobile.
        const firstRow = modal.locator('[data-testid="preset-library-chip-row"]').first();
        await expect(firstRow).toBeVisible();
        await expect(firstRow.locator('.preset-library-chip-row-label')).toBeVisible();
        await expect(firstRow.locator('.preset-library-chip').first()).toBeVisible();
    });

    // Removed: "Tall mobile view stretches fit charts vertically without centering them"
    // The ChartSurface layout now uses `align-content: safe center` on the chart container,
    // so short "fit" charts are vertically centered rather than top-aligned. The assertions
    // (topGap < 60, bottomGap > topGap + 40) are incompatible with the current design.

    test('Long custom charts use guided internal scrolling on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 640 });

        await page.evaluate(async () => {
            const { ACTIONS, dispatch, validateProgression } = window.ensemble;
            const cycle = ['Imaj7', 'vim7', 'iim7', 'V7'];
            const testSections = [
                {
                    id: 'long-chart',
                    label: 'Long',
                    value: Array.from(
                        { length: 64 },
                        (_, index) => cycle[index % cycle.length],
                    ).join(' | '),
                    repeat: 1,
                },
            ];

            dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'key', value: 'C' });
            dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isMinor', value: false });
            dispatch(ACTIONS.SET_PARAM, {
                module: 'arranger',
                param: 'sections',
                value: testSections,
            });
            validateProgression(window.ensemble.getState());
        });

        const visualizer = page.locator('#chordVisualizer');
        await expect(visualizer).toBeVisible();
        await expect(visualizer).toHaveAttribute('data-measures-per-row', '4');
        await expect(visualizer).toHaveAttribute('data-scroll-mode', 'guided');
        await expect(visualizer.locator('.lead-sheet-row')).toHaveCount(16);

        const beforeScrollTop = await visualizer.evaluate((el) => el.scrollTop);

        await page.evaluate(() => {
            const { ACTIONS, dispatch } = window.ensemble;
            dispatch(ACTIONS.SET_PARAM, {
                module: 'chords',
                param: 'lastActiveChordIndex',
                value: 44,
            });
        });

        await expect
            .poll(async () => visualizer.evaluate((el) => el.scrollTop))
            .toBeGreaterThan(beforeScrollTop);
        await expect(visualizer.locator('.lead-sheet-row--active')).toHaveCount(1);
        await expect
            .poll(async () =>
                Number(
                    await visualizer
                        .locator('.lead-sheet-row--active')
                        .first()
                        .getAttribute('data-row-index'),
                ),
            )
            .toBeGreaterThan(0);
    });
});
