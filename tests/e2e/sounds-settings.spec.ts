import pkg from '@playwright/test';
import { gotoHydrated, openSettings } from './helpers/nav.js';

const { expect, test } = pkg;

test.describe('Sounds settings section @ui', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHydrated(page);
    });

    test('Sounds tab shows a Chords source group with Synth selected and the grand pack', async ({
        page,
    }) => {
        await openSettings(page);
        const modal = page.locator('#settingsOverlay .settings-content');
        await expect(modal).toBeVisible();

        // Switch to the Sounds tab.
        await modal.getByRole('tab', { name: 'Sounds' }).click();

        // The Chords instrument group exposes a radio list of sources.
        const chordsGroup = modal.getByRole('radiogroup', { name: /Chords sound source/i });
        await expect(chordsGroup).toBeVisible();

        // Synth is always present and is the default selection (no blank state).
        const synth = chordsGroup.getByRole('radio', { name: /Synth/ });
        await expect(synth).toBeVisible();
        await expect(synth).toHaveAttribute('aria-checked', 'true');

        // The grand-piano pack appears as an installable source with its size +
        // an Install action (the radio is disabled until installed).
        await expect(chordsGroup).toContainText('Acoustic Grand Piano');
        await expect(
            chordsGroup.getByRole('button', { name: /Install Acoustic Grand Piano/i }),
        ).toBeVisible();
    });
});
