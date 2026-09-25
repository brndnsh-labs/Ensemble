import { appUrl, expect, test } from './fixtures';

// #1276 — the Feel & mix sheet: swing/swing grid/humanize/chord notation
// (document-owned, saved with the chart), master volume (a device preference,
// persisted independent of Save), and band intensity/auto intensity/metronome
// (runtime-derived, session-only by design — never saved, never a preference).
// Mirrors `instrument-settings.spec.ts`'s (#1275) helpers/structure.

async function openFeel(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Feel and mix', exact: true }).click();
}
async function closeFeel(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Close feel' }).click();
}

/** Same gesture-commit helper as `instrument-settings.spec.ts`'s `setRange`. */
async function setRange(page: import('@playwright/test').Page, label: string, value: number) {
    const input = page.getByLabel(label, { exact: true });
    await input.evaluate((el: HTMLInputElement, v: number) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!
            .set!;
        setter.call(el, String(v));
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await input.dispatchEvent('pointerup');
}

test('every Feel-sheet control has an accessible name', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await openFeel(page);

    await expect(page.getByLabel('Swing', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Swing grid', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Humanize', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Auto intensity', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Band intensity', { exact: true })).toBeVisible();
    // Complexity is the old engine's harmonic setting; the band engine has nothing for it to set.
    await expect(page.getByLabel('Complexity', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Master volume', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Metronome', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Chord notation', { exact: true })).toBeVisible();
});

test('document-owned feel fields (swing, swing grid, humanize, notation) persist through save, reload and revert', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await openFeel(page);

    const swing = page.getByLabel('Swing', { exact: true });
    const swingGrid = page.getByLabel('Swing grid', { exact: true });
    const humanize = page.getByLabel('Humanize', { exact: true });
    const notation = page.getByLabel('Chord notation', { exact: true });
    // The Blues starter's genre sets swing/swingSub at creation time
    // (`SET_GENRE_FEEL`), then its 'Blues Shuffle' drum preset's own `swing: 100`
    // wins over the genre's raw `swing: 90` (`loadDrumPreset` in
    // `instrument-controller.ts` runs as the genre-change effect and overwrites
    // it) — 100 is the real, correct value production applies, not 90.
    // humanize is the engine default; the starter's own arrangement
    // is authored with 'name' notation.
    await expect(swing).toHaveValue('100');
    await expect(swingGrid).toHaveValue('8th');
    await expect(humanize).toHaveValue('20');
    await expect(notation).toHaveValue('name');

    await setRange(page, 'Swing', 60);
    await swingGrid.selectOption('16th');
    await setRange(page, 'Humanize', 55);
    await notation.selectOption('roman');
    await expect(swing).toHaveValue('60');
    await expect(swingGrid).toHaveValue('16th');
    await expect(humanize).toHaveValue('55');
    await expect(notation).toHaveValue('roman');
    // Notation re-renders the chart immediately, not just the sheet's own select.
    await expect(page.locator('.chord-button').first()).not.toHaveText('C7');
    await closeFeel(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();

    // Revert to saved restores the pre-edit values while still unsaved.
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Revert to saved' }).click();
    await expect(page.locator('.chord-button').first()).toHaveText('C7');
    await openFeel(page);
    await expect(swing).toHaveValue('100');
    await expect(swingGrid).toHaveValue('8th');
    await expect(humanize).toHaveValue('20');
    await expect(notation).toHaveValue('name');
    await closeFeel(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    // Redo the edits and this time save them.
    await openFeel(page);
    await setRange(page, 'Swing', 60);
    await swingGrid.selectOption('16th');
    await setRange(page, 'Humanize', 55);
    await notation.selectOption('roman');
    await closeFeel(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).first().click();
    await expect(page.locator('.chord-button').first()).not.toHaveText('C7');
    await openFeel(page);
    await expect(swing).toHaveValue('60');
    await expect(swingGrid).toHaveValue('16th');
    await expect(humanize).toHaveValue('55');
    await expect(notation).toHaveValue('roman');
});

// The old engine's complexity slider, kept under `?engine=old` until it retires (#1404).
test('old engine: complexity persists with the other feel fields through save, reload and revert', async ({
    page,
}) => {
    await page.goto(appUrl('?engine=old'));
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await openFeel(page);

    const swing = page.getByLabel('Swing', { exact: true });
    const swingGrid = page.getByLabel('Swing grid', { exact: true });
    const humanize = page.getByLabel('Humanize', { exact: true });
    const complexity = page.getByLabel('Complexity', { exact: true });
    const notation = page.getByLabel('Chord notation', { exact: true });
    // The Blues starter's genre sets swing/swingSub at creation time
    // (`SET_GENRE_FEEL`), then its 'Blues Shuffle' drum preset's own `swing: 100`
    // wins over the genre's raw `swing: 90` (`loadDrumPreset` in
    // `instrument-controller.ts` runs as the genre-change effect and overwrites
    // it) — 100 is the real, correct value production applies, not 90.
    // humanize/complexity are the engine defaults; the starter's own arrangement
    // is authored with 'name' notation.
    await expect(swing).toHaveValue('100');
    await expect(swingGrid).toHaveValue('8th');
    await expect(humanize).toHaveValue('20');
    await expect(complexity).toHaveValue('30');
    await expect(notation).toHaveValue('name');

    await setRange(page, 'Swing', 60);
    await swingGrid.selectOption('16th');
    await setRange(page, 'Humanize', 55);
    await setRange(page, 'Complexity', 70);
    await notation.selectOption('roman');
    await expect(swing).toHaveValue('60');
    await expect(swingGrid).toHaveValue('16th');
    await expect(humanize).toHaveValue('55');
    await expect(complexity).toHaveValue('70');
    await expect(notation).toHaveValue('roman');
    // Notation re-renders the chart immediately, not just the sheet's own select.
    await expect(page.locator('.chord-button').first()).not.toHaveText('C7');
    await closeFeel(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();

    // Revert to saved restores the pre-edit values while still unsaved.
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Revert to saved' }).click();
    await expect(page.locator('.chord-button').first()).toHaveText('C7');
    await openFeel(page);
    await expect(swing).toHaveValue('100');
    await expect(swingGrid).toHaveValue('8th');
    await expect(humanize).toHaveValue('20');
    await expect(complexity).toHaveValue('30');
    await expect(notation).toHaveValue('name');
    await closeFeel(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    // Redo the edits and this time save them.
    await openFeel(page);
    await setRange(page, 'Swing', 60);
    await swingGrid.selectOption('16th');
    await setRange(page, 'Humanize', 55);
    await setRange(page, 'Complexity', 70);
    await notation.selectOption('roman');
    await closeFeel(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).first().click();
    await expect(page.locator('.chord-button').first()).not.toHaveText('C7');
    await openFeel(page);
    await expect(swing).toHaveValue('60');
    await expect(swingGrid).toHaveValue('16th');
    await expect(humanize).toHaveValue('55');
    await expect(complexity).toHaveValue('70');
    await expect(notation).toHaveValue('roman');
});

test('master volume is a device preference: it persists across reload without Save, independent of the chart', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await openFeel(page);

    const masterVolume = page.getByLabel('Master volume', { exact: true });
    await expect(masterVolume).toHaveValue('40');
    await setRange(page, 'Master volume', 75);
    await expect(masterVolume).toHaveValue('75');
    await closeFeel(page);
    // A preference change alone must not create a document-save prompt.
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).first().click();
    await openFeel(page);
    await expect(page.getByLabel('Master volume', { exact: true })).toHaveValue('75');
});

test('band intensity, auto intensity and the metronome are session-only: they reset on reload', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await openFeel(page);

    const autoIntensity = page.getByLabel('Auto intensity', { exact: true });
    const bandIntensity = page.getByLabel('Band intensity', { exact: true });
    const metronome = page.getByLabel('Metronome', { exact: true });
    await expect(autoIntensity).toBeChecked();
    await expect(bandIntensity).toBeDisabled();
    await expect(bandIntensity).toHaveValue('35');
    await expect(metronome).not.toBeChecked();

    await autoIntensity.uncheck();
    await expect(bandIntensity).toBeEnabled();
    await setRange(page, 'Band intensity', 80);
    await metronome.check();
    await expect(bandIntensity).toHaveValue('80');
    await expect(metronome).toBeChecked();
    await closeFeel(page);
    // Session-only fields never make the chart dirty.
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).first().click();
    await openFeel(page);
    await expect(page.getByLabel('Auto intensity', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Band intensity', { exact: true })).toHaveValue('35');
    await expect(page.getByLabel('Metronome', { exact: true })).not.toBeChecked();
});

test('changing swing during playback does not stop the band', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    // Playback auto-focuses the chart and hides the header chrome, Feel included
    // (`foundation.spec.ts`'s focused-mode test) — reveal it first.
    await page.getByRole('button', { name: 'Show controls' }).click();

    await openFeel(page);
    await setRange(page, 'Swing', 60);
    await expect(page.getByLabel('Swing', { exact: true })).toHaveValue('60');
    await closeFeel(page);

    // Still playing — a feel change must not have tripped the transport.
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});
