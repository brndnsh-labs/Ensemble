import { editorRevealed, expect, seedStarters, songLink, test, typeBar } from './fixtures';

/**
 * New song is a draft until it holds something (#1707): backing straight out leaves the songbook
 * as it was, and the first change — or leaving with bars typed — keeps it as an ordinary song.
 */

const newSong = async (page: import('@playwright/test').Page) => {
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    // Four bars to type over, the first of them C, and nothing open until one is pressed.
    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F']);
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
    await expect(page.locator('.song-subtitle')).toContainText(
        'Practice settings changed · Save to keep',
    );
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.getByRole('button', { name: /All 4 songs/ })).toBeVisible();
    await expect(songLink(page, 'Untitled song').first()).toBeVisible();
});

test('a nudge undone by hand on a kept new song leaves nothing unsaved (#1706)', async ({
    page,
}) => {
    await seedStarters(page);
    await newSong(page);
    await page.getByRole('button', { name: 'Faster' }).click();
    await expect(page.locator('.song-subtitle')).toContainText('Practice settings changed');
    // The kept song comes back from storage with its keys in another order; still the same song.
    await page.getByRole('button', { name: 'Slower' }).click();
    await expect(page.locator('.song-subtitle > span').first()).toHaveText('Saved on this device');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('leaving a new song with bars typed but not applied keeps them', async ({ page }) => {
    await seedStarters(page);
    await newSong(page);
    await typeBar(page, 1, 'Dm7');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByRole('button', { name: /All 4 songs/ })).toBeVisible();
    await songLink(page, 'Untitled song').first().click();
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['Dm7']);
});

test('Save on a new song commits it as it stands', async ({ page }) => {
    await seedStarters(page);
    await newSong(page);
    await typeBar(page, 1, 'Dm7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByRole('button', { name: /All 4 songs/ })).toBeVisible();
});

test('a new song the store refuses stays an unsaved draft the musician can still leave', async ({
    page,
}) => {
    await seedStarters(page);
    await newSong(page);
    await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
            const request = Reflect.apply(put, this, args);
            if (this.name === 'documents') {
                this.transaction.abort();
            }
            return request;
        };
    });
    await page.getByRole('button', { name: 'Faster' }).click();
    await expect(page.locator('.error-banner')).toBeVisible();
    // Refused once, it falls back to a draft like a standard's — not a keep retried forever.
    await expect(page.getByRole('button', { name: 'Keep a copy', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Back to songbook' })).toBeEnabled();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByRole('button', { name: /All 3 songs/ })).toBeVisible();
});

test('a title typed straight through the new song being kept lands whole (#1726 review)', async ({
    page,
}) => {
    await seedStarters(page);
    await newSong(page);
    const title = page.getByLabel('Song title');
    await title.fill('');
    await title.pressSequentially('Blue');
    // Past the pause that starts the keep: the rest is typed while it is being written.
    await page.waitForTimeout(800);
    await title.pressSequentially(' pocket two', { delay: 60 });
    await expect(title).toBeFocused();
    await expect(title).toBeEnabled();
    await expect(page.locator('.song-subtitle')).toContainText('Unsaved changes');
    await expect(title).toHaveValue('Blue pocket two');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(songLink(page, 'Blue pocket two')).toBeVisible();
});
