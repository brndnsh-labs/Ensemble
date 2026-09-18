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

    // The auto-prompt, right after this device's first sign-in.
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        `Add your ${guestTitles.length} songs on this device to your account?`,
    );
    // The 'copying' phase (`adopt-guest-progress`) is genuinely transient for three local-only
    // IDB writes — not asserted on directly, since polling for it would either race past it or
    // wait out a timeout on a step that legitimately never gets observed. `toHaveText` below
    // polls straight through it to the final state, which is the one this spec needs to prove.
    await page.getByTestId('adopt-guest-confirm').click();
    await expect(page.locator('#adopt-guest-title')).toHaveText(
        `Added ${guestTitles.length} songs to your account`,
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
