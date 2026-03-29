// cspell:ignore labelledby
import pkg from '@playwright/test';
import { expectLocatorFitsViewport, expectOwnsInteriorProbe } from './helpers/visibility.js';

const { expect, test } = pkg;

async function openLibraryFromArranger(page) {
    const libraryButton = page.locator('#arrangerLibraryInlineBtn');
    await expect(libraryButton).toBeVisible();
    await libraryButton.click();
}

async function expectPanelAttachedToTrigger(_page, triggerLocator, panelLocator) {
    const [triggerBox, panelBox] = await Promise.all([
        triggerLocator.boundingBox(),
        panelLocator.boundingBox(),
    ]);

    expect(triggerBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    const openGap =
        panelBox.y >= triggerBox.y
            ? panelBox.y - (triggerBox.y + triggerBox.height)
            : triggerBox.y - (panelBox.y + panelBox.height);

    expect(Math.abs(openGap)).toBeLessThanOrEqual(240);
}

test.describe('Arranger Mobile Scaling @mobile @ipad', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
    });

    test('Compact mobile toolbar keeps key, library, share, and seed as direct controls', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.click('[data-workspace-nav="arranger"]');

        await expect(page.locator('#keyMenuBtn')).toBeVisible();
        await expect(page.locator('#arrangerLibraryInlineBtn')).toBeVisible();
        await expect(page.locator('#shareHubBtn')).toBeVisible();
        await expect(page.locator('#soloistSeedMenuBtn')).toBeVisible();

        await page.locator('#keyMenuBtn').click();
        const keyTrigger = page.locator('#keyMenuBtn');
        const keyPanel = page.locator('#arrangerKeyPanel');
        await expect(keyPanel).toBeVisible();
        await expect(page.locator('#transDownBtn')).toBeVisible();
        await expect(page.locator('#transUpBtn')).toBeVisible();
        await expectPanelAttachedToTrigger(page, keyTrigger, keyPanel);
        await expectLocatorFitsViewport(page, keyPanel);
        await expectOwnsInteriorProbe(keyPanel);

        await page.mouse.click(8, 8);
        await expect(keyPanel).toBeHidden();

        await page.locator('#soloistSeedMenuBtn').click();
        const seedTrigger = page.locator('#soloistSeedMenuBtn');
        const seedPanel = page.locator('#soloistSeedPanel');
        await expect(seedPanel).toBeVisible();
        await expectPanelAttachedToTrigger(page, seedTrigger, seedPanel);
        await expectLocatorFitsViewport(page, seedPanel);
        await expectOwnsInteriorProbe(seedPanel);

        await page.mouse.click(8, 8);
        await expect(page.locator('#editArrangementBtn')).toBeVisible();
        await expect(page.locator('#arrangerOverflowBtn')).toHaveCount(0);
    });

    test('Tablet-sized viewport keeps the key menu fully visible @mobile', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.click('[data-workspace-nav="arranger"]');

        const keyTrigger = page.locator('#keyMenuBtn');
        const keyPanel = page.locator('#arrangerKeyPanel');
        await expect(keyTrigger).toBeVisible();

        await keyTrigger.click();
        await expect(keyPanel).toBeVisible();
        await expectPanelAttachedToTrigger(page, keyTrigger, keyPanel);
        await expectLocatorFitsViewport(page, keyPanel);
        await expectOwnsInteriorProbe(keyPanel);

        await page.mouse.click(8, 8);
        await expect(keyPanel).toBeHidden();
    });

    test('Donna Lee renders cleanly in the mobile arranger viewport', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 640 });
        await page.click('[data-workspace-nav="arranger"]');
        await openLibraryFromArranger(page);

        await page.getByRole('button', { name: 'Donna Lee' }).click();

        const modal = page.locator('[role="dialog"][aria-labelledby="workspaceLibraryTitle"]');
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
        await expect(visualizer.locator('.lead-sheet-row-marker')).toHaveCount(4);
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

    test('Tall mobile view stretches fit charts vertically without centering them', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 393, height: 852 });
        await page.click('[data-workspace-nav="arranger"]');
        await openLibraryFromArranger(page);
        await page.getByRole('button', { name: 'Giant Steps' }).click();

        const visualizer = page.locator('#chordVisualizer');
        const firstChord = visualizer.locator('.chord-card').first();

        await expect(visualizer).toBeVisible();
        await expect(visualizer).toHaveAttribute('data-scroll-mode', 'fit');
        await expect(visualizer).toHaveAttribute('data-vertical-fill', 'paper-fill');
        await expect
            .poll(async () =>
                firstChord.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
            )
            .toBeGreaterThan(15);
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
        await expect(visualizer).toHaveJSProperty(
            'scrollHeight',
            await visualizer.evaluate((el) => el.clientHeight),
        );
    });

    test('Long custom charts use guided internal scrolling on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 640 });
        await page.click('[data-workspace-nav="arranger"]');

        await page.evaluate(async () => {
            await window.ensemble.loadTools();
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

    test('Maximized arranger view exposes a touch close control', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 640 });
        await page.click('[data-workspace-nav="arranger"]');
        await page.click('#maximizeChordBtn');

        await expect(page.locator('body')).toHaveClass(/chord-maximized/);

        const exitButton = page.locator('.chord-maximize-exit-btn');
        await expect(exitButton).toBeVisible();
        await exitButton.click();

        await expect(page.locator('body')).not.toHaveClass(/chord-maximized/);
    });

    test('Maximized arranger view increases reading size for dense charts', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 640 });
        await page.click('[data-workspace-nav="arranger"]');
        await openLibraryFromArranger(page);
        await page.getByRole('button', { name: 'Autumn Leaves' }).click();

        const visualizer = page.locator('#chordVisualizer');
        await expect(visualizer).toBeVisible();

        const standardFontSize = await visualizer
            .locator('.chord-card')
            .first()
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

        await page.click('#maximizeChordBtn');
        await expect(page.locator('body')).toHaveClass(/chord-maximized/);

        const maximizedFontSize = await visualizer
            .locator('.chord-card')
            .first()
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

        expect(maximizedFontSize).toBeGreaterThan(standardFontSize + 1.5);
        await expect(visualizer).toHaveJSProperty(
            'scrollHeight',
            await visualizer.evaluate((el) => el.clientHeight),
        );
    });
});
