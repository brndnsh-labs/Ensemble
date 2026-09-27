import {
    backToSongbook,
    newSongOnTheStand,
    openWithAccounts,
    saveAndUpload,
    signUp,
    uploadOf,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * The row ⋯ menu's Rename/Duplicate/Delete (#1440) for an ACCOUNT song, against the real account
 * API with a real passkey.
 *
 * Two contracts DOCTRINE holds hard: Rename and Duplicate "sync like any Save" — proven here by
 * waiting on the real upload response, not just the local list re-rendering — and an account
 * song's Delete… goes through the EXISTING tombstone route (`account/delete-song.tsx`), never a
 * local-only removal. Since that route only ever acts on the chart on the stand, deleting a row
 * that is not currently open must open it first; this proves that happens instead of silently
 * doing nothing or deleting the wrong song.
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

test('Delete… on an account row that is not open goes through the cloud tombstone route', async ({
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
    // Neither song is open right now — the row menu has to open one before it can offer the
    // existing account delete confirm, which only ever acts on the chart on the stand.
    await expect(page.locator('.song-table .song-row')).toHaveCount(2);

    const row = page.locator('.song-table .song-row', { hasText: 'Delete me' });
    await row.getByRole('button', { name: 'More actions for Delete me' }).click();
    await page.getByTestId('row-menu-delete').click();
    // This IS the existing tombstone dialog, never the guest-only confirm.
    await expect(page.getByTestId('delete-song-confirm')).toBeVisible();
    await expect(page.getByTestId('delete-guest-song-confirm')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Delete me', exact: true })).toBeVisible();
    await expect(page.getByTestId('delete-song-export')).toBeEnabled();
    await page.getByTestId('delete-song-confirm').click();

    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
    await expect(page.locator('.song-table .song-row')).toHaveCount(1);
    await expect(page.locator('.song-table .song-name')).toHaveText(['Keeper']);
});
