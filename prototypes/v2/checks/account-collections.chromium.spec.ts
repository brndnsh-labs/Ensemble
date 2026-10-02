import type { Page } from '@playwright/test';
import { createAccountThroughDialog, openWithAccounts } from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * Collections in an account (#1477) — against the real account API on one origin, with a real
 * passkey and real IndexedDB.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * One journey, one account (the recovery-enroll budget is per test): a guest's collection and
 * Starred arrive in the account with the guest songs when the musician adopts them on sign-in,
 * their songs resolving to the adopted copies; then a collection Save the account has not taken
 * yet is named by the sign-out step, as an unsent song Save is. The merge, the migration and the
 * two-device union are proven against real IndexedDB in `tests/browser/account-starred`.
 */

const rows = (page: Page) => page.locator('.all-songs-table .song-name');

async function addToNew(page: Page, song: string, collection: string): Promise<void> {
    await page
        .locator('.all-songs-table .song-row', { hasText: song })
        .getByRole('button', { name: `More actions for ${song}` })
        .click();
    await page.getByTestId('row-menu-add-to-collection').click();
    await page.getByTestId('row-menu-new-collection-input').fill(collection);
    await page.getByTestId('row-menu-new-collection-save').click();
    await expect(page.getByTestId('shell-message')).toContainText(`to “${collection}”`);
}

async function addTo(page: Page, song: string, collection: string): Promise<void> {
    await page
        .locator('.all-songs-table .song-row', { hasText: song })
        .getByRole('button', { name: `More actions for ${song}` })
        .click();
    await page.getByTestId('row-menu-add-to-collection').click();
    await page.getByTestId('row-menu-collection').filter({ hasText: collection }).click();
    await expect(page.getByTestId('shell-message')).toContainText(`to “${collection}”`);
}

test('a guest collection arrives in the account on sign-in, and an unsent collection Save is named at sign-out', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);

    // As a guest: a collection in its own order, and a star.
    await page.getByTestId('all-songs-link').click();
    await addToNew(page, 'After hours', 'Friday gig');
    await addTo(page, 'Blue pocket', 'Friday gig');
    await page.getByRole('button', { name: 'Star Minor swing sketch' }).click();
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 1');
    await page.getByRole('button', { name: '← Home' }).click();

    await createAccountThroughDialog(page);
    await page.getByTestId('recovery-not-now').click();
    await page.getByTestId('adopt-guest-confirm').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        /^Copied 3 songs into this device’s account songbook$/,
    );
    await expect(page.getByTestId('adopt-guest-collection-failures')).toHaveCount(0);
    await page.getByTestId('adopt-guest-done').click();
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');

    // The account's All songs page: the collection is there, in its own order, its songs
    // resolving to the ADOPTED copies — and Starred came along too.
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByRole('heading', { name: /All songs/ })).toContainText('· 3');
    await expect(page.getByTestId('collection-filter')).toHaveText(['Friday gig 2']);
    await page.getByTestId('collection-filter').click();
    await expect(rows(page)).toHaveText(['After hours', 'Blue pocket']);
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 1');
    await page.getByRole('button', { name: /^Starred/ }).click();
    await expect(rows(page)).toHaveText(['Minor swing sketch']);

    // A star the account will not take yet: its Save stays queued on this device.
    await page.route('**/api/documents/save', (route) => route.abort('failed'));
    await page.getByRole('button', { name: /^All songs/ }).click();
    await page.getByRole('button', { name: 'Star After hours' }).click();
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 2');

    // The sign-out step says so, apart from songs, and offers the sync that would send it.
    await page.getByRole('button', { name: '← Home' }).click();
    await page.getByTestId('account-sign-out').click();
    await expect(page.getByTestId('sign-out-collections')).toContainText('to your collections');
    await expect(page.getByTestId('sign-out-clear')).toHaveCount(0);
    await expect(page.getByTestId('sign-out-confirm')).toHaveText('Sign out anyway');
    await expect(page.getByTestId('sign-out-sync')).toBeVisible();
    await page.getByTestId('sign-out-cancel').click();
});

/**
 * #1477 review R3: a guest whose SONGS are all in the account already — here a second device,
 * whose seeded guest songs carry the same ids the first device adopted — still has its own
 * Starred to bring over. With no song to offer, the sign-in offer used to stay shut and the
 * manual one said "Nothing new to add", stranding those stars on the device for good.
 */
test('a device whose songs are already in the account is offered its collections, once', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await createAccountThroughDialog(page);
    await page.getByTestId('recovery-not-now').click();
    await page.getByTestId('adopt-guest-confirm').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        /^Copied 3 songs into this device’s account songbook$/,
    );
    await page.getByTestId('adopt-guest-done').click();
    // The songs really reached the account before the second device looks.
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await page.locator('.song-link', { hasText: 'Blue pocket' }).first().click();
    await page.getByRole('button', { name: 'Song actions' }).click();
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');

    const [passkey] = await authenticator.credentials();
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkey);
        await openWithAccounts(second);
        await expect(second.getByTestId('library-loading')).toHaveCount(0);
        // As a guest on this device: one star.
        await second.getByTestId('all-songs-link').click();
        await second.getByRole('button', { name: 'Star Blue pocket' }).click();
        await expect(second.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 1');
        await second.getByRole('button', { name: '← Home' }).click();

        await second.getByTestId('account-sign-in').click();
        await second.getByTestId('account-do-sign-in').click();
        await expect(second.getByTestId('account-sign-out')).toBeVisible();

        // No song is missing from the account, but this device's Starred is: the offer opens on
        // its own, about the collections alone.
        await expect(second.locator('#adopt-guest-title')).toHaveText(
            'Add this device’s collections to your account?',
        );
        await expect(second.getByTestId('adopt-guest-collections-pending')).toBeVisible();
        await second.getByTestId('adopt-guest-collections').click();
        await expect(second.locator('#adopt-guest-title')).toHaveText(
            'Added 1 collection to this device’s account songbook',
        );
        await second.getByTestId('adopt-guest-done').click();

        // The account's Starred holds the star, on the account's copy of the song.
        await expect(second.getByTestId('library-heading')).toHaveText('Your account songbook');
        await second.getByTestId('all-songs-link').click();
        await expect(second.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 1');
        await second.getByRole('button', { name: /^Starred/ }).click();
        await expect(rows(second)).toHaveText(['Blue pocket']);
        await second.getByRole('button', { name: '← Home' }).click();

        // Asked again, there is nothing left to add — songs or collections.
        await second.getByTestId('account-open').click();
        await second.getByTestId('account-page-adopt-guest').click();
        await expect(second.locator('#adopt-guest-title')).toHaveText('Nothing new to add');
        await expect(second.getByTestId('adopt-guest-collections')).toHaveCount(0);
        await second.getByTestId('adopt-guest-close').click();
    } finally {
        await fresh.close();
    }
});
