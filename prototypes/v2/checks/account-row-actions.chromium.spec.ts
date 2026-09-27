import {
    backToSongbook,
    closeSongActions,
    newSongOnTheStand,
    openSong,
    openSongActions,
    openWithAccounts,
    revealEditor,
    saveAndUpload,
    saveAs,
    signUp,
    uploadOf,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * The row ⋯ menu's Rename/Duplicate/Delete (#1440) for an ACCOUNT song, against the real account
 * API with a real passkey.
 *
 * Three contracts DOCTRINE/the #1440 review hold hard:
 *
 * 1. Rename and Duplicate "sync like any Save" — proven here by waiting on the real upload
 *    response, not just the local list re-rendering.
 * 2. Rename never destroys a live draft: `AccountSongbook.save` retires every writer's older
 *    drafts on commit, so an in-place rename over one would silently discard it. When one exists,
 *    Rename opens the song instead (recovering the draft, exactly as opening always does).
 * 3. An account song's Delete… goes through the EXISTING tombstone route
 *    (`account/delete-song.tsx`), never a local-only removal — and, since review #1440 P2, never
 *    by opening the song first: it gets the observation it needs without navigating, so cancelling
 *    leaves the musician exactly on the list, and a song the cloud has never acknowledged doesn't
 *    offer a dead confirm at all.
 */

test('Rename and Duplicate on an account song each queue and confirm a real Save', async ({
    page,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');
    await backToSongbook(page);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');

    const row = page.locator('.song-table .song-row', { hasText: 'Set list' });
    await row.getByRole('button', { name: 'More actions for Set list' }).click();
    await page.getByTestId('row-menu-rename').click();
    await page.getByTestId('row-menu-rename-input').fill('Set list renamed');
    const renamed = uploadOf(page, 'Set list renamed');
    await page.getByTestId('row-menu-rename-save').click();
    await renamed;
    await expect(
        page.locator('.song-table .song-name', { hasText: 'Set list renamed' }),
    ).toBeVisible();

    const renamedRow = page.locator('.song-table .song-row', { hasText: 'Set list renamed' });
    await renamedRow.getByRole('button', { name: 'More actions for Set list renamed' }).click();
    const duplicated = uploadOf(page, 'Set list renamed copy');
    await page.getByTestId('row-menu-duplicate').click();
    await duplicated;
    await expect(
        page.locator('.song-table .song-name', { hasText: 'Set list renamed copy' }),
    ).toBeVisible();
    await expect(page.locator('.song-table .song-row')).toHaveCount(2);

    // Cheap sanity that the authenticator this test minted actually backed real requests.
    expect((await authenticator.credentials()).length).toBeGreaterThan(0);
});

test('Rename on an account song with a live draft opens it instead of renaming in place', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');
    await backToSongbook(page);

    // An edit that is never saved — a live draft in the ACCOUNT's own `drafts` store (#1299).
    await openSong(page, 'Set list');
    await revealEditor(page);
    await page.getByLabel('Song title').fill('Set list edited');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await backToSongbook(page);

    const row = page.locator('.song-table .song-row', { hasText: 'Set list' });
    await row.getByRole('button', { name: 'More actions for Set list' }).click();
    await page.getByTestId('row-menu-rename').click();
    await page.getByTestId('row-menu-rename-input').fill('Renamed from the row menu');
    await page.getByTestId('row-menu-rename-save').click();

    // The song opens (recovering the draft) instead of renaming in place — an in-place rename
    // would have gone through `AccountSongbook.save`, which retires every writer's older drafts
    // on commit, silently destroying the edit. The row menu's own typed title is carried forward
    // as a fresh edit on top of the recovered draft (#1440 review P4), rather than discarded.
    await expect(
        page.getByRole('heading', { name: 'Renamed from the row menu', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Song title')).toHaveValue('Renamed from the row menu');
    await expect(page.getByLabel('Song title')).toBeFocused();
});

test('starring an account song persists through the account preference store', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Star me');
    await backToSongbook(page);

    await page.getByRole('button', { name: 'Star Star me' }).click();
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 1');

    // Surviving a reload proves this is the ACCOUNT store, not a page-local flag: the guest
    // `localStorage` map is per-device too, so only a real round trip through `sync.owner`'s
    // effect distinguishes the two.
    await page.reload();
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 1');
});

test('Delete… on an account row that is not open never navigates, and Cancel leaves you on the list', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Keeper');
    await backToSongbook(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Delete me');
    await backToSongbook(page);
    await expect(page.locator('.song-table .song-row')).toHaveCount(2);

    const row = page.locator('.song-table .song-row', { hasText: 'Delete me' });
    await row.getByRole('button', { name: 'More actions for Delete me' }).click();
    await page.getByTestId('row-menu-delete').click();

    // This IS the existing tombstone dialog, never the guest-only confirm — and the songbook
    // list is still right there behind it: nothing was opened to reach this confirm step
    // (review #1440 P2). `library-heading` and the still-intact row count are the songbook's
    // own markers — the stand's `.song-header`/`.workspace` never mount for either song.
    await expect(page.getByTestId('delete-song-confirm')).toBeVisible();
    await expect(page.getByTestId('delete-guest-song-confirm')).toHaveCount(0);
    await expect(page.getByTestId('library-heading')).toBeVisible();
    await expect(page.locator('.workspace')).toHaveCount(0);
    await expect(page.locator('.song-table .song-row')).toHaveCount(2);

    // Cancel leaves the musician exactly where they were, both songs intact.
    await page.getByTestId('delete-song-cancel').click();
    await expect(page.getByTestId('delete-song-confirm')).toHaveCount(0);
    await expect(page.locator('.song-table .song-row')).toHaveCount(2);

    // Confirming removes it — still without ever having opened it.
    await row.getByRole('button', { name: 'More actions for Delete me' }).click();
    await page.getByTestId('row-menu-delete').click();
    await expect(page.getByTestId('delete-song-export')).toBeEnabled();
    await page.getByTestId('delete-song-confirm').click();

    await expect(page.getByTestId('library-heading')).toBeVisible();
    await expect(page.locator('.song-table .song-row')).toHaveCount(1);
    await expect(page.locator('.song-table .song-name')).toHaveText(['Keeper']);
});

test('Delete… on a song the cloud has never acknowledged does not offer a dead confirm', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    // Offline, so the Save queues but is never acknowledged — `remoteRevision` stays null.
    await page.context().setOffline(true);
    await newSongOnTheStand(page);
    await saveAs(page, 'Still queued');
    await openSongActions(page);
    await expect(page.getByTestId('sync-cloud')).toContainText('Waiting to upload');
    await closeSongActions(page);
    await backToSongbook(page);

    const row = page.locator('.song-table .song-row', { hasText: 'Still queued' });
    await row.getByRole('button', { name: 'More actions for Still queued' }).click();
    await page.getByTestId('row-menu-delete').click();

    // Nothing has reached the cloud yet, so there is nothing there to delete — the same state
    // the stand's own song menu hides its Delete button for (`inAccount`'s doc comment). No
    // confirm dialog opens; the explanation lands where it is actually visible while browsing
    // the songbook (review #1440 P2).
    await expect(page.getByTestId('delete-song-confirm')).toHaveCount(0);
    await expect(page.getByTestId('shell-message')).toContainText(
        'hasn’t finished syncing to your account yet',
    );
    await expect(page.locator('.song-table .song-row')).toHaveCount(1);
});
