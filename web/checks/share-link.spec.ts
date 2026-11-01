import { encodeChartLink } from '../../core/songbook/chart-link';
import {
    appUrl,
    expect,
    pickSongKey,
    seedStarters,
    songLink,
    songMenu,
    songMenuAction,
    test,
} from './fixtures';
import { importTemplate } from './large-library';

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
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(page.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();

    await songMenuAction(page, 'Copy link');
    const linkInput = page.getByTestId('share-link-fallback');
    await expect(linkInput).toBeVisible();
    const link = await linkInput.inputValue();
    expect(link).toContain(appUrl('#chart='));
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

/**
 * The same recovery-storage leak `standards-catalog.spec.ts` guards for a standard: a shared
 * `#chart=` draft belongs to no songbook yet, so editing it before "Keep a copy" must not write a
 * song recovery slot under the link's song id that nothing but a Save ever clears. Its changes
 * are kept under a draft key of their own (#1979), below.
 */
test('editing an opened share link before Keep a copy writes nothing to recovery storage', async ({
    page,
    context,
}) => {
    await withoutClipboard(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await songMenuAction(page, 'Copy link');
    const link = await page.getByTestId('share-link-fallback').inputValue();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    const fresh = await context.newPage();
    await withoutClipboard(fresh);
    await fresh.goto(link);
    await expect(fresh.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();

    await pickSongKey(fresh, 'D');
    await fresh.getByLabel('Tempo', { exact: true }).fill('140');
    await fresh.getByLabel('Tempo', { exact: true }).press('Enter');

    await expect
        .poll(() =>
            fresh.evaluate(
                () =>
                    Object.keys(localStorage).filter((key) =>
                        key.startsWith('ensemble-v2-preview:recovery:'),
                    ).length,
            ),
        )
        .toBe(0);

    await songMenuAction(fresh, 'More');
    await expect(songMenu(fresh, 'more')).toBeVisible();
    await expect(fresh.getByText(/Older drafts \(/)).toHaveCount(0);
});

/**
 * Opening the same link again lands the changes it was left with (#1979), marked "Changed"; the
 * sender's own song, with the same id, is untouched by them.
 */
test('the same share link opened again keeps its changes, marked (#1979)', async ({
    page,
    context,
}) => {
    await withoutClipboard(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await songMenuAction(page, 'Copy link');
    const link = await page.getByTestId('share-link-fallback').inputValue();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const sentTempo = await page.getByLabel('Tempo', { exact: true }).inputValue();
    expect(sentTempo).not.toBe('137');

    const fresh = await context.newPage();
    await withoutClipboard(fresh);
    await fresh.goto(link);
    await expect(fresh.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();
    const tempo = fresh.getByLabel('Tempo', { exact: true });
    await tempo.fill('137');
    await tempo.press('Enter');
    await expect(fresh.locator('.song-subtitle')).toContainText('Changed · Keep a copy');
    await fresh.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(fresh.locator('main.home')).toBeVisible();

    // A new page load (only the fragment differs, so `goto` alone would stay in this document).
    await fresh.goto('about:blank');
    await fresh.goto(link);
    await expect(fresh.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();
    await expect(tempo).toHaveValue('137');
    await expect(fresh.locator('.song-subtitle')).toContainText('Changed · Keep a copy');

    // The song the link was made from opens as it was saved.
    await fresh.getByRole('button', { name: 'Back to songbook' }).click();
    await songLink(fresh, 'Blue pocket', 'Blues').click();
    await expect(fresh.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();
    await expect(tempo).toHaveValue(sentTempo);
    await expect(fresh.locator('.song-subtitle')).toContainText('Saved on this device');
});

test('a share link too long to play is refused with the reason, not silently (#1632)', async ({
    page,
    context,
}) => {
    // A real measured chart (the app's own iReal import), re-shared with one section of 17
    // bars x 64 chords played 64 times: 69,632 chord events, past the band's ceiling and well
    // inside the codec's own limits.
    const document = await importTemplate(page);
    const [section] = document.chart.score.sections;
    const dense = {
        ...document,
        chart: {
            ...document.chart,
            score: {
                ...document.chart.score,
                sections: [
                    {
                        ...section,
                        repeat: 64,
                        measures: Array.from({ length: 17 }, (_, bar) => ({
                            id: `dense-${bar}`,
                            content: {
                                kind: 'events' as const,
                                events: Array.from({ length: 64 }, () => ({
                                    kind: 'chord' as const,
                                    symbol: 'C',
                                    duration: [1, 16] as [number, number],
                                })),
                            },
                        })),
                    },
                ],
            },
        },
    };

    // A separate page, so the link is opened by a page load as a pasted link would be.
    const fresh = await context.newPage();
    const errors: string[] = [];
    fresh.on('pageerror', (error) => errors.push(error.message));
    await fresh.goto(appUrl(await encodeChartLink(dense)));
    await expect(fresh.locator('.error-banner[role="alert"]')).toContainText(
        'playback limit of 65,536 chord events',
    );
    expect(errors).toEqual([]);
});

test('a malformed share link fails closed with a visible error, not a crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(appUrl('#chart=not-a-real-payload'));
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

// Old v1 `?s=`/`?prog=` links are retired (#1735). The URL is LEFT ALONE, not cleaned: nothing
// reads those parameters any more, so stripping them would be code kept alive for a link
// nobody opens, and a reload of an untouched URL is the same harmless songbook.
test('an old v1 `?s=` or `?prog=` link opens the songbook and is ignored, URL untouched', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const search of [
        '?s=not-a-real-payload&key=C&bpm=120',
        `?prog=${encodeURIComponent('C7 | F7 | C7 | G7')}&genre=Blues&autoplay=1`,
    ]) {
        await seedStarters(page, search);
        await expect(page.locator('main.home')).toBeVisible();
        await expect(page.locator('main.workspace')).toHaveCount(0);
        await expect(page.locator('.error-banner[role="alert"]')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Shared song' })).toHaveCount(0);
        expect(new URL(page.url()).search).toBe(search);
        // The songbook underneath is the starters, working as usual.
        await songLink(page, 'Blue pocket', 'Blues').click();
        await expect(page.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();
    }
    expect(errors).toEqual([]);
});

test('a `#chart=` link is consumed and leaves the rest of the query string', async ({
    page,
    context,
}) => {
    await withoutClipboard(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await songMenuAction(page, 'Copy link');
    const hash = new URL(await page.getByTestId('share-link-fallback').inputValue()).hash;
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    const fresh = await context.newPage();
    await withoutClipboard(fresh);
    await fresh.goto(appUrl(`?utm_source=email${hash}`));
    await expect(fresh.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();
    await expect(fresh.locator('.song-subtitle')).toContainText('Opened from a shared link');
    // Only the hash goes: a reload must not reopen the link over live work.
    expect(new URL(fresh.url()).search).toBe('?utm_source=email');
    expect(new URL(fresh.url()).hash).toBe('');
});
