import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import {
    CODE_SHAPE,
    createAccountThroughDialog,
    dismissAdoptGuestPrompt,
    openWithAccounts,
    persistedState,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * The passkey sign-in surface against the real API on one origin (#1262).
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * **Rate-limit budget, no longer shared.** `POST /api/auth/recovery/enroll` is rate limited to 5
 * per 10 minutes, but `fixtures.ts`'s `accountApi` fixture is TEST-scoped (patch review #1263,
 * item 5): every test spawns its own API process against its own throwaway `node:sqlite` file,
 * so every test gets a virgin rate limiter. There is no longer a bucket shared across tests in
 * this file, across workers, or with `account-recovery.chromium.spec.ts` to do arithmetic
 * against — a fifth (or fiftieth) enrolment costs nothing but its own spawn.
 *
 * The shapes below (one account covering both round trips, the "code never leaks" assertions
 * living inside the create test, the security-review follow-ups folded into these same tests) are
 * kept as they are because they are still the right shapes — one clear scenario per test — not
 * because of a budget that no longer exists.
 */

test('creating an account shows the recovery code once, downloads it, and survives a reload', async ({
    page,
}) => {
    const logged: string[] = [];
    page.on('console', (message) => logged.push(message.text()));
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);

    const code = await createAccountThroughDialog(page);

    // P2-2: the focused Create button unmounts the instant the recovery-code step replaces it;
    // focus must land inside the dialog (the step's own heading), never fall through to <body>.
    expect(await focusIsInDialog(page)).toBe(true);

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

    // P1-2: the recovery-code step has a touch-reachable exit now, not just Escape — abandon by
    // clicking it, proving that path rather than only the keyboard one.
    await page.getByTestId('recovery-not-now').click();
    await expect(page.locator('dialog.account-dialog')).toBeHidden();
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();
    // #1268's adoption prompt auto-opens once the account library has downloaded (this device's
    // guest starters are not in the account). Unrelated to this spec, but it is a modal: every
    // click below would be intercepted by it.
    await dismissAdoptGuestPrompt(page);

    // The unprotected state is the SERVER's answer (`recovery/status`), not a device flag, so a
    // reload — or another browser — still knows.
    await page.reload();
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();

    await page.getByTestId('account-finish-protecting').click();
    // P2-3: opening in recovery mode no longer auto-fires the enrolment — that DELETEs the live
    // recovery row and spends one of the 5 `recovery/enroll` calls per 10 minutes on every open,
    // which would lock the account out of getting a code for 10 minutes after a few open/closes.
    // An explicit press of "Get a code" is required now.
    await expect(
        page.getByRole('heading', { name: 'Finish protecting your account.' }),
    ).toBeVisible();
    await expect(page.getByTestId('recovery-code')).toHaveCount(0);
    await page.getByTestId('recovery-retry').click();
    const replacement = page.getByTestId('recovery-code');
    await expect(replacement).toBeVisible();
    const second = (await replacement.textContent()) ?? '';
    expect(second).toMatch(CODE_SHAPE);
    // `enrollRecoveryCode` (server decision 2) DELETES any live unconsumed row before inserting,
    // so a second enrolment issues a genuinely new code and the abandoned one stops working.
    // Re-showing the first code would be a lie about what opens the account.
    expect(second).not.toBe(abandoned);

    // P1-1: a failed Finish (here, the server refusing a rate-limited confirm) must render the
    // failure copy in the dialog and leave the account reading unprotected. Reusing this flow
    // instead of a dedicated account keeps the `recovery/enroll` budget where it was.
    await page.route('**/api/auth/recovery/confirm', (route) =>
        route.fulfill({
            status: 429,
            contentType: 'application/json',
            // The server's collapsed error shape is `{ error: <code> }` (`lib/account/api.ts`),
            // not `{ code }`.
            body: JSON.stringify({ error: 'rate_limited' }),
        }),
    );
    await page.getByTestId('recovery-saved').check();
    await page.getByTestId('recovery-finish').click();
    await expect(page.getByTestId('account-error')).toHaveText(
        'Too many attempts — try again later.',
    );
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();
    await page.unroute('**/api/auth/recovery/confirm');

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
    // #1268's adoption prompt auto-opens once the account library has downloaded (this device's
    // guest starters are not in the account). Unrelated to this spec, but it is a modal: every
    // click below would be intercepted by it.
    await dismissAdoptGuestPrompt(page);

    // P1-3: offline, sign-out must be disabled with a visible, honest reason rather than shipping
    // enabled and failing silently against a server it cannot reach (rollout decision 9 S2).
    const signOutButton = page.getByTestId('account-sign-out');
    await page.context().setOffline(true);
    await expect(signOutButton).toBeDisabled();
    await expect(page.getByTestId('account-offline-note')).toHaveText(
        'Sign out needs a connection',
    );
    await page.context().setOffline(false);
    await expect(signOutButton).toBeEnabled();
    await expect(page.getByTestId('account-offline-note')).toHaveCount(0);

    await signOutButton.click();
    // #1269 — sign-out goes through its preflight. This account has nothing unsent, which the
    // step says rather than leaving blank.
    await expect(page.getByTestId('sign-out-clear')).toBeVisible();
    await page.getByTestId('sign-out-confirm').click();
    // A DELIBERATE sign-out is not an expiry: the header offers a plain "Sign in", not the "Sign
    // in again" that belongs to a session which went away underneath somebody (#1269).
    await expect(page.getByTestId('account-sign-in')).toHaveText('Sign in');

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
