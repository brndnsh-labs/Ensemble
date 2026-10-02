import type { Page } from '@playwright/test';
import {
    createAccountThroughDialog,
    dismissAdoptGuestPrompt,
    openWithAccounts,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * A whole iReal playlist imported into an ACCOUNT (#1478) — against the real account API on one
 * origin, with a real passkey and real IndexedDB. `*.chromium.spec.ts`: the CDP virtual
 * authenticator is Chromium-only.
 *
 * The summary states the account cap before anything is written; the import lands as one
 * transaction (songs, then the collection) and uploads through the ordinary outbox. The cap
 * refusal, the 1,350-song drain and a database reopened mid-drain are proven against real
 * IndexedDB in `tests/browser/account-playlist-import.browser.test.ts`.
 */

function playlist(name: string, songs: Array<[title: string, body: string]>) {
    const fields = songs.flatMap(([title, body]) => [
        title,
        'Ensemble',
        'Medium Swing',
        'C',
        'n',
        body,
    ]);
    return `irealbook://${encodeURIComponent([...fields, name].join('='))}`;
}

const SET = playlist('Account set', [
    ['First tune', 'T44[C   |F7   |C   |G7   Z'],
    ['Second tune', 'T44[F7   |Bb7   |F7   |C7   Z'],
    ['Third tune', 'T44[A-7   |D7   |G^7   |G^7   Z'],
]);

/** The account's own manifest: what the SERVER holds, not what this device queued. */
async function serverDocuments(page: Page): Promise<number> {
    const body = await page.evaluate(async () => {
        const reply = await fetch('/api/documents?limit=100', { cache: 'no-store' });
        return reply.ok
            ? ((await reply.json()) as { documents: Array<{ deleted: boolean }> })
            : null;
    });
    expect(body).not.toBeNull();
    return body!.documents.filter((row) => !row.deleted).length;
}

test('a playlist imports into the account as a collection, states the cap first, and uploads', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await createAccountThroughDialog(page);
    await page.getByTestId('recovery-not-now').click();
    await dismissAdoptGuestPrompt(page);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    expect(await serverDocuments(page)).toBe(0);

    await page.getByRole('button', { name: 'Import chart', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Review import' });
    await dialog.getByText('Or paste an iReal link', { exact: true }).click();
    await dialog.getByLabel('iReal link', { exact: true }).fill(SET);
    await dialog.getByRole('button', { name: 'Review link', exact: true }).click();
    await expect(dialog.getByTestId('playlist-counts')).toHaveText(
        '3 songs to import, as the new collection “Account set”.',
    );
    // The cap, stated before anything is written: three songs and one collection.
    await expect(dialog.getByTestId('playlist-cap')).toHaveText(
        'Your account can hold 2,000 songs and collections. By this device’s latest check of it, it would hold 4 after this import.',
    );
    await dialog.getByTestId('playlist-import').click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByTestId('collection-bar').getByRole('heading')).toHaveText('Account set');
    await expect(page.locator('.all-songs-table .song-name')).toHaveText([
        'First tune',
        'Second tune',
        'Third tune',
    ]);
    // Uploaded through the ordinary outbox: every song and the collection reach the account.
    await expect.poll(() => serverDocuments(page)).toBe(4);
    await expect(page.getByTestId('songs-uploading')).toHaveCount(0);
});
