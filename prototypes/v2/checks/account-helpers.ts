import type { Page } from '@playwright/test';
import { RECOVERY_CODE_SHAPE } from '../lib/account/messages';
import { expect } from './fixtures';

/**
 * The account specs' shared page driving (#1262, extracted for #1263).
 *
 * `persistedState` in particular must exist exactly once: it is the sweep that proves a recovery
 * code is in no storage this origin can be asked for, and two copies of it would drift the moment
 * one flow learns to store something the other doesn't. Both the create flow (#1262) and the
 * recovery flow (#1263) mint a code, so both run the same sweep.
 */

/**
 * `randomBytes(32).toString('base64url')` — what the server mints, and nothing else. Re-exported
 * under this file's established name; the single source of truth is `lib/account/messages.ts`'s
 * `RECOVERY_CODE_SHAPE`, which `recover.tsx` also validates a typed code against (#1263 patch
 * review P3) — keeping one constant is what stops the client-side guard and this harness drifting
 * apart on what a real code looks like.
 */
export const CODE_SHAPE = RECOVERY_CODE_SHAPE;

/** Opt this device into the dark-launched account UI, then land on the songbook. */
export async function openWithAccounts(page: Page): Promise<void> {
    await page.goto('/v2/?accounts=on');
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
