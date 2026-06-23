// @ts-nocheck
import type { Page } from '@playwright/test';
import pkg from '@playwright/test';
import { gotoHydrated } from './helpers/nav.js';

const { expect, test } = pkg;

const ACCENT_BY_LABEL: Record<string, string> = {
    Drums: 'groove',
    Bass: 'bass',
    Chords: 'chords',
    Harmony: 'harmony',
    Soloist: 'soloist',
};

// IDs in the DOM (set by InstrumentSettings#getModuleName) — note that `groove`
// renders as `drum`, `chords` as `chord`, and `harmony` stays `harmony`.
const SLIDER_PREFIX: Record<string, string> = {
    Drums: 'drum',
    Bass: 'bass',
    Chords: 'chord',
    Harmony: 'harmony',
    Soloist: 'soloist',
};

function settingsSurfaceFor(page: Page, label: string) {
    const accent = ACCENT_BY_LABEL[label];
    return page.locator(
        `.workspace-studio-surface--settings.workspace-studio-surface--${accent}.is-open`,
    );
}

async function openInstrumentSettings(page: Page, label: string) {
    await page
        .getByRole('button', { name: `${label} settings` })
        .first()
        .click();
    const surface = settingsSurfaceFor(page, label);
    await expect(surface).toBeVisible();
    return surface;
}

async function openMobileMixSheet(page: Page) {
    await page.locator('.mobile-action-bar__btn', { hasText: 'Mix' }).click();
    await expect(page.locator('.mobile-mix-sheet')).toBeVisible();
}

async function expectWithinViewport(page: Page, locator) {
    const viewport = page.viewportSize();
    const box = await locator.boundingBox();
    expect(viewport).not.toBeNull();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

test.describe('Instrument settings — desktop @ui', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await gotoHydrated(page);
    });

    test('mixer accordion exposes all 5 instrument strips', async ({ page }) => {
        const trigger = page.locator('.workspace-studio-mixer-accordion-trigger');
        await expect(trigger).toBeVisible();
        await trigger.click();

        const body = page.locator('.workspace-studio-mixer-accordion-body');
        await expect(body).toBeVisible();
        const strips = body.locator('.workspace-studio-mixer-strip');
        await expect(strips).toHaveCount(5);

        for (const label of Object.keys(SLIDER_PREFIX)) {
            const prefix = SLIDER_PREFIX[label];
            const volume = page.locator(`#${prefix}Volume`);
            const reverb = page.locator(`#${prefix}Reverb`);
            await volume.scrollIntoViewIfNeeded();
            await expect(volume).toBeVisible();
            await reverb.scrollIntoViewIfNeeded();
            await expect(reverb).toBeVisible();
        }
    });

    test('Drum settings popover exposes swing and swing-base', async ({ page }) => {
        const surface = await openInstrumentSettings(page, 'Drums');

        await expect(surface.locator('#swingSlider')).toBeVisible();
        await expect(surface.locator('#swingBaseSelect')).toBeVisible();

        await expectWithinViewport(page, surface);
    });

    test('Chords settings popover exposes density select', async ({ page }) => {
        const surface = await openInstrumentSettings(page, 'Chords');
        await expect(surface.locator('#densitySelect')).toBeVisible();
        await expectWithinViewport(page, surface);
    });

    test('Harmony settings popover exposes complexity slider', async ({ page }) => {
        const surface = await openInstrumentSettings(page, 'Harmony');
        await expect(surface.locator('#harmonyComplexity')).toBeVisible();
        await expectWithinViewport(page, surface);
    });

    test('Soloist settings popover exposes complexity and trading controls', async ({ page }) => {
        const surface = await openInstrumentSettings(page, 'Soloist');

        await expect(surface.locator('#soloistComplexity')).toBeVisible();
        const soloistCard = surface.locator('.workspace-studio-surface-card--soloist');
        await expect(soloistCard).toBeVisible();
        await expect(soloistCard.getByText('Trading')).toBeVisible();

        // Body container should be the scroll area when content exceeds height.
        const body = surface.locator('.workspace-studio-surface-body');
        const fits = await body.evaluate(
            (el) => el.scrollHeight >= el.clientHeight && el.clientHeight > 0,
        );
        expect(fits).toBe(true);
    });

    // Regression guard: the dimmed backdrop must dismiss on click (it inherits
    // the layer's pointer-events:none and needs pointer-events:auto re-enabled,
    // or click-away silently dies). Inner clicks must NOT dismiss. All
    // StudioSurface overlays (gear settings + genre) share this one backdrop.
    test('clicking the backdrop dismisses settings; inner clicks do not', async ({ page }) => {
        const surface = await openInstrumentSettings(page, 'Chords');

        // A click inside the panel keeps it open (the fix must not over-dismiss).
        await surface.locator('.workspace-studio-surface-header h3').click();
        await expect(surface).toBeVisible();

        // A click on the dimmed backdrop, away from the top-right anchored panel,
        // closes it (StudioSurface unmounts → the surface locator detaches).
        await page
            .locator('.workspace-studio-surface-backdrop')
            .click({ position: { x: 5, y: 5 } });
        await expect(surface).toBeHidden();
    });
});

test.describe('Instrument settings — mobile @mobile', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHydrated(page);
    });

    test('mix sheet opens with 5 rows and instrument settings reachable from a row', async ({
        page,
    }) => {
        await openMobileMixSheet(page);

        const sheet = page.locator('.mobile-mix-sheet');
        await expect(sheet.locator('.workspace-studio-mix-row')).toHaveCount(5);

        await sheet.getByRole('button', { name: 'Chords settings' }).click();
        const settings = settingsSurfaceFor(page, 'Chords');
        await expect(settings).toBeVisible();
        await expect(settings.locator('#densitySelect')).toBeVisible();
    });

    test('mixer accordion inside mix sheet scrolls to reveal every slider', async ({ page }) => {
        await openMobileMixSheet(page);

        const sheet = page.locator('.mobile-mix-sheet');
        const trigger = sheet.locator('.workspace-studio-mixer-accordion-trigger');
        await trigger.click();

        const body = sheet.locator('.workspace-studio-mixer-accordion-body');
        await expect(body).toBeVisible();

        // Bottom slider reachable via scroll.
        const lastReverb = page.locator('#soloistReverb');
        await lastReverb.scrollIntoViewIfNeeded();
        await expect(lastReverb).toBeVisible();

        // Top slider still reachable after scrolling back.
        const firstVolume = page.locator('#drumVolume');
        await firstVolume.scrollIntoViewIfNeeded();
        await expect(firstVolume).toBeVisible();
    });

    test('soloist settings inside mix sheet remain reachable on narrow viewport', async ({
        page,
    }) => {
        await openMobileMixSheet(page);

        const sheet = page.locator('.mobile-mix-sheet');
        await sheet.getByRole('button', { name: 'Soloist settings' }).click();

        const surface = settingsSurfaceFor(page, 'Soloist');
        await expect(surface).toBeVisible();

        const viewport = page.viewportSize();
        const box = await surface.boundingBox();
        expect(box).not.toBeNull();
        // Full-bleed sheet on mobile: spans most of the height, fully within width.
        expect(box.height).toBeGreaterThan(viewport.height * 0.6);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);

        // Trading controls sit at the bottom of the soloist surface; must be reachable via scroll.
        const trading = surface
            .locator('.workspace-studio-surface-card--soloist')
            .getByText('Trading');
        await trading.scrollIntoViewIfNeeded();
        await expect(trading).toBeVisible();
    });
});
