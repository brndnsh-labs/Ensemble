import type { Page } from '@playwright/test';
import { OWNER_MESSAGES } from '../lib/account/sync-loop';
import { ACCOUNT_DATABASE } from '../lib/sync/protocol';
import {
    backToSongbook,
    CODE_SHAPE,
    dismissAdoptGuestPrompt,
    newSongOnTheStand,
    openWithAccounts,
    revealEditor,
    saveAndUpload,
    signUp,
    songTitles,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * The stand is bound to an OWNER, not just to a store (#1311) — against the real account API on
 * one origin, with real passkeys and a real IndexedDB.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * The journey is the one the fence exists for, and it is reachable entirely through the product:
 * the session expires under account A's chart — a 401 needs no gesture — and the expired banner's
 * own "Sign in again" is offered with that chart still on the stand, so a second person on this
 * machine (decision 9 S3: one account per browser profile, switching IS sign out, sign in) can
 * authenticate with THEIR passkey without the song ever leaving the stand.
 *
 * Before #1311 the shell recorded only that the chart came from "the account store". `storeSave`
 * therefore filed it under whoever was attached at the time it was pressed — and `Save a copy`,
 * which passes `expected: null`, could not even report a conflict about it: it simply created A's
 * music inside B's library.
 *
 * What this proves end to end is the whole shape of the fix, not just the refusal: the Save is
 * refused with the sentence, the mismatch keeps SAYING so through a press of Play, the chart is
 * still there afterwards, it exports with the edit that was refused, and B's own IndexedDB holds
 * nothing of it in any store — read directly, across a reload, so that is a statement about
 * storage rather than about a render.
 *
 * **Budget note:** `POST /api/auth/recovery/enroll` is rate limited to 5 per 10 minutes and the
 * harness runs the API in `socket-only` identity mode. `accountApi` is TEST-scoped, so this file
 * gets its own API process and its own bucket; the one test below spends 2, which is the point of
 * it. Do not add a third account — fold a new claim into this journey instead.
 */

/**
 * Every row the ATTACHED account holds for a document id, read straight out of IndexedDB in the
 * page (#1311 patch review R3).
 *
 * The songbook list is a render of one store; the claim being made is about ALL of them — a
 * committed record, a queued Save, a retained draft, a delete receipt, a last-opened pointer.
 * Precedent for reading real IDB from a check rather than through the module under test:
 * `tests/browser/account-songbook.browser.test.ts`.
 *
 * Scoped to the owner named by `meta.active`, which is the whole point: ONE database holds every
 * account this device has signed into, keyed by owner, and expiry removes nothing — so a count
 * over the raw stores finds A's own perfectly legitimate rows for this song and proves nothing.
 * The question is whether any of them are filed under B, and B's id is never on screen.
 */
function accountRowsFor(page: Page, documentId: string): Promise<Record<string, number>> {
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
            const owner = typeof active?.ownerId === 'string' ? active.ownerId : '';
            const counts: Record<string, number> = { owner: owner === '' ? 0 : 1 };
            for (const store of Array.from(db.objectStoreNames)) {
                const rows = (await read(store)) as Array<Record<string, unknown>>;
                counts[store] = rows.filter((row) => {
                    const text = JSON.stringify(row ?? null);
                    // `meta` is one generic keyed store shared by four namespaces, and its rows
                    // carry the owner inside the KEY rather than as a field — so it is matched on
                    // the serialized row, which holds both.
                    return (
                        text.includes(id) && (row.ownerId === owner || text.includes(`"${owner}`))
                    );
                }).length;
            }
            db.close();
            return counts;
        },
        [ACCOUNT_DATABASE, documentId] as const,
    );
}

/**
 * The document id this account filed a title under, read out of the account database's `songs`
 * store. Nothing on screen carries it, and the account stores key on it — so the spec has to ask
 * storage while the song is still THIS device's account's, before the switch.
 */
function documentIdOf(page: Page, title: string): Promise<string> {
    return page.evaluate(
        async ([name, wanted]) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(name);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            const rows = await new Promise<Array<Record<string, unknown>>>((resolve) => {
                const request = db.transaction('songs', 'readonly').objectStore('songs').getAll();
                request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
                request.onerror = () => resolve([]);
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

test('a chart from another account is exportable but can never be saved into the one signed in now', async ({
    page,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    // The guest rows render after the hero heading, and with accounts on the list waits for the
    // first session read — assert they arrived rather than measuring an empty list later (#1330).
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(songTitles(page)).not.toHaveCount(0);
    await signUp(page);

    // Account A's chart, confirmed in A's cloud library, on the stand.
    await newSongOnTheStand(page);
    await saveAndUpload(page, 'Set list');
    // Captured while this is still A's device: after the switch nothing on screen names it, and
    // it is the key every assertion about B's stores needs.
    const documentId = await documentIdOf(page, 'Set list');
    expect(documentId).not.toBe('');

    // Every Save request carrying THIS DOCUMENT from here on. Keyed on the id rather than the
    // title, because the deliberate Export -> Import at the end carries the same words under a
    // fresh identity and is supposed to upload. The assertion is that A's own document never
    // does: a refusal that still uploaded would be the leak wearing a refusal's face.
    let uploads = 0;
    page.on('request', (request) => {
        if (
            new URL(request.url()).pathname === '/api/documents/save' &&
            (request.postData() ?? '').includes(documentId)
        ) {
            uploads += 1;
        }
    });

    // The session goes away underneath the musician: the cookie is dropped, and the next pass
    // meets a 401 with the account, the passkey and the chart on the stand all still valid. No
    // gesture is involved, which is why this state can be reached with a song open at all.
    await page.context().clearCookies();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByTestId('account-expired-banner')).toBeVisible();

    // A different person answers "Sign in again" on the same browser profile. A fresh
    // authenticator so the usernameless ceremony has one credential to choose from, exactly as a
    // real second person on this machine would. The site header is hidden while a chart is open —
    // the expired banner is what makes this reachable with A's song still on the stand.
    await authenticator.remove();
    await addVirtualAuthenticator(page);
    await page
        .getByTestId('account-expired-banner')
        .getByRole('button', { name: 'Sign in again' })
        .click();
    await page.getByTestId('account-create').click();
    await expect(page.getByTestId('recovery-code')).toHaveText(CODE_SHAPE);
    await page.keyboard.press('Escape');
    // B's account library downloads, and #1268's adoption prompt auto-opens over this device's
    // guest starters. Unrelated to this spec, but modal, so every click below would hit it.
    await dismissAdoptGuestPrompt(page);

    // The chart did NOT leave the stand, and the shell says why — derived, not announced, so it
    // is still saying it after everything below (#1311 patch review R5).
    const mismatch = page.getByTestId('stand-mismatch-banner');
    await expect(mismatch).toHaveText(OWNER_MESSAGES.mismatch);
    // No Dismiss: while the mismatch stands, every account write is refused, so a musician who
    // dismissed it would be left with a Save button that cannot work and nothing explaining why.
    await expect(mismatch.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Set list', exact: true })).toBeVisible();
    // And the chip does not invite the upload either. "Not in your account yet" is what this read
    // as before the projection learned the state: true only in the least useful sense, about a
    // song that is fully saved in somebody else's library.
    await expect(page.getByTestId('sync-cloud')).toHaveText('Belongs to another account');

    // Pressing Play is a `run()`, and `run()` clears the shell's transient error line. The
    // mismatch is a standing fact, not an event, so it survives it — this is the assertion the
    // one-shot version of this banner failed.
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(mismatch).toHaveText(OWNER_MESSAGES.mismatch);
    await expect(page.getByTestId('sync-cloud')).toHaveText('Belongs to another account');
    // The transient line really is empty, so the assertions below cannot be reading a leftover.
    const errorText = page.locator('.error-banner[role="alert"] span');
    await expect(errorText).toHaveCount(0);

    // An edit is retained in this TAB, and says so in the REFUSAL's words rather than a storage
    // failure's (#1311 patch review R2/R7). Asserted exactly: the sentence only `draft()`'s own
    // refusal produces, so this cannot pass on a leftover banner.
    // Starting playback closes the editor (`onPlayToggle` sets `editing` false so the chart is
    // what a musician sees while the band plays), so it is opened again here.
    await revealEditor(page);
    await page.getByLabel('Song title').fill('Set list two');
    await expect(errorText).toHaveText(
        `${OWNER_MESSAGES.mismatch} Your edit is kept in this tab until then.`,
    );

    // Save is refused — exactly, so this is the Save's own sentence and not the draft warning's.
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(errorText).toHaveText(OWNER_MESSAGES.mismatch);
    // Nothing was committed, so the chart is still unsaved — a Save that had quietly succeeded
    // under B would have left this button disabled, which is the shell's own "committed" signal.
    await expect(save).toBeEnabled();
    // And it is not reported as a failure of this device, which is the one store working
    // perfectly here (#1311 patch review R5).
    await expect(page.getByTestId('sync-local')).not.toHaveText('Save failed on this device');

    // Export is the way out the sentence names, and it writes the version that was refused —
    // 'Set list two' is the EDITED title, so this is the in-tab draft and not a committed copy.
    // A refusal that stranded the work would be a worse outcome than the leak it prevented.
    await page.getByRole('button', { name: 'Song actions' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export file', exact: true }).click();
    const exported = await download;
    expect(exported.suggestedFilename()).toBe('Set list two.ensemble');
    await page.keyboard.press('Escape');

    // Nothing of A's reached B's storage — read out of IndexedDB directly rather than inferred
    // from a list, because the claim covers the committed record, the outbox, the drafts and the
    // receipts, and the songbook renders exactly one of those (#1311 patch review R3).
    expect(await accountRowsFor(page, documentId)).toEqual({
        // 1 = `meta.active` names an owner, so the counts below really are scoped to B and not
        // to an empty string that would match nothing whatever the stores held.
        owner: 1,
        songs: 0,
        operations: 0,
        receipts: 0,
        drafts: 0,
        meta: 0,
    });

    // Nothing was uploaded for it either, so the refusal was a refusal all the way down.
    expect(uploads).toBe(0);

    // The fence stops a SILENT crossing, and only that. Importing the file the musician just
    // exported is two deliberate human acts with a file on disk in between — exactly what the
    // sentence tells them to do — so it is NOT refused, even with the mismatched chart still on
    // the stand at the moment the import commits. This is also the guard on the other direction
    // of #1311 patch review R1b: an unrelated create must not be refused because of whose chart
    // happens to be showing, and must not re-point the stand's binding on its way past.
    const file = await exported.path();
    await page.locator('input.file-input').setInputFiles(file);
    await expect(page.getByRole('heading', { name: 'Set list two', exact: true })).toBeVisible();
    // The stand is now B's OWN copy, under a fresh identity, so there is no mismatch left to
    // report — and the chip reads a real cloud fact again rather than the foreign one.
    await expect(mismatch).toHaveCount(0);
    await expect(page.getByTestId('sync-cloud')).not.toHaveText('Belongs to another account');
    // The copy is B's; A's document id still has nothing under B, and still never uploaded.
    expect(await accountRowsFor(page, documentId)).toEqual({
        owner: 1,
        songs: 0,
        operations: 0,
        receipts: 0,
        drafts: 0,
        meta: 0,
    });
    expect(uploads).toBe(0);

    // B's library holds exactly that one imported copy, and nothing of A's, across a reload.
    await backToSongbook(page);
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(songTitles(page)).toHaveText(['Set list two']);
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(songTitles(page)).toHaveText(['Set list two']);
    expect(await accountRowsFor(page, documentId)).toEqual({
        // 1 = `meta.active` names an owner, so the counts below really are scoped to B and not
        // to an empty string that would match nothing whatever the stores held.
        owner: 1,
        songs: 0,
        operations: 0,
        receipts: 0,
        drafts: 0,
        meta: 0,
    });
    expect(uploads).toBe(0);
});
