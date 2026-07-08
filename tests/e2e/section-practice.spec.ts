// @ts-nocheck
import pkg from '@playwright/test';
import { gotoHydrated } from './helpers/nav.js';

const { expect, test } = pkg;

/**
 * #1016 — section practice. Smoke the chart-header affordance: tap a section
 * label → popover with "start from here" / "loop this section"; looping starts
 * playback and shows the persistent loop badge (the one control that survives
 * the strip collapsing during play); tapping the badge drops the loop.
 */
test.describe('Section practice @ui', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHydrated(page);
    });

    test('popover offers start-from-here and loop; looping shows a clearable badge', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1366, height: 900 });

        const practiceLabel = page.locator('.section-strip__label--practice').first();
        await expect(practiceLabel).toBeVisible();

        // Popover opens with both practice options.
        await practiceLabel.click();
        const menu = page.locator('.section-strip__practice-menu');
        await expect(menu).toBeVisible();
        await expect(menu.getByRole('menuitem', { name: /Start from here/ })).toBeVisible();
        const loopItem = menu.getByRole('menuitem', { name: /Loop this section/ });
        await expect(loopItem).toBeVisible();

        // Loop → playback starts; the strip collapses and the loop badge appears
        // on the drilled section (badge only renders while playing + looping).
        await loopItem.click();
        const badge = page.locator('.section-strip__loop-badge');
        await expect(badge).toBeVisible();
        await expect(page.locator('.section-strip__practice-menu')).toHaveCount(0);

        // Tapping the badge drops the loop (badge disappears).
        await badge.click();
        await expect(page.locator('.section-strip__loop-badge')).toHaveCount(0);
    });

    test('during playback the section label stays live but chord cards go inert', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1366, height: 900 });

        // Stopped + locked (default): clicking a chord card opens the picker.
        await page.locator('.chord-card').first().click();
        await expect(page.locator('.chord-picker')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('.chord-picker')).toHaveCount(0);

        // Start playback from a section.
        await page.locator('.section-strip__label--practice').first().click();
        await page
            .locator('.section-strip__practice-menu')
            .getByRole('menuitem', { name: /Start from here/ })
            .click();

        // Mid-play: the section label practice trigger is still present…
        await expect(page.locator('.section-strip__label--practice').first()).toBeVisible();
        // …but chord cards are now inert — clicking one does NOT open the picker.
        await page.locator('.chord-card').first().click();
        await expect(page.locator('.chord-picker')).toHaveCount(0);
        // …and the measure box has shed its button role (no measure editor).
        await expect(page.locator('.measure-box[role="button"]')).toHaveCount(0);
    });

    test('popover works on mobile @mobile', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });

        const practiceLabel = page.locator('.section-strip__label--practice').first();
        await expect(practiceLabel).toBeVisible();

        await practiceLabel.click();
        const menu = page.locator('.section-strip__practice-menu');
        await expect(menu).toBeVisible();
        await expect(menu.getByRole('menuitem', { name: /Loop this section/ })).toBeVisible();

        // Start from here begins playback (the strip collapses out of the direction
        // controls); assert the popover dismisses cleanly.
        await menu.getByRole('menuitem', { name: /Start from here/ }).click();
        await expect(page.locator('.section-strip__practice-menu')).toHaveCount(0);
    });
});
