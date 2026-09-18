import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * The passkey sign-in surface against the real API on one origin (#1262).
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * **Budget note, load-bearing for stability:** `POST /api/auth/recovery/enroll` is rate limited
 * to 5 per 10 minutes, and the harness runs the API in `socket-only` identity mode, so every
 * test in a worker shares ONE bucket (the preview proxy is the socket peer). Creating an account
 * through the UI always enrols once. This file therefore spends exactly 4: one each here and in
 * the sign-out round trip, two in the abandon/resume test — the fresh-profile sign-in costs
 * nothing extra because it reuses that round trip's account. That is also why the
 * "code never leaks" assertions live inside the create test rather than in a fifth account of
 * their own — the code is on screen exactly once per enrolment, so proving it is nowhere else at
 * that moment is the same test, not a cheaper version of a separate one.
 */

const CODE_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** Opt this device into the dark-launched account UI, then land on the songbook. */
async function openWithAccounts(page: Page): Promise<void> {
    await page.goto('/v2/?accounts=on');
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
}

async function createAccountThroughDialog(page: Page): Promise<string> {
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
async function persistedState(page: Page) {
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

test('creating an account shows the recovery code once, downloads it, and survives a reload', async ({
    page,
}) => {
    const logged: string[] = [];
    page.on('console', (message) => logged.push(message.text()));
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    // The opt-in is per device, not per link: the parameter is stripped so it cannot be shared.
    expect(page.url()).not.toContain('accounts=');

    const code = await createAccountThroughDialog(page);

    // Nothing is protected until the code is confirmed kept, so Finish waits for the checkbox.
    await expect(page.getByTestId('recovery-finish')).toBeDisabled();

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('dialog.account-dialog').getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('ensemble-recovery-code.txt');
    const saved = await download.path();
    expect(saved).not.toBeNull();
    const text = await readFile(String(saved), 'utf8');
    expect(text).toContain(code);
    // The file has to say what it is, or it is an unlabelled 43-character mystery in Downloads.
    expect(text.toLowerCase()).toContain('recovery code');

    // Every control on this step is reachable by name (the checkbox included, via its label).
    expect(await unnamedControls(page)).toEqual([]);

    await page.getByTestId('recovery-saved').check();
    await page.getByTestId('recovery-finish').click();
    await expect(page.locator('dialog.account-dialog')).toBeHidden();
    await expect(page.getByTestId('account-state')).toHaveText('Signed in');
    await expect(page.getByTestId('account-finish-protecting')).toHaveCount(0);

    // The code exists only in component state for the life of the dialog.
    const state = await persistedState(page);
    expect(state.href).not.toContain(code);
    expect(state.local).not.toContain(code);
    expect(state.session).not.toContain(code);
    expect(state.indexed).not.toContain(code);
    expect(state.cookie).not.toContain(code);
    expect(logged.join('\n')).not.toContain(code);

    await page.reload();
    await expect(page.getByTestId('account-state')).toHaveText('Signed in');
    await expect(page.getByTestId('account-finish-protecting')).toHaveCount(0);
});

test('abandoning the recovery step leaves the account unprotected until it is finished', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    const abandoned = await createAccountThroughDialog(page);

    // Walk away from the code. The account is real and signed in, just unprotected.
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.account-dialog')).toBeHidden();
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();

    // The unprotected state is the SERVER's answer (`recovery/status`), not a device flag, so a
    // reload — or another browser — still knows.
    await page.reload();
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();

    await page.getByTestId('account-finish-protecting').click();
    const replacement = page.getByTestId('recovery-code');
    await expect(replacement).toBeVisible();
    const second = (await replacement.textContent()) ?? '';
    expect(second).toMatch(CODE_SHAPE);
    // `enrollRecoveryCode` (server decision 2) DELETES any live unconsumed row before inserting,
    // so a second enrolment issues a genuinely new code and the abandoned one stops working.
    // Re-showing the first code would be a lie about what opens the account.
    expect(second).not.toBe(abandoned);

    await page.getByTestId('recovery-saved').check();
    await page.getByTestId('recovery-finish').click();
    await expect(page.getByTestId('account-state')).toHaveText('Signed in');
});

test('signing out and back in, then in again on a fresh profile, reaches the same account', async ({
    page,
    browser,
    accountApi,
}) => {
    // One account covers both round trips on purpose (see the budget note): a second account
    // would buy nothing but a fifth `recovery/enroll` against a bucket that allows five.
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await createAccountThroughDialog(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    // A session that WAS signed in and is now refused reads as `expired`, not `guest` — the
    // header says so.
    await expect(page.getByTestId('account-sign-in')).toHaveText('Sign in again');

    await page.getByTestId('account-sign-in').click();
    await page.getByTestId('account-do-sign-in').click();
    await expect(page.locator('dialog.account-dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    // Protection is account state on the server, so it survives the round trip untouched.
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();

    // Now a genuinely fresh browser profile: its own cookie jar, its own `localStorage`, its own
    // authenticator. The ONLY thing carried across is the passkey, which is the whole claim —
    // sign-in needs nothing this device happens to remember.
    const passkeys = await authenticator.credentials();
    expect(passkeys).toHaveLength(1);
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkeys[0]);
        await openWithAccounts(second);
        // The opt-in is per device, so this profile has to ask for the account UI itself.
        await second.getByTestId('account-sign-in').click();
        // `login/options` is usernameless — nothing is typed, and no `register/*` call happens.
        await second.getByTestId('account-do-sign-in').click();
        await expect(second.getByRole('button', { name: 'Sign out' })).toBeVisible();
        // It landed on the SAME account, not a new one: that account is the unprotected one.
        await expect(second.getByTestId('account-finish-protecting')).toBeVisible();
    } finally {
        await fresh.close();
    }
});

test('a dismissed passkey prompt returns quietly; a rejected one explains itself in words', async ({
    page,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);

    // An authenticator that cannot verify the user refuses the ceremony, and Chromium reports the
    // same `NotAllowedError` a dismissed prompt does — the one case that must produce no banner.
    await authenticator.setUserVerified(false);
    await page.getByTestId('account-sign-in').click();
    const started = page.waitForResponse((reply) =>
        reply.url().includes('/api/auth/register/options'),
    );
    await page.getByTestId('account-create').click();
    await started;
    // The rejection lands within milliseconds of the options reply; give it a beat before
    // asserting silence (the same shape as account-transport.spec.ts's cache check).
    await page.waitForTimeout(500);
    await expect(page.getByTestId('account-error')).toHaveCount(0);
    await expect(page.getByTestId('account-notice')).toHaveCount(0);
    // Back at the start state, not stuck mid-ceremony.
    await expect(page.getByRole('heading', { name: 'Take your songbook with you.' })).toBeVisible();
    await expect(page.getByTestId('account-create')).toBeEnabled();
    await page.keyboard.press('Escape');

    // Now a real server-side rejection: register out-of-band, then make the authenticator sign
    // badly so `login/verify` refuses the assertion with `401 authentication_failed`.
    await authenticator.setUserVerified(true);
    const rebuilt = authenticator;
    const registered = await page.evaluate(async () => {
        const post = (path: string, body: unknown) =>
            fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                cache: 'no-store',
            });
        const started = await post('/api/auth/register/options', {});
        const { options } = await started.json();
        const credential = (await navigator.credentials.create({
            publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options),
        })) as PublicKeyCredential;
        const verified = await post('/api/auth/register/verify', credential.toJSON());
        await post('/api/auth/logout', {});
        return verified.status;
    });
    expect(registered).toBe(200);
    // `isBogusSignature` zeroes the signature in the assertion, so the ceremony succeeds in the
    // browser and the SERVER is the thing that refuses it — a real `401 authentication_failed`
    // from the real service, not a stubbed response.
    await rebuilt.session.send('WebAuthn.setResponseOverrideBits', {
        authenticatorId: rebuilt.authenticatorId,
        isBogusSignature: true,
    });

    await page.reload();
    await page.getByTestId('account-sign-in').click();
    await page.getByTestId('account-do-sign-in').click();
    const banner = page.getByTestId('account-error');
    await expect(banner).toHaveText('That didn’t work. Try again, or use a different passkey.');
    // Never the server's vocabulary, and never an exception message.
    const dialogText = (await page.locator('dialog.account-dialog').textContent()) ?? '';
    expect(dialogText).not.toContain('authentication_failed');
    expect(dialogText).not.toContain('401');
});

test('the sign-in dialog meets the modal a11y contract', async ({ page }) => {
    await openWithAccounts(page);
    const opener = page.getByTestId('account-sign-in');
    await opener.click();
    const dialog = page.locator('dialog.account-dialog');
    await expect(dialog).toBeVisible();

    // A modal `<dialog>` moves focus inside itself and traps it there. Tabbing more times than
    // the dialog has controls exercises the wrap, and nothing behind the dialog may ever take
    // focus. Chromium's wrap passes through `<body>` on the way round (the slot where the
    // browser's own chrome would be), which is not a page control and not an escape — the claim
    // is that no FOCUSABLE element outside the dialog is ever reached.
    expect(await focusIsInDialog(page)).toBe(true);
    const escaped: string[] = [];
    for (let press = 0; press < 8; press += 1) {
        await page.keyboard.press('Tab');
        escaped.push(
            ...(await page.evaluate(() => {
                const box = document.querySelector('dialog.account-dialog');
                const focused = document.activeElement;
                if (!focused || focused === document.body || box?.contains(focused)) {
                    return [];
                }
                return [focused.outerHTML.slice(0, 90)];
            })),
        );
    }
    expect(escaped).toEqual([]);
    // And it came back: the cycle ends inside the dialog, not parked outside it.
    expect(await focusIsInDialog(page)).toBe(true);
    // The dialog itself is named, via the heading it points at.
    expect(
        await page.evaluate(() => {
            const box = document.querySelector('dialog.account-dialog');
            const id = box?.getAttribute('aria-labelledby') ?? '';
            return document.getElementById(id)?.textContent?.trim() ?? '';
        }),
    ).not.toBe('');
    expect(await unnamedControls(page)).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
});

async function focusIsInDialog(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const box = document.querySelector('dialog.account-dialog');
        return !!box && box.contains(document.activeElement);
    });
}

/** Any control in the open dialog with no accessible name; `[]` is the passing answer. */
async function unnamedControls(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const box = document.querySelector('dialog.account-dialog');
        if (!box) {
            return ['the dialog is not in the document'];
        }
        const unnamed: string[] = [];
        for (const control of box.querySelectorAll('button, input, a, select, textarea')) {
            const labelledBy = control.getAttribute('aria-labelledby') ?? '';
            const name = [
                control.getAttribute('aria-label') ?? '',
                labelledBy ? (document.getElementById(labelledBy)?.textContent ?? '') : '',
                control.closest('label')?.textContent ?? '',
                control.textContent ?? '',
            ]
                .join(' ')
                .trim();
            if (name === '') {
                unnamed.push(control.outerHTML.slice(0, 90));
            }
        }
        return unnamed;
    });
}
