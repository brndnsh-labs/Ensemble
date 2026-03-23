import pkg from '@playwright/test';

const { expect, test } = pkg;

test.describe('Soloist XY Pad', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15000 });

        await page.waitForFunction(() => window.ensemble !== undefined);
        await page.waitForFunction(() => window.ensemble.getState() !== undefined);

        // Find the soloist module toggle
        // Some views don't require clicking a button, the panel is just there.
        // Let's ensure the soloist module is expanded or just query the smart tab directly.
        await page.evaluate(() => {
            const soloistPanel = document.getElementById('panel-soloist');
            if (soloistPanel?.hidden) {
                soloistPanel.hidden = false;
            }
        });

        // Find the "Smart" tab in the soloist panel
        // Just force active tab via state to ensure XY pad renders
        await page.evaluate(() => {
            const state = window.ensemble.getState();
            state.soloist.activeTab = 'smart';
            window.ensemble.dispatch({
                type: 'SET_ACTIVE_TAB',
                payload: { module: 'soloist', tab: 'smart' },
            });
            // Alternatively we can use UI controls if visible, but directly setting it is more robust here.
        });
    });

    test('should update global state timbreX and timbreY when dragged', async ({ page }) => {
        const xyPad = page.locator('.xy-pad');
        await expect(xyPad).toBeVisible();

        const box = await xyPad.boundingBox();
        expect(box).not.toBeNull();

        // Start at center
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;

        await xyPad.dispatchEvent('pointerdown', {
            clientX: startX,
            clientY: startY,
            pointerId: 1,
            bubbles: true,
        });

        const targetX = box.x + box.width - 2;
        const targetY = box.y + 2;

        await xyPad.dispatchEvent('pointermove', {
            clientX: targetX,
            clientY: targetY,
            pointerId: 1,
            bubbles: true,
        });
        await xyPad.dispatchEvent('pointerup', {
            clientX: targetX,
            clientY: targetY,
            pointerId: 1,
            bubbles: true,
        });

        await page.waitForTimeout(100);

        // Check window.ensemble state
        const state = await page.evaluate(() => window.ensemble.getState());

        const { timbreX, timbreY } = state.soloist;

        expect(timbreX).toBeGreaterThan(0.9);
        expect(timbreY).toBeGreaterThan(0.9);
    });
});
