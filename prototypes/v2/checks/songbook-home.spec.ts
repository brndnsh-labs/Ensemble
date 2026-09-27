import type { Page } from '@playwright/test';
import {
    appUrl,
    expect,
    seedGuestDocuments,
    seedStarters,
    songLink,
    starterDocuments,
    test,
} from './fixtures';

/**
 * The songbook home, library first (#1441): Continue with the song's own first bars, the eight
 * most recently opened songs, the standards shelf, a first-visit layout, one search — and a home
 * page that reads only what it shows.
 */

/** Twelve ordinary guest songs (`home-song-00`…`11`) cloned from the starter fixture. */
function manySongs(count: number) {
    const [blues] = starterDocuments();
    return Array.from({ length: count }, (_, i) => {
        const stamp = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();
        const id = `home-song-${String(i).padStart(2, '0')}`;
        return { ...blues, id, title: `Home song ${i}`, createdAt: stamp, updatedAt: stamp };
    });
}

/**
 * Counts full reads of the guest songbook from outside the app (#1441 review P3): `repository.list`
 * is the one caller of `getAll()` on the guest `documents` store, and the home's own reads are
 * `get`, `count` and a cursor. Installed before the app's scripts run.
 */
async function countFullReads(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as unknown as { __fullReads: number };
        w.__fullReads = 0;
        const getAll = IDBObjectStore.prototype.getAll;
        IDBObjectStore.prototype.getAll = function (
            this: IDBObjectStore,
            ...args: Parameters<IDBObjectStore['getAll']>
        ) {
            if (this.name === 'documents') {
                w.__fullReads += 1;
            }
            return getAll.apply(this, args);
        };
    });
}

function fullReads(page: Page): Promise<number> {
    return page.evaluate(() => (window as unknown as { __fullReads: number }).__fullReads);
}

/** What the phone and desktop must never do at the page level. */
async function horizontalOverflow(page: Page): Promise<number> {
    return page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
}

test('the home renders its rows without a full-library read', async ({ page }) => {
    // A corrupt document a FULL read trips over (`repository.list()` refuses a songbook it cannot
    // wholly read) — keyed to sort after every other id, so the home's bounded reads (by id, then
    // a cursor fill that stops at eight rows) never reach it.
    const corrupt = { schemaVersion: 1, id: 'zz-corrupt', title: 42, chart: null };
    await countFullReads(page);
    await seedGuestDocuments(page, [...manySongs(12), corrupt]);
    await expect(page.getByTestId('library-heading')).toHaveText('Your songbook');
    await expect(page.locator('.home-table .song-row')).toHaveCount(8);
    // The seam, counted: the home rendered its rows and nothing read the whole songbook.
    expect(await fullReads(page)).toBe(0);
    // The count is IndexedDB's own — the corrupt song is still one of the thirteen.
    await expect(page.getByTestId('all-songs-link')).toHaveText('All 13 songs →');
    await expect(page.getByTestId('home-unreadable')).toHaveCount(0);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    // The one surface that reads everything says why it cannot, rather than listing a short songbook.
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByTestId('library-failure')).toContainText('Cannot open this chart');
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(0);
    // …and the counter is not vacuous: that page's full read went through it.
    expect(await fullReads(page)).toBeGreaterThan(0);
});

test('an opened song that will not read leaves no gap: the list is topped up', async ({ page }) => {
    // Eight opened songs, one of them corrupt: seven readable opened rows, and the fill adds one
    // more from the rest of the songbook rather than leaving the list short.
    const songs = manySongs(12);
    const corrupt = { schemaVersion: 1, id: 'home-song-03', title: 42, chart: null };
    const opened = Object.fromEntries(
        songs
            .slice(0, 8)
            .map((song, i) => [song.id, new Date(Date.UTC(2026, 1, 1, 0, i)).toISOString()]),
    );
    await page.addInitScript((map) => {
        localStorage.setItem('ensemble-v2-preview:opened-at', JSON.stringify(map));
    }, opened);
    await seedGuestDocuments(page, [
        ...songs.filter((song) => song.id !== 'home-song-03'),
        corrupt,
    ]);
    await expect(page.locator('.home-table .song-row')).toHaveCount(8);
    await expect(page.getByTestId('home-unreadable')).toContainText('couldn’t be read');
    await expect(page.getByTestId('all-songs-link')).toHaveText('All 12 songs →');
});

test('a corrupt song the home does read is left out and said, never blanking the page', async ({
    page,
}) => {
    const corrupt = { schemaVersion: 1, id: 'aa-corrupt', title: 42, chart: null };
    await seedGuestDocuments(page, [...starterDocuments(), corrupt]);
    await expect(page.locator('.home-table .song-row')).toHaveCount(3);
    await expect(page.getByTestId('home-unreadable')).toContainText('couldn’t be read');
    await expect(songLink(page, 'Blue pocket', 'Blues')).toBeVisible();
});

test('the home never lists more than eight songs, most recently opened first', async ({ page }) => {
    await seedGuestDocuments(page, manySongs(12));
    await expect(page.locator('.home-table .song-row')).toHaveCount(8);
    // Nothing opened yet: the list is filled from the songbook, and "Home song 11" is not in it.
    await expect(songLink(page, 'Home song 11')).toHaveCount(0);
    // Found through the one search box instead, then opened.
    await page
        .getByRole('searchbox', { name: 'Search your songs and the standards' })
        .fill('song 11');
    await songLink(page, 'Home song 11').click();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await page.getByRole('searchbox', { name: 'Search your songs and the standards' }).fill('');
    await songLink(page, 'Home song 3').click();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.locator('.home-table .song-row')).toHaveCount(8);
    await expect(page.locator('.home-table .song-name').first()).toHaveText('Home song 3');
    await expect(page.locator('.home-table .song-name').nth(1)).toHaveText('Home song 11');
    await expect(page.getByTestId('all-songs-link')).toHaveText('All 12 songs →');
    // The rows no longer repeat where the songs live; the footer says it once.
    await expect(page.locator('.home-table')).not.toContainText('Saved locally');
    await expect(page.getByTestId('home-storage')).toContainText('Saved on this device');
});

test('Continue shows the song’s own first bars, and Play starts it without the editor', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Minor swing sketch', 'Jazz').click();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    const card = page.getByTestId('continue-card');
    await expect(card).toContainText('Pick up where you left off');
    await expect(card.getByRole('heading', { name: 'Minor swing sketch' })).toBeVisible();
    await expect(card).toContainText('Jazz · 160 BPM · Am');
    // The fixture chart's own bars: `Am6 | Am6 | Dm6 | Dm6 | E7 | E7 | Am6 | E7`.
    await expect(page.getByTestId('continue-bars').locator('li')).toHaveText([
        'Am6',
        'Am6',
        'Dm6',
        'Dm6',
        'E7',
        'E7',
        'Am6',
        'E7',
    ]);
    await card.getByRole('button', { name: 'Play Minor swing sketch' }).click();
    await expect(
        page.getByRole('heading', { name: 'Minor swing sketch', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    // Not the editor: the edit panel stays closed while the band plays.
    await expect(page.locator('.edit-panel')).toBeHidden();
    await page.getByRole('button', { name: 'Stop playback' }).click();
});

test('a fresh device shows the first visit; after one save, the everyday layout', async ({
    page,
}) => {
    await page.goto(appUrl());
    await expect(
        page.getByRole('heading', { name: 'Pick a tune. The band comes in.' }),
    ).toBeVisible();
    await expect(page.getByTestId('continue-card')).toHaveCount(0);
    await expect(page.locator('.home-table')).toHaveCount(0);
    // The bigger shelf: six per column where the shelf has that many (Blues has four).
    await expect(page.locator('.shelf-column').nth(0).locator('.standard-item')).toHaveCount(4);
    await expect(page.locator('.shelf-column').nth(1).locator('.standard-item')).toHaveCount(6);
    await expect(page.locator('.shelf-column').nth(2).locator('.standard-item')).toHaveCount(6);
    await expect(page.getByRole('button', { name: /Import from iReal Pro/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Write a new song/ })).toBeVisible();
    // No v1 data on this device, so no old-Ensemble card.
    await expect(
        page.getByRole('button', { name: /Bring songs from the old Ensemble/ }),
    ).toHaveCount(0);
    // A shelf's own link opens the browser on that shelf, and focus comes back to it.
    await page.getByRole('button', { name: 'All 11 jazz standards →' }).click();
    await expect(page.locator('.standards-table .song-row')).toHaveCount(11);
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByRole('button', { name: 'All 11 jazz standards →' })).toBeFocused();

    await page.getByRole('button', { name: /Write a new song/ }).click();
    // New song saves the blank chart itself and opens it in the editor.
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(
        page.getByRole('heading', { name: 'Pick a tune. The band comes in.' }),
    ).toHaveCount(0);
    await expect(page.getByTestId('continue-card')).toBeVisible();
    await expect(page.locator('.home-table .song-row')).toHaveCount(1);
    await expect(page.getByTestId('all-songs-link')).toHaveText('All 1 song →');
    await expect(page.locator('.shelf-column').nth(1).locator('.standard-item')).toHaveCount(4);
});

test('one search returns your songs and the standards, grouped', async ({ page }) => {
    await seedStarters(page);
    const search = page.getByRole('searchbox', { name: 'Search your songs and the standards' });
    await search.fill('blu');
    const songs = page.getByTestId('search-songs');
    const standards = page.getByTestId('search-standards');
    await expect(songs.getByRole('heading', { name: 'Your songs' })).toBeVisible();
    await expect(songLink(page, 'Blue pocket', 'Blues')).toBeVisible();
    await expect(songs.locator('.song-link')).toHaveCount(1);
    await expect(standards.getByRole('button', { name: 'Open 12-Bar Blues' })).toBeVisible();
    await expect(standards.getByRole('button', { name: 'Open Blue Bossa' })).toBeVisible();
    // The home's own sections step aside for the results.
    await expect(page.locator('.home-table')).toHaveCount(0);
    await standards.getByRole('button', { name: 'Open Minor Blues' }).click();
    await expect(page.getByRole('heading', { name: 'Minor Blues', exact: true })).toBeVisible();
});

test('the first visit keeps an h1 while searching', async ({ page }) => {
    await page.goto(appUrl());
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Pick a tune. The band comes in.',
    );
    await page.getByRole('searchbox', { name: 'Search your songs and the standards' }).fill('blu');
    await expect(page.getByTestId('search-standards')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your songbook');
});

test('deleting the last song on the home lands focus on the first visit’s heading', async ({
    page,
}) => {
    await seedGuestDocuments(page, manySongs(1));
    await page.getByRole('button', { name: 'More actions for Home song 0' }).click();
    await page.getByTestId('row-menu-delete').click();
    await page.getByTestId('delete-guest-song-confirm').click();
    const heading = page.getByRole('heading', { name: 'Pick a tune. The band comes in.' });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
});

test('focus returns to Browse all when leaving the standards browser', async ({ page }) => {
    await seedStarters(page);
    await page.getByRole('button', { name: 'Browse all →' }).click();
    await expect(page.locator('.standards-table .song-row')).toHaveCount(28);
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByRole('button', { name: 'Browse all →' })).toBeFocused();
});

for (const theme of ['light', 'dark'] as const) {
    test(`at 390 px: no horizontal scroll and every control at least 44 px (${theme})`, async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ colorScheme: theme });
        for (const layout of ['first-visit', 'everyday'] as const) {
            if (layout === 'first-visit') {
                await page.goto(appUrl());
            } else {
                await seedStarters(page);
                await songLink(page, 'Blue pocket', 'Blues').click();
                await page.getByRole('button', { name: 'Back to songbook' }).click();
            }
            await expect(page.locator(`main.home[data-layout="${layout}"]`)).toBeVisible();
            expect(await horizontalOverflow(page)).toBe(0);
            const small = await page.evaluate(() =>
                [
                    ...document.querySelectorAll(
                        '.site-header button, .site-header .search, main.home button',
                    ),
                ]
                    .map((element) => {
                        const box = element.getBoundingClientRect();
                        return {
                            label:
                                element.getAttribute('aria-label') || element.textContent?.trim(),
                            width: box.width,
                            height: box.height,
                        };
                    })
                    .filter((box) => box.width > 0 && (box.width < 44 || box.height < 44)),
            );
            expect(small).toEqual([]);
        }
    });
}
