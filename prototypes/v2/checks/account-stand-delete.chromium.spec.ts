import type { Page } from '@playwright/test';
import {
    backToSongbook,
    newSongOnTheStand,
    openSong,
    openWithAccounts,
    saveAndUpload,
    saveAs,
    signUp,
} from './account-helpers';
import { expect, songMenuAction, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * Delete… from the stand's Song menu (#1756) for the account songs a cloud delete cannot remove:
 * one the cloud never confirmed, and one the account deleted while this device kept it ("No longer
 * in your account"). Both go to delete-from-this-device, as the row menu's Delete does
 * (`account-library-cleanup.chromium.spec.ts`), with nothing sent, and the stand goes back to the
 * songbook once the song is gone.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 */

function rowOf(page: Page, title: string) {
    return page.locator('.song-table .song-row', { hasText: title });
}

/**
 * Every write to the documents API (a Save or a delete) that reached the server from here on —
 * the purge sends none. Counted when it finishes, not when it starts: offline, the loop's own
 * retry of the queued Save still starts a request that never leaves the browser.
 */
function documentRequests(page: Page): string[] {
    const sent: string[] = [];
    page.on('requestfinished', (request) => {
        if (request.method() === 'POST' && request.url().includes('/api/documents')) {
            sent.push(request.url());
        }
    });
    return sent;
}

test('a song the cloud never confirmed is deleted from the stand, its only copy named', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    // Offline, so the Save queues but is never acknowledged — `remoteRevision` stays null.
    await page.context().setOffline(true);
    await newSongOnTheStand(page);
    await saveAs(page, 'Never sent');

    const sent = documentRequests(page);
    await songMenuAction(page, 'Delete…');
    // Nothing in the account, so no cloud delete — and the step says this copy is the only one,
    // with the export in front of it.
    await expect(page.getByTestId('delete-song-confirm')).toBeHidden();
    const purge = page.getByTestId('purge-songs');
    await expect(purge).toContainText('Delete this song from this device?');
    await expect(purge).toContainText('this removes the only copy');
    const download = page.waitForEvent('download');
    await page.getByTestId('purge-songs-export').click();
    expect((await download).suggestedFilename()).toBe('Never sent.ensemble');

    await page.getByTestId('purge-songs-confirm').click();
    await expect(page.getByTestId('library-heading')).toBeVisible();
    await expect(rowOf(page, 'Never sent')).toHaveCount(0);
    expect(sent).toEqual([]);

    // Back online, the queued Save went with it: nothing uploads the song back.
    await page.context().setOffline(false);
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(rowOf(page, 'Never sent')).toHaveCount(0);
});

test('a song no longer in your account is deleted from the stand with nothing sent', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    // Upload it, then leave an unsaved title on it: a live draft holds it here.
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');
    await backToSongbook(page);
    await openSong(page, 'Set list');
    await page.getByRole('button', { name: 'Edit chart' }).click();
    await page.getByLabel('Song title').fill('Set list — my words');
    await expect(page.getByText('Draft recovered on this device')).toBeVisible();
    await backToSongbook(page);

    // Delete it from the account and keep it here: the row is marked.
    await rowOf(page, 'Set list')
        .getByRole('button', { name: 'More actions for Set list' })
        .click();
    await page.getByTestId('row-menu-delete').click();
    await page.getByTestId('delete-song-confirm').click();
    await page.getByTestId('purge-songs-cancel').click();
    await expect(rowOf(page, 'Set list').getByTestId('song-deleted-in-account')).toHaveText(
        'No longer in your account',
    );

    // From the stand, Delete… asks the local question alone: there is nothing in the account.
    await rowOf(page, 'Set list').locator('.song-link').first().click();
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    const sent = documentRequests(page);
    await songMenuAction(page, 'Delete…');
    await expect(page.getByTestId('delete-song-confirm')).toBeHidden();
    await expect(page.getByTestId('purge-songs')).toContainText('Delete from this device too?');
    await page.getByTestId('purge-songs-confirm').click();

    await expect(page.getByTestId('library-heading')).toBeVisible();
    await expect(rowOf(page, 'Set list')).toHaveCount(0);
    expect(sent).toEqual([]);
});
