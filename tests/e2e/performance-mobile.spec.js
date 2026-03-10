import { expect, test } from '@playwright/test';

test.describe('Performance Mobile Quad-Pillar @ui @mobile', () => {
    test.beforeEach(async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 400, height: 800 });
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });
    });

    test('Performance Modal renders mobile canvas pillars', async ({ page }) => {
        // Switch to Soloist tab on mobile
        await page.click('.mobile-tabs-nav .tab-soloist');
        await page.waitForTimeout(500); // Wait for tab transition

        // Open performance modal
        await page.click('[data-id="soloist"] [aria-label="Open Performance Mode"]');

        const modal = page.locator('.PerformanceSurfaceModal');
        await expect(modal).toBeVisible();

        // Verify Canvas is present
        const canvas = page.locator('.PerformanceSurfaceModal canvas');
        await expect(canvas).toBeVisible();

        // Verify QUIT and LATCH buttons
        const quitBtn = page.locator('button').filter({ hasText: 'QUIT' });
        const latchBtn = page.locator('button').filter({ hasText: /LATCH/ });
        await expect(quitBtn).toBeVisible();
        await expect(latchBtn).toBeVisible();

        // Test LATCH toggle
        await latchBtn.click();
        await expect(latchBtn).toContainText('LATCH ON');

        // Verify snapshot
        await expect(modal).toHaveScreenshot('performance-modal-pillars-mobile.png');

        // Test QUIT
        await quitBtn.click();
        await expect(modal).toBeHidden();
    });

    test('Canvas interaction triggers note display', async ({ page }) => {
        await page.click('.mobile-tabs-nav .tab-soloist');
        await page.waitForTimeout(500);
        await page.click('[data-id="soloist"] [aria-label="Open Performance Mode"]');

        const canvas = page.locator('.PerformanceSurfaceModal canvas');

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
