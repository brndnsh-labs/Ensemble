import type { Page } from '@playwright/test';
import pkg from '@playwright/test';
import { gotoHydrated, openSettings } from './helpers/nav.js';

const { expect, test } = pkg as unknown as typeof import('@playwright/test');

/** Read an instrument's sound-source state via the e2e bridge. */
async function readSource(page: Page, module: string) {
    return page.evaluate((m) => {
        const inst = (window as any).ensemble.getState()[m];
        return { voice: inst.voice, autoSound: inst.autoSound };
    }, module);
}

/** Open an instrument's settings popover from the rail. */
async function openInstrumentSettings(page: Page, label: string) {
    await page
        .getByRole('button', { name: `${label} settings` })
        .first()
        .click();
    const surface = page.locator('.workspace-studio-surface--settings.is-open');
    await expect(surface).toBeVisible();
    return surface;
}

test.describe('Sounds: pack library (gear) @ui', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHydrated(page);
    });

    test('the Packs tab is pure library management — no per-instrument source pickers', async ({
        page,
    }) => {
        await openSettings(page);
        const modal = page.locator('#settingsOverlay .settings-content');
        await expect(modal).toBeVisible();
        await modal.getByRole('tab', { name: 'Packs' }).click();

        // Install-all + per-pack install/preview/remove are here.
        await expect(modal.getByRole('button', { name: /Install all packs/i })).toBeVisible();
        await expect(modal).toContainText('Acoustic Grand Piano');
        await expect(
            modal.getByRole('button', { name: /^Install Acoustic Grand Piano/i }),
        ).toBeVisible();

        // Source assignment has moved to the rail — no source radio groups in the gear.
        await expect(modal.getByRole('radiogroup', { name: /sound source/i })).toHaveCount(0);
    });
});

test.describe('Sounds: per-instrument source control (rail) @ui', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHydrated(page);
    });

    test('Harmony settings expose a Source control; pinning suppresses genre auto-follow', async ({
        page,
    }) => {
        const surface = await openInstrumentSettings(page, 'Harmony');
        // Source is now a segmented chip row (tap-to-select), not a dropdown.
        const sourceGroup = surface.locator('.instrument-sound-source');
        const chip = (name: string) => sourceGroup.getByRole('button', { name, exact: true });
        await expect(sourceGroup).toBeVisible();

        // Default: Auto active.
        await expect(chip('Auto')).toHaveAttribute('aria-pressed', 'true');
        expect((await readSource(page, 'harmony')).autoSound).toBe(true);

        // Tap Synth — the lane is now manual.
        await chip('Synth').click();
        const pinned = await readSource(page, 'harmony');
        expect(pinned.autoSound).toBe(false);
        expect(pinned.voice).toBe('synth');
        await expect(chip('Synth')).toHaveAttribute('aria-pressed', 'true');

        // A genre change must NOT move a pinned lane (Funk maps harmony→horns).
        await page.evaluate(() => {
            (window as any).ensemble.dispatch('SET_GENRE_FEEL', { genreName: 'Funk' });
        });
        const afterGenre = await readSource(page, 'harmony');
        expect(afterGenre.autoSound).toBe(false);
        expect(afterGenre.voice).toBe('synth');

        // Tapping Auto re-enables follow-the-genre.
        await chip('Auto').click();
        expect((await readSource(page, 'harmony')).autoSound).toBe(true);
    });
});
