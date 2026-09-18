import {
    CODE_SHAPE,
    createAccountThroughDialog,
    openWithAccounts,
    persistedState,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * Recovering an account with its recovery code, against the real API on one origin (#1263).
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * **Budget note, load-bearing for stability.** `POST /api/auth/recovery/enroll` is 5 per 10
 * minutes and the harness runs the API in `socket-only` identity mode, so every test sharing a
 * WORKER shares one bucket (the preview proxy is the socket peer). Measured 2026-09-17 with
 * `--reporter=json`: under `fullyParallel` Playwright hands out one TEST at a time, so tests from
 * one file land on different workers AND tests from different files land on the same one —
 * `account-sign-in.chromium.spec.ts`'s 4 enrolments and this file's are drawn from the same
 * bucket whenever two of them meet on a worker. A recovery costs two enrolments that nothing can
 * remove (one to mint the code being recovered with, one for the replacement the server issues
 * afterwards), so this file spends exactly 2: the whole flow is ONE test, and the wrong-code and
 * rate-limit test needs no account at all.
 *
 * That is also why the abandon → unprotected → re-prompt tail below stops at the re-prompt rather
 * than pressing "Get a code" again. The surface it re-prompts into is `sign-in.tsx`'s own
 * `mode === 'recovery'` step, unchanged by this story, and the sibling spec already drives that
 * button through to a confirmed code. Spending a third enrolment to retest it would buy a
 * duplicate assertion and cost the bucket headroom these two files share.
 *
 * Even at 2, the account suite's total is 6 against a budget of 5, so **the account specs need at
 * least two Playwright workers.** Measured 2026-09-17: green at 2, 3 and the default (cores/2),
 * and `npx playwright test account --workers=1` exhausts the bucket — the sibling's third
 * enrolling test is the one that reports it. The gate and CI both run 3, and the only config that
 * forces one worker (`V2_LIVE_TEST=1`) refuses account specs outright, so nothing the project runs
 * hits this. The durable fix is to make `fixtures.ts`'s `accountApi` test-scoped instead of
 * worker-scoped, which would hand every test a virgin rate limiter and retire this arithmetic
 * altogether; that is a change to shared harness infrastructure and a decision of its own, not a
 * side effect of this story.
 */

const BAD_PASSKEY = 'That didn’t work. Try again, or use a different passkey.';
const BAD_CODE = 'That code isn’t right, or it has already been used. Check it and try again.';

test('recovering with the code replaces the passkey, and an interrupted enrolment never spends it', async ({
    page,
    browser,
    accountApi,
}) => {
    const logged: string[] = [];
    page.on('console', (message) => logged.push(message.text()));
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);

    // An account with a CONFIRMED code: the server refuses to claim one that was never confirmed,
    // so Finish here is part of the setup, not decoration.
    const code = await createAccountThroughDialog(page);
    await page.getByTestId('recovery-saved').check();
    await page.getByTestId('recovery-finish').click();
    await expect(page.getByTestId('account-state')).toHaveText('Signed in');

    // The passkey this account is about to lose — kept to prove, at the end, that it really is
    // lost rather than merely joined by a second one.
    const [lost] = await authenticator.credentials();

    await page.getByTestId('account-sign-out').click();
    await expect(page.getByTestId('account-sign-in')).toHaveText('Sign in again');

    // --- the way back in is one line under the two things people came for --------------------
    await page.getByTestId('account-sign-in').click();
    await page.getByTestId('account-recover').click();
    await expect(page.getByRole('heading', { name: 'Use your recovery code.' })).toBeVisible();
    await page.getByTestId('recovery-code-input').fill(code);
    await page.getByTestId('recovery-claim').click();
    const ceremonyStep = page.getByRole('heading', { name: 'Create a new passkey.' });
    await expect(ceremonyStep).toBeVisible();
    // Focus followed the step. The Continue button that got us here has unmounted, so without
    // this it would sit on `<body>` — outside the dialog and silent for a screen reader.
    await expect(ceremonyStep).toBeFocused();

    // --- the recovery-only session opens nothing ----------------------------------------------
    // `recovery/claim` set a session cookie, and the tempting bug is for it to be an ordinary
    // one. It authorizes exactly one new passkey: the library and even "who am I" are refused,
    // measured through the page so the HttpOnly cookie is genuinely attached.
    const refused = await page.evaluate(async () => {
        const read = async (path: string) => {
            const reply = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
            return { status: reply.status, body: await reply.text() };
        };
        return {
            library: await read('/api/documents'),
            session: await read('/api/auth/session'),
        };
    });
    expect(refused.library.status).toBe(401);
    // Not merely a 401 shape: nothing that could carry a manifest came back.
    expect(refused.library.body).not.toContain('documents');
    expect(refused.session.status).toBe(401);

    // --- interrupted enrolment, twice, and the code survives both ------------------------------
    // (1) The platform prompt is refused, exactly as a human dismissal reads. The server sees the
    // options call and never a verify.
    await authenticator.setUserVerified(false);
    const started = page.waitForResponse((reply) =>
        reply.url().includes('/api/auth/recovery/enroll-passkey/options'),
    );
    await page.getByTestId('recovery-new-passkey').click();
    await started;
    // The rejection lands within milliseconds of the options reply; give it a beat before
    // asserting silence (the same shape as the sibling spec's dismissal check).
    await page.waitForTimeout(500);
    await expect(page.getByTestId('account-error')).toHaveCount(0);
    await expect(page.getByTestId('account-notice')).toHaveCount(0);
    // Still on the ceremony step, where the button IS the retry — never sent back to code entry,
    // which would read as "your code stopped working" when the claim is still perfectly live.
    await expect(page.getByRole('heading', { name: 'Create a new passkey.' })).toBeVisible();
    await expect(page.getByTestId('recovery-new-passkey')).toBeEnabled();

    // (2) Now a refusal the SERVER issues: `isBadUV` clears the user-verification flag in the
    // authenticator data, so the ceremony completes in the browser and
    // `verifyRecoveryEnrollPasskey` — which requires user verification — rejects it. This is the
    // interruption that matters, because it is the one where the server ran the enrolment and
    // said no; the code must come back out of that unspent.
    await authenticator.setUserVerified(true);
    await authenticator.session.send('WebAuthn.setResponseOverrideBits', {
        authenticatorId: authenticator.authenticatorId,
        isBadUV: true,
    });
    const rejected = page.waitForResponse((reply) =>
        reply.url().includes('/api/auth/recovery/enroll-passkey/verify'),
    );
    await page.getByTestId('recovery-new-passkey').click();
    expect((await rejected).status()).toBe(401);
    await expect(page.getByTestId('account-error')).toHaveText(BAD_PASSKEY);

    // (3) Retry the CEREMONY, not the claim: a second `recovery/claim` of the same code inside
    // ten minutes is refused by the claim lock, not because the code is spent, and the recovery
    // session from step 1 is still holding that lock. If either interruption above had consumed
    // the code, the server's commit would abort `recovery_code_not_found` and this would fail.
    await authenticator.session.send('WebAuthn.setResponseOverrideBits', {
        authenticatorId: authenticator.authenticatorId,
        isBadUV: false,
    });
    await page.getByTestId('recovery-new-passkey').click();
    const shown = page.getByTestId('recovery-code');
    await expect(shown).toBeVisible();
    const replacement = (await shown.textContent()) ?? '';
    expect(replacement).toMatch(CODE_SHAPE);
    // The code that was just spent must never be re-shown as if it still opened the account.
    expect(replacement).not.toBe(code);

    // --- neither code is anywhere but the screen ----------------------------------------------
    // The old one was TYPED, which is the new exposure this story adds: an entry step built as a
    // `<form>` would have submitted by navigation and written it into the address bar.
    const state = await persistedState(page);
    for (const secret of [code, replacement]) {
        expect(state.href).not.toContain(secret);
        expect(state.local).not.toContain(secret);
        expect(state.session).not.toContain(secret);
        expect(state.indexed).not.toContain(secret);
        expect(state.cookie).not.toContain(secret);
        expect(logged.join('\n')).not.toContain(secret);
    }

    // --- abandoning the replacement is #1262's path, unchanged --------------------------------
    await page.getByTestId('recovery-not-now').click();
    await expect(page.locator('dialog.account-dialog')).toBeHidden();
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();
    // Unprotected is the SERVER's answer (`recovery/status`), not a device flag, so a reload —
    // or another browser — still knows.
    await page.reload();
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();
    await page.getByTestId('account-finish-protecting').click();
    // And it re-prompts into the create flow's own step, not a recovery-shaped copy of it.
    await expect(
        page.getByRole('heading', { name: 'Finish protecting your account.' }),
    ).toBeVisible();
    await expect(page.getByTestId('recovery-code')).toHaveCount(0);
    await expect(page.getByTestId('recovery-retry')).toBeEnabled();
    await page.keyboard.press('Escape');

    // --- the old passkey is gone, not merely joined -------------------------------------------
    // A genuinely fresh profile holding ONLY the lost credential: the server deleted every
    // credential on the account as part of the recovery commit, so its assertion is refused.
    const stale = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const other = await stale.newPage();
        const spare = await addVirtualAuthenticator(other);
        await spare.addCredential(lost);
        await openWithAccounts(other);
        await other.getByTestId('account-sign-in').click();
        await other.getByTestId('account-do-sign-in').click();
        await expect(other.getByTestId('account-error')).toHaveText(BAD_PASSKEY);
        await expect(other.getByTestId('account-state')).toHaveCount(0);
    } finally {
        await stale.close();
    }
});

test('a wrong code and a rate-limited one both answer in words, never in server vocabulary', async ({
    page,
}) => {
    // No account and no authenticator: both answers are about the typed code, and buying an
    // account to ask about one would spend an enrolment for nothing.
    await openWithAccounts(page);
    await page.getByTestId('account-sign-in').click();
    await page.getByTestId('account-recover').click();
    // Arriving is a step change too: the link that opened this is gone, so focus is moved onto
    // the step's own heading rather than left on `<body>`.
    await expect(page.getByRole('heading', { name: 'Use your recovery code.' })).toBeFocused();

    // A real `401 authentication_failed` from the real service. The server collapses every reason
    // a claim can fail into that one code, so this is also what "already used" and "someone else
    // is mid-claim" look like — which is why the copy says so rather than naming one of them.
    const wrong = 'w'.repeat(43);
    await page.getByTestId('recovery-code-input').fill(wrong);
    await page.getByTestId('recovery-claim').click();
    await expect(page.getByTestId('account-error')).toHaveText(BAD_CODE);
    // Not the generic passkey copy: there is no passkey in this ceremony to use a different one.
    await expect(page.getByTestId('account-error')).not.toHaveText(BAD_PASSKEY);
    const dialogText = (await page.locator('dialog.account-dialog').textContent()) ?? '';
    expect(dialogText).not.toContain('authentication_failed');
    expect(dialogText).not.toContain('401');
    // A refused attempt must not have put the attempt itself in the address bar.
    expect(page.url()).not.toContain(wrong);

    // Rate limiting is its own answer. Folding it into "wrong code" would tell someone their
    // perfectly good code is bad at the exact moment they most need to trust it.
    await page.route('**/api/auth/recovery/claim', (route) =>
        route.fulfill({
            status: 429,
            contentType: 'application/json',
            // The server's collapsed error shape is `{ error: <code> }` (`lib/account/api.ts`).
            body: JSON.stringify({ error: 'rate_limited' }),
        }),
    );
    await page.getByTestId('recovery-claim').click();
    await expect(page.getByTestId('account-error')).toHaveText(
        'Too many attempts — try again later.',
    );
    expect((await page.locator('dialog.account-dialog').textContent()) ?? '').not.toContain(
        'rate_limited',
    );
    await page.unroute('**/api/auth/recovery/claim');

    // Still on the entry step with the code intact, so a retry is one press away.
    await expect(page.getByTestId('recovery-code-input')).toHaveValue(wrong);
    await expect(page.getByTestId('recovery-claim')).toBeEnabled();
});
