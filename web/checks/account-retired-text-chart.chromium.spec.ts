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

/**
 * Readable copies of the 'Set list' song under ids that sort before the text chart's, so the
 * home's fill (eight rows, read in key order) is full before it reaches the text chart. With
 * `remove`, takes them out again.
 */
function seedCopies(page: Page, count: number, remove = false): Promise<void> {
    return page.evaluate(
        async ([name, count, remove]) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(name);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction('songs', 'readwrite');
                const store = tx.objectStore('songs');
                const read = store.getAll();
                read.onsuccess = () => {
                    const rows = read.result as Array<{
                        ownerId: string;
                        documentId: string;
                        document: { title?: unknown };
                    }>;
                    const source = rows.find((row) => row.document?.title === 'Set list');
                    if (!source) {
                        tx.abort();
                        return;
                    }
                    for (let index = 0; index < count; index += 1) {
                        const id = `0-copy-${index}`;
                        if (remove) {
                            store.delete([source.ownerId, id]);
                        } else {
                            store.put({
                                ownerId: source.ownerId,
                                documentId: id,
                                remoteRevision: null,
                                document: { ...source.document, id, title: `Copy ${index}` },
                            });
                        }
                    }
                };
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error ?? new Error('No Set list row to copy.'));
                tx.onabort = () => reject(tx.error ?? new Error('No Set list row to copy.'));
            });
            db.close();
        },
        [ACCOUNT_DATABASE, count, remove] as const,
    );
}

/**
 * Queues a Save for `documentId` as a NEWER build would have (#1805): a chart schema this build
 * does not know, which every pass steps over and never retires. With `remove`, takes the queue out
 * again, as that newer build sending it would.
 */
function seedNewerQueue(page: Page, documentId: string, remove = false): Promise<void> {
    return page.evaluate(
        async ([name, id, remove]) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(name);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(['meta', 'operations'], 'readwrite');
                const active = tx.objectStore('meta').get('active');
                active.onsuccess = () => {
                    const ownerId = (active.result as { ownerId: string }).ownerId;
                    const operations = tx.objectStore('operations');
                    if (remove) {
                        const keys = operations.index('song').getAllKeys([ownerId, id]);
                        keys.onsuccess = () => {
                            for (const key of keys.result) {
                                operations.delete(key);
                            }
                        };
                        return;
                    }
                    operations.put({
                        ownerId,
                        documentId: id,
                        operationId: 'newer-build-save',
                        localRevision: 1,
                        snapshot: { schemaVersion: 99, id, title: 'From a newer build' },
                        base: { revision: null },
                        wireBody: null,
                        status: 'queued',
                    });
                };
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            db.close();
        },
        [ACCOUNT_DATABASE, documentId, remove] as const,
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
    // Enough readable songs ahead of it that the home's own window never reads it (#1782).
    await seedCopies(page, 8);
    // A fresh page load, so nothing the shell read before the row existed stands in for it.
    await page.reload();
    await expect(accountChip(page)).toBeVisible();
    await expect(page.getByTestId('library-heading')).toBeVisible();
    await expect(page.getByTestId('home-unreadable')).toHaveCount(0);

    // All songs leaves it out and says so (#1769), rather than passing for the whole songbook.
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByTestId('all-songs-unreadable').locator('span')).toHaveText(
        'One song on this device couldn’t be read, so it isn’t listed here.',
    );
    await expect(page.locator('.all-songs-count')).toHaveText('· 9');
    // And offers it as a file, as stored (#1782).
    await page.getByTestId('all-songs-unreadable-export').click();
    await expect.poll(() => downloads.length).toBe(1);
    expect(downloads[0].suggestedFilename()).toBe('old-text-chart (unreadable).json');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    // Back on the home, which now says what All songs said (#1782), with the same offer.
    await expect(page.getByTestId('home-unreadable')).toContainText(
        'One song on this device couldn’t be read',
    );
    await expect(page.getByTestId('home-unreadable-export')).toBeVisible();

    // The copies go again, so the rest is about the one real song and the text chart.
    await seedCopies(page, 8, true);
    await page.reload();
    await expect(accountChip(page)).toBeVisible();

    await openSignOut(page);
    await expect(page.getByTestId('sign-out-unreadable')).toHaveText(
        'One song this app can no longer open will be removed — export it to keep the file.',
    );
    await expect(page.getByTestId('sign-out-clear')).toHaveCount(0);
    await expect(page.getByTestId('sign-out-confirm')).toHaveText('Sign out anyway');
    await page.getByTestId('sign-out-export').click();
    await expect.poll(() => downloads.length).toBe(2);
    expect(downloads[1].suggestedFilename()).toBe('old-text-chart (unreadable).json');
    // The file is the row's stored bytes, exactly.
    const stored = JSON.parse(await streamText(downloads[1]));
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
    await expect.poll(() => downloads.length).toBe(4);
    expect(
        downloads
            .slice(2)
            .map((file) => file.suggestedFilename())
            .sort(),
    ).toEqual(['Set list.ensemble', 'old-text-chart (unreadable).json']);

    // The notices' Remove (#1805). First, held: a Save for it is still queued, so nothing goes.
    await page.reload();
    await expect(accountChip(page)).toBeVisible();
    await expect(page.getByTestId('home-unreadable')).toContainText(
        'One song on this device couldn’t be read',
    );
    await seedNewerQueue(page, 'old-text-chart');
    await page.getByTestId('home-unreadable-remove').click();
    const confirm = page.getByTestId('remove-unreadable');
    await expect(confirm.locator('h2')).toHaveText('Remove the song this device couldn’t read?');
    await expect(confirm).toContainText(
        'Once it’s gone it can’t be recovered, unless you exported it first.',
    );
    // Its own Export, before anything goes.
    await confirm.getByTestId('remove-unreadable-export').click();
    await expect.poll(() => downloads.length).toBe(5);
    expect(downloads[4].suggestedFilename()).toBe('old-text-chart (unreadable).json');
    await confirm.getByTestId('remove-unreadable-confirm').click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId('shell-message')).toHaveText(
        'One song was kept: it has a change that hasn’t reached your account yet, and removing it would lose that change.',
    );
    await expect(page.getByTestId('home-unreadable')).toBeVisible();

    // Once nothing is queued for it, Remove from All songs takes it off both surfaces.
    await seedNewerQueue(page, 'old-text-chart', true);
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByTestId('all-songs-unreadable')).toBeVisible();
    await page.getByTestId('all-songs-unreadable-remove').click();
    await page.getByTestId('remove-unreadable-confirm').click();
    await expect(page.getByTestId('shell-message')).toHaveText('Removed 1 song.');
    await expect(page.getByTestId('all-songs-unreadable')).toHaveCount(0);
    await expect(page.locator('.all-songs-count')).toHaveText('· 1');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByTestId('library-heading')).toBeVisible();
    await expect(page.getByTestId('home-unreadable')).toHaveCount(0);
});

async function streamText(download: Download): Promise<string> {
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
}
