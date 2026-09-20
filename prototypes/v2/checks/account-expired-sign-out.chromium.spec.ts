import type { Page } from '@playwright/test';
import { ACCOUNT_DATABASE } from '../lib/sync/protocol';
import {
    backToSongbook,
    CODE_SHAPE,
    dismissAdoptGuestPrompt,
    newSongOnTheStand,
    openWithAccounts,
    saveAndUpload,
    saveAs,
    signUp,
    songTitles,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * "Sign out on this device" (#1351) — against the real account API on one origin, with real
 * passkeys and a real IndexedDB.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * The gap this closes: a device with no live session had no way to clear the account's local data.
 * The banner offered only "Sign in again", `signOut()` needs a live scope and a logout round trip,
 * and `switchAccount(B)` fences A's rows out without deleting them — so a device that changed hands
 * kept A's songs, outbox and drafts on disk indefinitely. Auto-wiping on an owner switch would
 * contradict "an expired session loses no queued Save", so the way out has to be an explicit act
 * (DECISION 2026-09-19, Brandon, on #1269).
 *
 * It is the same clearing path as #1269's sign-out and #1271's delete-my-account, with the
 * revocation already settled — the session is dead, so there is nothing to revoke. The four tests:
 *
 * 1. The journey, driven entirely OFFLINE against a request counter proven non-vacuous — the step
 *    sends nothing, so decision 9 S2's "sign-out needs a connection" does not reach it.
 * 2. The control belongs to the banner, not to whoever is signed in now (the #1311 state).
 * 3. It survives a RELOAD, which is the whole point of deriving the offer from STORAGE rather than
 *    from the session: `session.ts` only ever moves a signed-in session to `expired`, so a restart
 *    lands on `guest` with every row still on the disk. Also pins what a plain guest device pays.
 * 4. A refusal from another tab is said INSIDE the modal step, not in the inert tree behind it.
 *
 * **Budget note:** `POST /api/auth/recovery/enroll` is rate limited to 5 per 10 minutes and the
 * harness runs the API in `socket-only` identity mode. `accountApi` is TEST-scoped, so each test
 * gets its own API process and its own bucket: 1, 2, 1 and 1. Fold a new claim into one of these
 * journeys rather than adding a fifth.
 */

const RECOVERY_PREFIX = 'ensemble-v2-preview:recovery:';

/** How many per-writer chart recoveries the GUEST namespace holds. Expected 0 throughout. */
function recoverySlots(page: Page): Promise<number> {
    return page.evaluate(
        (prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix)).length,
        RECOVERY_PREFIX,
    );
}

/**
 * The document id this account filed a title under, read out of the account database's `songs`
 * store. Nothing on screen carries it, and every account store keys on it — so the spec has to ask
 * storage while the song is still here, before the sign-out removes it.
 */
function documentIdOf(page: Page, title: string): Promise<string> {
    return page.evaluate(
        async ([name, wanted]) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(name);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            // Rejects rather than resolving empty: an unreadable store must not read as "no such
            // song", which every assertion below would then agree with.
            const rows = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
                const request = db.transaction('songs', 'readonly').objectStore('songs').getAll();
                request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
                request.onerror = () => reject(request.error);
            });
            db.close();
            const match = rows.find(
                (row) => (row.document as { title?: string } | undefined)?.title === wanted,
            );
            return typeof match?.documentId === 'string' ? match.documentId : '';
        },
        [ACCOUNT_DATABASE, title] as const,
    );
}

/**
 * Every row in the account database mentioning a document id, in ANY store and under ANY owner,
 * plus the owner `meta.active` names (#1311's reader scopes to the attached owner; here there is
 * deliberately no attached owner left to scope to, and "gone" has to mean gone from the file).
 *
 * `total` is what makes the zeros meaningful: it counts every row in the database, so a reader
 * that had silently stopped finding anything would show up as a total of 0 before the sign-out
 * rather than as a clean bill of health after it.
 */
function accountRows(
    page: Page,
    documentId: string,
): Promise<{ owner: string; total: number; matching: Record<string, number> }> {
    return page.evaluate(
        async ([name, id]) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(name);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            // A failed read rejects: resolving `[]` would count as "nothing of A's here" and pass.
            const read = (store: string) =>
                new Promise<unknown[]>((resolve, reject) => {
                    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
                    request.onsuccess = () => resolve(request.result as unknown[]);
                    request.onerror = () => reject(request.error);
                });
            const meta = (await read('meta')) as Array<Record<string, unknown>>;
            const active = meta.find((row) => row.key === 'active');
            const matching: Record<string, number> = {};
            let total = 0;
            for (const store of Array.from(db.objectStoreNames)) {
                const rows = await read(store);
                total += rows.length;
                // `meta` is one generic keyed store whose rows carry the owner and the document id
                // inside the KEY, so everything is matched on the serialized row, which holds both.
                matching[store] = rows.filter((row) =>
                    JSON.stringify(row ?? null).includes(id),
                ).length;
            }
            db.close();
            return {
                owner: typeof active?.ownerId === 'string' ? active.ownerId : '',
                total,
                matching,
            };
        },
        [ACCOUNT_DATABASE, documentId] as const,
    );
}

/** Every request this page makes to the account API, counted live. */
function apiRequests(page: Page): () => number {
    let count = 0;
    page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/')) {
            count += 1;
        }
    });
    return () => count;
}

test('an expired session clears its account from this device, offline, without a request', async ({
    page,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    // The guest rows render after the hero heading, and with accounts on the list waits for the
    // first session read — assert they arrived rather than measuring an empty list later (#1330).
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(songTitles(page)).not.toHaveCount(0);
    const guestSongs = await songTitles(page).allInnerTexts();
    expect(guestSongs.length).toBeGreaterThan(0);
    const apiCalls = apiRequests(page);
    await signUp(page);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');
    const documentId = await documentIdOf(page, 'Set list');
    expect(documentId).not.toBe('');

    // A committed version the account never took, and an unsaved experiment on top of it. This is
    // the work the step has to name before it destroys it — and, unlike an ordinary sign-out, the
    // queued Save here can never be rescued by sending it.
    await page.context().setOffline(true);
    await saveAs(page, 'Set list two');
    await expect(page.getByTestId('sync-cloud')).toContainText('Waiting to upload');
    await page.getByLabel('Song title').fill('Set list three');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    // The experiment is in the ACCOUNT's own database (#1299), which is what this zero measures:
    // not one byte of this account's chart text is in the guest namespace.
    expect(await recoverySlots(page)).toBe(0);

    // The session goes away underneath the musician: the cookie is dropped, so the next pass meets
    // a 401 with the account, the passkey and the queued Save all still perfectly valid.
    // Cookies FIRST, then the network. Coming back online fires the browser's own `online` event,
    // which runs a pass — and with the session still valid that pass uploads the very version this
    // step is about to be asked to name.
    await page.context().clearCookies();
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByTestId('account-expired-banner')).toBeVisible();
    await backToSongbook(page);

    // Both ways out are offered, side by side. "Sign in again" keeps everything and resumes the
    // upload; this one is the other answer, for a device that is changing hands.
    const banner = page.getByTestId('account-expired-banner');
    // The EXPIRED sentence, unchanged from #1269 — this page load really did have a session, so
    // "again" is true and so is the reassurance (#1351 patch N1). The reload journey below pins
    // the other one.
    await expect(banner).toContainText('Sign in again to keep syncing');
    await expect(banner).toContainText('Everything you saved is still on this device');
    await expect(banner.getByRole('button', { name: 'Sign in again' })).toBeVisible();
    const signOutHere = page.getByTestId('account-expired-sign-out');
    await expect(signOutHere).toHaveText('Sign out on this device');

    // Everything from here runs OFFLINE, and against a request counter. The counter is proven
    // non-vacuous first: signing up and uploading a song spent plenty, so a zero below is the
    // absence of requests rather than the absence of counting.
    const before = apiCalls();
    expect(before).toBeGreaterThan(0);
    await page.context().setOffline(true);
    await signOutHere.click();

    // The queue's warning is scoped to THIS action and names the alternative (patch R4). "Sync
    // now" is not offered — a button that provably cannot work does not belong beside a
    // destructive one — and the sentence must not claim the version is doomed, because cancelling
    // and signing back in as this account is precisely what still uploads it.
    const unsent = page.getByTestId('sign-out-unsent');
    await expect(unsent).toContainText('Signing out here discards it');
    await expect(unsent).toContainText('cancel and sign in again to let it upload');
    await expect(unsent).not.toContainText('never');
    await expect(page.getByTestId('sign-out-drafts')).toContainText(
        'One unsaved experiment is kept on this device',
    );
    await expect(page.getByTestId('sign-out-sync')).toHaveCount(0);
    await expect(page.getByTestId('sign-out-clear')).toHaveCount(0);
    // And the network does NOT gate the destructive button here (rollout decision 9 S2 applies to
    // a logout round trip, and there is none): no offline reason, and the button is live.
    await expect(page.getByTestId('sign-out-offline')).toHaveCount(0);
    await expect(page.getByTestId('sign-out-confirm')).toBeEnabled();
    await expect(page.getByTestId('sign-out-confirm')).toHaveText('Sign out anyway');

    // Export is the only thing that saves those bytes, and it writes the EDITED title — so this is
    // the retained draft, not the library's committed copy, which is the version that would not
    // have been worth rescuing. Offline, as it always is: the file never leaves the device.
    const download = page.waitForEvent('download');
    await page.getByTestId('sign-out-export').click();
    expect((await download).suggestedFilename()).toBe('Set list three.ensemble');

    // Everything of this account's is still on the disk at this point, which is what makes the
    // reader's zeros afterwards a measurement.
    const occupied = await accountRows(page, documentId);
    expect(occupied.owner).not.toBe('');
    expect(occupied.total).toBeGreaterThan(0);
    expect(occupied.matching.songs).toBeGreaterThan(0);
    expect(occupied.matching.operations).toBeGreaterThan(0);
    expect(occupied.matching.drafts).toBeGreaterThan(0);

    await page.getByTestId('sign-out-confirm').click();

    // A guest device, not an expired one: nobody who has just left should be told to "sign in
    // again to keep syncing", and the banner that offered this control is gone with it.
    await expect(page.getByTestId('account-sign-in')).toHaveText('Sign in');
    await expect(page.getByTestId('account-expired-banner')).toHaveCount(0);
    await expect(page.getByTestId('account-expired-sign-out')).toHaveCount(0);
    await expect(page.getByTestId('library-heading')).toHaveText('Your songbook');
    await expect(songTitles(page)).toHaveText(guestSongs);
    expect(await recoverySlots(page)).toBe(0);

    // Nothing of that account is left in ANY store — read out of IndexedDB rather than inferred
    // from a list, because the claim covers the committed record, the outbox, the receipts, the
    // drafts and the `meta` namespaces, and the songbook renders exactly one of those.
    const cleared = await accountRows(page, documentId);
    expect(cleared.matching).toEqual({
        songs: 0,
        operations: 0,
        receipts: 0,
        drafts: 0,
        meta: 0,
    });
    // The fence itself is all that is left: `switchAccount(null)` names no owner, and the row it
    // wrote is the one thing `clearAccount` deliberately does not reach.
    expect(cleared.owner).toBe('');
    expect(cleared.total).toBe(1);

    // Not one request, across the preflight, the export and the clear.
    expect(apiCalls()).toBe(before);

    // And it holds across a reload, with the network back: there is nothing left to re-list.
    await page.context().setOffline(false);
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(songTitles(page)).toHaveText(guestSongs);

    // A second person on the SAME browser profile (decision 9 S3: switching accounts IS sign out,
    // sign in) finds none of A's songs — which is the whole point of the control. A fresh
    // authenticator so the usernameless ceremony has one credential to choose from, exactly as a
    // real second person on this machine would.
    await authenticator.remove();
    await addVirtualAuthenticator(page);
    await signUp(page);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(page.locator('.song-row')).toHaveCount(0);
    expect((await accountRows(page, documentId)).matching).toEqual({
        songs: 0,
        operations: 0,
        receipts: 0,
        drafts: 0,
        meta: 0,
    });
});

test('the control belongs to the expired banner, not to whoever is signed in now', async ({
    page,
}) => {
    // The #1311 state: A's chart is still on the stand when B signs in on the same profile. B is
    // signed in rather than expired, so the expired banner — and the only control that can clear
    // an account's local data without a session — is gone. B pressing it would have been B asking
    // to delete A's library from a step that never named A.
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(songTitles(page)).not.toHaveCount(0);
    await signUp(page);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');

    await page.context().clearCookies();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByTestId('account-expired-banner')).toBeVisible();
    // With A's chart still on the stand — the site header is hidden while a song is open, so the
    // banner is the only place either control can be reached from.
    await expect(page.getByRole('heading', { name: 'Set list', exact: true })).toBeVisible();
    await expect(page.getByTestId('account-expired-sign-out')).toBeVisible();

    // A different person answers "Sign in again" with THEIR passkey, on the same profile.
    await authenticator.remove();
    await addVirtualAuthenticator(page);
    await page
        .getByTestId('account-expired-banner')
        .getByRole('button', { name: 'Sign in again' })
        .click();
    await page.getByTestId('account-create').click();
    await expect(page.getByTestId('recovery-code')).toHaveText(CODE_SHAPE);
    await page.keyboard.press('Escape');

    // A's chart is still on the stand and says whose it is (#1311) — and the control is gone,
    // because the banner that carried it is gone: this session is not expired, it is B's.
    await expect(page.getByTestId('stand-mismatch-banner')).toBeVisible();
    await expect(page.getByTestId('account-expired-banner')).toHaveCount(0);
    await expect(page.getByTestId('account-expired-sign-out')).toHaveCount(0);

    // B's own library renders, and nothing about the LIBRARY was reported as an error (#1351 patch
    // N3). The named reads `refreshSongs`/`computeAdoptCandidates` make are refused for as long as
    // `meta.active` still names A, which is right — but that refusal is "not ready yet", and its
    // sentence is about a CHART on a stand, so it must never reach the shell's error line about a
    // listing. The `role="status"` mismatch banner above is a different element and stays.
    await backToSongbook(page);
    // #1268's adoption offer waits for the songbook while a chart is open, so it arrives here.
    await dismissAdoptGuestPrompt(page);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(page.locator('.error-banner[role="alert"]')).toHaveCount(0);

    // A's records are still on the disk, untouched by B's arrival — which is exactly the state the
    // first test's control exists to resolve, and exactly the state B must not be able to resolve
    // on A's behalf from a step that never mentioned A.
    const documentId = await documentIdOf(page, 'Set list');
    expect(documentId).not.toBe('');
    const rows = await accountRows(page, documentId);
    expect(rows.matching.songs).toBeGreaterThan(0);
});

test('a device that still holds an account after a RELOAD can still clear it', async ({ page }) => {
    // The reachability gap this patch closes (#1351 patch R1). `session.ts` only ever moves a
    // SIGNED-IN session to `expired`, so a reload lands on `guest` — while `meta.active` still
    // names the account and every one of its rows is still on the disk. With the offer derived
    // from the session state, a device that changed hands and was restarted in between had no
    // surface anywhere to clear it, and a later sign-in as B fenced A's rows out forever.
    //
    // So the banner's condition is a STORAGE fact: this device HOLDS an account, and there is no
    // live session for it.
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(songTitles(page)).not.toHaveCount(0);
    const guestSongs = await songTitles(page).allInnerTexts();
    expect(guestSongs.length).toBeGreaterThan(0);

    // A device that has never held an account pays nothing for any of this: no banner, no offer,
    // and the guest songbook is the whole app. The same assertion after the clear below is what
    // makes this one a measurement rather than a coincidence of timing.
    await expect(page.getByTestId('account-expired-banner')).toHaveCount(0);
    await expect(page.getByTestId('account-expired-sign-out')).toHaveCount(0);

    await signUp(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');
    const documentId = await documentIdOf(page, 'Set list');
    expect(documentId).not.toBe('');

    // Work the account has not got, so the preflight has something to name after the reload.
    await page.context().setOffline(true);
    await saveAs(page, 'Set list two');
    await expect(page.getByTestId('sync-cloud')).toContainText('Waiting to upload');

    // Cookies FIRST, then the network, for the reason the journey above states: the `online` event
    // runs a pass, and a pass with a live session uploads the queued Save.
    await page.context().clearCookies();
    await page.context().setOffline(false);

    // The session goes away, and then the page is RELOADED — which is where `expired` stops
    // existing and `guest` takes over, with nothing about the disk having changed.
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    // Not "Sign in again": this page load never saw a signed-in session, so the header is a plain
    // guest header. That is exactly why the offer cannot be derived from the session state.
    await expect(page.getByTestId('account-sign-in')).toHaveText('Sign in');

    // The banner is here anyway, with both answers, because this device still holds the account —
    // and it says something DIFFERENT (#1351 patch N1). "Sign in again to keep syncing" would be
    // wrong twice over here: this load never had a session, and the same state is reached by a
    // deliberate sign-out whose clear failed, where it reads as though the sign-out never happened.
    const banner = page.getByTestId('account-expired-banner');
    await expect(banner).toContainText('This device still has an account songbook on it');
    await expect(banner).not.toContainText('again');
    // "Sign in", exactly — not "Sign in again".
    await expect(banner.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Sign in again' })).toHaveCount(0);
    await expect(page.getByTestId('account-expired-sign-out')).toBeVisible();

    await page.getByTestId('account-expired-sign-out').click();
    // The preflight reads the account this device holds, not the session it does not have.
    await expect(page.getByTestId('sign-out-unsent')).toContainText('Signing out here discards it');
    await expect(page.getByTestId('sign-out-confirm')).toBeEnabled();
    await page.getByTestId('sign-out-confirm').click();

    // Gone, from every store, and the banner with it — this device holds nothing now.
    await expect(page.getByTestId('account-expired-banner')).toHaveCount(0);
    await expect(page.getByTestId('account-expired-sign-out')).toHaveCount(0);
    await expect(songTitles(page)).toHaveText(guestSongs);
    const cleared = await accountRows(page, documentId);
    expect(cleared.matching).toEqual({
        songs: 0,
        operations: 0,
        receipts: 0,
        drafts: 0,
        meta: 0,
    });
    expect(cleared.owner).toBe('');
});

test('a refusal from another tab is said inside the step, not behind it', async ({ page }) => {
    // #1351 patch R3. The step is a `<dialog>` opened with `showModal()`, which makes the rest of
    // the tree INERT — so a refusal routed through the shell's error banner is rendered behind the
    // modal where it can be neither read nor dismissed, and the dialog just sits there.
    //
    // The refusal itself is real: `meta.active` is one row in one database shared by every tab on
    // this origin, and a second tab signing in as somebody else rewrites it. Writing that row
    // directly is the same act, without spending a second passkey enrolment on it.
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await signUp(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');

    await page.context().clearCookies();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByTestId('account-expired-banner')).toBeVisible();
    await backToSongbook(page);
    await page.getByTestId('account-expired-sign-out').click();
    await expect(page.getByTestId('sign-out-confirm')).toBeEnabled();

    // The other tab arrives between the preflight and the confirm.
    await page.evaluate(async (name) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({
                key: 'active',
                ownerId: 'someone-else-entirely',
                generation: 99,
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }, ACCOUNT_DATABASE);

    await page.getByTestId('sign-out-confirm').click();

    // Said INSIDE the dialog, in this step's own words — not the chart sentence, which would send
    // the musician looking for a song this step never mentioned.
    const failure = page.getByTestId('sign-out-failure');
    await expect(failure).toBeVisible();
    await expect(failure).toContainText('nothing here to sign out of');
    await expect(failure).not.toContainText('export it');
    // And the step is still open, because nothing happened: no fence moved and no row was removed.
    await expect(page.getByTestId('sign-out-confirm')).toBeVisible();
});
