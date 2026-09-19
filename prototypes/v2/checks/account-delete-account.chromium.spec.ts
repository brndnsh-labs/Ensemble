import type { Download, Page } from '@playwright/test';
import { DELETE_CONFIRMATION } from '../app/account/delete-account';
import {
    backToSongbook,
    countStepUps,
    dismissAdoptGuestPrompt,
    newSongOnTheStand,
    openSong,
    openWithAccounts,
    refuseOnceWithFreshAuthRequired,
    revealEditor,
    saveAndUpload,
    saveAs,
    signUp,
    songTitles,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * Deleting an account (#1271), against the real account API on one origin, with real passkeys and
 * a real IndexedDB on each device.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * The contract being proven is DECISION 2026-09-17 — accounts do not ship without a way out — and
 * the four properties the story asks for: the deletion is refused without a fresh authentication,
 * every route answers signed-out for the old cookie afterwards, a second context's queued Save is
 * refused while its local work stays exportable, and the same passkey can make a brand-new
 * account. The typed confirmation and the export-everything offer are the two things standing in
 * front of an action with no undo, so both are asserted where a musician meets them.
 *
 * **Budget note:** `POST /api/auth/recovery/enroll` is 5 per 10 minutes, keyed by source IP, and
 * `accountApi` is TEST-scoped — each test gets its own API process and its own bucket. The first
 * test spends 2 (one account, then the brand-new one the same passkey makes afterwards) and the
 * second spends 1. Do not add another account; fold a new claim into one of these journeys.
 */

/** Account page → the Delete account step, ready for the typed confirmation. */
async function openDeleteStep(page: Page): Promise<void> {
    await page.getByTestId('account-open').click();
    await expect(page.locator('dialog.account-page')).toBeVisible();
    await page.getByTestId('delete-account-open').click();
    await expect(page.getByTestId('delete-account-confirm')).toBeVisible();
}

const sessionStatus = (page: Page) =>
    page.evaluate(() =>
        fetch('/api/auth/session', { cache: 'no-store' }).then((reply) => reply.status),
    );

test('deleting an account: typed confirmation, an export offer, a step-up, and nothing of it left', async ({
    page,
}) => {
    // A step-up ceremony, two real Saves and a second account creation at the end. Slow but
    // legitimate: raise the timeout at this test rather than at the suite.
    test.setTimeout(120_000);
    const stepUps = countStepUps(page);
    const downloads: Download[] = [];
    page.on('download', (download) => downloads.push(download));

    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    // #1330 — same pre-render capture as account-sign-out: the rows arrive after the hero
    // heading and after the first session read, so wait for them before reading.
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(songTitles(page)).not.toHaveCount(0);
    const guestSongs = await songTitles(page).allInnerTexts();
    expect(guestSongs.length).toBeGreaterThan(0);
    await signUp(page);

    // Two songs the account really holds, both confirmed by the server.
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');
    await backToSongbook(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Scratch take');
    await backToSongbook(page);

    await openDeleteStep(page);
    // What it costs is said before it is asked for, backups included — nobody may read this step
    // as a promise that every copy everywhere is gone the instant they press the button.
    await expect(page.getByTestId('delete-account-backups')).toContainText('age out');
    await expect(page.getByTestId('delete-account-songs')).toContainText('2 songs');

    // The typed confirmation is the gate, not a second "are you sure" button: Delete stays
    // disabled through a near-miss and unlocks only on the word itself.
    await expect(page.getByTestId('delete-account-confirm')).toBeDisabled();
    // A prefix of the word, not a different word: the gate must be an equality, never a
    // `startsWith` that a half-typed confirmation satisfies.
    await page.getByTestId('delete-account-input').fill(DELETE_CONFIRMATION.slice(0, -1));
    await expect(page.getByTestId('delete-account-confirm')).toBeDisabled();

    // Export first: one file per song, written from this device's own library. It is the only
    // copy that survives, which is why it is a real button here rather than a suggestion.
    await page.getByTestId('delete-account-export').click();
    await expect.poll(() => downloads.length).toBe(2);
    expect(downloads.map((file) => file.suggestedFilename()).sort()).toEqual([
        'Scratch take.ensemble',
        'Set list.ensemble',
    ]);

    // Cancel goes back without deleting anything, and reopening starts from an empty field —
    // a typed confirmation that survives a cancel is not a confirmation.
    await page.getByTestId('delete-account-cancel').click();
    await expect(page.getByTestId('passkey-add')).toBeVisible();
    await page.getByTestId('delete-account-open').click();
    await expect(page.getByTestId('delete-account-input')).toHaveValue('');

    // The server refuses a stale session (`fresh_auth_required`), and the client answers with a
    // REAL re-authentication rather than a bare retry — the faked refusal is what makes that path
    // run here, the `reauth/verify` counter is what proves a ceremony actually answered it.
    expect(stepUps()).toBe(0);
    await refuseOnceWithFreshAuthRequired(page, '**/api/auth/account/delete');
    await page.getByTestId('delete-account-input').fill(DELETE_CONFIRMATION);
    await expect(page.getByTestId('delete-account-confirm')).toBeEnabled();
    await page.getByTestId('delete-account-confirm').click();

    // The dialog stays open and says what happened, rather than vanishing the instant the header
    // behind it flips to signed-out.
    await expect(page.getByTestId('delete-account-done')).toBeVisible();
    await expect.poll(stepUps).toBe(1);
    await page.getByTestId('delete-account-done').click();
    await expect(page.locator('dialog.account-page')).toBeHidden();

    // Signed out, and NOT expired: nobody who deleted their account should be told to sign in
    // again. The guest songbook is exactly as it was — a different library, never touched.
    await expect(page.getByTestId('account-sign-in')).toHaveText('Sign in');
    await expect(page.getByTestId('account-expired-banner')).toHaveCount(0);
    await expect(page.getByTestId('library-heading')).toHaveText('Your songbook');
    await expect(songTitles(page)).toHaveText(guestSongs); // web-first, retries (#1330)
    expect(await sessionStatus(page)).toBe(401);

    // And it stays that way across a reload: nothing of the account was left in storage to re-list.
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.getByTestId('library-heading')).toHaveText('Your songbook');
    await expect(songTitles(page)).toHaveText(guestSongs); // web-first, retries (#1330)

    // The SAME passkey makes a brand-new account: deletion frees the credential rather than
    // blacklisting it, or somebody who deleted an account could never use that passkey again.
    await signUp(page);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(page.locator('.song-row')).toHaveCount(0);
    expect(await sessionStatus(page)).toBe(200);
});

test('a second device is refused after the deletion, and keeps its own work exportable', async ({
    page,
    browser,
    accountApi,
}) => {
    test.setTimeout(120_000);
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Road take');
    await backToSongbook(page);

    // Device two: its own cookie jar, storage and authenticator. Only the passkey is carried over.
    const passkeys = await authenticator.credentials();
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await openWithAccounts(second);
        await second.getByTestId('account-sign-in').click();
        await second.getByTestId('account-do-sign-in').click();
        await expect(second.getByTestId('account-sign-out')).toBeVisible();
        // A fresh profile: its own guest starters, none of them in the account, so #1268's
        // prompt opens here too once the download lands (`account-helpers.ts`).
        await dismissAdoptGuestPrompt(second);
        await expect(songTitles(second)).toHaveText(['Road take']);

        // Device two commits a version the account has not got, offline. This is the work the
        // deletion must not silently destroy on a device that has not heard about it yet.
        await openSong(second, 'Road take');
        await revealEditor(second);
        await second.context().setOffline(true);
        await saveAs(second, 'Road take two');
        await expect(second.getByTestId('sync-cloud')).toContainText('Waiting to upload');

        // Device one deletes the account.
        await openDeleteStep(page);
        await page.getByTestId('delete-account-input').fill(DELETE_CONFIRMATION);
        await page.getByTestId('delete-account-confirm').click();
        await expect(page.getByTestId('delete-account-done')).toBeVisible();

        // Reconnecting is what sends device two's queued Save. It is REFUSED — the session it was
        // queued under no longer exists — and this device says so rather than pretending.
        await second.context().setOffline(false);
        await expect(second.getByTestId('account-expired-banner')).toBeVisible();
        await expect(second.getByTestId('sync-local')).toHaveText('Saved on this device');
        expect(await sessionStatus(second)).toBe(401);
        // The refusal never recreated the document server-side either: nothing on that origin
        // answers for this account any more.
        expect(
            await second.evaluate(() =>
                fetch('/api/documents', { cache: 'no-store' }).then((reply) => reply.status),
            ),
        ).toBe(401);

        // And the local work is still here, and still exportable — the one copy that was never
        // the server's to delete. The filename is the load-bearing part: 'Road take two' is the
        // version the account never got.
        await expect(
            second.getByRole('heading', { name: 'Road take two', exact: true }),
        ).toBeVisible();
        await second.getByRole('button', { name: 'Song actions' }).click();
        const download = second.waitForEvent('download');
        await second.getByRole('button', { name: 'Export file' }).click();
        expect((await download).suggestedFilename()).toBe('Road take two.ensemble');
    } finally {
        await fresh.close();
    }
});
