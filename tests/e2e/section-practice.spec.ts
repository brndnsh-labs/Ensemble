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

    test('loop arms the drill in place without auto-play; START shows the badge; stop clears it', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1366, height: 900 });

        const practiceLabel = page.locator('.section-strip__label--practice').first();
        await expect(practiceLabel).toBeVisible();

        // Popover opens with both practice options.
        await practiceLabel.click();
        const menu = page.locator('.section-strip__practice-menu');
        await expect(menu).toBeVisible();
        await expect(menu.getByRole('button', { name: /Start from here/ })).toBeVisible();
        await menu.getByRole('button', { name: /Loop this section/ }).click();

        // #1021 — "Loop this section" now ARMS the loop and expands the popover in
        // place (Stop looping + the ramp setup) WITHOUT starting playback: the
        // menu stays open, no badge yet, and the transport still reads START.
        await expect(menu).toBeVisible();
        await expect(menu.getByRole('button', { name: /Stop looping/ })).toBeVisible();
        await expect(page.locator('.section-strip__loop-badge')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'START' })).toBeVisible();

        // Pressing the MAIN transport START begins the drill; the strip collapses
        // to the loop badge (renders only while playing + looping).
        await page.getByRole('button', { name: 'START' }).click();
        const badge = page.locator('.section-strip__loop-badge');
        await expect(badge).toBeVisible();

        // Tapping the badge reopens the popover (drill config + stop); Stop clears.
        await badge.click();
        const loopMenu = page.locator('.section-strip__practice-menu');
        await expect(loopMenu).toBeVisible();
        await loopMenu.getByRole('button', { name: /Stop looping/ }).click();
        await expect(page.locator('.section-strip__loop-badge')).toHaveCount(0);
    });

    test('enabling the ramp discloses its controls + a start→goal summary and marks the transport @ui', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1366, height: 900 });

        // Arm a loop; the popover expands in place to the drill setup (no play).
        await page.locator('.section-strip__label--practice').first().click();
        const menu = page.locator('.section-strip__practice-menu');
        await menu.getByRole('button', { name: /Loop this section/ }).click();

        const toggle = menu.locator('.section-strip__ramp-toggle input[type="checkbox"]');
        // Progressive disclosure: toggle shows, inputs + summary hidden until on,
        // and the transport carries no ramp marker yet.
        await expect(toggle).toBeVisible();
        await expect(menu.locator('.section-strip__ramp-fields')).toHaveCount(0);
        await expect(page.locator('.bpm-ramp-indicator')).toHaveCount(0);

        // Flip it on → the start-% and climb inputs appear with a concrete
        // "start → goal BPM" summary, and the transport gains the ramp marker.
        await toggle.check();
        const startInput = menu.getByLabel(/Start speed/);
        const climbInput = menu.getByLabel('BPM added each loop');
        await expect(startInput).toBeVisible();
        await expect(climbInput).toBeVisible();
        await expect(menu.locator('.section-strip__ramp-summary')).toContainText('BPM');
        await expect(page.locator('.bpm-ramp-indicator')).toBeVisible();

        // #1021 — the fields must be wide enough to actually SHOW their 2-digit
        // value: the global input[type=number] rule + native spinners once clipped
        // them to near-zero usable width (toBeVisible() alone didn't catch it).
        for (const input of [startInput, climbInput]) {
            const box = await input.boundingBox();
            expect(box?.width ?? 0).toBeGreaterThan(36);
        }
        // and the values are the expected defaults, actually populated.
        await expect(startInput).toHaveValue('66');
        await expect(climbInput).toHaveValue('4');
    });

    test('during playback the section label stays live but chord cards go inert', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1366, height: 900 });

        // Stopped + locked (default): clicking a chord card opens the picker.
        await page.locator('.chord-card').first().click();
        const picker = page.locator('.chord-picker');
        await expect(picker).toBeVisible();
        // why: the Escape listener attaches in a mount effect that can still be
        // pending when the picker first paints (docs/FLAKY_TESTS.md e2e-timing) —
        // wait for the post-effect readiness marker before sending Escape.
        await expect(picker).toHaveAttribute('data-dismiss-ready', 'true');
        await page.keyboard.press('Escape');
        await expect(picker).toHaveCount(0);

        // Start playback from a section.
        await page.locator('.section-strip__label--practice').first().click();
        await page
            .locator('.section-strip__practice-menu')
            .getByRole('button', { name: /Start from here/ })
            .click();

        // Mid-play: the section label practice trigger is still present…
        await expect(page.locator('.section-strip__label--practice').first()).toBeVisible();
        // …and the measure box has shed its button role (no measure editor).
        // why: TOGGLE_PLAY flips isPlaying synchronously in the reducer, but the
        // re-render that detaches ChordCard's onPick is batched — waiting for this
        // (same re-render, same isPlaying read) before the next click closes the
        // window where the click could beat the commit (docs/FLAKY_TESTS.md e2e-timing).
        await expect(page.locator('.measure-box[role="button"]')).toHaveCount(0);
        // …so chord cards are now inert — clicking one does NOT open the picker.
        await page.locator('.chord-card').first().click();
        await expect(page.locator('.chord-picker')).toHaveCount(0);
    });

    test('popover works on mobile @mobile', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });

        const practiceLabel = page.locator('.section-strip__label--practice').first();
        await expect(practiceLabel).toBeVisible();

        await practiceLabel.click();
        const menu = page.locator('.section-strip__practice-menu');
        await expect(menu).toBeVisible();
        await expect(menu.getByRole('button', { name: /Loop this section/ })).toBeVisible();

        // Start from here begins playback (the strip collapses out of the direction
        // controls); assert the popover dismisses cleanly.
        await menu.getByRole('button', { name: /Start from here/ }).click();
        await expect(page.locator('.section-strip__practice-menu')).toHaveCount(0);
    });
});
