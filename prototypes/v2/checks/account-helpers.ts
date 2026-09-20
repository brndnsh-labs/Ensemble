import type { Page } from '@playwright/test';
import { RECOVERY_CODE_SHAPE } from '../lib/account/messages';
import { appUrl, editorRevealed, expect } from './fixtures';

/**
 * The account specs' shared page driving (#1262, extracted for #1263).
 *
 * `persistedState` in particular must exist exactly once: it is the sweep that proves a recovery
 * code is in no storage this origin can be asked for, and two copies of it would drift the moment
 * one flow learns to store something the other doesn't. Both the create flow (#1262) and the
 * recovery flow (#1263) mint a code, so both run the same sweep.
 */

/**
 * Make this page look like a device that already holds an account, without signing one in.
 *
 * Since #1357's patch a device that has never held an account asks the server nothing at all
 * (`deviceMayHoldAccount`), so a spec about what happens to the session READ has to be on a
 * device that has a reason to make one. This seeds the same per-device marker the fence writes;
 * it does not fabricate a session, and the server is still the only thing that can grant one.
 */
export async function asHeldDevice(page: Page): Promise<void> {
    await page.addInitScript(() => {
        try {
            localStorage.setItem('ensemble-v2-preview:account-held', 'yes');
        } catch {
            // A device that cannot store it asks anyway, which is the same behaviour.
        }
    });
}

/** What an `/api/*` request meets, for a spec that needs a server behaving badly. */
export type ApiBehaviour =
    /** `fetch` rejects, as it does for a refused connection, a dead DNS name or an offline device. */
    | 'unreachable'
    /** An origin that IS there and refuses: `503 internal_error`. */
    | 'error'
    /** An origin that accepts the request and never answers, until `releaseApi` lets it. */
    | 'hold';

/**
 * Make `/api/*` behave badly for this page, by replacing `window.fetch` before any page script
 * runs (`lib/account/client.ts` captures `fetch` at module scope, so this is the copy it gets).
 *
 * NOT `page.route`, and that is the whole point of this helper existing. Measured on this suite
 * 2026-09-20: in the `webkit-phone` project a route registered for these URLs — as a glob, as a
 * predicate, and intermittently even as a RegExp — never enters its handler, and the request
 * reaches the preview server, which answers its ordinary 404. It passes when the box is idle and
 * loses the race under the full suite's three workers, so the failure mode is a test that
 * quietly asserts nothing about the server it claimed to be simulating (confirmed from the trace:
 * `GET /api/auth/session` → 404 in 2ms, un-intercepted). An init script has no such race: it is
 * installed before the document's first script and `fetch` is simply already ours.
 *
 * `only` shapes exactly one pathname and lets every other `/api/*` request through, for a spec
 * that needs the session read to hang while the rest of an account works normally.
 */
export async function shapeApi(
    page: Page,
    behaviour: ApiBehaviour,
    options: { only?: string } = {},
): Promise<void> {
    await page.addInitScript(
        ([mode, only]: [ApiBehaviour, string]) => {
            const real = window.fetch.bind(window);
            const held: Array<() => void> = [];
            (window as unknown as { __releaseApi?: () => void }).__releaseApi = () => {
                for (const resume of held.splice(0)) {
                    resume();
                }
            };
            window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
                const href =
                    typeof input === 'string'
                        ? input
                        : input instanceof URL
                          ? input.href
                          : input.url;
                const { pathname } = new URL(href, location.href);
                const mine = only
                    ? pathname === only
                    : pathname === '/api' || pathname.startsWith('/api/');
                if (!mine) {
                    return real(input, init);
                }
                if (mode === 'unreachable') {
                    // What a browser's `fetch` rejects with; `lib/account/api.ts` maps any
                    // rejection to `{ kind: 'network' }`, so the exact class is not load-bearing.
                    return Promise.reject(new TypeError('Load failed'));
                }
                if (mode === 'error') {
                    return Promise.resolve(
                        new Response(JSON.stringify({ error: 'internal_error' }), {
                            status: 503,
                            headers: { 'content-type': 'application/json' },
                        }),
                    );
                }
                // Held: resolved by re-issuing the real request, so what lands afterwards is a
                // genuine answer from the server rather than a fixture's idea of one.
                return new Promise<Response>((resolve) => {
                    held.push(() => resolve(real(input, init)));
                });
            }) as typeof fetch;
        },
        [behaviour, options.only ?? ''] as [ApiBehaviour, string],
    );
}

/** Let every request `shapeApi(page, 'hold')` is holding finish for real. */
export async function releaseApi(page: Page): Promise<void> {
    await page.evaluate(() => {
        (window as unknown as { __releaseApi?: () => void }).__releaseApi?.();
    });
}

/**
 * `randomBytes(32).toString('base64url')` — what the server mints, and nothing else. Re-exported
 * under this file's established name; the single source of truth is `lib/account/messages.ts`'s
 * `RECOVERY_CODE_SHAPE`, which `recover.tsx` also validates a typed code against (#1263 patch
 * review P3) — keeping one constant is what stops the client-side guard and this harness drifting
 * apart on what a real code looks like.
 */
export const CODE_SHAPE = RECOVERY_CODE_SHAPE;

/**
 * Land on the songbook with the account UI available — which since the cutover (#1357) is the
 * plain URL, no parameter. Deliberately not `?accounts=on`: every account spec then rides the
 * real default, so a regression that took the entry point away from an ordinary visitor fails
 * here rather than hiding behind an opt-in nobody types any more.
 */
export async function openWithAccounts(page: Page): Promise<void> {
    await page.goto(appUrl());
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
}

/** Create an account and stop on the recovery-code step, returning the code it showed. */
export async function createAccountThroughDialog(page: Page): Promise<string> {
    await page.getByTestId('account-sign-in').click();
    await expect(page.locator('dialog.account-dialog')).toBeVisible();
    await page.getByTestId('account-create').click();
    const shown = page.getByTestId('recovery-code');
    await expect(shown).toBeVisible();
    const code = (await shown.textContent()) ?? '';
    expect(code).toMatch(CODE_SHAPE);
    return code;
}

/**
 * Dismiss the guest-songs adoption prompt (#1268), which auto-opens once the sign-in dialog
 * closes on a device whose guest songbook holds anything (every fresh preview does: `lib/starters.ts`
 * seeds three). It is unrelated to what these specs are testing, so they decline it and move on —
 * `adopt-guest.chromium.spec.ts` is the one spec that exercises this dialog's own contract.
 *
 * A fresh account on a fresh device/browser context reliably has candidates to offer, so this is
 * NOT a conditional skip: if the dialog fails to appear, that is worth this helper failing loudly
 * rather than silently waving every future caller through.
 */
export async function dismissAdoptGuestPrompt(page: Page): Promise<void> {
    const dialog = page.locator('dialog[aria-labelledby="adopt-guest-title"]');
    await expect(dialog).toBeVisible();
    await page.getByTestId('adopt-guest-decline').click();
    await expect(dialog).toBeHidden();
}

/** Creates an account and walks away from the recovery step, which costs no second enrolment. */
export async function signUp(page: Page): Promise<void> {
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

/** A new song on the stand, with its editor revealed and the shell no longer working. */
export async function newSongOnTheStand(page: Page): Promise<void> {
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('C');
    await editorRevealed(page);
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
}

/** Retitle and commit. The Save button going disabled is the shell's own "committed" signal. */
export async function saveAs(page: Page, title: string): Promise<void> {
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await page.getByLabel('Song title').fill(title);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();
}

/**
 * Save, and wait for THIS version's upload to come back before going on (#1303).
 *
 * `sync-cloud` reading "Saved to your account" is not enough on its own: a brand-new song's
 * blank first version is confirmed a moment earlier, so the chip is already showing that sentence
 * when this Save is queued and an assertion can match the old state. Waiting on the response whose
 * body carries this title is the only reading that cannot be a moment stale.
 */
export async function saveAndUpload(page: Page, title: string): Promise<void> {
    const uploaded = uploadOf(page, title);
    await saveAs(page, title);
    await uploaded;
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');
}

/**
 * The Save of `title` the account ACCEPTED. `response.ok()` matters: a refused Save (#1267's
 * conflict, a 409) carries the same bytes, and resolving on it would call a rejection an upload.
 */
export function uploadOf(page: Page, title: string) {
    return page.waitForResponse(
        (response) =>
            response.url().includes('/api/documents/save') &&
            (response.request().postData() ?? '').includes(title) &&
            response.ok(),
    );
}

/** The songbook list's visible titles, in the order rendered. */
export const songTitles = (page: Page) => page.locator('.song-name');

/** Back to the songbook, past the loading gate so a "0 rows" read isn't a still-running query. */
export async function backToSongbook(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
}

/** Open a song by its title from the songbook list. */
export async function openSong(page: Page, title: string): Promise<void> {
    await page.locator('.song-link', { hasText: title }).first().click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
}

/**
 * Reveal the edit panel. Opening an existing song leaves the chart showing rather than the editor
 * (`open()` sets `editing` false), so the title field only exists after this.
 */
export async function revealEditor(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Edit chart' }).click();
    await editorRevealed(page);
}

/**
 * Intercepts exactly ONE matching request with a fake `403 fresh_auth_required`, then lets every
 * later request through untouched (#1264, shared with #1271).
 *
 * Faking the refusal alone proves nothing on its own — the session really IS fresh in these specs,
 * so a client that simply retried without re-authenticating would sail through. It is the pair of
 * this and `countStepUps` below that proves the step-up: the fake makes the stale path run, and
 * the `reauth/verify` counter proves a real ceremony answered it. The fake response never reaches
 * the server and costs nothing against any route's budget.
 */
export async function refuseOnceWithFreshAuthRequired(page: Page, urlGlob: string): Promise<void> {
    let used = false;
    await page.route(urlGlob, async (route) => {
        if (used) {
            await route.continue();
            return;
        }
        used = true;
        await route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'fresh_auth_required' }),
        });
    });
}

/** Counts completed step-up ceremonies: one `reauth/verify` per successful re-authentication. */
export function countStepUps(page: Page): () => number {
    let count = 0;
    page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/auth/reauth/verify') {
            count += 1;
        }
    });
    return () => count;
}

/** Everything this origin can be asked for, to search for a leaked recovery code. */
export async function persistedState(page: Page) {
    return page.evaluate(async () => {
        const pack = (storage: Storage) => {
            const entries: string[] = [];
            for (let index = 0; index < storage.length; index += 1) {
                const key = storage.key(index);
                entries.push(`${key}=${key === null ? '' : storage.getItem(key)}`);
            }
            return entries.join('\n');
        };
        let indexed = '';
        const databases = (await indexedDB.databases?.()) ?? [];
        for (const { name } of databases) {
            if (!name) {
                continue;
            }
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(name);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            for (const store of Array.from(db.objectStoreNames)) {
                indexed += await new Promise<string>((resolve) => {
                    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
                    request.onsuccess = () => resolve(JSON.stringify(request.result));
                    request.onerror = () => resolve('');
                });
            }
            db.close();
        }
        return {
            href: location.href,
            local: pack(localStorage),
            session: pack(sessionStorage),
            indexed,
            // HttpOnly, so this should be empty — but an accidental readable cookie is exactly
            // the kind of thing worth failing on.
            cookie: document.cookie,
        };
    });
}
