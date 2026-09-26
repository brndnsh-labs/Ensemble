import type { Page } from '@playwright/test';
import { ACCOUNT_DATABASE } from '../lib/sync/protocol';
import {
    backToSongbook,
    dismissAdoptGuestPrompt,
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
 * The two preserved-candidate kinds `reconcile` has always produced but this stand had no
 * surface for (#1362) — `'deleted'` (the account tombstoned a song this device holds work for)
 * and `'unsupported'` (a body from a schema this build cannot read). #1310 gave `'version'` its
 * marker, banner and adoption route; this closes the other two, following the same pattern:
 * `SyncSnapshot.candidates` publishes the `kind` with each row, and the songbook row, the stand
 * banner and the sync chip each read it.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * The `'deleted'` kind also has full end-to-end coverage reached through a REAL cloud delete —
 * see the second device in `account-delete.chromium.spec.ts`'s "offline the delete is disabled
 * with a reason" test, which downloads a real tombstone for a chart on the stand and proves the
 * chip, the banner and the "Keep mine as a new song" resolution this story adds to
 * `AccountSongbook.keepBoth`. This file adds a `'deleted'` case reached with a plain unsaved
 * DRAFT rather than an open chart, to prove the surfaces read `kind`, not the reason a record
 * was held — and the `'unsupported'` kind, which cannot be reached the same way.
 *
 * **Why `'unsupported'` is seeded in storage rather than downloaded for real.** The contract's
 * body is "a schema a future update understands" — by construction, a body this exact build
 * cannot decode. The server validates every Save through the SAME portable codec the client
 * does (`decodeSaveRequest` → `snapshot()`, `prototypes/v2-api/src/http/documents.ts`), so no
 * request this build can send ever reaches storage as an undecodable document: there is no way,
 * with one build of this codebase, to make the real account API hold a body this same build
 * cannot read back. `reconcile()`'s own `'unsupported'` branch (`repository.ts`) is exactly this
 * boundary — a download saw a body it could not validate and preserved it untouched — and the
 * unit-level coverage for it (`tests/browser/account-keep-both.browser.test.ts`,
 * `account-adopt-candidate.browser.test.ts`) already reaches it the same way this file does: by
 * writing the exact `RemoteCandidate` row `reconcile` would have written directly into this
 * device's own account database, through the same public shape (`meta`, keyed
 * `remote:<owner>:<documentId>`) the app itself reads with `AccountSongbook.remoteCandidates`.
 * Nothing about the SURFACE under test — the marker, the banner, the chip, the absence of any
 * action — depends on how the candidate arrived; only the (unreachable) upload does.
 */

/** One of the loop's four triggers, with nothing else going on. */
async function syncPass(page: Page): Promise<void> {
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

/**
 * Write an `'unsupported'` remote candidate directly into this device's account database, for
 * the song whose COMMITTED title is `songTitle` — see this file's header for why no real upload
 * can produce one. `revision` only has to be a string the record's own `remoteRevision` is not;
 * revisions are opaque and never compared for order, so nothing here claims one is "newer".
 */
async function seedUnsupportedCandidate(
    page: Page,
    songTitle: string,
    revision: string,
): Promise<void> {
    await page.evaluate(
        async ({
            database,
            title,
            revision,
        }: {
            database: string;
            title: string;
            revision: string;
        }) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(database);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            try {
                const active = await new Promise<{ ownerId: string } | undefined>(
                    (resolve, reject) => {
                        const request = db
                            .transaction('meta', 'readonly')
                            .objectStore('meta')
                            .get('active');
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    },
                );
                if (!active) {
                    throw new Error('No account is attached on this device.');
                }
                const songs = await new Promise<Array<Record<string, unknown>>>(
                    (resolve, reject) => {
                        const request = db
                            .transaction('songs', 'readonly')
                            .objectStore('songs')
                            .getAll();
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    },
                );
                const row = songs.find(
                    (candidate) =>
                        (candidate.document as { title?: string } | undefined)?.title === title,
                );
                if (!row || typeof row.documentId !== 'string') {
                    throw new Error(`No saved song titled ${title}.`);
                }
                await new Promise<void>((resolve, reject) => {
                    const tx = db.transaction('meta', 'readwrite');
                    tx.objectStore('meta').put({
                        key: `remote:${active.ownerId}:${row.documentId}`,
                        ownerId: active.ownerId,
                        documentId: row.documentId,
                        kind: 'unsupported',
                        revision,
                        body: { schemaVersion: 99, id: row.documentId },
                        reason: 'needs-app-update',
                    });
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
            } finally {
                db.close();
            }
        },
        { database: ACCOUNT_DATABASE, title: songTitle, revision },
    );
}

test('a body from a newer schema is marked, banners with no action, and never offers adoption', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Field notes');
    await backToSongbook(page);

    await seedUnsupportedCandidate(page, 'Field notes', 'cloud-future-1');
    // A reload is a fresh `attach()`: the manifest still reports this document at the revision
    // already saved here, so the diff skips it and the seeded row survives untouched — this
    // is only proving the candidate is READ, not producing a second one.
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);

    await expect(page.getByTestId('song-unsupported-in-account')).toHaveText(
        'Saved by a newer version of Ensemble — update to open it',
    );
    // Not the same marker a `'version'` or `'deleted'` candidate would leave on this row.
    await expect(page.getByTestId('song-newer-in-account')).toHaveCount(0);
    await expect(page.getByTestId('song-deleted-in-account')).toHaveCount(0);

    await openSong(page, 'Field notes');
    const banner = page.getByTestId('conflict-banner');
    await expect(banner).toHaveAttribute('data-conflict', 'candidate-unsupported');
    await expect(page.getByTestId('conflict-title')).toHaveText(
        'Saved by a newer version of Ensemble — update to open it',
    );
    // No action of any kind: neither "Use the account's version" nor "Keep mine as a new song"
    // is a real move against a body this build cannot read.
    await expect(page.getByTestId('conflict-use-account')).toHaveCount(0);
    await expect(page.getByTestId('conflict-keep-both')).toHaveCount(0);
    // The chart itself is untouched — this candidate never rewrites, migrates or coerces the
    // saved record it sits beside.
    await expect(page.getByRole('heading', { name: 'Field notes', exact: true })).toBeVisible();
    // The chip stays honest about the one thing storage actually confirmed: this device's own
    // committed copy, which the unsupported body never touched.
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
});

/**
 * `'deleted'` reached with a plain unsaved DRAFT rather than an open chart — the surfaces read
 * the candidate's `kind`, not which held-record reason produced it. The chart-open case is
 * covered end to end in `account-delete.chromium.spec.ts`.
 */
test('a tombstoned song held by an unsaved draft is marked and offered a new identity', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');
    await backToSongbook(page);

    const passkeys = await authenticator.credentials();
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await openWithAccounts(second);
        await second.getByTestId('account-sign-in').click();
        await second.getByTestId('account-do-sign-in').click();
        await expect(second.getByRole('button', { name: 'Sign out' })).toBeVisible();
        await dismissAdoptGuestPrompt(second);

        // Device one leaves an unsaved draft on the song and closes it — the record is held by
        // the draft alone, with no chart on any stand and no queued Save.
        await openSong(page, 'Set list');
        await page.getByRole('button', { name: 'Edit chart' }).click();
        await page.getByLabel('Song title').fill('Set list — my words');
        await expect(page.getByText('Draft recovered on this device')).toBeVisible();
        await backToSongbook(page);

        // Device two deletes the song from the account.
        await openSong(second, 'Set list');
        await second.getByRole('button', { name: 'Song actions' }).click();
        await second.getByTestId('delete-from-account').click();
        await second.getByTestId('delete-song-confirm').click();
        await expect(second.getByRole('button', { name: 'Song actions' })).toHaveCount(0);

        // Device one's next pass finds the tombstone. Nothing is on the stand, but the draft
        // still holds the record, so it is preserved rather than removed.
        await syncPass(page);
        await expect(page.getByTestId('song-deleted-in-account')).toHaveText(
            'No longer in your account',
        );
        await expect(songTitles(page)).toHaveText(['Set list']);

        // The row still reads its COMMITTED title; the draft recovers onto the stand the moment
        // it opens (`openSong` asserts the row's OWN title, which this is not — see
        // `openSongShowing` in `account-remote-update.chromium.spec.ts` for the same shape).
        await page.locator('.song-link', { hasText: 'Set list' }).first().click();
        await expect(
            page.getByRole('heading', { name: 'Set list — my words', exact: true }),
        ).toBeVisible();
        const banner = page.getByTestId('conflict-banner');
        await expect(banner).toHaveAttribute('data-conflict', 'candidate-deleted');
        await expect(page.getByTestId('conflict-title')).toHaveText('No longer in your account');
        // Never the version-adoption route: the account has no version to offer.
        await expect(page.getByTestId('conflict-use-account')).toHaveCount(0);

        await page.getByTestId('conflict-keep-both').click();
        await expect(
            page.getByRole('heading', { name: 'Set list — my words — kept', exact: true }),
        ).toBeVisible();
        await expect(page.getByTestId('conflict-banner')).toHaveCount(0);
        await backToSongbook(page);
        await expect(page.getByTestId('song-deleted-in-account')).toHaveCount(0);
        await expect(songTitles(page)).toHaveText(['Set list — my words — kept']);
    } finally {
        await fresh.close();
    }
});
