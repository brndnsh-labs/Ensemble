// cspell:ignore labelledby
import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('Arranger Mobile Scaling @mobile', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('Donna Lee renders cleanly in the mobile arranger viewport', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 640 });
        await page.click('[data-workspace-nav="arranger"]');
        await page.click('button[aria-label="Open arranger actions"]');
        await page.click('.workspace-library-fab');

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
        await page.click('button[aria-label="Open arranger actions"]');
        await page.click('.workspace-library-fab');
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
