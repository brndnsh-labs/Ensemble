import {
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
 * The product moment (#1266): Save on one device, open it on another — against the real account
 * API on one origin, with real passkeys and a real IndexedDB on each side.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * **Budget note, load-bearing for stability:** `POST /api/auth/recovery/enroll` is rate limited
 * to 5 per 10 minutes and the harness runs the API in `socket-only` identity mode, so every test
 * sharing a worker shares ONE bucket. Creating an account through the UI always enrols once, so
 * this file spends exactly 2 — one per test, with the two-device journey reusing its single
 * account rather than minting a second. Do not add a third account here; fold a new claim into
 * one of these two journeys instead.
 */

test('a song saved on one device opens on another, and the guest songbook is untouched', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    // The guest songbook as it stands before any account exists on this device. With accounts on,
    // the list is held back until the first session read answers — the shell will not show one
    // songbook and then swap in another — so wait for that answer before reading the rows.
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    const guestSongs = await songTitles(page).allInnerTexts();
    expect(guestSongs.length).toBeGreaterThan(0);

    await signUp(page);
    // Rollout decision 9 S3: no switcher. Signed in, the songbook IS the account library —
    // a separate store, which on a brand-new account is legitimately empty.
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    // The read has to have actually FINISHED before an empty table means anything: "we haven't
    // looked yet" and "your account has no songs" render as the same zero rows otherwise, so a
    // failed or still-running library read would pass this assertion as a success.
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.locator('.song-row')).toHaveCount(0);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Take A');

    // Device two: its own cookie jar, its own localStorage, its own IndexedDB and its own
    // authenticator. The ONLY thing carried across is the passkey, which is the whole claim.
    const passkeys = await authenticator.credentials();
    expect(passkeys).toHaveLength(1);
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await openWithAccounts(second);
        // The opt-in is per device, so this profile asks for the account UI itself.
        await second.getByTestId('account-sign-in').click();
        await second.getByTestId('account-do-sign-in').click();
        await expect(second.getByRole('button', { name: 'Sign out' })).toBeVisible();
        // Signing in is a trigger: A arrives without the musician asking for a download.
        await expect(songTitles(second)).toHaveText('Take A');

        // B is an edit that is never saved; C is the next committed version.
        await page.getByLabel('Song title').fill('Take B');
        await saveAndUpload(page, 'Take C');

        // A then C, and never the unsaved B: an experiment nobody committed never uploads.
        // On reload the list stays hidden until the session read answers "signed in" and the
        // account library is read — never the guest starters for a moment first.
        await second.reload();
        await expect(second.getByTestId('library-heading')).toHaveText('Your account songbook');
        await expect(second.getByTestId('library-loading')).toHaveCount(0);
        await expect(songTitles(second)).toHaveText('Take C');
        await expect(songTitles(second)).toHaveCount(1);
    } finally {
        await fresh.close();
    }

    // D is unsaved too — and this device reopens D, not the C the cloud confirmed.
    await page.getByLabel('Song title').fill('Take D');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    // The list shows what was committed; the row is the door back to the retained draft.
    await expect(songTitles(page)).toHaveText('Take C');
    await page.locator('.song-link').click();
    await expect(page.getByRole('heading', { name: 'Take D', exact: true })).toBeVisible();

    // Nothing above went anywhere near the guest songbook.
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    // Sign-out goes through its preflight (#1269). Take D is exactly the case it exists for: an
    // edit this device kept and the account never got, about to be removed. So the step NAMES it
    // and the destructive button says "anyway" — "everything has reached your account" here would
    // be the preflight lying about the retained draft the two assertions above just proved.
    await page.getByTestId('account-sign-out').click();
    await expect(page.getByTestId('sign-out-drafts')).toContainText(
        'One unsaved experiment is kept on this device',
    );
    await expect(page.getByTestId('sign-out-clear')).toHaveCount(0);
    await expect(page.getByTestId('sign-out-confirm')).toHaveText('Sign out anyway');
    await page.getByTestId('sign-out-confirm').click();
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
    await expect(page.getByTestId('library-heading')).toHaveText('Your songbook');
    expect(await songTitles(page).allInnerTexts()).toEqual(guestSongs);
});

test('an offline Save is safe here and confirms on reconnect; a refusal arrives as words', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Road take');

    // Offline, Save is still a successful Save. It commits here and says so; it does not fail,
    // and it does not pretend the cloud has it.
    await page.context().setOffline(true);
    await saveAs(page, 'Road take two');
    await expect(page.getByTestId('sync-local')).toHaveText('Saved on this device');
    await expect(page.getByTestId('sync-cloud')).toContainText('Waiting to upload');
    const failure = page.getByTestId('sync-failure');
    await expect(failure).toContainText('Saved on this device');
    await expect(failure).toContainText('back online');

    // Reconnecting is one of the four triggers. Nothing polled for this.
    await page.context().setOffline(false);
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
    await expect(failure).toHaveCount(0);

    // A refusal the musician has to act on reads as a sentence, never as a server code.
    await page.route('**/api/documents/save', (route) =>
        route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: '{"error":"quota_exceeded"}',
        }),
    );
    await saveAs(page, 'Road take three');
    await expect(failure).toContainText('library is full');
    expect(await failure.textContent()).not.toContain('quota');
    // Refused by the cloud and still safe here — the exact case three separate facts exist for.
    await expect(page.getByTestId('sync-local')).toHaveText('Saved on this device');
    await page.unroute('**/api/documents/save');
});

/**
 * A per-document, permanent refusal (#1298) — the chip names it durably, distinct from the
 * pass-level `sync-failure` sentence above, and a fresh Save of the same document clears it
 * rather than queuing behind it forever. Forced with the same `page.route` intercept the quota
 * case above already uses; the 413 the account API would emit for an oversized chart is not
 * something this suite needs a real oversized chart to reproduce.
 */
test('a 413 names the refusal on the chip, and a fresh Save clears it (#1298)', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);

    await newSongOnTheStand(page);
    // Waited on the manifest GET, not just the chip: the chip's "Saved to your account" can read
    // true the instant the Save half of the pass acknowledges, while the DOWNLOAD half is still
    // in flight — and starting the next Save while THIS pass is still running would coalesce into
    // a second, overlapping pass (`run()`'s documented "duplicate senders" case) that resends the
    // same frozen bytes and would make the call count below flaky for reasons unrelated to #1298.
    const firstPassSettled = page.waitForResponse(
        (response) => response.url().includes('/api/documents?') && response.ok(),
    );
    await saveAs(page, 'Big chart');
    await firstPassSettled;
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');

    await page.route('**/api/documents/save', (route) =>
        route.fulfill({
            status: 413,
            contentType: 'application/json',
            body: '{"error":"payload_too_large"}',
        }),
    );
    await saveAs(page, 'Big chart two');
    // Named per document, on the cloud fact itself — not folded into the transient pass-level
    // `sync-failure` sentence, which would go stale the moment a later pass touches another song.
    // (A strict request COUNT is not asserted here: an overlapping "duplicate sender" pass, from
    // an `online`/`visibilitychange` firing while this one is still in flight, is a documented,
    // safe case elsewhere in this suite and would make a call-count assertion flaky for reasons
    // unrelated to #1298. The unit-level proof that the SECOND, later pass sends nothing further
    // lives in `tests/unit/songbook/account-sync-loop.test.ts`.)
    await expect(page.getByTestId('sync-cloud')).toHaveText('This chart is too large to upload');
    await expect(page.getByTestId('sync-local')).toHaveText('Saved on this device');

    await page.unroute('**/api/documents/save');
    // A fresh Save of the SAME document is a request the account has never seen, and it clears
    // the refusal instead of queuing behind it — the queue becomes [new], not [refused, new].
    const uploaded = page.waitForResponse(
        (response) => response.url().includes('/api/documents/save') && response.ok(),
    );
    await saveAs(page, 'Big chart three');
    await uploaded;
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
});
