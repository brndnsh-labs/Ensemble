// @ts-nocheck
import pkg from '@playwright/test';
import { gotoHydrated } from './helpers/nav.js';

const { expect, test } = pkg;

// The suite-wide init script (playwright.config.ts) pre-sets the nudge's "seen"
// flag so the onboarding toast never pollutes other specs. These tests clear it
// before the (single) load to exercise the real post-load trigger. A fresh
// context has no `/packs/` SW cache, so pack detection finds zero installed —
// exactly the synth-only first-run state the nudge targets.
test.describe('Pack-install nudge @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.removeItem('ensemble.packNudgeSeen');
        });
        await gotoHydrated(page);
    });

    test('Open Packs deep-links to Settings → Packs', async ({ page }) => {
        const toast = page.locator('.notification-box', { hasText: 'real instruments' });
        await expect(toast).toBeVisible();

        await toast.getByRole('button', { name: 'Open Packs' }).click();
        await expect(toast).toBeHidden();

        await page.waitForSelector('#settingsOverlay.active');
        await expect(page.locator('#settingsTab-packs')).toHaveAttribute('aria-selected', 'true');
        // The Packs panel (where "Install all" lives) is the one rendered.
        await expect(page.locator('#settingsOverlay')).toContainText(/Install all/i);
    });
});
