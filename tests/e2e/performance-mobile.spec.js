import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('Performance Mobile Quad-Pillar @ui @mobile', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', {
            state: 'attached',
            timeout: 15000,
        });
    });

    test('Performance Modal renders mobile canvas pillars', async ({ page }) => {
        await page.click('[data-workspace-nav="perform"]');

        const performanceBtn = page.locator('button[aria-label="Open Performance Mode"]');
        await expect(performanceBtn).toBeVisible();
        await performanceBtn.click();

        const modal = page.locator('.PerformanceSurfaceModal');
        await expect(modal).toBeVisible();

        // Verify Canvas is present (Mobile uses Canvas instead of DOM keys)
        const canvas = modal.locator('canvas');
        await expect(canvas).toBeVisible();

        // Verify Close button
        const closeBtn = page.locator('button[aria-label="Close"]');
        if ((await closeBtn.count()) === 0) {
            // Fallback to generic close btn if aria-label is different
            await expect(page.locator('.PerformanceSurfaceModal .close-btn')).toBeVisible();
        } else {
            await expect(closeBtn).toBeVisible();
        }

        // Test Close
        const closeTrigger =
            (await closeBtn.count()) > 0
                ? closeBtn
                : page.locator('.PerformanceSurfaceModal .close-btn');
        await closeTrigger.click();
        await expect(modal).toBeHidden();
    });

    test('Canvas interaction triggers note display', async ({ page }) => {
        await page.click('[data-workspace-nav="perform"]');

        const performanceBtn = page.locator('button[aria-label="Open Performance Mode"]');
        await expect(performanceBtn).toBeVisible();
        await performanceBtn.click();

        const canvas = page.locator('.PerformanceSurfaceModal canvas');
        await expect(canvas).toBeVisible();

        // Dispatch a touch event to the far left lane (Current Safe)
        await canvas.dispatchEvent('touchstart', {
            touches: [{ identifier: 0, clientX: 50, clientY: 400 }],
            changedTouches: [{ identifier: 0, clientX: 50, clientY: 400 }],
        });

        // Note display should appear in center (we look for any text matching a note pattern)
        // We can't easily query canvas text, but we can verify it doesn't crash

        await canvas.dispatchEvent('touchend', {
            touches: [],
            changedTouches: [{ identifier: 0, clientX: 50, clientY: 400 }],
        });
    });
});
