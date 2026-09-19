import type { Page } from '@playwright/test';
import {
    backToSongbook,
    dismissAdoptGuestPrompt,
    newSongOnTheStand,
    openSong,
    openWithAccounts,
    revealEditor,
    saveAndUpload,
    saveAs,
    signUp,
    songTitles,
    uploadOf,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * The way out of a refused Save (#1267) — against the real account API on one origin, with real
 * passkeys and a real IndexedDB on each device.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * The contract being proven is `docs/design/ensemble-v2-sync.md`: "A revision conflict durably
 * preserves the incoming remote version separately, blocks that document's dependent saves, and
 * offers Keep both… Keeping both creates a fresh document identity through an explicit resolution
 * operation; it does not repurpose the failed ID."
 *
 * **Why the loser's chart stays on the stand.** A chart on the stand is what stops a download pass
 * advancing that record underneath it, so keeping it open is what makes "both devices saved from
 * the same revision" deterministic rather than a race against whichever pass happens to run. It is
 * also the realistic case: the musician is playing the song they are editing.
 *
 * **Budget note:** `POST /api/auth/recovery/enroll` is rate limited to 5 per 10 minutes and the
 * harness runs the API in `socket-only` identity mode; `accountApi` is TEST-scoped, so each test
 * gets its own API process and its own bucket. Each test here spends exactly 1 — one account,
 * shared by its two devices, which is what makes them two devices rather than two accounts.
 */

/**
 * Open the row whose name is EXACTLY this, not the first one containing it. After keeping both,
 * the two rows are `X` and `X — kept`, and a substring match would silently always take the
 * first — which is the kept line, never the account's version this is asked for.
 */
async function openExactSong(page: Page, title: string): Promise<void> {
    await page.locator('.song-name', { hasText: new RegExp(`^${title}$`) }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
}

/**
 * Guest recovery slots this device holds for one document id — `lib/repository.ts`'s key shape,
 * read from the page rather than through that module because this spec drives a real browser.
 *
 * Expected to be 0 for both ids since #1299: an account chart's unsaved experiment is a row in the
 * account database, so keeping both moves it there and neither the kept line nor the refused one
 * leaves account chart text in the guest namespace. What the experiment DID survive is asserted
 * the only way that matters — by reloading and reading the bar back.
 */
function recoverySlots(page: Page, documentId: string): Promise<number> {
    return page.evaluate((id) => {
        let count = 0;
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith('ensemble-v2-preview:recovery:') && key.endsWith(`:${id}`)) {
                count += 1;
            }
        }
        return count;
    }, documentId);
}

/** Sign this device in with a passkey minted on another one, and settle its first download. */
async function signInOnSecondDevice(page: Page): Promise<void> {
    await openWithAccounts(page);
    await page.getByTestId('account-sign-in').click();
    await page.getByTestId('account-do-sign-in').click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    // A fresh profile: its own guest starters, none of them in the account, so #1268's prompt
    // opens here too once the download lands.
    await dismissAdoptGuestPrompt(page);
}

/**
 * The identity of every Save this device actually sent, read off the request bodies.
 *
 * This is how "the failed operation id is never reused" is proven end to end: the id is what the
 * server's receipts are keyed by, and reusing one for different bytes is exactly what it refuses
 * forever as `operation_mismatch`. Reading the wire is the only place a client claim about it can
 * be checked without asking the client to describe itself.
 */
function sentSaves(page: Page): () => Array<{ documentId: string; operationId: string }> {
    const sent: Array<{ documentId: string; operationId: string }> = [];
    page.on('request', (request) => {
        if (!request.url().includes('/api/documents/save')) {
            return;
        }
        try {
            const body = JSON.parse(request.postData() ?? '');
            sent.push({ documentId: body.documentId, operationId: body.operationId });
        } catch {
            /* Not a body this harness can read; the assertions below would fail loudly anyway. */
        }
    });
    return () => sent;
}

/**
 * The failed operation id is never reused, and neither is the document id it was spent on (#1267).
 *
 * Distinct REQUESTS are deliberately not the claim: an uncertain send is retried with the same
 * frozen bytes under the same id on purpose, which is what makes the second attempt a replay the
 * server answers from its receipt rather than a second write. What must hold is that the create the
 * resolution queued carries an id that was never spent on the document the account refused — and
 * that it is one create, under one new identity, not a replay of the line's whole history.
 */
function expectFreshIdentity(sent: Array<{ documentId: string; operationId: string }>): void {
    expect(sent.length).toBeGreaterThanOrEqual(2);
    const refusedDocument = sent[0].documentId;
    expect(new Set(sent.map((save) => save.documentId)).size).toBe(2);
    const refused = new Set(
        sent.filter((save) => save.documentId === refusedDocument).map((save) => save.operationId),
    );
    const created = new Set(
        sent.filter((save) => save.documentId !== refusedDocument).map((save) => save.operationId),
    );
    expect(created.size).toBe(1);
    for (const operationId of created) {
        expect(refused.has(operationId)).toBe(false);
    }
}

async function openDeleteConfirm(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByTestId('delete-from-account').click();
    await expect(page.getByTestId('delete-song-confirm')).toBeVisible();
}

test('two devices save the same version: the loser keeps both, and nothing is lost', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);

    // One song in the account, confirmed — the shared base both devices will save from.
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Both takes');

    const passkeys = await authenticator.credentials();
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const saves = sentSaves(second);
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await signInOnSecondDevice(second);
        await expect(songTitles(second)).toHaveText('Both takes');

        // Device two opens it and stays there, which is what pins its base revision.
        await openSong(second, 'Both takes');
        await revealEditor(second);

        // Device one commits the next version from that same base, and the account takes it.
        // BOTH devices name it the same thing on purpose: two people editing one song from one
        // base is exactly the case where the two lines end up spelled identically, and a
        // resolution that leaves two rows a musician cannot tell apart has not resolved anything.
        await saveAndUpload(page, 'Our take');

        // Device two commits ITS next version from the same base. The account refuses it — and
        // the refusal is a banner with a way out, not a dead end that parks this song forever.
        await saveAs(second, 'Our take');
        const banner = second.getByTestId('conflict-banner');
        await expect(banner).toHaveAttribute('data-conflict', 'version');
        await expect(second.getByTestId('conflict-title')).toHaveText('Changed on another device');
        // Refused by the cloud and still perfectly safe here — the whole reason local safety and
        // cloud confirmation are two separate facts.
        await expect(second.getByTestId('sync-local')).toHaveText('Saved on this device');

        // Waited on the RESPONSE, not the chip: the refused Save carried this same title, so the
        // only reading that cannot be a moment stale is the one the account accepted (`ok()`; the
        // refusal is a 409).
        const uploaded = uploadOf(second, 'Our take');
        await second.getByTestId('conflict-keep-both').click();
        await uploaded;
        await expect(banner).toHaveCount(0);
        // The chart on the stand is untouched: the local line IS what is open, and only its
        // identity — and the name it is filed under — moved. It also leaves the outbox, which it
        // could not do before.
        await expect(
            second.getByRole('heading', { name: 'Our take — kept', exact: true }),
        ).toBeVisible();
        await expect(second.getByTestId('sync-cloud')).toHaveText('Saved to your account');
        // The stand reads the name the songbook filed it under, so nothing claims an edit nobody
        // made — and the next plain Save cannot quietly rename it back.
        await expect(second.getByTestId('sync-local')).toHaveText('Saved on this device');

        // The create the resolution queued is a request the account has never seen.
        expectFreshIdentity(saves());

        // Both charts, on the device that had the conflict: its own version as a new song, and
        // the account's version under the name they both chose — told apart by the suffix, which
        // is the only thing that makes this list actionable.
        await backToSongbook(second);
        await expect(songTitles(second)).toHaveText(['Our take — kept', 'Our take']);
        await openExactSong(second, 'Our take');
        await backToSongbook(second);

        // ...and on the device that won, which learns about the new song the ordinary way.
        await page.reload();
        await expect(page.getByTestId('library-loading')).toHaveCount(0);
        await expect(songTitles(page)).toHaveText(['Our take — kept', 'Our take']);
    } finally {
        await fresh.close();
    }
});

test('a Save the account can no longer hold becomes a song of its own', async ({
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
        const saves = sentSaves(second);
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await signInOnSecondDevice(second);
        await expect(songTitles(second)).toHaveText('Set list');

        // Device two commits a version the account has not got, while it cannot be sent.
        await openSong(second, 'Set list');
        await revealEditor(second);
        await second.context().setOffline(true);
        await saveAs(second, 'Set list two');
        await expect(second.getByTestId('sync-cloud')).toContainText('Waiting to upload');

        // Device one deletes the song from the account (#1270).
        await openSong(page, 'Set list');
        await openDeleteConfirm(page);
        await page.getByTestId('delete-song-confirm').click();
        await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
        await expect(page.locator('.song-row')).toHaveCount(0);

        // Reconnecting is one of the four triggers. The queued Save is refused with no version to
        // weigh it against — so the banner offers no choice between versions, and says so.
        await second.context().setOffline(false);
        const banner = second.getByTestId('conflict-banner');
        await expect(banner).toHaveAttribute('data-conflict', 'gone');
        await expect(second.getByTestId('conflict-title')).toHaveText('No longer in your account');
        await expect(second.getByTestId('conflict-keep-both')).toHaveText(
            'Keep mine as a new song',
        );

        // A create under an id the account has no tombstone for, so it lands — and the response
        // is what proves it, rather than a chip that could still be describing the refused id.
        const uploaded = uploadOf(second, 'Set list two');
        await second.getByTestId('conflict-keep-both').click();
        await uploaded;
        await expect(banner).toHaveCount(0);
        await expect(
            second.getByRole('heading', { name: 'Set list two — kept', exact: true }),
        ).toBeVisible();
        await expect(second.getByTestId('sync-cloud')).toHaveText('Saved to your account');

        expectFreshIdentity(saves());

        // The deleted id is gone from this device too — it never resurrected — and what is left
        // is this device's own version, named for what it is.
        await backToSongbook(second);
        await expect(songTitles(second)).toHaveText(['Set list two — kept']);
        await second.reload();
        await expect(second.getByTestId('library-loading')).toHaveCount(0);
        await expect(songTitles(second)).toHaveText(['Set list two — kept']);

        // And the device that deleted it gets the new song the ordinary way.
        await page.reload();
        await expect(page.getByTestId('library-loading')).toHaveCount(0);
        await expect(songTitles(page)).toHaveText(['Set list two — kept']);
    } finally {
        await fresh.close();
    }
});

/**
 * A bar typed and not yet applied when Keep both is pressed (#1267 patch review P1).
 *
 * The resolution changes `current.id`, and the bar editor and tempo control are mounted with
 * `key={current.id}` — so without a commit in front of it the remount takes every unapplied bar
 * with it, silently, while the chip goes on saying "Unsaved changes" about text that no longer
 * exists anywhere. Save has always committed the editor first; this proves the resolution does too,
 * through to the retained draft that has to survive a reload under the NEW identity.
 */
test('a bar typed but not applied survives keeping both, and its retained draft moves', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Study');

    const passkeys = await authenticator.credentials();
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const saves = sentSaves(second);
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await signInOnSecondDevice(second);
        await openSong(second, 'Study');
        await revealEditor(second);

        // The same two-device refusal as above: device one advances the account from the base
        // device two is holding open.
        await saveAndUpload(page, 'Study theirs');
        await saveAs(second, 'Study mine');
        await expect(second.getByTestId('conflict-banner')).toHaveAttribute(
            'data-conflict',
            'version',
        );

        // ...and THEN the musician types a bar and reaches for the banner without applying it.
        const bar = second.getByLabel('Chords in this bar');
        await bar.fill('F');
        await expect(second.getByTestId('sync-local')).toHaveText('Unsaved changes');

        const uploaded = uploadOf(second, 'Study mine');
        await second.getByTestId('conflict-keep-both').click();
        await uploaded;
        await expect(second.getByTestId('conflict-banner')).toHaveCount(0);

        // The typed bar is in the chart that moved, not lost with the editor that unmounted —
        // and it is still honestly unsaved, because it is: the account holds the version that was
        // refused, not this experiment on top of it.
        await expect(
            second.getByRole('heading', { name: 'Study mine — kept', exact: true }),
        ).toBeVisible();
        await expect(bar).toHaveValue('F');
        await expect(second.getByTestId('sync-local')).toHaveText('Unsaved changes');

        const sent = saves();
        const refusedId = sent[0].documentId;
        const keptId = sent.find((save) => save.documentId !== refusedId)?.documentId ?? '';
        expect(keptId).not.toBe('');
        // The experiment follows its line, and it follows it INTO THE ACCOUNT STORE (#1299):
        // neither the new identity nor the refused one leaves account chart text sitting in the
        // guest namespace, where a sign-out would have to go hunting for it.
        expect(await recoverySlots(second, keptId)).toBe(0);
        expect(await recoverySlots(second, refusedId)).toBe(0);

        // Which is the whole point of writing it: it is what a reload has to find.
        await second.reload();
        await expect(second.getByTestId('library-loading')).toHaveCount(0);
        await openExactSong(second, 'Study mine — kept');
        await revealEditor(second);
        await expect(second.getByLabel('Chords in this bar')).toHaveValue('F');
    } finally {
        await fresh.close();
    }
});
