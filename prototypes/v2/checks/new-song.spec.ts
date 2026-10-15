import { expect, seedStarters, songLink, test } from './fixtures';

/**
 * New song is a draft until it holds something (#1707): backing straight out leaves the songbook
 * as it was, and the first change — or leaving with bars typed — keeps it as an ordinary song.
 */

const newSong = async (page: import('@playwright/test').Page) => {
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('C');
    await expect(page.locator('.song-subtitle')).toContainText('New song');
};

test('a New song backed straight out of leaves nothing behind', async ({ page }) => {
    await seedStarters(page);
    await newSong(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByRole('button', { name: /All 3 songs/ })).toBeVisible();
    await expect(songLink(page, 'Untitled song')).toHaveCount(0);

    // Browser Back too.
    await newSong(page);
    await page.goBack();
    await expect(page.getByRole('button', { name: /All 3 songs/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /All 3 songs/ })).toBeVisible();
});

test('the first change keeps a new song, and it survives a reload', async ({ page }) => {
    await seedStarters(page);
    await newSong(page);
    await page.getByRole('button', { name: 'Faster' }).click();
    // The song is in the songbook now, and the change itself is an unsaved draft over it: only
    // Save commits the musician's own edits.
    await expect(page.locator('.song-subtitle')).toContainText('Unsaved setup · locally recovered');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.getByRole('button', { name: /All 4 songs/ })).toBeVisible();
    await expect(songLink(page, 'Untitled song').first()).toBeVisible();
});

test('leaving a new song with bars typed but not applied keeps them', async ({ page }) => {
    await seedStarters(page);
    await newSong(page);
    await page.getByLabel('Chords in this bar').fill('Dm7');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByRole('button', { name: /All 4 songs/ })).toBeVisible();
    await songLink(page, 'Untitled song').first().click();
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['Dm7']);
});

test('Save on a new song commits it as it stands', async ({ page }) => {
    await seedStarters(page);
    await newSong(page);
    await page.getByLabel('Chords in this bar').fill('Dm7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByRole('button', { name: /All 4 songs/ })).toBeVisible();
});
