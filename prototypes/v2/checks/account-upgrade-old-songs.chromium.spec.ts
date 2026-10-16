import type { Page } from '@playwright/test';
import { createAccountThroughDialog, openWithAccounts } from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * "Upgrade old songs" (#1738) on an account, against the real API: each account song is
 * upgraded by the account's own Save, which queues it in the outbox, and the ordinary drain
 * uploads it — so the SERVER ends up holding schema 2 with no legacy fields, which is what the
 * operator page's counts (#1731) and the reader deletion after this read.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only. The guest half, both
 * projects, is `upgrade-old-songs.spec.ts`.
 */

/** Every Save the account accepted, by the bytes that were sent. */
function acceptedSaves(page: Page): string[] {
    const bodies: string[] = [];
    page.on('response', (response) => {
        if (new URL(response.url()).pathname === '/api/documents/save' && response.ok()) {
            bodies.push(response.request().postData() ?? '');
        }
    });
    return bodies;
}

/** What the server holds for this account, read as the app itself would (the session cookie). */
async function serverDocuments(page: Page) {
    return page.evaluate(async () => {
        const manifest = await (await fetch('/api/documents')).json();
        const ids: string[] = manifest.documents
            .filter((entry: { deleted: boolean }) => !entry.deleted)
            .map((entry: { documentId: string }) => entry.documentId);
        return Promise.all(
            ids.map(async (id) => {
                const reply = await (await fetch(`/api/documents/${id}`)).json();
                return { revision: reply.revision as string, document: reply.document };
            }),
        );
    });
}

const card = (page: Page) => page.getByTestId('upgrade-old-songs');

test('account songs are upgraded in place through the outbox, and the server holds schema 2', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    const saves = acceptedSaves(page);
    // Three old-format (schema-1) songs in this device's guest songbook…
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await createAccountThroughDialog(page);
    await page.getByTestId('recovery-not-now').click();
    // …copied into the account as they are, the way #1268 copies them, and uploaded.
    await page.getByTestId('adopt-guest-confirm').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        'Copied 3 songs into this device’s account songbook',
    );
    await page.getByTestId('adopt-guest-done').click();
    await expect.poll(() => saves.length, { timeout: 15_000 }).toBe(3);
    const before = await serverDocuments(page);
    expect(before).toHaveLength(3);
    expect(before.map((entry) => entry.document.schemaVersion)).toEqual([1, 1, 1]);

    // The card covers both songbooks on this device: three account songs, three guest ones.
    await expect(card(page).getByRole('heading', { name: 'Upgrade old songs (6)' })).toBeVisible();
    await expect(card(page)).toContainText('uploaded to your account');
    await card(page).getByRole('button', { name: 'Upgrade old songs…' }).click();
    await card(page).getByRole('button', { name: 'Upgrade without a backup' }).click();
    await expect(card(page).getByRole('heading', { name: 'Upgraded 6 songs' })).toBeVisible();

    // The outbox drains on its own: three more accepted Saves, each the new format.
    await expect.poll(() => saves.length, { timeout: 15_000 }).toBe(6);
    expect(saves.slice(3).every((body) => body.includes('"schemaVersion":2'))).toBe(true);
    await expect(page.getByTestId('songs-uploading')).toHaveCount(0);

    const after = await serverDocuments(page);
    expect(after).toHaveLength(3);
    for (const { revision, document } of after) {
        const old = before.find((entry) => entry.document.id === document.id)!;
        // The same document, a new server revision, the current format.
        expect(old).toBeDefined();
        expect(revision).not.toBe(old.revision);
        expect(document.schemaVersion).toBe(2);
        expect(document.title).toBe(old.document.title);
        expect(document.revision).toBe(old.document.revision + 1);
        expect(document.chart.band.groove.genre).toBeTruthy();
        expect(JSON.stringify(document)).not.toContain('"arrangement"');
    }

    await card(page).getByRole('button', { name: 'Done' }).click();
    await expect(card(page)).toHaveCount(0);
    // A second look finds nothing: the account and the guest songbook are both current.
    await page.reload();
    await expect(page.locator('main.home')).toHaveAttribute('data-upgrade-scan', 'settled');
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(card(page)).toHaveCount(0);
});
