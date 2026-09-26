import { appUrl, expect, test } from './fixtures';

// #1276 — the Feel & mix sheet: swing/swing grid/humanize/chord notation and the
// chart's energy — auto intensity/band intensity, saved with the chart since the
// chart-format decision of 2026-09-26 (document-owned), master volume (a device
// preference, persisted independent of Save), and the metronome (runtime-derived,
// session-only by design — never saved, never a preference).
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
    await expect(page.getByLabel('Count-in', { exact: true })).toBeVisible();
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
    // The Blues starter's genre sets swing/swingSub at creation time: its band
    // style's shuffle, 100 on the eighths (`genreSwing`, the one swing authority).
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

test('count-in (#1422) is a device preference too: it persists across reload without Save, independent of the chart', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await openFeel(page);

    const countIn = page.getByLabel('Count-in', { exact: true });
    // This suite seeds it OFF (`fixtures.ts`) so a bar of clicks doesn't push back the first
    // note/highlight in every OTHER spec that presses Play — the real product default is ON
    // (`playback.countIn`'s own initial value), unread here until this test writes one.
    await expect(countIn).not.toBeChecked();
    await countIn.check();
    await expect(countIn).toBeChecked();
    await closeFeel(page);
    // A preference change alone must not create a document-save prompt.
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).first().click();
    await openFeel(page);
    await expect(page.getByLabel('Count-in', { exact: true })).toBeChecked();
});

test("energy (auto intensity, band intensity) is the chart's own: it dirties the chart, reverts, and persists through save and reload", async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await openFeel(page);

    const autoIntensity = page.getByLabel('Auto intensity', { exact: true });
    const bandIntensity = page.getByLabel('Band intensity', { exact: true });
    // A starter saved before energy rode the chart plays on auto.
    await expect(autoIntensity).toBeChecked();
    await expect(bandIntensity).toBeDisabled();
    await expect(bandIntensity).toHaveValue('35');

    await autoIntensity.uncheck();
    await expect(bandIntensity).toBeEnabled();
    await setRange(page, 'Band intensity', 80);
    await expect(bandIntensity).toHaveValue('80');
    await closeFeel(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();

    // Revert to saved puts the band back on auto.
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Revert to saved' }).click();
    await openFeel(page);
    await expect(autoIntensity).toBeChecked();
    await expect(bandIntensity).toHaveValue('35');

    // Redo it and save it.
    await autoIntensity.uncheck();
    await setRange(page, 'Band intensity', 80);
    await closeFeel(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).first().click();
    await openFeel(page);
    await expect(page.getByLabel('Auto intensity', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Band intensity', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Band intensity', { exact: true })).toHaveValue('80');
    await closeFeel(page);

    // Another chart opens on its own energy, not this one's.
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await page.getByRole('button', { name: 'Minor swing sketch Jazz · Saved locally' }).click();
    await openFeel(page);
    await expect(page.getByLabel('Auto intensity', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Band intensity', { exact: true })).toHaveValue('35');
});

test('the metronome is session-only: it never dirties the chart and resets on reload', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await openFeel(page);

    const metronome = page.getByLabel('Metronome', { exact: true });
    await expect(metronome).not.toBeChecked();
    await metronome.check();
    await expect(metronome).toBeChecked();
    await closeFeel(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).first().click();
    await openFeel(page);
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

test('count-in (#1422) clicks one bar before the band, then the chart plays from the top', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await openFeel(page);
    await page.getByLabel('Count-in', { exact: true }).check();
    await closeFeel(page);

    const playButton = page.getByRole('button', { name: 'Stop playback', exact: true });
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(playButton).toBeVisible();
    // The play button counts the bar down instead of showing the stop glyph, and the chart
    // itself doesn't move yet — the count-in must not advance the playhead.
    await expect(playButton).toHaveText('1');
    await expect(page.locator('.chord[aria-current="true"]')).toHaveCount(0);
    // Once the bar elapses, the band's own downbeat lands and the glyph returns to stop.
    await expect(playButton).toHaveText('■', { timeout: 10_000 });
    await expect(page.locator('.chord[aria-current="true"]')).toHaveCount(1);
    await playButton.click();
});
