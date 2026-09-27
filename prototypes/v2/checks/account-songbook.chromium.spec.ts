import {
    closeSongActions,
    newSongOnTheStand,
    openSongActions,
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
    await expect(songTitles(page)).toHaveText(guestSongs); // web-first, retries (#1330)
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

    // #1460 acceptance — the SAME retry failure is a persistent notice on the stand, readable
    // without opening Song actions at all, in its own element (review P2 #1) so a standing
    // failure can never mask a later `message` toast.
    const standNotice = page.getByTestId('stand-sync-failure');
    await expect(standNotice).toBeVisible();
    await expect(standNotice).toContainText('Saved on this device');
    await expect(standNotice).toContainText('back online');

    // #1460 review P2 #4 — the sync-failure notice and the Resume-follow pill are both in the
    // fixed `.stand-stack` now (never independently positioned), so proving they cannot overlap
    // needs both showing at once: start playback and scroll away.
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await page.locator('.chart-scroll').press('PageDown');
    const pill = page.getByTestId('resume-follow');
    await expect(pill).toBeVisible();
    const noticeBox = await standNotice.boundingBox();
    const pillBox = await pill.boundingBox();
    expect(noticeBox).not.toBeNull();
    expect(pillBox).not.toBeNull();
    // No vertical overlap: one box's top sits at or below the other's bottom edge.
    const noOverlap =
        noticeBox!.y + noticeBox!.height <= pillBox!.y ||
        pillBox!.y + pillBox!.height <= noticeBox!.y;
    expect(noOverlap).toBe(true);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    // Starting playback closes the editor (`startPlayback` sets `editing` false so the chart is
    // what a musician sees while the band plays) — reopened here since the rest of this test
    // still needs the title field.
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(page.getByLabel('Song title')).toBeVisible();

    // #1460 acceptance — the close button dismisses it (a persistent notice, unlike an
    // auto-dismissed message) and is a real ≥44px tap target, not a decorative ×.
    const dismiss = standNotice.getByRole('button', { name: 'Dismiss' });
    const dismissBox = await dismiss.boundingBox();
    expect(dismissBox?.width).toBeGreaterThanOrEqual(44);
    expect(dismissBox?.height).toBeGreaterThanOrEqual(44);
    await dismiss.click();
    await expect(page.getByTestId('stand-sync-failure')).toHaveCount(0);
    // The failure itself has not changed — this is a dismissal of the notice, not a fix — so
    // Song actions still shows it in full. Opening it also hides the stand's own copy (review
    // P2 #1): both are `role="status"`, and leaving both mounted would announce one change twice.
    await openSongActions(page);
    await expect(page.getByTestId('sync-local')).toHaveText('Saved on this device');
    await expect(page.getByTestId('sync-cloud')).toContainText('Waiting to upload');
    const failure = page.getByTestId('sync-failure');
    await expect(failure).toContainText('Saved on this device');
    await expect(failure).toContainText('back online');
    await expect(page.getByTestId('stand-sync-failure')).toHaveCount(0);

    // Reconnecting is one of the four triggers. Nothing polled for this.
    await page.context().setOffline(false);
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
    await expect(failure).toHaveCount(0);
    await closeSongActions(page);
    // The stand's own notice is gone the moment the underlying fact is, menu open or not.
    await expect(page.getByTestId('stand-sync-failure')).toHaveCount(0);

    // A refusal the musician has to act on reads as a sentence, never as a server code.
    await page.route('**/api/documents/save', (route) =>
        route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: '{"error":"quota_exceeded"}',
        }),
    );
    await saveAs(page, 'Road take three');
    // #1460 review P3 — a DIFFERENT fact (a quota retry, not the earlier offline one) reappears
    // on the stand on its own: the earlier dismissal was keyed to the offline failure and does
    // not carry over to this one.
    await expect(page.getByTestId('stand-sync-failure')).toContainText('library is full');
    await openSongActions(page);
    const failureAgain = page.getByTestId('sync-failure');
    await expect(failureAgain).toContainText('library is full');
    expect(await failureAgain.textContent()).not.toContain('quota');
    // Refused by the cloud and still safe here — the exact case three separate facts exist for.
    await expect(page.getByTestId('sync-local')).toHaveText('Saved on this device');
    await closeSongActions(page);
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
    await openSongActions(page);
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
    await closeSongActions(page);

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
    // #1460 — a permanent per-document refusal is ALSO one of the stand's own persistent-notice
    // cases (`syncFailureNotice`'s `view.cloud.status === 'refused'` branch).
    await openSongActions(page);
    await expect(page.getByTestId('sync-cloud')).toHaveText('This chart is too large to upload');
    await expect(page.getByTestId('sync-local')).toHaveText('Saved on this device');
    await closeSongActions(page);
    // The pass-level failure (`sync.failure`, reason `'too-large'`) outranks the per-document
    // cloud label here — the same priority `syncFailureNotice` and `SyncStatus`'s own
    // `sync-failure` element both give it — so the stand's own words are the fuller sentence.
    const standNotice = page.getByTestId('stand-sync-failure');
    await expect(standNotice).toContainText('this chart is too large to upload');

    await page.unroute('**/api/documents/save');
    // A fresh Save of the SAME document is a request the account has never seen, and it clears
    // the refusal instead of queuing behind it — the queue becomes [new], not [refused, new].
    const uploaded = page.waitForResponse(
        (response) => response.url().includes('/api/documents/save') && response.ok(),
    );
    await saveAs(page, 'Big chart three');
    await uploaded;
    await openSongActions(page);
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
    await closeSongActions(page);
});

/**
 * #1460 re-review P2 #1 — a local Save failure DOES get a persistent stand notice, reversing the
 * previous round's call: the top `.error-banner` alone isn't enough, because `run()` opens with
 * `setError('')` and the very next `run()` ANYWHERE — opening Song actions to go check, pressing
 * Play, a feel change — wipes that banner while the local failure is still true.
 * `syncFailureNotice` checks `view.local.status === 'save-failed'` FIRST, ahead of the pass-level
 * failure, so the stand's own notice survives regardless of what else runs in between.
 */
test('a forced local Save failure gets a persistent stand notice that survives other run()s', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Local fail take');

    // Offline (so a pass-level `sync.failure` would ALSO be live) and the account's own local
    // IndexedDB write is what fails — `syncFailureNotice` must resolve the ambiguity in the local
    // write's favour, not the pass-level one.
    await page.context().setOffline(true);
    await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        Object.assign(window, { __failLocalSave: true });
        IDBObjectStore.prototype.put = function (
            ...args: Parameters<typeof IDBObjectStore.prototype.put>
        ) {
            const request = Reflect.apply(put, this, args);
            if (
                this.name === 'songs' &&
                (window as unknown as { __failLocalSave: boolean }).__failLocalSave
            ) {
                this.transaction?.abort();
            }
            return request;
        };
    });
    await page.getByLabel('Song title').fill('Local fail take two');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.locator('.error-banner')).toBeVisible();
    const standNotice = page.getByTestId('stand-sync-failure');
    await expect(standNotice).toContainText('Save failed on this device');

    // Opening Song actions is itself a `run()` (`onMenu`) — its own `setError('')` wipes the top
    // banner the instant it fires, but the stand's own notice reads a different fact and must not
    // move.
    await openSongActions(page);
    await expect(page.getByTestId('sync-local')).toHaveText('Save failed on this device');
    await closeSongActions(page);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(standNotice).toContainText('Save failed on this device');

    // And pressing Play — another `run()` — still doesn't clear it.
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await expect(standNotice).toContainText('Save failed on this device');
    await page.getByRole('button', { name: 'Stop playback' }).click();
});
