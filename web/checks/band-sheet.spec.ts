import {
    closeKeyPopover,
    expect,
    openBand,
    openKeyPopover,
    seedStarters,
    songLink,
    songMenuAction,
    test,
} from './fixtures';

// #1276 — the Band sheet's Groove and Practice tabs: swing/swing grid/humanize (and chord notation,
// which is the transport's Key popover's since #1757) and the
// chart's energy — auto intensity/band intensity, saved with the chart since the
// chart-format decision of 2026-09-26 (document-owned), master volume (a device
// preference, persisted independent of Save), and the metronome (runtime-derived,
// session-only by design — never saved, never a preference).
// Mirrors `instrument-settings.spec.ts`'s (#1275) helpers/structure.

async function closeBand(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Close band' }).click();
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

test('every Band-sheet control has an accessible name', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Groove');

    await expect(page.getByLabel('Swing', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Swing grid', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Humanize', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Auto intensity', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Band intensity', { exact: true })).toBeVisible();
    // Complexity is the old engine's harmonic setting; the band engine has nothing for it to set.
    await expect(page.getByLabel('Complexity', { exact: true })).toHaveCount(0);
    await openBand(page, 'Practice');
    await expect(page.getByLabel('Master volume', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Metronome', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Count-in', { exact: true })).toBeVisible();
    // Chord notation is the Key popover's alone (#1757).
    await expect(page.getByLabel('Chord notation', { exact: true })).toHaveCount(0);
});

test('document-owned feel fields (swing, swing grid, humanize, notation) persist through save, reload and revert', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Groove');

    const swing = page.getByLabel('Swing', { exact: true });
    const swingGrid = page.getByLabel('Swing grid', { exact: true });
    const humanize = page.getByLabel('Humanize', { exact: true });
    const notation = page.getByLabel('Chord notation', { exact: true });
    // The Blues starter's genre sets swing/swingSub at creation time: its band
    // style's shuffle, 100 on the eighths (`genreSwing`, the one swing authority).
    // Humanize is not set, so it shows the blues style's own (35, #2010); the starter's own
    // arrangement is authored with 'name' notation.
    await expect(swing).toHaveValue('100');
    await expect(swingGrid).toHaveValue('8th');
    await expect(humanize).toHaveValue('35');
    await expect(
        page.getByText('Humanize follows the Blues style until you change it.'),
    ).toBeVisible();
    await closeBand(page);
    await openKeyPopover(page);
    await expect(notation).toHaveValue('name');

    await notation.selectOption('roman');
    await expect(notation).toHaveValue('roman');
    await closeKeyPopover(page);
    await openBand(page, 'Groove');
    await setRange(page, 'Swing', 60);
    await swingGrid.selectOption('16th');
    await setRange(page, 'Humanize', 55);
    await expect(swing).toHaveValue('60');
    await expect(swingGrid).toHaveValue('16th');
    await expect(humanize).toHaveValue('55');
    await expect(
        page.getByText('Humanize follows the Blues style until you change it.'),
    ).toHaveCount(0);
    // Notation re-renders the chart immediately, not just the popover's own select.
    await expect(page.locator('.chord-button').first()).not.toHaveText('C7');
    await closeBand(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();

    // Revert to saved restores the pre-edit values while still unsaved.
    await songMenuAction(page, 'Revert to saved');
    await expect(page.locator('.chord-button').first()).toHaveText('C7');
    await openBand(page, 'Groove');
    await expect(swing).toHaveValue('100');
    await expect(swingGrid).toHaveValue('8th');
    await expect(humanize).toHaveValue('35');
    await closeBand(page);
    await openKeyPopover(page);
    await expect(notation).toHaveValue('name');
    await closeKeyPopover(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    // Redo the edits and this time save them.
    await openBand(page, 'Groove');
    await setRange(page, 'Swing', 60);
    await swingGrid.selectOption('16th');
    await setRange(page, 'Humanize', 55);
    await closeBand(page);
    await openKeyPopover(page);
    await notation.selectOption('roman');
    await closeKeyPopover(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').first().click();
    await expect(page.locator('.chord-button').first()).not.toHaveText('C7');
    await openBand(page, 'Groove');
    await expect(swing).toHaveValue('60');
    await expect(swingGrid).toHaveValue('16th');
    await expect(humanize).toHaveValue('55');
    await closeBand(page);
    await openKeyPopover(page);
    await expect(notation).toHaveValue('roman');
});

test('master volume is a device preference: it persists across reload without Save, independent of the chart', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Practice');

    const masterVolume = page.getByLabel('Master volume', { exact: true });
    await expect(masterVolume).toHaveValue('40');
    await setRange(page, 'Master volume', 75);
    await expect(masterVolume).toHaveValue('75');
    await closeBand(page);
    // A preference change alone must not create a document-save prompt.
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').first().click();
    await openBand(page, 'Practice');
    await expect(page.getByLabel('Master volume', { exact: true })).toHaveValue('75');
});

test('count-in (#1422) is a device preference too: it persists across reload without Save, independent of the chart', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Practice');

    const countIn = page.getByLabel('Count-in', { exact: true });
    // This suite seeds it OFF (`fixtures.ts`) so a bar of clicks doesn't push back the first
    // note/highlight in every OTHER spec that presses Play — the real product default is ON
    // (`playback.countIn`'s own initial value), unread here until this test writes one.
    await expect(countIn).not.toBeChecked();
    await countIn.check();
    await expect(countIn).toBeChecked();
    await closeBand(page);
    // A preference change alone must not create a document-save prompt.
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').first().click();
    await openBand(page, 'Practice');
    await expect(page.getByLabel('Count-in', { exact: true })).toBeChecked();
});

test("energy (auto intensity, band intensity) is the chart's own: it dirties the chart, reverts, and persists through save and reload", async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Groove');

    const autoIntensity = page.getByLabel('Auto intensity', { exact: true });
    const bandIntensity = page.getByLabel('Band intensity', { exact: true });
    // A starter is seeded on auto (`energy: 'auto'`), at the default level.
    await expect(autoIntensity).toBeChecked();
    await expect(bandIntensity).toBeDisabled();
    await expect(bandIntensity).toHaveValue('35');

    await autoIntensity.uncheck();
    await expect(bandIntensity).toBeEnabled();
    await setRange(page, 'Band intensity', 80);
    await expect(bandIntensity).toHaveValue('80');
    await closeBand(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();

    // Revert to saved puts the band back on auto.
    await songMenuAction(page, 'Revert to saved');
    await openBand(page, 'Groove');
    await expect(autoIntensity).toBeChecked();
    await expect(bandIntensity).toHaveValue('35');

    // Redo it and save it.
    await autoIntensity.uncheck();
    await setRange(page, 'Band intensity', 80);
    await closeBand(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').first().click();
    await openBand(page, 'Groove');
    await expect(page.getByLabel('Auto intensity', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Band intensity', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Band intensity', { exact: true })).toHaveValue('80');
    await closeBand(page);

    // Another chart opens on its own energy, not this one's.
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await songLink(page, 'Minor swing sketch', 'Jazz').click();
    await openBand(page, 'Groove');
    await expect(page.getByLabel('Auto intensity', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Band intensity', { exact: true })).toHaveValue('35');
});

test('the metronome is session-only: it never dirties the chart and resets on reload', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Practice');

    const metronome = page.getByLabel('Metronome', { exact: true });
    await expect(metronome).not.toBeChecked();
    await metronome.check();
    await expect(metronome).toBeChecked();
    await closeBand(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').first().click();
    await openBand(page, 'Practice');
    await expect(page.getByLabel('Metronome', { exact: true })).not.toBeChecked();
});

test('changing swing during playback does not stop the band', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();

    await openBand(page, 'Groove');
    await setRange(page, 'Swing', 60);
    await expect(page.getByLabel('Swing', { exact: true })).toHaveValue('60');
    await closeBand(page);

    // Still playing — a feel change must not have tripped the transport.
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('count-in (#1422) clicks one bar before the band, then the chart plays from the top', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Practice');
    await page.getByLabel('Count-in', { exact: true }).check();
    await closeBand(page);

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

test('humanize 20 is "not set": picking it shows the style\'s own amount (#2010)', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Groove');
    const humanize = page.getByLabel('Humanize', { exact: true });
    const hint = page.getByText('Humanize follows the Blues style until you change it.');
    await expect(humanize).toHaveValue('35');

    // Not set, a pick of 20 is still not set: the slider shows the blues style's 35 again, and
    // nothing changed, so there is nothing to save.
    await setRange(page, 'Humanize', 20);
    await expect(humanize).toHaveValue('35');
    await expect(hint).toBeVisible();

    // Set, a pick of 20 lets it go back to following the style.
    await setRange(page, 'Humanize', 55);
    await expect(humanize).toHaveValue('55');
    await expect(hint).toHaveCount(0);
    await setRange(page, 'Humanize', 20);
    await expect(humanize).toHaveValue('35');
    await expect(hint).toBeVisible();
    await closeBand(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('a slider step with no pointer or key behind it is still applied', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Groove');
    const humanize = page.getByLabel('Humanize', { exact: true });
    // Not set: the blues style's own (#2010).
    await expect(humanize).toHaveValue('35');

    // What assistive technology does to a range (a VoiceOver swipe, a switch-control step):
    // the value moves and the input reports it final, with no pointer or key event around it.
    await humanize.evaluate((el: HTMLInputElement) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!
            .set!;
        setter.call(el, '55');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(humanize).toHaveValue('55');
    await closeBand(page);
    // Applied to the chart, not just shown on the slider: there is something to save.
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});

// #1700 — a tap on the backdrop closes the sheet (as Escape does); a tap inside it never does.
test('a tap on the backdrop closes the sheet; a tap inside it does not', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Groove');
    const sheet = page.getByRole('dialog', { name: 'Band' });
    await expect(sheet).toBeVisible();
    // The sheet's own padding, beside its heading: the dialog element is the target there too.
    const box = (await sheet.boundingBox())!;
    await page.mouse.click(box.x + 6, box.y + box.height / 2);
    await expect(sheet).toBeVisible();
    // A drag that starts inside the sheet and is released over the backdrop (selecting text)
    // reports a click on the dialog outside its box too — it must not close it.
    await page.mouse.move(box.x + 6, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(4, 4);
    await page.mouse.up();
    await expect(sheet).toBeVisible();
    // The top-left corner of the page is backdrop on every layout (centred or bottom sheet).
    await page.mouse.click(4, 4);
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: 'Band…' })).toBeFocused();
});

// #1703 — one Band dialog: it opens on Players, remembers the tab it was left on, the trade chip
// opens it on Trade, and a lane's on/off switch is the same state the transport's chip shows.
test('the Band sheet remembers its tab, the trade chip opens it on Trade, and Players switches lanes', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    // The Sounds button left the song header; its contents are the Players tab now.
    await expect(page.getByRole('button', { name: 'Sounds' })).toHaveCount(0);

    const sheet = page.getByRole('dialog', { name: 'Band' });
    await page.getByRole('button', { name: 'Band…' }).click();
    await expect(sheet.getByRole('tab', { name: 'Players' })).toHaveAttribute(
        'aria-selected',
        'true',
    );

    await sheet.getByRole('tab', { name: 'Practice' }).click();
    await expect(sheet.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
        'aria-selected',
        'true',
    );
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: 'Band…' }).click();
    await expect(sheet.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
        'aria-selected',
        'true',
    );
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: /^Trade/ }).click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('tab', { name: 'Trade' })).toHaveAttribute(
        'aria-selected',
        'true',
    );

    await openBand(page, 'Players');
    const drumsChip = page.getByRole('button', { name: 'Drums', exact: true });
    await expect(drumsChip).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('switch', { name: 'Drums playing' }).click();
    await expect(drumsChip).toHaveAttribute('aria-pressed', 'false');
    await sheet.getByRole('switch', { name: 'Drums playing' }).click();
    await expect(drumsChip).toHaveAttribute('aria-pressed', 'true');
});
