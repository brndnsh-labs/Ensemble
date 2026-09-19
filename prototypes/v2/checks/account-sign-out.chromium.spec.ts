import type { Page } from '@playwright/test';
import {
    backToSongbook,
    newSongOnTheStand,
    openSong,
    openWithAccounts,
    revealEditor,
    saveAndUpload,
    saveAs,
    signUp,
    songTitles,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * Signing out, and living through an expired session (#1269) — against the real account API on one
 * origin, with real passkeys and a real IndexedDB.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * The contract being proven is `docs/design/ensemble-v2-sync.md`: "On explicit sign-out, remove
 * that account's local private data after a preflight that protects unsent saves and drafts…
 * Guest songs and public sound files are unaffected. Session expiry is different: retained offline
 * songs remain usable, but uploads wait for reauthentication." Plus rollout decision 9 S2 (offline,
 * sign-out is disabled with a reason) and S3 (one account per browser profile — switching IS sign
 * out, sign in, which is why the second account below shares this profile rather than a new one).
 *
 * **Budget note:** `POST /api/auth/recovery/enroll` is rate limited to 5 per 10 minutes and the
 * harness runs the API in `socket-only` identity mode. `accountApi` is TEST-scoped, so each test
 * gets its own API process and its own bucket. This file spends 2 in the first test (the account
 * switch is the point of it) and 1 in the second. Do not add another account; fold a new claim
 * into one of these two journeys instead.
 *
 * This file is also the only place the preflight's UNSAVED-EDIT half can be proven end to end, and
 * since #1299 it proves two things at once: the count comes from the account database's `drafts`
 * store — which is where the shell now retains an account chart's experiment — and the guest
 * `localStorage` namespace holds NOTHING for that chart while it does. A count sourced from the
 * wrong store would fail the first; a shell still writing to guest storage would fail the second.
 */

const RECOVERY_PREFIX = 'ensemble-v2-preview:recovery:';

/**
 * How many per-writer chart recoveries the GUEST namespace is holding, whoever wrote them.
 *
 * Expected to stay 0 for an account chart (#1299): account content belongs in the account
 * database, which is what sign-out and delete-account remove. Read from the page rather than
 * through `lib/repository.ts` because this drives a real browser, not the module.
 */
function recoverySlots(page: Page): Promise<number> {
    return page.evaluate(
        (prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix)).length,
        RECOVERY_PREFIX,
    );
}

test('sign-out names the work it would destroy, then leaves nothing of that account behind', async ({
    page,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    // #1330 — `openWithAccounts` waits for the hero heading, which renders before the library
    // rows do, and with accounts on the list is held back until the first session read answers.
    // A bare `allInnerTexts()` here captured `[]` on a slow runner, and the closing comparison
    // then measured the real three starters against that empty array (v2-suite red on #1325,
    // green on rerun). Wait for the rows, and say out loud that there were some.
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(songTitles(page)).not.toHaveCount(0);
    const guestSongs = await songTitles(page).allInnerTexts();
    expect(guestSongs.length).toBeGreaterThan(0);
    await signUp(page);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');

    // The CLEAN case, asserted where it is actually true: nothing queued, nothing unsaved. This
    // is the sentence a preflight that could not see unsaved edits would also print a moment
    // before destroying them, so it is worth pinning to a device that really is clear — the
    // recovery-slot count is what makes that a measurement rather than a hope.
    await backToSongbook(page);
    expect(await recoverySlots(page)).toBe(0);
    await page.getByTestId('account-sign-out').click();
    await expect(page.getByTestId('sign-out-clear')).toBeVisible();
    await expect(page.getByTestId('sign-out-confirm')).toHaveText('Sign out');
    await expect(page.getByTestId('sign-out-export')).toHaveCount(0);
    await page.getByTestId('sign-out-cancel').click();

    // A Save the server will not take. Blocked at the route rather than by going offline,
    // because sign-out needs a connection (decision 9 S2) — the queue has to still be there when
    // the musician is online enough to leave, which is the whole case this preflight is for.
    await openSong(page, 'Set list');
    await revealEditor(page);
    await page.route('**/api/documents/save', (route) => route.abort('failed'));
    await saveAs(page, 'Set list two');
    await expect(page.getByTestId('sync-cloud')).toContainText('Waiting to upload');

    // Offline the header refuses sign-out outright, with the reason visible (decision 9 S2).
    // There is no persisted logout barrier, so a device that cannot reach the server cannot
    // honestly claim the session was revoked.
    await backToSongbook(page);
    await page.context().setOffline(true);
    await expect(page.getByTestId('account-sign-out')).toBeDisabled();
    await expect(page.getByTestId('account-offline-note')).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.getByTestId('account-sign-out')).toBeEnabled();

    // Editing the chart retains the experiment — in the ACCOUNT's own database (#1299), which is
    // what the zero below measures: not one byte of this account's chart text is in the guest
    // namespace. The sign-out step's own count, asserted a few lines down, is the other half; the
    // draft has to be somewhere for it to find one at all.
    await openSong(page, 'Set list two');
    await revealEditor(page);
    await page.getByLabel('Song title').fill('Set list three');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    expect(await recoverySlots(page)).toBe(0);
    await backToSongbook(page);

    await page.getByTestId('account-sign-out').click();
    await expect(page.getByTestId('sign-out-unsent')).toContainText(
        'hasn’t reached your account yet',
    );
    // The unsaved retitle is NAMED, not silently included in the queue's count — read from the
    // account's own `drafts` store (#1299), which is the store sign-out is about to empty. Without
    // it this step would print "everything on this device has reached your account" moments before
    // deleting the edit.
    await expect(page.getByTestId('sign-out-drafts')).toContainText(
        'One unsaved experiment is kept on this device',
    );
    await expect(page.getByTestId('sign-out-clear')).toHaveCount(0);
    await expect(page.getByTestId('sign-out-confirm')).toHaveText('Sign out anyway');

    // Export is offered beside the destructive button, never implied, and it names the songs it
    // would actually write: a file on the musician's own disk is the only thing that survives
    // this whatever the network does. It is the one control the network never disables. The
    // filename is the load-bearing assertion — 'Set list three' is the EDITED title, so this is
    // the retained draft being written out and not the library's committed copy, which is
    // precisely the version that would not have been worth rescuing.
    const exportButton = page.getByTestId('sign-out-export');
    await expect(exportButton).toHaveText('Export that song');
    const download = page.waitForEvent('download');
    await exportButton.click();
    expect((await download).suggestedFilename()).toBe('Set list three.ensemble');

    // "Sync now" is the other way out, and the step RE-READS rather than remembering what it
    // found: the queue empties, and the sentence about it goes. The unsaved experiment is not
    // something a sync can rescue, so that one stays — and so does "Sign out anyway".
    await page.unroute('**/api/documents/save');
    await page.getByTestId('sign-out-sync').click();
    await expect(page.getByTestId('sign-out-unsent')).toHaveCount(0);
    await expect(page.getByTestId('sign-out-drafts')).toBeVisible();
    await expect(page.getByTestId('sign-out-confirm')).toHaveText('Sign out anyway');
    await page.getByTestId('sign-out-confirm').click();

    // Signed out: the guest songbook is back, untouched, and this is NOT an expired session —
    // nobody who just left should be told to "sign in again to keep syncing".
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
    await expect(page.getByTestId('account-sign-in')).toHaveText('Sign in');
    await expect(page.getByTestId('account-expired-banner')).toHaveCount(0);
    await expect(page.getByTestId('library-heading')).toHaveText('Your songbook');
    // Web-first, so it retries while the guest library re-renders after sign-out (#1330).
    await expect(songTitles(page)).toHaveText(guestSongs);
    // Still nothing in the guest namespace — it never held this account's text (#1299), and the
    // clear that runs over `documentIds` anyway is belt and braces for a slot an older build could
    // have left. (One page load can only produce its own slot, so the across-writers half of that
    // clear is proven in `tests/unit/songbook/repository-recovery.test.ts`.)
    expect(await recoverySlots(page)).toBe(0);

    // A second account on the SAME browser profile — which is what switching accounts is
    // (decision 9 S3). A fresh authenticator so the usernameless ceremony has one credential to
    // choose from, exactly as a real second person on this machine would.
    await authenticator.remove();
    await addVirtualAuthenticator(page);
    await signUp(page);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(page.locator('.song-row')).toHaveCount(0);
    // And it stays that way across a reload: nothing of A's was left in storage to re-list.
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.locator('.song-row')).toHaveCount(0);
});

test('an expired session pauses the outbox, says so everywhere, and loses no queued Save', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Road take');

    // Offline, commit a version the account has not got. This is the work an expiring session
    // must not touch.
    await page.context().setOffline(true);
    await saveAs(page, 'Road take two');
    await expect(page.getByTestId('sync-cloud')).toContainText('Waiting to upload');

    // The session goes away underneath the musician: the cookie is dropped, so the next request
    // meets a 401 with the account, the passkey and the queued Save all still perfectly valid.
    await page.context().clearCookies();
    await page.context().setOffline(false);

    // The outbox pauses and says why, leading with the local truth — never a server code.
    const failure = page.getByTestId('sync-failure');
    await expect(failure).toContainText('Saved on this device');
    await expect(failure).toContainText('sign in again to upload it');
    await expect(page.getByTestId('sync-local')).toHaveText('Saved on this device');
    await expect(page.getByTestId('account-expired-banner')).toBeVisible();

    // And the banner follows to the songbook page. The stand's chip only exists with a chart
    // open, so without this a musician who closed the song would watch their library fall back
    // to the guest one with no explanation anywhere.
    await backToSongbook(page);
    await expect(page.getByTestId('account-expired-banner')).toBeVisible();
    await expect(page.getByTestId('sync-status')).toHaveCount(0);
    await expect(page.getByTestId('account-sign-in')).toHaveText('Sign in again');

    // Nothing local was discarded, and nothing was signed out of: the queued Save is still here.
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.getByTestId('account-sign-in')).toBeVisible();

    // Signing back in is itself a trigger. The Save that was queued before the session lapsed
    // goes out on the first pass of the new one — it waited for reauthentication, it was never
    // lost and it was never rewritten.
    await page.getByTestId('account-sign-in').click();
    await page.getByTestId('account-do-sign-in').click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByTestId('account-expired-banner')).toHaveCount(0);
    await expect(songTitles(page)).toHaveText(['Road take two']);
    await openSong(page, 'Road take two');
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
});
