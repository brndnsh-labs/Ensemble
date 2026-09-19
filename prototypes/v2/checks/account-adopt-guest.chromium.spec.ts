import type { Page } from '@playwright/test';
import { createAccountThroughDialog, openWithAccounts } from './account-helpers';
import { expect, accountTest as test } from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * Copying guest songs into the account (#1268): opt-in, retry-safe, originals retained.
 *
 * `*.chromium.spec.ts`: the CDP virtual authenticator is Chromium-only.
 *
 * "Interrupt mid-copy, rerun" is proven at the level that actually owns that behavior — real
 * IndexedDB compare-and-put — in `tests/browser/account-songbook.browser.test.ts` ("rejects
 * recreating a document under its own deterministic id…") and at the orchestration level in
 * `tests/unit/songbook/account-adopt-guest.test.ts`. What this spec proves instead is the product
 * moment: the prompt appears once, adopting actually reaches the account list rendered on screen,
 * the guest songbook is provably untouched, and running the same gesture again adds nothing more.
 */

const songTitles = (page: Page) => page.locator('.song-name');

/** Every Save this page actually sent. Zero is the honest proof that nothing was re-queued. */
function countSaveRequests(page: Page): () => number {
    let count = 0;
    page.on('request', (request) => {
        if (
            request.method() === 'POST' &&
            new URL(request.url()).pathname === '/api/documents/save'
        ) {
            count += 1;
        }
    });
    return () => count;
}

test('signing in offers to add this device’s songs; adopting reaches the account list, the guest songbook is untouched, and running it again adds nothing new', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    const guestTitles = await songTitles(page).allInnerTexts();
    // A fresh guest songbook seeds three starters (`lib/starters.ts`); there is something to
    // offer, and starters are not filtered out of the offer (documented in `adopt-guest.ts`).
    expect(guestTitles.length).toBeGreaterThan(0);

    await createAccountThroughDialog(page);
    await page.getByTestId('recovery-not-now').click();
    await expect(page.getByTestId('account-finish-protecting')).toBeVisible();

    // The auto-prompt, right after this device's first sign-in — and with it the preview the
    // contract asks for: exactly the titles that are about to be copied, by name.
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        `Add your ${guestTitles.length} songs on this device to your account?`,
    );
    await expect(page.getByTestId('adopt-guest-preview').locator('li')).toHaveText(guestTitles);
    // The 'copying' phase (`adopt-guest-progress`) is genuinely transient for three local-only
    // IDB writes — not asserted on directly, since polling for it would either race past it or
    // wait out a timeout on a step that legitimately never gets observed. `toHaveText` below
    // polls straight through it to the final state, which is the one this spec needs to prove.
    await page.getByTestId('adopt-guest-confirm').click();
    // Says what actually happened: the copies are committed HERE, and the per-song chip is what
    // reports the cloud half (#1268 patch review P2-4).
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        `Copied ${guestTitles.length} songs into this device’s account songbook`,
    );
    await page.getByTestId('adopt-guest-done').click();
    await expect(page.locator('dialog[aria-labelledby="adopt-guest-title"]')).toBeHidden();

    // The account library — a separate store from the guest one (rollout decision 9 S3) — now
    // holds copies of every guest song, same titles, nothing lost and nothing extra.
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    const accountTitles = await songTitles(page).allInnerTexts();
    expect(accountTitles.slice().sort()).toEqual(guestTitles.slice().sort());

    // Reloading does not re-nag: the auto-prompt already answered itself once for this
    // (device, owner), and neither a stray dialog nor a stale "loading" state should reappear.
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.locator('dialog[aria-labelledby="adopt-guest-title"]')).toBeHidden();

    // Manually reachable from the account page, and running it again with nothing new to offer
    // says so rather than silently duplicating the library (the "rerun -> exactly N" contract,
    // exercised here as "rerun with N already adopted -> zero more").
    await page.getByTestId('account-open').click();
    await page.getByTestId('account-page-adopt-guest').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText('Nothing new to add');
    await page.getByTestId('adopt-guest-close').click();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    expect((await songTitles(page).allInnerTexts()).sort()).toEqual(guestTitles.slice().sort());
});

test('declining is remembered — reloading and signing back in does not reopen the prompt, but the account page still reaches it', async ({
    page,
}) => {
    await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    const guestTitles = await songTitles(page).allInnerTexts();

    await createAccountThroughDialog(page);
    await page.getByTestId('recovery-not-now').click();

    await expect(page.locator('#adopt-guest-title')).toHaveText(
        `Add your ${guestTitles.length} songs on this device to your account?`,
    );
    await page.getByTestId('adopt-guest-decline').click();
    await expect(page.locator('dialog[aria-labelledby="adopt-guest-title"]')).toBeHidden();

    // The account library stays legitimately empty — nothing was adopted.
    await expect(page.getByTestId('library-heading')).toHaveText('Your account songbook');
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.locator('.song-row')).toHaveCount(0);

    // A reload re-attaches the same owner; the decision from before the reload must hold.
    await page.reload();
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await expect(page.locator('dialog[aria-labelledby="adopt-guest-title"]')).toBeHidden();
    await expect(page.locator('.song-row')).toHaveCount(0);

    // The account page's own button is unaffected by the earlier decline — it is a standing
    // invitation, not a one-time offer.
    await page.getByTestId('account-open').click();
    await page.getByTestId('account-page-adopt-guest').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        `Add your ${guestTitles.length} songs on this device to your account?`,
    );
});

/**
 * The #1268 patch-review P0, on two real devices: guest starters carry the SAME literal ids
 * (`starter-blues`…) on every device, so a second device signing into the same account derives the
 * same deterministic account document ids for songs the first device has already adopted. Offering
 * them again is what re-queued a Save for a document the account already holds — and under the
 * deterministic OPERATION id this story shipped with, the server answered `operation_mismatch`
 * (receipts never expire, and `save()` restamps `updatedAt`, so the bytes never match the
 * receipt), which the outbox reads as `'retry'` and which therefore ended every pass at that
 * document forever. Both halves of the fix are asserted here: the offer is computed only after the
 * first download has landed (so the account library is actually known), and this device sends no
 * Save at all.
 */
test('a second device signing into the same account is offered nothing, and queues no upload for songs the account already holds', async ({
    page,
    browser,
    accountApi,
}) => {
    const authenticator = await addVirtualAuthenticator(page);
    await openWithAccounts(page);
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    const guestTitles = await songTitles(page).allInnerTexts();
    expect(guestTitles.length).toBeGreaterThan(0);

    await createAccountThroughDialog(page);
    await page.getByTestId('recovery-not-now').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        `Add your ${guestTitles.length} songs on this device to your account?`,
    );
    await page.getByTestId('adopt-guest-confirm').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        `Copied ${guestTitles.length} songs into this device’s account songbook`,
    );
    await page.getByTestId('adopt-guest-done').click();

    // The cloud really took them — read from one adopted song's own chip, not from the copy
    // dialog, which only ever claimed the local half.
    await expect(page.getByTestId('library-loading')).toHaveCount(0);
    await page.locator('.song-link', { hasText: guestTitles[0] }).first().click();
    await expect(page.getByTestId('sync-cloud')).toHaveText('Saved to your account');

    // Device two: its own cookie jar, its own IndexedDB, its own guest songbook — and the same
    // three starters, under the same ids. Only the passkey is carried over.
    const [passkey] = await authenticator.credentials();
    const fresh = await browser.newContext({ baseURL: accountApi.origin });
    try {
        const second = await fresh.newPage();
        const saves = countSaveRequests(second);
        const spare = await addVirtualAuthenticator(second);
        await spare.addCredential(passkey);
        await openWithAccounts(second);
        await expect(second.getByTestId('library-loading')).toHaveCount(0);
        // The precondition that made this a P0: the same titles, from the same starter ids.
        expect((await songTitles(second).allInnerTexts()).slice().sort()).toEqual(
            guestTitles.slice().sort(),
        );

        await second.getByTestId('account-sign-in').click();
        await second.getByTestId('account-do-sign-in').click();
        await expect(second.getByTestId('account-sign-out')).toBeVisible();

        // The download lands, and with it every song the first device adopted.
        await expect(second.getByTestId('library-heading')).toHaveText('Your account songbook');
        await expect(second.getByTestId('library-loading')).toHaveCount(0);
        await expect
            .poll(async () => (await songTitles(second).allInnerTexts()).slice().sort())
            .toEqual(guestTitles.slice().sort());

        // No auto-prompt here: there is nothing missing from the account to offer. Asking again
        // is exactly what would have re-queued the whole library.
        await expect(second.locator('dialog[aria-labelledby="adopt-guest-title"]')).toBeHidden();

        // And asked explicitly, it says so — computed against the DOWNLOADED library, which is
        // why the account-page button waits for that download before it enables.
        await second.getByTestId('account-open').click();
        await second.getByTestId('account-page-adopt-guest').click();
        await expect(second.locator('#adopt-guest-title')).toHaveText('Nothing new to add');
        await second.getByTestId('adopt-guest-close').click();

        // The proof that no poisoned operation exists: this device never sent a Save at all, so
        // there is no `operation_mismatch` to be stuck behind and nothing was duplicated.
        expect(saves()).toBe(0);
        await expect(second.getByTestId('library-loading')).toHaveCount(0);
        expect((await songTitles(second).allInnerTexts()).slice().sort()).toEqual(
            guestTitles.slice().sort(),
        );
    } finally {
        await fresh.close();
    }
});
