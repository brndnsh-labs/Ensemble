import { expect, test } from './fixtures';

/**
 * Old v1 `?s=` share links landing on the v2 stand (#1279).
 *
 * The payload is built the way v1's `compressSections` builds it — the minified
 * `{l, v, r}` section records, UTF-8, Base64 — rather than pasted from a captured URL, so
 * this spec keeps meaning something if the codec's envelope ever moves. The unit suite
 * (`tests/unit/songbook/v1-link.test.ts`) drives the real writer; this one proves the
 * shell actually opens what it produces.
 */
function v1Link(sections: Array<Record<string, unknown>>, params: Record<string, string>): string {
    const search = new URLSearchParams({
        s: Buffer.from(JSON.stringify(sections), 'utf8').toString('base64'),
    });
    for (const [name, value] of Object.entries(params)) {
        search.set(name, value);
    }
    return `/v2/?${search.toString()}`;
}

/** The blues the first test opens, reused by the precedence tests. */
const BLUES = [
    { l: 'Head', v: 'C7 | F7 | C7 | C7' },
    { l: 'Turnaround', v: 'G7 | F7 | C7 | G7', r: 2 },
];

/**
 * Deterministic across both projects: force the Clipboard API unavailable so "Copy link"
 * always renders its visible fallback input, whichever engine is running (the same trick
 * `share-link.spec.ts` uses, and the only way to read a v2 link back out of the app).
 */
async function withoutClipboard(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    });
}

/** A REAL `#chart=` fragment, minted by the app itself for the starter blues. */
async function chartFragment(page: import('@playwright/test').Page): Promise<string> {
    await withoutClipboard(page);
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Copy link', exact: true }).click();
    const link = await page.getByTestId('share-link-fallback').inputValue();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    return new URL(link).hash;
}

test('an old v1 share link opens as an unsaved draft; Keep a copy persists it and a reload never resurrects it', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
        v1Link(BLUES, {
            key: 'C',
            ts: '4/4',
            bpm: '96',
            genre: 'Blues',
            style: 'jazz',
            int: '0.40',
            comp: '0.55',
            notation: 'name',
            // A share link must never carry a feature-flag side effect (#1279 patch R2).
            accounts: 'on',
        }),
    );

    await expect(page.getByRole('heading', { name: 'Shared song' })).toBeVisible();
    // The same unsaved-shared-draft state a v2 `#chart=` link opens in — the header's own
    // wording — with the older link's note in the status line beside it.
    await expect(page.locator('.song-subtitle')).toContainText('Opened from a shared link');
    await expect(page.locator('.playback-footer [role="status"]')).toContainText(
        'Opened from an older shared link',
    );
    // The chart itself: the chords the link carried, in the notation it asked for.
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['C7']);
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('96');
    await expect(page.getByLabel('Key', { exact: true })).toHaveValue('C');
    // Consumed on load: the v1 parameters AND the account flag are gone from the address
    // bar, and the flag was never applied — otherwise a reload of the tidied URL would.
    expect(new URL(page.url()).search).toBe('');
    expect(
        await page.evaluate(() => localStorage.getItem('ensemble-v2-preview:accounts')),
    ).toBeNull();
    expect(errors).toEqual([]);

    const keepACopy = page.getByRole('button', { name: 'Keep a copy', exact: true });
    await expect(keepACopy).toBeEnabled();
    await keepACopy.click();
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');

    // Nothing left in the URL to re-open, whether or not "Keep a copy" ran first.
    await page.reload();
    await expect(page.locator('main.home')).toBeVisible();
    await expect(page.locator('main.workspace')).toHaveCount(0);
    // The copy it kept is a normal library song now — as the featured card or a list row,
    // depending on what else this device has open, so the assertion is on the home surface.
    await expect(page.locator('main.home')).toContainText('Shared song');
});

test('a garbage v1 link says so and leaves the songbook working', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/v2/?s=not-a-real-payload&key=C&bpm=120');

    // Scoped to the app's own banner: Next's route announcer also carries `role="alert"`.
    await expect(page.locator('.error-banner[role="alert"]')).toContainText(
        "This older link couldn't be opened",
    );
    await expect(page.locator('main.home')).toBeVisible();
    expect(errors).toEqual([]);
    expect(new URL(page.url()).search).toBe('');

    // The songbook is untouched by the failed link.
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await expect(page.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();

    // Consumed here too: reloading must not re-show the failure indefinitely.
    await page.goto('/v2/');
    await expect(page.locator('.error-banner[role="alert"]')).toHaveCount(0);
});

test('a share link is decided once per page load, not again when the songbook changes', async ({
    page,
}) => {
    // #1279 patch R1. A `#chart=` URL pasted into the tab the musician is already working in
    // is a SAME-DOCUMENT fragment navigation: the browser does nothing, and neither should
    // the app. The regression this guards is the effect re-reading `window.location` on a
    // later re-render — a Save refreshes the library, which used to re-arm it — and opening
    // the stranger's chart over live, unsaved work.
    const fragment = await chartFragment(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.getByRole('button', { name: 'Back to songbook' }).click();
    // The list row's accessible name carries a leading ♪ glyph, so this is a substring
    // match like the rest of the suite's songbook clicks, not an anchored one.
    await page.getByRole('button', { name: 'Minor swing sketch Jazz · Saved locally' }).click();
    await expect(page.getByRole('heading', { name: 'Minor swing sketch' })).toBeVisible();

    // Make it dirty so Save is live, then plant the fragment without reloading.
    await page.getByLabel('Tempo', { exact: true }).fill('150');
    await page.getByLabel('Tempo', { exact: true }).press('Enter');
    await page.evaluate((hash) => {
        window.location.hash = hash;
    }, fragment);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    // The save round-trips through IndexedDB, so by the time this settles the effect's own
    // decode promise would long since have swapped the stand.
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');

    await expect(page.getByRole('heading', { name: 'Minor swing sketch' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Blue pocket' })).toHaveCount(0);
    await expect(page.locator('.song-subtitle')).not.toContainText('Opened from a shared link');
    await expect(page.locator('.error-banner[role="alert"]')).toHaveCount(0);
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('150');

    // Everything above is a negative, and a satisfied negative resolves on its first poll —
    // possibly before a regressed effect's decode promise has swapped the stand. The
    // positive fact: had the effect re-run it would have consumed the fragment
    // (`consumeLink`), so after one more positively-observed step it must still be there.
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.locator('main.home')).toBeVisible();
    expect(new URL(page.url()).hash).toBe(fragment);
    expect(errors).toEqual([]);
});

test('a `#chart=` fragment wins over a v1 payload, and consumes it too', async ({ page }) => {
    // #1279 patch R5, cases (a) and (c).
    const fragment = await chartFragment(page);
    await page.goto(`${v1Link(BLUES, { key: 'C', bpm: '96', notation: 'name' })}${fragment}`);

    await expect(page.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shared song' })).toHaveCount(0);
    // The losing v1 payload is consumed all the same, so a reload cannot open it instead.
    expect(new URL(page.url()).search).toBe('');
    expect(new URL(page.url()).hash).toBe('');
    await page.reload();
    await expect(page.locator('main.home')).toBeVisible();
});

test('an unrelated fragment does not cost a v1 link its chart', async ({ page }) => {
    // #1279 patch R5, case (b): a scroll anchor or a chat client's `#` is nobody's share
    // link, and treating any hash as one gave this link the v2 failure copy and threw the
    // chart away. Only a `chart=` fragment outranks the query string.
    await page.goto(`${v1Link(BLUES, { key: 'C', bpm: '96', notation: 'name' })}#section-2`);

    await expect(page.getByRole('heading', { name: 'Shared song' })).toBeVisible();
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['C7']);
    await expect(page.locator('.error-banner[role="alert"]')).toHaveCount(0);
});
