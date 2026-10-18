import type { Download, Page } from '@playwright/test';
import {
    accountChip,
    backToSongbook,
    newSongOnTheStand,
    openSignOut,
    openWithAccounts,
    saveAndUpload,
    signUp,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * A text chart (schema 1) left in the account mirror after #1740 retired the format. No build can
 * open it, so the songbook leaves it out — and signing out or deleting the account would remove it
 * without a word unless those steps name it and write its stored bytes out. Real API, real
 * passkeys, real IndexedDB; `*.chromium.spec.ts` for the CDP virtual authenticator. One account
 * (one recovery enrolment), under the endpoint's rate limit.
 */

const ACCOUNT_DATABASE = 'ensemble-v2-account-songbook';

/** Writes a text-chart song row into this account's mirror, as an older build left one. */
function seedTextChart(page: Page, documentId: string): Promise<void> {
    return page.evaluate(
        async ([name, id]) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(name);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            const active = await new Promise<{ ownerId?: unknown } | undefined>(
                (resolve, reject) => {
                    const request = db
                        .transaction('meta', 'readonly')
                        .objectStore('meta')
                        .get('active');
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                },
            );
            if (typeof active?.ownerId !== 'string') {
                db.close();
                throw new Error('No account is attached on this device.');
            }
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction('songs', 'readwrite');
                tx.objectStore('songs').put({
                    ownerId: active.ownerId,
                    documentId: id,
                    remoteRevision: null,
                    document: {
                        schemaVersion: 1,
                        id,
                        title: 'Old text chart',
                        createdAt: '2026-09-01T12:00:00.000Z',
                        updatedAt: '2026-09-01T12:00:00.000Z',
                        revision: 0,
                        chart: { arrangement: { sections: [] }, performance: {}, band: {} },
                    },
                });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            db.close();
        },
        [ACCOUNT_DATABASE, documentId] as const,
    );
}

test('sign-out and account deletion name a song this app can no longer open, and export it as stored', async ({
    page,
}) => {
    test.setTimeout(120_000);
    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    // One song the account really holds, so the text chart is the ONLY thing at risk.
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');
    await backToSongbook(page);

    await seedTextChart(page, 'old-text-chart');
    // A fresh page load, so nothing the shell read before the row existed stands in for it.
    await page.reload();
    await expect(accountChip(page)).toBeVisible();

    await openSignOut(page);
    await expect(page.getByTestId('sign-out-unreadable')).toHaveText(
        'One song this app can no longer open will be removed — export it to keep the file.',
    );
    await expect(page.getByTestId('sign-out-clear')).toHaveCount(0);
    await expect(page.getByTestId('sign-out-confirm')).toHaveText('Sign out anyway');
    await page.getByTestId('sign-out-export').click();
    await expect.poll(() => downloads.length).toBe(1);
    expect(downloads[0].suggestedFilename()).toBe('old-text-chart (unreadable).json');
    // The file is the row's stored bytes, exactly.
    const stored = JSON.parse(await streamText(downloads[0]));
    expect(stored).toMatchObject({ schemaVersion: 1, id: 'old-text-chart' });
    await page.getByTestId('sign-out-cancel').click();

    // Deleting the account exports every song, and says one of them is a file nothing opens.
    await page.getByTestId('account-open').click();
    await expect(page.locator('dialog.account-page')).toBeVisible();
    await page.getByTestId('delete-account-open').click();
    await expect(page.getByTestId('delete-account-songs')).toContainText('2 songs');
    await expect(page.getByTestId('delete-account-unreadable')).toContainText(
        'One of them is a song this app can no longer open',
    );
    await page.getByTestId('delete-account-export').click();
    await expect.poll(() => downloads.length).toBe(3);
    expect(
        downloads
            .slice(1)
            .map((file) => file.suggestedFilename())
            .sort(),
    ).toEqual(['Set list.ensemble', 'old-text-chart (unreadable).json']);
});

async function streamText(download: Download): Promise<string> {
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
}
