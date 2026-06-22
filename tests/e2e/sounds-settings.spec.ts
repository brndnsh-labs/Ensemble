import pkg from '@playwright/test';
import { gotoHydrated, openSettings } from './helpers/nav.js';

const { expect, test } = pkg;

test.describe('Sounds settings section @ui', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHydrated(page);
    });

    test('Sounds tab lists the grand-piano pack and a chords source picker', async ({ page }) => {
        await openSettings(page);
        const modal = page.locator('#settingsOverlay .settings-content');
        await expect(modal).toBeVisible();

        // Switch to the Sounds tab.
        await modal.getByRole('tab', { name: 'Sounds' }).click();

        // The pack catalog shows the grand-piano card with an Install action and
        // its CC-BY credit.
        await expect(modal).toContainText('Acoustic Grand Piano');
        await expect(
            modal.getByRole('button', { name: /Install Acoustic Grand Piano/i }),
        ).toBeVisible();
        await expect(modal).toContainText('CC-BY');

        // The per-instrument source picker exposes a Chords source (Synth by default).
        const chordsSource = modal.locator('#soundSource-chords');
        await expect(chordsSource).toBeVisible();
    });
});
