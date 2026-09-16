import { expect, test } from '@playwright/test';

// Deterministic across both projects (Desktop Chrome and the WebKit-based
// `webkit-phone` project, which grants no clipboard permission by default,
// matching some real mobile Safari contexts): force the Clipboard API
// unavailable so every run exercises the visible fallback, rather than
// depending on which engine happens to allow `navigator.clipboard.writeText`.
async function withoutClipboard(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    });
}

test('shares a link that reopens as an unsaved draft; Keep a copy persists it and the hash never resurrects it', async ({
    page,
    context,
}) => {
    await withoutClipboard(page);
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await expect(page.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();

    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Copy link', exact: true }).click();
    const linkInput = page.getByTestId('share-link-fallback');
    await expect(linkInput).toBeVisible();
    const link = await linkInput.inputValue();
    expect(link).toContain('/v2/#chart=');
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // "Opening it in a fresh browser" — a separate page/tab sharing no app state.
    const fresh = await context.newPage();
    await withoutClipboard(fresh);
    await fresh.goto(link);
    await expect(fresh.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();
    await expect(fresh.locator('.song-subtitle')).toContainText('Opened from a shared link');
    const keepACopy = fresh.getByRole('button', { name: 'Keep a copy', exact: true });
    await expect(keepACopy).toBeEnabled();

    await keepACopy.click();
    await expect(fresh.locator('.song-subtitle')).toContainText('Saved on this device');
    await expect(fresh.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    // The hash is consumed on load: a reload must not resurrect the shared draft,
    // whether or not "Keep a copy" ran first — back to the songbook home, not the
    // workspace. (Not asserting on a specific song title: "Keep a copy" left a
    // second "Blue pocket" entry alongside the untouched starter, which is
    // expected — a duplicate title is not itself a bug.)
    await fresh.reload();
    await expect(fresh.locator('main.home')).toBeVisible();
    await expect(fresh.locator('main.workspace')).toHaveCount(0);
});

test('a malformed share link fails closed with a visible error, not a crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/v2/#chart=not-a-real-payload');
    // Scoped to the app's own banner: Next's route announcer also carries
    // `role="alert"` (empty text), which makes a bare `getByRole('alert')` match
    // two elements in strict mode.
    await expect(page.locator('.error-banner[role="alert"]')).toContainText('could not be opened');
    await expect(page.locator('main.home')).toBeVisible();
    expect(errors).toEqual([]);
    // Consumed here too: reloading must not re-show the error indefinitely.
    await page.reload();
    await expect(page.locator('.error-banner[role="alert"]')).toHaveCount(0);
});
