import type { Page } from '@playwright/test';
import { appUrl, expect, seedStarters, songLink, songMenuAction, test, typeBar } from './fixtures';

/**
 * Browser history (#1700): each view — the songbook, All songs, Standards, a song — is one
 * history entry, so Back returns to where the musician came from instead of leaving the app, and
 * the URL never changes (the hash belongs to `#chart=` links).
 */

const home = (page: Page) => expect(page.locator('main.home').first()).toBeVisible();
const onSong = (page: Page, title: string) =>
    expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();

test('Back and Forward move between the songbook and All songs; the URL stays put', async ({
    page,
}) => {
    await seedStarters(page);
    const url = page.url();
    await page.getByRole('button', { name: /All 3 songs/ }).click();
    await expect(page.getByRole('heading', { name: /All songs/ })).toBeVisible();
    await page.goBack();
    await home(page);
    await expect(page.getByRole('heading', { name: /All songs/ })).toHaveCount(0);
    await page.goForward();
    await expect(page.getByRole('heading', { name: /All songs/ })).toBeVisible();
    expect(page.url()).toBe(url);
});

test('Back from a song returns to the page it was opened from', async ({ page }) => {
    await seedStarters(page);
    await page.getByRole('button', { name: /All 3 songs/ }).click();
    await songLink(page, 'Blue pocket').first().click();
    await onSong(page, 'Blue pocket');
    await page.goBack();
    await expect(page.getByRole('heading', { name: /All songs/ })).toBeVisible();
    await page.goBack();
    await home(page);
});

test('Back from a standard returns to the standards browser, then the songbook', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: '12-Bar Blues' });
    await row.getByRole('button', { name: 'Open' }).click();
    await onSong(page, '12-Bar Blues');
    await page.goBack();
    await expect(page.locator('main.standards-browser')).toBeVisible();
    // Forward rebuilds the standard from the catalog.
    await page.goForward();
    await onSong(page, '12-Bar Blues');
    await page.goBack();
    await page.goBack();
    await home(page);
});

test('switching Chart, Neck and the editor adds no entries: one Back leaves the song', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    await onSong(page, 'Blue pocket');
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await page.goBack();
    await home(page);
});

test('the in-app back button goes back in history too, so Forward reopens the song', async ({
    page,
}) => {
    await seedStarters(page);
    const length = await page.evaluate(() => history.length);
    await songLink(page, 'Blue pocket').first().click();
    await onSong(page, 'Blue pocket');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await home(page);
    await page.goForward();
    await onSong(page, 'Blue pocket');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await home(page);
    // Going in and out never stacks entries.
    expect(await page.evaluate(() => history.length)).toBe(length + 1);
});

test('Back with a dialog open closes the dialog and keeps the song', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    await onSong(page, 'Blue pocket');
    await songMenuAction(page, 'Export…');
    const dialog = page.getByTestId('export-dialog');
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).toBeHidden();
    await onSong(page, 'Blue pocket');
    // And the song's entry is still there: one more Back leaves it.
    await page.goBack();
    await home(page);
});

test('an unsaved edit survives Back the way it survives the back button', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    await onSong(page, 'Blue pocket');
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    // A bar typed and not left (#1723), as the edit panel's chord text was never applied.
    await typeBar(page, 1, 'Dm7');
    await page.goBack();
    await home(page);
    await songLink(page, 'Blue pocket').first().click();
    await onSong(page, 'Blue pocket');
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['Dm7']);
});

test('Back from a shared link lands on the songbook with the link consumed', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    });
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    await songMenuAction(page, 'Copy link');
    const link = await page.getByTestId('share-link-fallback').inputValue();
    // A fresh load of the link, as a tap on it elsewhere would be (same path, so a bare goto
    // would only change the hash in place).
    await page.goto('about:blank');
    await page.goto(link);
    await expect(page.locator('.song-subtitle')).toContainText('Opened from a shared link');
    await page.goBack();
    await home(page);
    expect(new URL(page.url()).hash).toBe('');
});

test('Back on an edited standard leaves at once and keeps the change (#1979)', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: '12-Bar Blues' });
    await row.getByRole('button', { name: 'Open' }).click();
    await onSong(page, '12-Bar Blues');
    const tempo = page.getByLabel('Tempo', { exact: true });
    const before = await tempo.inputValue();
    await page.getByRole('button', { name: 'Faster' }).click();
    await expect(tempo).not.toHaveValue(before);
    const changed = await tempo.inputValue();
    // No question on the way out: the change is kept on this device…
    await page.goBack();
    await expect(page.locator('main.standards-browser')).toBeVisible();
    // …and Forward (which rebuilds the standard) lands it, marked.
    await page.goForward();
    await onSong(page, '12-Bar Blues');
    await expect(tempo).toHaveValue(changed);
    await expect(page.locator('.song-subtitle')).toContainText('Changed · Keep a copy');
});

test('Back with a dialog open keeps Forward intact', async ({ page }) => {
    await seedStarters(page);
    await page.getByRole('button', { name: /All 3 songs/ }).click();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await home(page);
    // All songs is ahead of the songbook now. A dialog over the songbook, then Back…
    await songLink(page, 'Blue pocket').first().click();
    await onSong(page, 'Blue pocket');
    await songMenuAction(page, 'Export…');
    await page.goBack();
    await expect(page.getByTestId('export-dialog')).toBeHidden();
    await onSong(page, 'Blue pocket');
    await page.goBack();
    await home(page);
    // …and Forward still reaches the song, not a duplicate of the page under it.
    await page.goForward();
    await onSong(page, 'Blue pocket');
});
