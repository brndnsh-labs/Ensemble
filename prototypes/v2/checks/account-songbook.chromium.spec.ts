import type { Page } from '@playwright/test';
import { editorRevealed, expect, accountTest as test } from './fixtures';
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

const CODE_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** Opt this device into the dark-launched account UI, then land on the songbook. */
async function openWithAccounts(page: Page): Promise<void> {
    await page.goto('/v2/?accounts=on');
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
}

/**
 * Creates an account and walks away from the recovery step. Abandoning it deliberately: this
 * file is about the songbook, the unprotected-account path is #1262's own spec, and dismissing
 * costs no second `recovery/enroll`.
 */
async function signUp(page: Page): Promise<void> {
    await page.getByTestId('account-sign-in').click();
    await page.getByTestId('account-create').click();
    await expect(page.getByTestId('recovery-code')).toHaveText(CODE_SHAPE);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();
}

/** A new song on the stand, with its editor revealed and the shell no longer working. */
async function newSongOnTheStand(page: Page): Promise<void> {
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('C');
    await editorRevealed(page);
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
}

/** Retitle and commit. The Save button going disabled is the shell's own "committed" signal. */
async function saveAs(page: Page, title: string): Promise<void> {
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await page.getByLabel('Song title').fill(title);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();
}

const songTitles = (page: Page) => page.locator('.song-name');

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
    await saveAs(page, 'Take A');
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');

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
        await saveAs(page, 'Take C');
        await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');

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
    await saveAs(page, 'Road take');
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');

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
