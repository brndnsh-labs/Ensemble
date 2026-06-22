import pkg from '@playwright/test';
import { gotoHydrated, openSettings } from './helpers/nav.js';

const { expect, test } = pkg;

/** Read an instrument's sound-source state via the e2e bridge. */
async function readSource(page: pkg.Page, module: string) {
    return page.evaluate((m) => {
        const inst = (window as any).ensemble.getState()[m];
        return { voice: inst.voice, autoSound: inst.autoSound };
    }, module);
}

test.describe('Sounds settings section @ui', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHydrated(page);
    });

    test('Sounds tab shows per-instrument source controls (Auto default) and the pack library', async ({
        page,
    }) => {
        await openSettings(page);
        const modal = page.locator('#settingsOverlay .settings-content');
        await expect(modal).toBeVisible();
        await modal.getByRole('tab', { name: 'Sounds' }).click();

        // The Harmony lane (the one with a genre→sound map) exposes a source
        // radiogroup with Auto selected by default, plus Synth and its packs.
        const harmonyGroup = modal.getByRole('radiogroup', { name: /Harmony sound source/i });
        await expect(harmonyGroup).toBeVisible();

        const auto = harmonyGroup.getByRole('radio', { name: /^Auto/ });
        await expect(auto).toBeVisible();
        await expect(auto).toHaveAttribute('aria-checked', 'true');
        await expect(harmonyGroup.getByRole('radio', { name: /^Synth/ })).toBeVisible();
        // Packs appear as sources, disabled until installed.
        await expect(harmonyGroup).toContainText('String Ensemble');

        // The pack library (management) carries an "Install all packs" action and
        // per-pack Install buttons — separate from the source control.
        await expect(modal.getByRole('button', { name: /Install all packs/i })).toBeVisible();
        await expect(
            modal.getByRole('button', { name: /^Install Acoustic Grand Piano/i }),
        ).toBeVisible();
    });

    test('pinning a source suppresses genre auto-follow; choosing Auto re-enables it', async ({
        page,
    }) => {
        await openSettings(page);
        const modal = page.locator('#settingsOverlay .settings-content');
        await modal.getByRole('tab', { name: 'Sounds' }).click();
        const harmonyGroup = modal.getByRole('radiogroup', { name: /Harmony sound source/i });

        // Default: Auto.
        expect((await readSource(page, 'harmony')).autoSound).toBe(true);

        // Pin Synth — the lane is now manual.
        await harmonyGroup.getByRole('radio', { name: /^Synth/ }).click();
        const pinned = await readSource(page, 'harmony');
        expect(pinned.autoSound).toBe(false);
        expect(pinned.voice).toBe('synth');

        // A genre change must NOT move a pinned lane (Funk maps harmony→horns).
        await page.evaluate(() => {
            (window as any).ensemble.dispatch('SET_GENRE_FEEL', { genreName: 'Funk' });
        });
        const afterGenre = await readSource(page, 'harmony');
        expect(afterGenre.autoSound).toBe(false);
        expect(afterGenre.voice).toBe('synth');

        // Choosing Auto re-enables follow-the-genre.
        await harmonyGroup.getByRole('radio', { name: /^Auto/ }).click();
        expect((await readSource(page, 'harmony')).autoSound).toBe(true);
    });
});
