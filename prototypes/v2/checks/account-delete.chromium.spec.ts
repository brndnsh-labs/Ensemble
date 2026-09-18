import type { Page } from '@playwright/test';
import { dismissAdoptGuestPrompt } from './account-helpers';
import { editorRevealed, expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * Deleting a song from the cloud (#1270), against the real account API on one origin, with real
 * passkeys and a real IndexedDB on each side.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * The contract being proven is the one in `docs/design/ensemble-v2-sync.md`: cloud deletion is an
 * explicit ONLINE operation with a tombstone and an export preflight, never a side effect of
 * removing a local copy — and "Remote deletion removes a clean mirror; local divergent work is
 * retained for export or an explicit new-ID copy. A stale Save cannot resurrect the deleted cloud
 * ID." All three halves of that sentence are asserted below on a second, independent device.
 *
 * **Budget note:** `POST /api/auth/recovery/enroll` is rate limited to 5 per 10 minutes and the
 * harness runs the API in `socket-only` identity mode. `accountApi` is TEST-scoped, so each test
 * gets its own API process and its own bucket; creating one account per test is well inside it. Do
 * not add a second account to either test — fold a new claim into an existing journey instead.
 */

const CODE_SHAPE = /^[A-Za-z0-9_-]{43}$/;

async function openWithAccounts(page: Page): Promise<void> {
    await page.goto('/v2/?accounts=on');
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
}

/** Creates an account and walks away from the recovery step, which costs no second enrolment. */
async function signUp(page: Page): Promise<void> {
    await page.getByTestId('account-sign-in').click();
    await page.getByTestId('account-create').click();
    await expect(page.getByTestId('recovery-code')).toHaveText(CODE_SHAPE);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();
    // #1268's adoption prompt auto-opens once the account library has downloaded, and this
    // device's guest starters are not in the account — it is unrelated to this spec, but it is a
    // modal, so every click below would be intercepted by it.
    await dismissAdoptGuestPrompt(page);
}

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

async function backToSongbook(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
}

/** Open a song by its title from the songbook list. */
async function openSong(page: Page, title: string): Promise<void> {
    await page.locator('.song-link', { hasText: title }).first().click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
}

/**
 * Reveal the edit panel. Opening an existing song leaves the chart showing rather than the editor
 * (`open()` sets `editing` false), so the title field only exists after this.
 */
async function revealEditor(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Edit chart' }).click();
    await editorRevealed(page);
}

/** Song menu → "Delete from my account", stopping on the confirm step. */
async function openDeleteConfirm(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByTestId('delete-from-account').click();
    await expect(page.getByTestId('delete-song-confirm')).toBeVisible();
}

test('a cloud delete reaches the other device: clean mirror dropped, divergent work kept', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);

    // Two songs in the account, both confirmed by the cloud.
    await newSongOnTheStand(page);
    await saveAs(page, 'Set list');
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
    await backToSongbook(page);
    await newSongOnTheStand(page);
    await saveAs(page, 'Scratch take');
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
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
        await expect(second.getByRole('button', { name: 'Sign out' })).toBeVisible();
        // A fresh profile: its own guest starters, none of them in the account, so #1268's
        // prompt opens here too once the download lands (`account-helpers.ts`).
        await dismissAdoptGuestPrompt(second);
        await expect(songTitles(second)).toHaveText(['Scratch take', 'Set list']);

        // Device two goes offline and commits a version of one song. That Save is safe here and
        // has not reached the account — the exact divergence the deletion rule must preserve.
        await openSong(second, 'Scratch take');
        await revealEditor(second);
        await second.context().setOffline(true);
        await saveAs(second, 'Scratch take two');
        await expect(second.getByTestId('sync-cloud')).toContainText('Waiting to upload');

        // Device one deletes both songs. The confirm step offers the export preflight the contract
        // calls for, and deleting takes the chart off the stand.
        await openSong(page, 'Set list');
        await openDeleteConfirm(page);
        await expect(page.getByTestId('delete-song-export')).toBeEnabled();
        await page.getByTestId('delete-song-confirm').click();
        await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
        await expect(songTitles(page)).toHaveText(['Scratch take']);

        await openSong(page, 'Scratch take');
        await openDeleteConfirm(page);
        await page.getByTestId('delete-song-confirm').click();
        await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
        await expect(page.locator('.song-row')).toHaveCount(0);

        // Reconnecting is one of the four triggers. Nothing polled for any of this.
        await second.context().setOffline(false);

        // The stale queued Save is refused and SAID OUT LOUD — and never as "choose which to
        // keep", because the account has no version to choose. The local copy is still here.
        await expect(second.getByTestId('sync-cloud')).toHaveText(
            'No longer in your account — this version is still on this device',
        );
        await expect(second.getByTestId('sync-local')).toHaveText('Saved on this device');
        await expect(
            second.getByRole('heading', { name: 'Scratch take two', exact: true }),
        ).toBeVisible();

        // And on the songbook: the clean mirror of the other song is gone, the divergent copy
        // stays. The refused Save never resurrected the deleted id either — the row that remains
        // is this device's own version, not a re-uploaded one.
        await backToSongbook(second);
        await expect(songTitles(second)).toHaveText(['Scratch take two']);
        await second.reload();
        await expect(second.getByTestId('library-loading')).toHaveCount(0);
        await expect(songTitles(second)).toHaveText(['Scratch take two']);
    } finally {
        await fresh.close();
    }
});

test('offline the delete is disabled with a reason; a lost response retries the same operation', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);
    await newSongOnTheStand(page);
    await saveAs(page, 'One take');
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');

    // Offline, deleting is refused BEFORE it is attempted — a control that looks live and then
    // fails teaches nothing. Export stays available, because it never leaves the device.
    await page.context().setOffline(true);
    await openDeleteConfirm(page);
    await expect(page.getByTestId('delete-song-offline')).toBeVisible();
    await expect(page.getByTestId('delete-song-confirm')).toBeDisabled();
    await expect(page.getByTestId('delete-song-export')).toBeEnabled();
    await page.getByTestId('delete-song-cancel').click();
    await page.context().setOffline(false);

    // A lost response: the server COMMITS the delete and the reply never arrives. This device
    // cannot tell that from a delete that never happened, which is the whole reason the operation
    // id is frozen on disk before the request goes out.
    const sent: string[] = [];
    // Collected, never asserted inside the handler: an `expect` that fails in a route callback
    // rejects out of band, where the failure is a stray unhandled rejection rather than this
    // test's own result.
    const answered: number[] = [];
    await page.route('**/api/documents/delete', async (route) => {
        sent.push(route.request().postData() ?? '');
        const response = await route.fetch();
        answered.push(response.status());
        if (sent.length === 1) {
            await route.abort('failed');
            return;
        }
        await route.fulfill({ response });
    });

    await openDeleteConfirm(page);
    await page.getByTestId('delete-song-confirm').click();
    // This device cannot tell a committed delete from one that never happened, so it says exactly
    // that and stays put rather than closing on either claim.
    await expect(page.getByTestId('delete-song-failure')).toContainText('couldn’t confirm');
    await expect(page.getByTestId('delete-song-failure')).not.toContainText('Nothing was deleted');
    await expect(page.getByRole('heading', { name: 'One take', exact: true })).toBeVisible();

    // The retry is a REPLAY: byte-identical bytes, so the same operation id, so the server answers
    // from the receipt it already wrote instead of deleting a second time.
    await page.getByTestId('delete-song-confirm').click();
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(page.locator('.song-row')).toHaveCount(0);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe(sent[0]);
    expect(JSON.parse(sent[0]).operationId).toEqual(expect.any(String));
    // Both times the account did the work; only the first reply was thrown away.
    expect(answered).toEqual([200, 200]);
    await page.unroute('**/api/documents/delete');

    // It stays gone across a reload: the tombstone is the account's answer, not this tab's.
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.locator('.song-row')).toHaveCount(0);

    // A reply this build cannot READ is the other half of a lost answer: the account committed,
    // and what came back was not a delete reply at all. That path throws rather than returning a
    // refusal, and the chart must still get its active claim back — an unprotected chart on the
    // stand is exactly what the next download pass is allowed to drop the local copy of.
    await newSongOnTheStand(page);
    await saveAs(page, 'Second take');
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
    await expect(page.getByTestId('sync-offline')).toContainText('Songs 1/1');

    await page.route('**/api/documents/delete', async (route) => {
        await route.fetch();
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '{"status":"ok"}',
        });
    });
    await openDeleteConfirm(page);
    await page.getByTestId('delete-song-confirm').click();
    await expect(page.getByTestId('delete-song-failure')).toContainText('does not match');
    await page.unroute('**/api/documents/delete');
    await page.getByTestId('delete-song-cancel').click();

    // Reconnecting runs a pass, and the manifest now carries the account's tombstone for the song
    // still on the stand. With the claim restored, the shared rule RETAINS this device's copy —
    // the chart is still open, still readable, still exportable. Without it, the same pass would
    // drop the record from under the musician and the chip would fall to "not in your account".
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    await expect(page.getByTestId('sync-offline')).toContainText('Songs 0/0');
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
    await expect(page.getByRole('heading', { name: 'Second take', exact: true })).toBeVisible();
});
