// @ts-nocheck
import type { Page } from '@playwright/test';
import pkg from '@playwright/test';
import { gotoHydrated } from './helpers/nav.js';

const { expect, test } = pkg;

async function openLibrary(page: Page): Promise<void> {
    const topbarLibrary = page
        .locator('.chart-surface__topbar')
        .getByRole('button', { name: 'Library' });
    if (await topbarLibrary.isVisible()) {
        await topbarLibrary.click();
        return;
    }
    await page.getByRole('button', { name: 'More options' }).click();
    await page.locator('#chartOverflowPanel').getByRole('button', { name: 'Library' }).click();
}

test.describe('Surprise Me wizard @ui', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHydrated(page);
    });

    test('Surprise Me at zero answers rolls a chart and shows toast actions', async ({ page }) => {
        await openLibrary(page);
        const modal = page.locator('#surpriseMeOverlay');
        await expect(modal).toBeVisible();

        // Switch to Roll tab.
        await modal.getByRole('button', { name: /Roll/ }).click();
        await expect(modal.locator('.surprise-me-wizard')).toBeVisible();

        // Surprise Me button is the headline action.
        const dice = modal.locator('.surprise-me-dice');
        await expect(dice).toBeVisible();
        await expect(dice).toContainText('Surprise Me');

        await dice.click();

        // Modal closes after the roll.
        await expect(modal).toBeHidden();

        // Toast with action buttons appears.
        const toast = page.locator('.notification-box');
        await expect(toast).toBeVisible();
        await expect(toast.locator('.notification-actions')).toBeVisible();

        // Reroll + Undo buttons are present.
        await expect(toast.getByRole('button', { name: /Reroll/ })).toBeVisible();
        await expect(toast.getByRole('button', { name: /Undo/ })).toBeVisible();
    });

    test('Reroll button on the toast generates again', async ({ page }) => {
        await openLibrary(page);
        const modal = page.locator('#surpriseMeOverlay');
        await modal.getByRole('button', { name: /Roll/ }).click();
        await modal.locator('.surprise-me-dice').click();

        const toast = page.locator('.notification-box');
        await expect(toast).toBeVisible();
        await toast.getByRole('button', { name: /Reroll/ }).click();

        // After reroll, a new toast (still with actions) should appear.
        await expect(page.locator('.notification-box')).toBeVisible();
    });

    test('Seed suggestion chip populates the seed and Role selector appears', async ({ page }) => {
        await openLibrary(page);
        const modal = page.locator('#surpriseMeOverlay');
        await modal.getByRole('button', { name: /Roll/ }).click();

        // No role selector before a seed is set.
        await expect(modal.locator('.surprise-me-role-field')).toHaveCount(0);

        // Click a suggest chip.
        await modal.getByRole('button', { name: 'I-V-vi-IV' }).click();

        // Role selector now visible.
        await expect(modal.locator('.surprise-me-role-field')).toBeVisible();

        // Seed chips show the chord tokens.
        const chips = modal.locator('.surprise-me-seed-chip');
        await expect(chips).toHaveCount(4);
        await expect(chips.nth(0)).toContainText('I');
    });

    test('Reset clears the seed back to the empty state', async ({ page }) => {
        await openLibrary(page);
        const modal = page.locator('#surpriseMeOverlay');
        await modal.getByRole('button', { name: /Roll/ }).click();

        await modal.getByRole('button', { name: 'I-V-vi-IV' }).click();
        await expect(modal.locator('.surprise-me-seed-chip')).toHaveCount(4);

        await modal.getByRole('button', { name: /Reset answers/ }).click();
        await expect(modal.locator('.surprise-me-seed-chip')).toHaveCount(0);
        await expect(modal.locator('.surprise-me-seed-add')).toBeVisible();
    });

    test('@mobile wizard renders cleanly on narrow viewports', async ({ page }) => {
        await openLibrary(page);
        const modal = page.locator('#surpriseMeOverlay');
        await modal.getByRole('button', { name: /Roll/ }).click();
        const wizard = modal.locator('.surprise-me-wizard');
        await expect(wizard).toBeVisible();

        // No horizontal scroll on the wizard at mobile widths.
        const overflow = await wizard.evaluate((el) => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
        }));
        // Allow a few pixels of sub-pixel rounding slop.
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 4);

        // Surprise Me + key/TS controls all reachable.
        await expect(modal.locator('.surprise-me-dice')).toBeVisible();
        await expect(modal.locator('select').first()).toBeVisible();

        // A seed chip click still works on mobile.
        await modal.getByRole('button', { name: 'I-V-vi-IV' }).click();
        await expect(modal.locator('.surprise-me-seed-chip')).toHaveCount(4);
    });
});
