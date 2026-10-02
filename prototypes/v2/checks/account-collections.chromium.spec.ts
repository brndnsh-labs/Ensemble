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
