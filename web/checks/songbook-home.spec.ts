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
 * Counts full reads of the guest songbook from outside the app (#1441 review P3): `getAll()` on the
 * guest `documents` store is a whole-songbook read (`repository.list`), and the home's own reads
 * are `get`, `count` and a cursor. Each is also counted apart when it happens before the home's
 * rows are on screen — the claim #1441 makes is that the home never WAITS on one. Installed
 * before the app's scripts run.
 */
async function countFullReads(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as unknown as { __fullReads: number; __readsBeforeRows: number };
        w.__fullReads = 0;
        w.__readsBeforeRows = 0;
        const getAll = IDBObjectStore.prototype.getAll;
        IDBObjectStore.prototype.getAll = function (
            this: IDBObjectStore,
            ...args: Parameters<IDBObjectStore['getAll']>
        ) {
            if (this.name === 'documents') {
                w.__fullReads += 1;
                if (!document.querySelector('.home-table .song-row')) {
                    w.__readsBeforeRows += 1;
                }
            }
            return getAll.apply(this, args);
        };
    });
}

function fullReads(page: Page): Promise<number> {
    return page.evaluate(() => (window as unknown as { __fullReads: number }).__fullReads);
}

function readsBeforeRows(page: Page): Promise<number> {
    return page.evaluate(
        () => (window as unknown as { __readsBeforeRows: number }).__readsBeforeRows,
    );
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
    const corrupt = { schemaVersion: 2, id: 'zz-corrupt', title: 42, chart: null };
    await countFullReads(page);
    await seedGuestDocuments(page, [...manySongs(12), corrupt]);
    await expect(page.getByTestId('library-heading')).toHaveText('Your songbook');
    await expect(page.locator('.home-table .song-row')).toHaveCount(8);
    // The seam, counted: the home rendered its rows and nothing read the whole songbook first.
    expect(await readsBeforeRows(page)).toBe(0);
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
    const corrupt = { schemaVersion: 2, id: 'home-song-03', title: 42, chart: null };
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
    const corrupt = { schemaVersion: 2, id: 'aa-corrupt', title: 42, chart: null };
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
    // Not the editor: no bar is open for typing and the title is not a field while the band
    // plays (a measure chart has no edit panel, #1726).
    await expect(page.locator('.bar-input, .bar-dock')).toHaveCount(0);
    await expect(page.getByLabel('Song title')).toHaveCount(0);
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
    // New song is kept once it holds something (#1707): one change puts it in the songbook.
    await page.getByRole('button', { name: 'Faster' }).click();
    await expect(page.locator('.song-subtitle')).toContainText('Practice settings changed');
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

test('a commit that lands before the search box’s input event is handled does not eat the typing (#1635)', async ({
    page,
}) => {
    // The race behind the intermittent "one search returns…" timeout on WebKit: the browser has
    // already put "blu" in the box, but a React render commits (here the settle of the first
    // session read, in CI) before React's own `input` handler has seen it. A controlled box is
    // rewritten to the state it held, "", by that commit — and React, finding the tracked value
    // unchanged, never fires `onChange`, so the typing is gone and no results appear. Reproduced
    // deterministically: set the value the way the browser does (past React's value tracker),
    // force a synchronous commit with a real click, and only then deliver the `input` event.
    await seedStarters(page);
    await expect(page.getByTestId('continue-card')).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Search your songs and the standards' });
    await search.evaluate(async (box: HTMLInputElement) => {
        box.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(box, 'blu');
        // Opening the Import dialog is a discrete click; React renders and commits the shell in
        // the microtask checkpoint after it, so yield one before delivering the event.
        (document.querySelector('.header-tools .btn') as HTMLButtonElement).click();
        await Promise.resolve();
        await Promise.resolve();
        box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(search).toHaveValue('blu');
    await expect(
        page.getByTestId('search-songs').getByRole('heading', { name: 'Your songs' }),
    ).toBeVisible();
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

test('a standard’s ▶ opens and plays; its row only opens (#1987)', async ({ page }) => {
    await page.goto(appUrl());
    const shelf = page.locator('.standards-shelf');
    // The row opens the chart and leaves the band stopped.
    await shelf.getByRole('button', { name: 'Open 12-Bar Blues' }).click();
    await expect(page.getByRole('heading', { name: '12-Bar Blues', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    // The ▶ is named for what it does, and opens and plays.
    await shelf.getByRole('button', { name: 'Play 12-Bar Blues' }).click();
    await expect(page.getByRole('heading', { name: '12-Bar Blues', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();
});

test('the Standards browser’s ▶ opens and plays (#1987)', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    await page.getByRole('button', { name: 'Play 12-Bar Blues' }).click();
    await expect(page.getByRole('heading', { name: '12-Bar Blues', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();
});
