import type { Page } from '@playwright/test';
import { ACCOUNT_DATABASE } from '../lib/sync/protocol';
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
 * A remote advance this device preserved, surfaced and adopted (#1310) — against the real account
 * API on one origin, with real passkeys and a real IndexedDB on each device.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * The contract being proven is `docs/design/ensemble-v2-sync.md`: "Remote updates may advance a
 * clean local saved record, but cannot overwrite local drafts, queued saves or an active chart.
 * Keep the playing setup stable until the user adopts an update or reopens. Dirty records receive a
 * separate remote candidate for reconciliation." Everything before this story was the first half;
 * these tests are the second — that the preserved candidate is VISIBLE, that adopting it is an
 * explicit, confirmed choice, and that declining it changes nothing.
 *
 * **Why device A holds an unsaved title rather than an unapplied bar.** The retained draft is what
 * keeps the record held once the chart is closed — an open chart holds it too, but only while it is
 * open — so the songbook's row marker is only stable with a draft actually written to the account
 * store (#1299). Changing the title is the shortest edit that writes one (`draft()` in
 * `app/ensemble.tsx`), and the heading then shows at a glance which version is on the stand.
 *
 * **Budget note:** `POST /api/auth/recovery/enroll` is rate limited to 5 per 10 minutes and the
 * harness runs the API in `socket-only` identity mode; `accountApi` is TEST-scoped, so each test
 * gets its own API process and its own bucket. Each test here spends exactly 1 — one account,
 * shared by its two devices, which is what makes them two devices rather than two accounts.
 */

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
 * Retitle without saving, and wait for the store to have taken it.
 *
 * The wait is the point, not politeness: `draft()` writes the account row fire-and-forget, and the
 * sentence below is published only once that write has answered (#1299 patch review P3). Triggering
 * the download pass before it lands would be a race against the very row that makes this record
 * held.
 */
async function retitleWithoutSaving(page: Page, title: string): Promise<void> {
    await page.getByLabel('Song title').fill(title);
    await expect(page.getByText('Draft recovered on this device')).toBeVisible();
    await expect(page.getByTestId('sync-local')).toHaveText('Unsaved changes');
}

/** One of the loop's four triggers, with nothing else going on. */
async function syncPass(page: Page): Promise<void> {
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

/**
 * The title of the version this device has PRESERVED rather than applied, read out of the account
 * database itself, or null when it holds none.
 *
 * The store is the only place this is observable: two preserved versions of the same song render
 * the same banner and the same row marker, so nothing on screen distinguishes "the pass landed a
 * newer one" from "it has not run yet". A spec that needs the second one to have arrived — the
 * frozen-offer case — would otherwise be racing the download it just triggered.
 */
function preservedVersionTitle(page: Page): Promise<string | null> {
    return page.evaluate(async (database: string) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(database);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            const rows = await new Promise<Array<Record<string, unknown>>>((resolve) => {
                const request = db.transaction('meta', 'readonly').objectStore('meta').getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve([]);
            });
            const candidate = rows.find(
                (row) => typeof row.key === 'string' && row.key.startsWith('remote:'),
            );
            const document = candidate?.document as { title?: string } | undefined;
            return document?.title ?? null;
        } finally {
            db.close();
        }
    }, ACCOUNT_DATABASE);
}

/**
 * Open a row whose committed title is one thing and whose stand title is another — which is what a
 * retained experiment on the title looks like, and is exactly the state under test. `openSong` in
 * the shared helpers waits for a heading named after the ROW, so it cannot serve this.
 */
async function openSongShowing(page: Page, row: string, heading: string): Promise<void> {
    await page.locator('.song-link', { hasText: row }).first().click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
}

/**
 * The state this story is about, on `page`, with `second` as the device that moved the account on.
 *
 * Returns nothing: every assertion below reads it off the screen, which is the only place it
 * matters. What it leaves behind is a chart on A's stand whose title is an unsaved experiment, an
 * account holding B's newer version, and a download pass that has already decided what to do about
 * the two of them.
 */
async function preservedRemoteUpdate(page: Page, second: Page): Promise<void> {
    await openSong(second, 'Shared tune');
    await revealEditor(second);

    // Device A holds an unsaved experiment on the song it has open. Its editor is already
    // revealed — `newSongOnTheStand` left it that way and the Save above ran through it.
    await retitleWithoutSaving(page, 'Shared tune — my words');

    // ...and device B commits a version the account takes.
    await saveAndUpload(second, 'Shared tune v2');

    // A's next pass finds the account ahead of it and CANNOT apply the body: the record is held by
    // the draft and by the chart on the stand, so the version is preserved beside it instead.
    await syncPass(page);
    await expect(page.getByTestId('conflict-banner')).toHaveAttribute('data-conflict', 'candidate');
}

test('a newer version in the account is surfaced, and adopting it replaces the song', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Shared tune');

    const passkeys = await authenticator.credentials();
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await signInOnSecondDevice(second);
        await expect(songTitles(second)).toHaveText('Shared tune');

        await preservedRemoteUpdate(page, second);

        // The banner says what happened in plain words, and the experiment is untouched: the
        // contract's "keep the playing setup stable until the user adopts an update" is the whole
        // reason the body was preserved rather than applied.
        await expect(page.getByTestId('conflict-title')).toHaveText(
            'A newer version is in your account',
        );
        await expect(page.getByLabel('Song title')).toHaveValue('Shared tune — my words');
        await expect(page.getByTestId('sync-local')).toHaveText('Unsaved changes');

        // ...and the songbook marks the row, which is the one surface that shows the whole library
        // at once. The row still reads its COMMITTED title — the experiment is not a version.
        await backToSongbook(page);
        await expect(songTitles(page)).toHaveText(['Shared tune']);
        await expect(page.getByTestId('song-newer-in-account')).toHaveText(
            'A newer version is in your account',
        );

        // Reopening finds the offer where it was left. Adopting is behind a confirm step, because
        // it is the one choice here that destroys something — with the export offered first.
        await openSongShowing(page, 'Shared tune', 'Shared tune — my words');
        await expect(page.getByTestId('conflict-banner')).toHaveAttribute(
            'data-conflict',
            'candidate',
        );
        await page.getByTestId('conflict-use-account').click();
        await expect(page.getByTestId('adopt-remote-export')).toBeVisible();
        await expect(page.getByTestId('adopt-remote-unsaved')).toBeVisible();
        await page.getByTestId('adopt-remote-confirm').click();

        // The account's version is the song now — under the SAME id, so there is no second row —
        // and the experiment that was holding it is gone rather than hiding behind it.
        await expect(
            page.getByRole('heading', { name: 'Shared tune v2', exact: true }),
        ).toBeVisible();
        await expect(page.getByTestId('conflict-banner')).toHaveCount(0);
        await expect(page.getByTestId('sync-local')).toHaveText('Saved on this device');
        await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');

        // Which is what a reload has to find: one song, no marker, no recovered draft.
        await page.reload();
        await expect(page.getByTestId('library-loading')).toHaveCount(0);
        await expect(songTitles(page)).toHaveText(['Shared tune v2']);
        await expect(page.getByTestId('song-newer-in-account')).toHaveCount(0);
        await openSong(page, 'Shared tune v2');
        await expect(page.getByTestId('sync-local')).toHaveText('Saved on this device');

        // And this device can save again with no conflict at all: the record it is building on is
        // the revision the account actually holds, which is what adopting it was for.
        await revealEditor(page);
        await saveAndUpload(page, 'Shared tune v3');
        await backToSongbook(page);
        await expect(songTitles(page)).toHaveText(['Shared tune v3']);
    } finally {
        await fresh.close();
    }
});

test('Keep both is still the other exit, and still mints a fresh id', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Shared tune');

    const passkeys = await authenticator.credentials();
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await signInOnSecondDevice(second);

        await preservedRemoteUpdate(page, second);

        // The same setup, answered the other way: committing the experiment sends it, the account
        // refuses it against a revision this device no longer has, and THAT is the refused-Save
        // conflict Keep both resolves (#1267). Adoption never replaced it — it is the resolution
        // for the case where nothing has been committed.
        await saveAs(page, 'Shared tune mine');
        const banner = page.getByTestId('conflict-banner');
        await expect(banner).toHaveAttribute('data-conflict', 'version');
        await expect(page.getByTestId('conflict-title')).toHaveText('Changed on another device');

        const uploaded = uploadOf(page, 'Shared tune mine');
        await page.getByTestId('conflict-keep-both').click();
        await uploaded;
        await expect(banner).toHaveCount(0);

        // A fresh identity for this device's line, and the account's version back under the
        // original — both songs, told apart by the marked title.
        await expect(
            page.getByRole('heading', { name: 'Shared tune mine — kept', exact: true }),
        ).toBeVisible();
        await backToSongbook(page);
        await expect(songTitles(page)).toHaveText(['Shared tune mine — kept', 'Shared tune v2']);
        // The divergence is settled either way, so nothing is still waiting on this device.
        await expect(page.getByTestId('song-newer-in-account')).toHaveCount(0);
    } finally {
        await fresh.close();
    }
});

/**
 * The same state reached with NOTHING typed (#1310 patch R2).
 *
 * `reconcile` holds a record on the open chart alone, so this is the commonest way to meet the
 * offer — and the copy has to be honest about it. Telling this musician that their "unsaved
 * changes" are about to be discarded invents work they never did and then points at Save, which is
 * disabled while the chart is clean.
 */
test('an open chart with no edits gets the honest sentence, and adopts', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Shared tune');

    const passkeys = await authenticator.credentials();
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await signInOnSecondDevice(second);
        await openSong(second, 'Shared tune');
        await revealEditor(second);

        // A saves nothing and types nothing — the chart is simply open, which is enough to hold
        // the record against the download.
        await expect(page.getByTestId('sync-local')).toHaveText('Saved on this device');
        await saveAndUpload(second, 'Shared tune v2');
        await syncPass(page);

        const banner = page.getByTestId('conflict-banner');
        await expect(banner).toHaveAttribute('data-conflict', 'candidate');
        await expect(banner).toContainText('This song is open here');
        // Neither sentence about local work is said, because there is none.
        await expect(banner).not.toContainText('unsaved changes');
        await expect(banner).not.toContainText('save your own version first');

        await page.getByTestId('conflict-use-account').click();
        await expect(page.getByTestId('adopt-remote-unsaved')).toHaveCount(0);
        await expect(page.getByTestId('adopt-remote-keep-both')).toHaveCount(0);
        // The one thing that IS true of a clean stand, and was never said before this patch.
        await expect(page.locator('dialog[aria-labelledby="adopt-remote-title"]')).toContainText(
            'playback stops',
        );
        await page.getByTestId('adopt-remote-confirm').click();

        await expect(
            page.getByRole('heading', { name: 'Shared tune v2', exact: true }),
        ).toBeVisible();
        await expect(page.getByTestId('conflict-banner')).toHaveCount(0);
        await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
    } finally {
        await fresh.close();
    }
});

/**
 * The compare-and-swap is against the version the CONFIRM STEP was opened on (#1310 patch R5).
 *
 * A pass landing a newer version while the step is open must not slide under the confirmation: the
 * musician answers about the version they were shown, and anything else is this resolution adopting
 * a body nobody looked at.
 */
test('a version that arrives while the confirm step is open is refused, not adopted', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Shared tune');

    const passkeys = await authenticator.credentials();
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await signInOnSecondDevice(second);

        await preservedRemoteUpdate(page, second);
        await page.getByTestId('conflict-use-account').click();
        await expect(page.getByTestId('adopt-remote-confirm')).toBeVisible();

        // Device B saves again, and A's pass preserves THAT version — all while the step stands
        // open on the previous one. Waited for in the STORE: nothing on screen changes between one
        // preserved version and the next, so this is the only reading that is not a race.
        await saveAndUpload(second, 'Shared tune v3');
        await syncPass(page);
        await expect.poll(() => preservedVersionTitle(page)).toBe('Shared tune v3');
        await page.getByTestId('adopt-remote-confirm').click();

        // Refused, and nothing changed: the step closes and the banner behind it carries the
        // reason, because a newer version really is waiting. Hidden rather than absent — a
        // `<dialog>` the shell has closed keeps its children in the DOM.
        await expect(page.getByTestId('adopt-remote-confirm')).toBeHidden();
        await expect(page.getByTestId('conflict-failure')).toContainText(
            'A newer version arrived while this was open',
        );
        await expect(page.getByLabel('Song title')).toHaveValue('Shared tune — my words');

        // Choosing again adopts what is actually waiting now.
        await page.getByTestId('conflict-use-account').click();
        await page.getByTestId('adopt-remote-confirm').click();
        await expect(
            page.getByRole('heading', { name: 'Shared tune v3', exact: true }),
        ).toBeVisible();
        await expect(page.getByTestId('conflict-banner')).toHaveCount(0);
    } finally {
        await fresh.close();
    }
});

test('cancelling the confirm step changes nothing at all', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await signUp(page);

    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Shared tune');

    const passkeys = await authenticator.credentials();
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await signInOnSecondDevice(second);

        await preservedRemoteUpdate(page, second);

        await page.getByTestId('conflict-use-account').click();
        await page.getByTestId('adopt-remote-cancel').click();

        // Nothing adopted, nothing discarded, and the offer still on the table.
        await expect(page.getByLabel('Song title')).toHaveValue('Shared tune — my words');
        await expect(page.getByTestId('sync-local')).toHaveText('Unsaved changes');
        await expect(page.getByTestId('conflict-banner')).toHaveAttribute(
            'data-conflict',
            'candidate',
        );

        // Including across a reload, which is the only proof the DRAFT survived rather than the
        // screen: the retained row is what the next open recovers.
        await page.reload();
        await expect(page.getByTestId('library-loading')).toHaveCount(0);
        await expect(page.getByTestId('song-newer-in-account')).toHaveCount(1);
        await openSongShowing(page, 'Shared tune', 'Shared tune — my words');
        await revealEditor(page);
        await expect(page.getByLabel('Song title')).toHaveValue('Shared tune — my words');
        await expect(page.getByTestId('conflict-banner')).toHaveAttribute(
            'data-conflict',
            'candidate',
        );
    } finally {
        await fresh.close();
    }
});
