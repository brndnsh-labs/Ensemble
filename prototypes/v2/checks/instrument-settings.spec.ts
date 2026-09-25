import { appUrl, expect, test } from './fixtures';

// #1275 — per-instrument volume/reverb controls (and, on the old engine, style) in
// the Sounds panel. Mirrors `foundation.spec.ts`'s Sounds helpers and
// `share-link.spec.ts`'s clipboard-less fallback pattern rather than
// reinventing either.

async function openSounds(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Sounds', exact: true }).click();
}
async function closeSounds(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Close sounds' }).click();
}

/**
 * Commits a range input's value once, the way a drag's pointer-up would.
 * Playwright's `fill()` refuses `type="range"` and there is no built-in
 * drag-a-slider primitive, so this sets the DOM value through the native
 * property setter (keeping React's controlled-input tracking honest) and
 * fires `input` (live display) then `pointerup` (the component's
 * once-per-gesture commit — see `sounds-panel.tsx`'s `RangeSetting`).
 */
async function setRange(page: import('@playwright/test').Page, label: string, percent: number) {
    const input = page.getByLabel(label, { exact: true });
    await input.evaluate((el: HTMLInputElement, value: number) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!
            .set!;
        setter.call(el, String(value));
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, percent);
    await input.dispatchEvent('pointerup');
}

// Same rationale as `share-link.spec.ts`: force the fallback path on every
// engine so the assertion doesn't depend on which browser happens to grant
// `navigator.clipboard.writeText`.
async function withoutClipboard(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    });
}

test('every per-instrument sound control has a lane-scoped accessible name', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await openSounds(page);

    // The band engine's lanes: harmony is not a band role, and each genre plays its own
    // idioms, so the old engine's style, density and soloist-mode pickers are gone
    // (docs/design/band-engine.md).
    for (const label of ['Drums', 'Bass', 'Chords', 'Soloist']) {
        await expect(page.getByLabel(`${label} sound`, { exact: true })).toBeVisible();
        await expect(page.getByLabel(`${label} volume`, { exact: true })).toBeVisible();
        await expect(page.getByLabel(`${label} reverb`, { exact: true })).toBeVisible();
        await expect(page.getByLabel(`${label} style`, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByLabel('Harmony sound', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Chords density', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Soloist mode', { exact: true })).toHaveCount(0);
});

test('bass volume persists through save, reload, revert and a share link', async ({
    page,
    context,
}) => {
    // Registered before the first navigation, like `share-link.spec.ts`: an
    // `addInitScript` only takes effect on a page's NEXT document load.
    await withoutClipboard(page);
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await openSounds(page);

    const bassVolume = page.getByLabel('Bass volume', { exact: true });
    // Assert the known starting point before changing it.
    await expect(bassVolume).toHaveValue('100');

    await setRange(page, 'Bass volume', 40);
    await expect(bassVolume).toHaveValue('40');
    await closeSounds(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();

    // Revert to saved restores the pre-edit values while still unsaved.
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Revert to saved' }).click();
    await openSounds(page);
    await expect(bassVolume).toHaveValue('100');
    await closeSounds(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    // Redo the edits and this time save them.
    await openSounds(page);
    await setRange(page, 'Bass volume', 40);
    await closeSounds(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).first().click();
    await openSounds(page);
    await expect(bassVolume).toHaveValue('40');
    await closeSounds(page);

    // Share link round-trip: opens as an unsaved draft carrying the same values.
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Copy link', exact: true }).click();
    const linkInput = page.getByTestId('share-link-fallback');
    await expect(linkInput).toBeVisible();
    const link = await linkInput.inputValue();
    expect(link).toContain(appUrl('#chart='));
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    const fresh = await context.newPage();
    await withoutClipboard(fresh);
    await fresh.goto(link);
    await expect(fresh.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();
    await openSounds(fresh);
    await expect(fresh.getByLabel('Bass volume', { exact: true })).toHaveValue('40');
});

// The old engine's style picker, which the band engine doesn't have; this retires with the old
// engine (#1404).
test('changing an instrument style during playback does not stop the band', async ({ page }) => {
    await page.goto(appUrl('?engine=old'));
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    // Playback auto-focuses the chart and hides the header chrome, Sounds
    // included (`foundation.spec.ts`'s focused-mode test) — reveal it first.
    await page.getByRole('button', { name: 'Show controls' }).click();

    await openSounds(page);
    await page.getByLabel('Bass style', { exact: true }).selectOption('funk');
    await expect(page.getByLabel('Bass style', { exact: true })).toHaveValue('funk');
    await closeSounds(page);

    // Still playing — a style swap must not have tripped the transport.
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});
