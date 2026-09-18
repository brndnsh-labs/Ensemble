import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/**
 * The account specs' shared page driving (#1262, extracted for #1263).
 *
 * `persistedState` in particular must exist exactly once: it is the sweep that proves a recovery
 * code is in no storage this origin can be asked for, and two copies of it would drift the moment
 * one flow learns to store something the other doesn't. Both the create flow (#1262) and the
 * recovery flow (#1263) mint a code, so both run the same sweep.
 */

/** `randomBytes(32).toString('base64url')` — what the server mints, and nothing else. */
export const CODE_SHAPE = /^[A-Za-z0-9_-]{43}$/;

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
