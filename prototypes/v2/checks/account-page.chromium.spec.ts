import { ACCOUNT_MESSAGES } from '../lib/account/messages';
import {
    CODE_SHAPE,
    countStepUps,
    createAccountThroughDialog,
    dismissAdoptGuestPrompt,
    openWithAccounts,
    persistedState,
    refuseOnceWithFreshAuthRequired,
} from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * The account page (#1264) — passkeys, sessions, recovery code — against the real API on one
 * origin (#1258's harness).
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * **Rate limits.** `POST /api/auth/recovery/enroll` is 5 per 10 minutes, but `fixtures.ts`'s
 * `accountApi` fixture is TEST-scoped (#1263 patch review, item 5): this test gets its own API
 * process, its own throwaway database and its own virgin limiter, so there is no cross-test
 * budget to account for. It spends 2 enrolments — one when the account is created, one for
 * "Replace recovery code".
 *
 * **How the step-up is proven.** Every mutation below is checked twice — the fake refusal
 * (`refuseOnceWithFreshAuthRequired`) makes the stale path run, and the `reauth/verify` counter
 * (`countStepUps`) proves a real step-up ceremony actually happened before the retry. Both live in
 * `account-helpers.ts`, shared with #1271's delete-account spec, which proves the same contract
 * for the same reason; see their doc comments for why the pair is what carries the proof.
 *
 * One account carries the whole narrative, for the same reason the sibling specs do it: a second
 * account would buy nothing but another ceremony.
 */

test('passkeys can be added and revoked (each stepping up when stale), the last one cannot be removed, and signing out other devices ends a second context', async ({
    page,
    browser,
    accountApi,
}) => {
    // This one test carries the whole narrative (header above) — several real WebAuthn ceremonies,
    // three step-up round trips, a second browser context and a second API-backed sign-in. Slow
    // but legitimate, not flaky: raise the timeout at this single test rather than the suite's.
    test.setTimeout(120_000);
    const stepUps = countStepUps(page);
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await createAccountThroughDialog(page);

    // Abandon the recovery step on purpose: this account must have ZERO confirmed recovery
    // material for the last-passkey refusal below to actually BE `last_credential` — with a
    // confirmed code the server is right to allow removing the last passkey, and the assertion
    // would be testing the wrong rule.
    await page.getByTestId('recovery-not-now').click();
    await expect(page.locator('dialog.account-dialog')).toBeHidden();
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();
    // Unrelated to this spec (#1268 owns it) but blocks every click below until it's answered.
    await dismissAdoptGuestPrompt(page);

    // Captured now, while it is the only credential on the authenticator — reused at the very end
    // to sign the SAME (surviving) passkey in on a genuinely fresh browser profile.
    const originalCredentials = await authenticator.credentials();
    expect(originalCredentials).toHaveLength(1);
    const [originalCredential] = originalCredentials;

    // --- the page opens, is named, and closes the way every dialog in this app does ------------
    await page.getByTestId('account-open').click();
    const dialog = page.locator('dialog.account-page');
    await expect(dialog).toBeVisible();
    // Named by the heading it points at — and that heading's id must be this dialog's own, not
    // the sign-in dialog's, since both are mounted at once.
    expect(
        await page.evaluate(() => {
            const box = document.querySelector('dialog.account-page');
            const id = box?.getAttribute('aria-labelledby') ?? '';
            return document.getElementById(id)?.textContent?.trim() ?? '';
        }),
    ).toBe('Your account.');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByTestId('account-open').click();
    await expect(dialog).toBeVisible();
    const rows = page.getByTestId('passkey-row');

    // --- adding a passkey on a device that already holds the account's only credential ---------
    // Only the platform authenticator is attached right now (the second "device" below doesn't
    // exist yet) — `attemptAddPasskey`'s `excludeCredentials` lists the existing credential, so
    // WebAuthn refuses with `InvalidStateError`, which `@simplewebauthn/browser` (verified against
    // the installed 14.0.0) maps to `ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED`. `failureFromCeremony`
    // (#1264 patch review P2-3) must answer with the dedicated message, not the generic "try a
    // different passkey" — nonsense advice when a different passkey is exactly what this device
    // doesn't have.
    await page.getByTestId('passkey-add').click();
    await expect(page.getByTestId('account-error')).toHaveText(
        ACCOUNT_MESSAGES.passkeyOnThisDevice,
    );
    await expect(rows).toHaveCount(1);

    // A SECOND, independent virtual authenticator — a different transport, standing in for a
    // different physical device — added only NOW, after the account already has its one
    // credential. `excludeCredentials` on the add-passkey ceremony lists that existing credential,
    // and WebAuthn's exclusion check is per-connected-authenticator: adding a second passkey on
    // the SAME authenticator that already holds one always throws `InvalidStateError` (correct
    // WebAuthn behavior, not a bug in `lib/account/passkeys.ts`), and attaching this one earlier
    // would race Chrome's presence simulation across both for the FIRST registration too. A
    // second `transport: 'internal'` authenticator is refused outright — Chrome allows one.
    const secondDevice = await addVirtualAuthenticator(page, 'usb');

    // --- the last passkey cannot be removed: in the UI, and at the server ----------------------
    await expect(rows).toHaveCount(1);
    await expect(rows.getByTestId('passkey-remove')).toBeDisabled();
    await expect(page.getByTestId('passkey-last-note')).toBeVisible();

    // The disabled button is a courtesy; the server is the enforcement point. Call the route
    // directly, bypassing the UI entirely, with the sole passkey's real id.
    const soleId = await page.evaluate(async () => {
        const reply = await fetch('/api/auth/passkeys', { cache: 'no-store' });
        const { passkeys } = (await reply.json()) as { passkeys: { id: string }[] };
        return passkeys[0].id;
    });
    const refusal = await page.evaluate(async (credentialId) => {
        const reply = await fetch('/api/auth/passkeys/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credentialId }),
            cache: 'no-store',
        });
        return { status: reply.status, body: await reply.json() };
    }, soleId);
    expect(refusal.status).toBe(409);
    expect(refusal.body).toEqual({ error: 'last_credential' });
    // Refusing it must not have removed it either.
    await expect(rows).toHaveCount(1);

    // --- add a passkey, through a step-up ------------------------------------------------------
    expect(stepUps()).toBe(0);
    await refuseOnceWithFreshAuthRequired(page, '**/api/auth/passkeys/options');
    await page.getByTestId('passkey-add').click();
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId('account-error')).toHaveCount(0);
    // The refusal was answered by a real re-authentication, not by a bare retry.
    await expect.poll(stepUps).toBe(1);

    // The new credential lives entirely on `secondDevice`, and the original is untouched.
    expect(await secondDevice.credentials()).toHaveLength(1);
    expect(await authenticator.credentials()).toHaveLength(1);

    // Unplug the second device now that its passkey is registered. Every later ceremony here is a
    // step-up whose `allowCredentials` lists BOTH credentials, and with both authenticators
    // attached Chrome picks the answering one itself — observed landing either way across runs.
    // When it picks the added credential, the session rebinds to it, and revoking that credential
    // below then correctly ends THIS session (`signedOut: true`), closing the page mid-test. That
    // is a real behavior worth its own coverage, not a flake to retry: pinning the answering
    // authenticator is what makes this test about revocation rather than about Chrome's choice.
    await secondDevice.remove();

    // Both are removable now that there are two, and the one-passkey note is gone.
    await expect(rows.nth(0).getByTestId('passkey-remove')).toBeEnabled();
    await expect(rows.nth(1).getByTestId('passkey-remove')).toBeEnabled();
    await expect(page.getByTestId('passkey-last-note')).toHaveCount(0);

    // --- revoke the added passkey, through a step-up -------------------------------------------
    // Identify the ADDED row by its known SERVER id (whichever is not `soleId`) rather than list
    // order or the `current` label, which a step-up can rebind. Revoking the added one rather
    // than the original is deliberate: this session was created by the original, so revoking the
    // original would end it (`signedOut: true`) — a real and correct path, but not this block's.
    const addedId = await page.evaluate(async (knownId) => {
        const reply = await fetch('/api/auth/passkeys', { cache: 'no-store' });
        const { passkeys } = (await reply.json()) as { passkeys: { id: string }[] };
        const other = passkeys.find((row) => row.id !== knownId);
        if (!other) {
            throw new Error('expected a second passkey');
        }
        return other.id;
    }, soleId);
    const addedRow = page.locator(`[data-credential-id="${addedId}"]`);
    const originalRow = page.locator(`[data-credential-id="${soleId}"]`);
    await expect(addedRow).toHaveCount(1);
    await expect(originalRow).toHaveCount(1);

    await refuseOnceWithFreshAuthRequired(page, '**/api/auth/passkeys/revoke');
    await addedRow.getByTestId('passkey-remove').click();
    await expect(rows).toHaveCount(1);
    await expect(page.getByTestId('account-error')).toHaveCount(0);
    await expect.poll(stepUps).toBe(2);
    await expect(addedRow).toHaveCount(0);
    // Still signed in on the original credential, and the guard re-engages for the survivor.
    await expect(originalRow).toHaveCount(1);
    await expect(rows.getByTestId('passkey-remove')).toBeDisabled();

    // --- replace the recovery code, through a step-up ------------------------------------------
    await refuseOnceWithFreshAuthRequired(page, '**/api/auth/recovery/enroll');
    await page.getByTestId('replace-recovery-code').click();
    const shownReplacement = page.getByTestId('recovery-code');
    await expect(shownReplacement).toBeVisible();
    const replacementCode = (await shownReplacement.textContent()) ?? '';
    expect(replacementCode).toMatch(CODE_SHAPE);
    await expect.poll(stepUps).toBe(3);
    await page.getByTestId('recovery-saved').check();
    await page.getByTestId('recovery-finish').click();
    // Back on the account page proper, with focus moved to its heading rather than dropped on
    // `<body>` when the code step unmounted.
    await expect(page.getByTestId('recovery-code')).toHaveCount(0);
    await expect(page.locator('#account-page-title')).toBeFocused();
    await expect(page.getByTestId('account-error')).toHaveCount(0);

    // This is the THIRD code this test has minted (account creation's, abandoned, doesn't count
    // since it was never confirmed and is unrelated to this sweep) — the create and recovery
    // flows already run this exact leaked-storage sweep (#1262/#1263); the replace-code flow
    // (#1264 patch review P3-6) must run it too, identically, or a future storage regression in
    // ONE of the three flows could ship unnoticed.
    const replaceState = await persistedState(page);
    expect(replaceState.href).not.toContain(replacementCode);
    expect(replaceState.local).not.toContain(replacementCode);
    expect(replaceState.session).not.toContain(replacementCode);
    expect(replaceState.indexed).not.toContain(replacementCode);
    expect(replaceState.cookie).not.toContain(replacementCode);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // The header reads protected now: no more "Finish protecting".
    await expect(page.getByTestId('account-finish-protecting')).toHaveCount(0);
    await expect(page.getByTestId('account-state')).toHaveText('Signed in');

    // --- signing out other devices ends a second, genuinely separate context -------------------
    // Sign the SURVIVING passkey in on a fresh browser profile — its own cookie jar, its own
    // `localStorage`, its own authenticator — then revoke-others from here.
    // Re-read the credential rather than reusing the snapshot taken at the top: three step-up
    // ceremonies have signed with it since, and each one advanced its signature counter on both
    // the authenticator and the server. Exporting the stale copy hands the fresh profile a
    // passkey whose counter has regressed, which the server is right to refuse — it looks exactly
    // like a cloned authenticator. Same credential, current state.
    const [survivor] = await authenticator.credentials();
    expect(survivor.credentialId).toBe(originalCredential.credentialId);
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(survivor);
        await openWithAccounts(second);
        await second.getByTestId('account-sign-in').click();
        await second.getByTestId('account-do-sign-in').click();
        await expect(second.getByTestId('account-sign-out')).toBeVisible();
        // That context genuinely holds a live session before anything revokes it.
        expect(
            await second.evaluate(() =>
                fetch('/api/auth/session', { cache: 'no-store' }).then((reply) => reply.status),
            ),
        ).toBe(200);

        await page.getByTestId('account-state').click();
        await expect(dialog).toBeVisible();
        await page.getByTestId('sign-out-others').click();
        await expect(page.getByTestId('sign-out-others-done')).toBeVisible();
        // No freshness gate on this route, so no step-up should have run for it.
        expect(stepUps()).toBe(3);

        expect(
            await second.evaluate(() =>
                fetch('/api/auth/session', { cache: 'no-store' }).then((reply) => reply.status),
            ),
        ).toBe(401);
        // ...and this session, the one that asked, is untouched.
        expect(
            await page.evaluate(() =>
                fetch('/api/auth/session', { cache: 'no-store' }).then((reply) => reply.status),
            ),
        ).toBe(200);
    } finally {
        await fresh.close();
    }
});

/**
 * Revoking the credential that created THIS session (#1264 patch review P2-4) — a separate test,
 * and a separate account, from the narrative above: `accountApi` is TEST-scoped (its own API
 * process and throwaway database), so there is no budget or ordering to share, and this scenario
 * needs its OWN account left with exactly two passkeys, removing the one bound to the live
 * session. Reusing the narrative test's account would mean either revoking its remaining passkey
 * (leaving nothing for later assertions in that test) or adding a third, neither of which is
 * simpler than a fresh account.
 */
test('revoking the passkey that signed this device in ends the session, with the dialog saying so', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await createAccountThroughDialog(page);
    await page.getByTestId('recovery-not-now').click();
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();
    await dismissAdoptGuestPrompt(page);

    // A second passkey, purely so removing the first isn't blocked by the last-credential guard —
    // this test is about the SIGN-OUT reaction, not that guard (covered above).
    const secondDevice = await addVirtualAuthenticator(page, 'usb');
    await page.getByTestId('account-open').click();
    const dialog = page.locator('dialog.account-page');
    await expect(dialog).toBeVisible();
    await page.getByTestId('passkey-add').click();
    await expect(page.getByTestId('passkey-row')).toHaveCount(2);
    // Unplug it immediately: with both authenticators attached, a later ceremony that allows
    // either one is Chrome's choice, not this test's (`VirtualAuthenticator.remove`'s own doc
    // comment) — there is no later ceremony here, but removing it keeps this test's intent
    // (revoke the ORIGINAL, session-creating credential) unambiguous either way.
    await secondDevice.remove();

    // This session was created by registration, i.e. the credential still marked `current`.
    const currentId = await page.evaluate(async () => {
        const reply = await fetch('/api/auth/passkeys', { cache: 'no-store' });
        const { passkeys } = (await reply.json()) as {
            passkeys: { id: string; current: boolean }[];
        };
        return passkeys.find((row) => row.current)?.id;
    });
    expect(currentId).toBeDefined();
    await page.locator(`[data-credential-id="${currentId}"]`).getByTestId('passkey-remove').click();

    // The dialog stays open and says why, rather than vanishing the instant the header behind it
    // flips to signed-out.
    await expect(page.getByTestId('account-page-signed-out-close')).toBeVisible();
    await expect(dialog).toBeVisible();
    await page.getByTestId('account-page-signed-out-close').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('account-sign-in')).toBeVisible();
    expect(
        await page.evaluate(() =>
            fetch('/api/auth/session', { cache: 'no-store' }).then((reply) => reply.status),
        ),
    ).toBe(401);
});
