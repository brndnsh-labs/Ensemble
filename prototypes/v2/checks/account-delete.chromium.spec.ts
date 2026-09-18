import type { Page } from '@playwright/test';
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
    await page.route('**/api/documents/delete', async (route) => {
        sent.push(route.request().postData() ?? '');
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        if (sent.length === 1) {
            await route.abort('failed');
            return;
        }
        await route.fulfill({ response });
    });

    await openDeleteConfirm(page);
    await page.getByTestId('delete-song-confirm').click();
    // Nothing was deleted as far as this device knows, so it says so and stays put rather than
    // closing on a claim it cannot make.
    await expect(page.getByTestId('delete-song-failure')).toContainText('needs a connection');
    await expect(page.getByRole('heading', { name: 'One take', exact: true })).toBeVisible();

    // The retry is a REPLAY: byte-identical bytes, so the same operation id, so the server answers
    // from the receipt it already wrote instead of deleting a second time.
    await page.getByTestId('delete-song-confirm').click();
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(page.locator('.song-row')).toHaveCount(0);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe(sent[0]);
    expect(JSON.parse(sent[0]).operationId).toEqual(expect.any(String));
    await page.unroute('**/api/documents/delete');

    // It stays gone across a reload: the tombstone is the account's answer, not this tab's.
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.locator('.song-row')).toHaveCount(0);
});
