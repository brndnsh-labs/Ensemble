import type { Page } from '@playwright/test';
import {
    backToSongbook,
    draftKept,
    newSongOnTheStand,
    openSong,
    openWithAccounts,
    saveAndUpload,
    signUp,
    songTitles,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * Songs no longer in your account can be deleted for real (#1754).
 *
 * A cloud delete of a song this device holds work for — a live draft, a queued Save — answers
 * `retained`: the account copy is gone and this device keeps its own, marked "No longer in your
 * account". Pressing Delete again used to retain it again, forever. Now the cloud delete goes
 * straight on to "Delete from this device too?", a marked row's Delete asks that alone, and All
 * songs removes every marked row behind one confirm. That step is local: no request is sent.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 */

/** Commit and upload a new song, then leave an unsaved title on it: a live draft holds it. */
async function songHeldByADraft(page: Page, title: string): Promise<void> {
    await newSongOnTheStand(page);
    await saveAndUpload(page, title);
    await backToSongbook(page);
    await openSong(page, title);
    await page.getByRole('button', { name: 'Edit chart' }).click();
    await page.getByLabel('Song title').fill(`${title} — my words`);
    await draftKept(page, `${title} — my words`);
    await backToSongbook(page);
}

function rowOf(page: Page, title: string) {
    return page.locator('.song-table .song-row', { hasText: title });
}

async function rowDelete(page: Page, title: string): Promise<void> {
    await rowOf(page, title)
        .getByRole('button', { name: `More actions for ${title}` })
        .click();
    await page.getByTestId('row-menu-delete').click();
}

/** Every write to the documents API (a Save or a delete) from here on — the purge sends none. */
function documentRequests(page: Page): string[] {
    const sent: string[] = [];
    page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().includes('/api/documents')) {
            sent.push(request.url());
        }
    });
    return sent;
}

test('one press of Delete removes a song the account deleted but this device kept', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await songHeldByADraft(page, 'Set list');

    await rowDelete(page, 'Set list');
    await page.getByTestId('delete-song-confirm').click();
    // The draft held the record, so the cloud delete was `retained` — and the next step follows
    // on its own rather than leaving the song behind, marked.
    const purge = page.getByTestId('purge-songs');
    await expect(purge).toContainText('Delete from this device too?');
    await expect(purge).toContainText('Unsaved changes to it will be lost.');

    const sent = documentRequests(page);
    await page.getByTestId('purge-songs-confirm').click();
    await expect(page.getByTestId('shell-message')).toContainText('Deleted from this device');
    await expect(rowOf(page, 'Set list')).toHaveCount(0);
    expect(sent).toEqual([]);

    // Gone for good: the next download finds the account's tombstone and nothing here to keep.
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(rowOf(page, 'Set list')).toHaveCount(0);
});

test('marked rows leave the counts, delete locally, and go together from All songs', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await songHeldByADraft(page, 'One');
    await songHeldByADraft(page, 'Two');
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Three');
    await backToSongbook(page);

    // Delete One and Two from the account, and keep them here (Cancel the second step): the old
    // dead end, two rows marked "No longer in your account".
    for (const title of ['One', 'Two']) {
        await rowDelete(page, title);
        await page.getByTestId('delete-song-confirm').click();
        await page.getByTestId('purge-songs-cancel').click();
        await expect(page.getByTestId('purge-songs')).toHaveCount(0);
        await expect(rowOf(page, title).getByTestId('song-deleted-in-account')).toHaveText(
            'No longer in your account',
        );
    }

    // The home count leaves them out; the rows are still listed so they can be removed.
    await expect(page.getByTestId('all-songs-link')).toHaveText('All 1 song →');

    // A marked row's Delete asks the local question alone — there is nothing in the account.
    await rowDelete(page, 'One');
    await expect(page.getByTestId('delete-song-confirm')).toHaveCount(0);
    await expect(page.getByTestId('purge-songs')).toContainText('Delete from this device too?');
    await page.getByTestId('purge-songs-cancel').click();

    await page.getByTestId('all-songs-link').click();
    await expect(page.locator('.all-songs-count')).toHaveText('· 1');
    await expect(page.getByRole('button', { name: /^All songs/ })).toContainText('1');
    await expect(songTitles(page)).toHaveCount(3);

    const sent = documentRequests(page);
    await expect(page.getByTestId('remove-gone-button')).toHaveText(
        'Remove 2 songs no longer in your account',
    );
    await page.getByTestId('remove-gone-button').click();
    const purge = page.getByTestId('purge-songs');
    await expect(purge).toContainText('Remove 2 songs no longer in your account?');
    await page.getByTestId('purge-songs-confirm').click();

    await expect(songTitles(page)).toHaveText(['Three']);
    await expect(page.getByTestId('remove-gone')).toHaveCount(0);
    await expect(page.locator('.all-songs-count')).toHaveText('· 1');
    expect(sent).toEqual([]);
});
