import type { Page } from '@playwright/test';
import { backToSongbook, newSongOnTheStand, saveAs } from './account-helpers';
import { appUrl, expect, seedStarters, test } from './fixtures';
import { seedGuestSongs } from './large-library';

/**
 * The All songs page (#1440): search, Starred/Recently-opened filters, a genre dropdown scoped
 * to genres actually present, five sort orders and an A–Z index for two of them — against the
 * three guest `seedStarters` songs ('Blue pocket' · Blues · C · 110, 'Minor swing sketch' · Jazz
 * · Am · 160, 'After hours' · Bossa · C · 125), whose fixed genres/tempos/titles make every
 * ordering predictable.
 */

async function documentRecord(
    page: Page,
    id: string,
): Promise<{ updatedAt: string; revision: number } | undefined> {
    return page.evaluate(async (documentId: string) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ensemble-v2-preview', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            const record = await new Promise<{ updatedAt: string; revision: number } | undefined>(
                (resolve, reject) => {
                    const request = db
                        .transaction('documents')
                        .objectStore('documents')
                        .get(documentId);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                },
            );
            return record;
        } finally {
            db.close();
        }
    }, id);
}

test('search, genre filter, every sort order and the A–Z index', async ({ page }) => {
    await seedStarters(page);
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByRole('heading', { name: /All songs/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /All songs/ })).toContainText('· 3');
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(3);

    // The genre dropdown lists only genres present, alphabetically.
    const genreOptions = await page.locator('.all-songs-toolbar select').first().locator('option');
    await expect(genreOptions).toHaveText(['All genres', 'Blues', 'Bossa', 'Jazz']);

    // Default sort is Title.
    await expect(page.locator('.all-songs-table .song-name')).toHaveText([
        'After hours',
        'Blue pocket',
        'Minor swing sketch',
    ]);

    // Search matches title, case-insensitively.
    await page.getByPlaceholder('Title or composer…').fill('BLUE');
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(1);
    await expect(page.locator('.all-songs-table .song-name')).toHaveText(['Blue pocket']);
    await page.getByPlaceholder('Title or composer…').fill('');

    // The genre dropdown filters, combined with search.
    await page.locator('.all-songs-select select').nth(0).selectOption('Jazz');
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(1);
    await expect(page.locator('.all-songs-table .song-name')).toHaveText(['Minor swing sketch']);
    await page.locator('.all-songs-select select').nth(0).selectOption('');

    // Sort by Tempo.
    await page.locator('.all-songs-select select').nth(1).selectOption('tempo');
    await expect(page.locator('.all-songs-table .song-name')).toHaveText([
        'Blue pocket', // 110
        'After hours', // 125
        'Minor swing sketch', // 160
    ]);

    // Sort by Recently added — the starters are seeded with descending timestamps, blues newest.
    await page.locator('.all-songs-select select').nth(1).selectOption('recentAdded');
    await expect(page.locator('.all-songs-table .song-name')).toHaveText([
        'Blue pocket',
        'Minor swing sketch',
        'After hours',
    ]);

    // The A–Z index shows for Title and Composer sorts, not for the others.
    await page.locator('.all-songs-select select').nth(1).selectOption('title');
    await expect(page.locator('.az-index button')).toHaveCount(26);
    await page.locator('.all-songs-select select').nth(1).selectOption('tempo');
    await expect(page.locator('.az-index')).toHaveCount(0);
    await page.locator('.all-songs-select select').nth(1).selectOption('composer');
    await expect(page.locator('.az-index button')).toHaveCount(26);

    // Jumping to a letter scrolls the first song at or after it into view AND focuses its own
    // song link (#1440 review P3) — not just a scroll, which hands nothing to keyboard use.
    await page.locator('.all-songs-select select').nth(1).selectOption('title');
    await page.locator('.az-index button', { hasText: 'M' }).click();
    await expect(
        page.locator('.all-songs-table .song-row', { hasText: 'Minor swing sketch' }),
    ).toBeInViewport();
    await expect(
        page.locator('.all-songs-table .song-link', { hasText: 'Minor swing sketch' }),
    ).toBeFocused();
});

test('the sort choice is remembered per device across a reload', async ({ page }) => {
    await seedStarters(page);
    await page.getByTestId('all-songs-link').click();
    await page.locator('.all-songs-select select').nth(1).selectOption('tempo');
    await expect(page.locator('.all-songs-select select').nth(1)).toHaveValue('tempo');

    await page.reload();
    await page.getByTestId('all-songs-link').click();
    await expect(page.locator('.all-songs-select select').nth(1)).toHaveValue('tempo');
});

test('Starred and Recently-opened filter the list and combine with the sort/search', async ({
    page,
}) => {
    await seedStarters(page);
    await page.getByTestId('all-songs-link').click();

    // Nothing starred, nothing opened yet.
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 0');
    await expect(page.getByRole('button', { name: /^Recently opened/ })).toHaveText(
        'Recently opened 0',
    );

    await page.getByRole('button', { name: 'Star Blue pocket' }).click();
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 1');
    await page.getByRole('button', { name: /^Starred/ }).click();
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(1);
    await expect(page.locator('.all-songs-table .song-name')).toHaveText(['Blue pocket']);

    // Unstar flips the toggle button's own label back.
    await page.getByRole('button', { name: 'Unstar Blue pocket' }).click();
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 0');
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(0);

    await page.getByRole('button', { name: /^All songs/ }).click();
    await page.locator('.song-link', { hasText: 'After hours' }).click();
    await expect(page.getByRole('heading', { name: 'After hours', exact: true })).toBeVisible();
    await backToSongbook(page);
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByRole('button', { name: /^Recently opened/ })).toHaveText(
        'Recently opened 1',
    );
    await page.getByRole('button', { name: /^Recently opened/ }).click();
    await expect(page.locator('.all-songs-table .song-name')).toHaveText(['After hours']);
});

/**
 * Opening a song never writes a document edit (#1440's brake): the acceptance criterion is that
 * no Save is queued by an open alone, proven here by re-reading the raw IndexedDB record and
 * asserting its `updatedAt`/`revision` are byte-identical to what `seedStarters` wrote.
 */
test('opening a song from the All songs page queues no Save', async ({ page }) => {
    await seedStarters(page);
    const before = await documentRecord(page, 'starter-blues');
    expect(before).toBeDefined();

    await page.getByTestId('all-songs-link').click();
    await page.locator('.song-link', { hasText: 'Blue pocket' }).click();
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();

    const after = await documentRecord(page, 'starter-blues');
    expect(after).toEqual(before);
});

/**
 * At scale (#1442's fixture, ≥500 songs) — the acceptance criterion's own ask. Every seeded song
 * shares the imported template's genre and composer ("Ensemble" — see `large-library.ts`'s own
 * note on the fixture's embedded title/composer), which is what makes a composer-only search
 * assertion possible here: none of the titles ("Guest song N") contain "ensemble".
 */
test('functions correctly at scale: 500 seeded songs', async ({ page }) => {
    test.setTimeout(60_000);
    await seedGuestSongs(page, 500);
    await page.goto(appUrl());
    await expect(page.getByTestId('library-heading')).toBeVisible();
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByRole('heading', { name: /All songs/ })).toContainText('· 500');
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(500, { timeout: 30_000 });

    // Search matches COMPOSER, not just title: no title contains "ensemble", so every row
    // matching proves the composer field is actually being read.
    await page.getByPlaceholder('Title or composer…').fill('ensemble');
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(500);
    await page.getByPlaceholder('Title or composer…').fill('Guest song 500');
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(1);
    await expect(page.locator('.all-songs-table .song-name')).toHaveText(['Guest song 500']);
    await page.getByPlaceholder('Title or composer…').fill('');
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(500);

    // Every seeded song shares one genre, so the dropdown lists exactly one option besides "All
    // genres", and filtering by it keeps every row.
    const genreOptions = page.locator('.all-songs-toolbar select').first().locator('option');
    await expect(genreOptions).toHaveCount(2);
    const onlyGenre = await genreOptions.nth(1).textContent();
    await page
        .locator('.all-songs-select select')
        .nth(0)
        .selectOption(onlyGenre ?? '');
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(500);
    await page.locator('.all-songs-select select').nth(0).selectOption('');

    // Sort by Title shows the A–Z index; sorting by Recently added genuinely reorders (seeding
    // writes ascending timestamps, so "Guest song 500" — the newest — leads that order).
    await page.locator('.all-songs-select select').nth(1).selectOption('title');
    await expect(page.locator('.az-index button')).toHaveCount(26);
    await expect(page.locator('.all-songs-table .song-name').first()).toHaveText('Guest song 1');
    await page.locator('.all-songs-select select').nth(1).selectOption('recentAdded');
    await expect(page.locator('.all-songs-table .song-name').first()).toHaveText('Guest song 500');
});

test('a fresh device (no songs) shows no All songs link', async ({ page }) => {
    await page.goto(appUrl());
    await expect(page.getByTestId('all-songs-link')).toHaveCount(0);
});

/**
 * Leaving returns focus to the entry point on home (#1440 review P3), not `<body>`. This view
 * swap remounts `Songbook` (and its "All N songs →" button) on every return, so the fix has to
 * be a ref the SHELL holds across that remount (`app/ensemble.tsx`'s `allSongsEntryRef`) — a ref
 * captured inside `AllSongs` itself would already be pointing at a removed node by the time its
 * own unmount cleanup could use it.
 */
test('leaving the All songs page returns focus to its entry link on home', async ({ page }) => {
    await seedStarters(page);
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByRole('heading', { name: /All songs/ })).toBeVisible();
    await page.getByRole('button', { name: '← Home' }).click();
    await expect(page.getByTestId('all-songs-link')).toBeFocused();
});

test('the row ⋯ menu: Star/Unstar, Rename, Duplicate, Export file, Delete…', async ({ page }) => {
    await seedStarters(page);
    await page.getByTestId('all-songs-link').click();

    const row = page.locator('.all-songs-table .song-row', { hasText: 'Blue pocket' });
    await row.getByRole('button', { name: 'More actions for Blue pocket' }).click();
    await expect(page.getByTestId('row-menu-star')).toHaveText('★ Star');

    // Star from the menu is the same fact the row's own toggle reads. Starring does not close
    // the menu (matching the existing song menu's own "actions don't auto-close" convention);
    // close it explicitly before the next row click.
    await page.getByTestId('row-menu-star').click();
    await expect(page.getByRole('button', { name: 'Unstar Blue pocket' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('row-menu-star')).toBeHidden();

    // Rename, in place.
    await row.getByRole('button', { name: 'More actions for Blue pocket' }).click();
    await page.getByTestId('row-menu-rename').click();
    await page.getByTestId('row-menu-rename-input').fill('Blue pocket renamed');
    await page.getByTestId('row-menu-rename-save').click();
    await expect(
        page.locator('.all-songs-table .song-name', { hasText: 'Blue pocket renamed' }),
    ).toBeVisible();
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(3);

    // Duplicate mints "<title> copy" under a fresh id.
    const renamedRow = page.locator('.all-songs-table .song-row', {
        hasText: 'Blue pocket renamed',
    });
    await renamedRow.getByRole('button', { name: 'More actions for Blue pocket renamed' }).click();
    await page.getByTestId('row-menu-duplicate').click();
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(4);
    await expect(
        page.locator('.all-songs-table .song-name', { hasText: 'Blue pocket renamed copy' }),
    ).toBeVisible();

    // Export file downloads the row's own chart.
    const copyRow = page.locator('.all-songs-table .song-row', {
        hasText: 'Blue pocket renamed copy',
    });
    await copyRow
        .getByRole('button', { name: 'More actions for Blue pocket renamed copy' })
        .click();
    const download = page.waitForEvent('download');
    await page.getByTestId('row-menu-export').click();
    expect((await download).suggestedFilename()).toBe('Blue pocket renamed copy.ensemble');
    // Export does not close the menu either; close it before the next row click.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('row-menu-export')).toBeHidden();

    // Delete asks first and offers export first.
    await copyRow
        .getByRole('button', { name: 'More actions for Blue pocket renamed copy' })
        .click();
    await page.getByTestId('row-menu-delete').click();
    await expect(page.getByTestId('delete-guest-song-export')).toBeEnabled();
    await page.getByTestId('delete-guest-song-confirm').click();
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(3);
});

/**
 * Deleting the Continue song leaves the songbook consistent (#1440 review P5).
 *
 * A row's ⋯ menu only ever renders while `current` is null (`Songbook`/`AllSongs` are only
 * mounted in that state), so a row-menu delete can never target the chart actually open on the
 * stand — there is no UI path to reach it, and an earlier version of both `renameRow` and
 * `deleteGuestSong` carried a branch that handled exactly that unreachable case. That dead code
 * is gone; what is left to prove is the real, reachable case this test covers: the Continue
 * card's own song, and a second delete right after it, both leaving no dangling state.
 */
test('deleting the Continue song leaves the songbook consistent, and so does a second delete', async ({
    page,
}) => {
    await seedStarters(page);
    // Open "Blue pocket" so it becomes the Continue song, then leave it.
    await page.locator('.song-link', { hasText: 'Blue pocket' }).click();
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();
    await backToSongbook(page);
    await expect(page.locator('.continue-card')).toContainText('Blue pocket');

    // Delete the Continue song from the home row list.
    const homeRow = page.locator('.song-table .song-row', { hasText: 'Blue pocket' });
    await homeRow.getByRole('button', { name: 'More actions for Blue pocket' }).click();
    await page.getByTestId('row-menu-delete').click();
    await page.getByTestId('delete-guest-song-confirm').click();
    await expect(page.locator('.song-table .song-row', { hasText: 'Blue pocket' })).toHaveCount(0);
    // The Continue card falls back cleanly rather than pointing at a dead id.
    await expect(page.locator('.continue-card')).not.toContainText('Blue pocket');

    // A second, unrelated delete right after leaves the songbook just as consistent.
    const secondRow = page.locator('.song-table .song-row', { hasText: 'After hours' });
    await secondRow.getByRole('button', { name: 'More actions for After hours' }).click();
    await page.getByTestId('row-menu-delete').click();
    await page.getByTestId('delete-guest-song-confirm').click();
    await expect(page.locator('.song-table .song-row', { hasText: 'After hours' })).toHaveCount(0);
    // The songbook is left consistent: nothing crashed, no dangling banner.
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
});

/**
 * Rename must never destroy a live draft (#1440 review P1): an in-place rename would either
 * retire an account's newer drafts or (here, guest) bump `updatedAt` and silently orphan the
 * recovery slot `recoveryFor` would otherwise still offer. So Rename opens the song instead,
 * through the normal path that recovers the draft, and focuses the title field there.
 */
test('Rename opens the song (recovering its draft) instead of renaming in place when one exists', async ({
    page,
}) => {
    await seedStarters(page);
    await page.locator('.song-link', { hasText: 'Blue pocket' }).click();
    await page.getByRole('button', { name: 'Edit chart' }).click();
    await page.getByLabel('Song title').fill('Blue pocket edited');
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    Object.keys(localStorage).filter((key) =>
                        key.startsWith('ensemble-v2-preview:recovery:'),
                    ).length,
            ),
        )
        .toBeGreaterThan(0);
    await backToSongbook(page);

    const row = page.locator('.song-table .song-row', { hasText: 'Blue pocket' });
    await row.getByRole('button', { name: 'More actions for Blue pocket' }).click();
    await page.getByTestId('row-menu-rename').click();
    await page.getByTestId('row-menu-rename-input').fill('Renamed from the row menu');
    await page.getByTestId('row-menu-rename-save').click();

    // The song opens instead of renaming in place: the recovered draft's own edited title comes
    // back — never the row menu's typed text, which was never committed anywhere — in both the
    // heading and the focused title field.
    await expect(
        page.getByRole('heading', { name: 'Blue pocket edited', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Song title')).toHaveValue('Blue pocket edited');
    await expect(page.getByLabel('Song title')).toBeFocused();
    await expect(page.locator('.playback-footer [role="status"]')).toContainText(
        'opened it here so renaming won’t lose them',
    );
});

test('a live draft is discarded, not orphaned, when its song is deleted', async ({ page }) => {
    await seedStarters(page);
    await page.locator('.song-link', { hasText: 'Blue pocket' }).click();
    await page.getByRole('button', { name: 'Edit chart' }).click();
    await page.getByLabel('Song title').fill('Blue pocket edited');
    // Recovery is written on the trailing edge of an edit; wait for the slot to appear.
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    Object.keys(localStorage).filter((key) =>
                        key.startsWith('ensemble-v2-preview:recovery:'),
                    ).length,
            ),
        )
        .toBeGreaterThan(0);
    await backToSongbook(page);

    const row = page.locator('.song-table .song-row', { hasText: 'Blue pocket' });
    await row.getByRole('button', { name: /More actions for Blue pocket/ }).click();
    await page.getByTestId('row-menu-delete').click();
    await expect(page.getByTestId('delete-guest-song-recovery')).toBeVisible();
    await page.getByTestId('delete-guest-song-confirm').click();
    // The row disappearing is the UI's own "the delete has actually landed" signal — the click
    // above only waits for the event to dispatch, not for the async delete it triggers to settle.
    await expect(page.locator('.song-table .song-row', { hasText: 'Blue pocket' })).toHaveCount(0);

    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    Object.keys(localStorage).filter((key) => key.endsWith(':starter-blues'))
                        .length,
            ),
        )
        .toBe(0);
});

test('new song / save-a-copy naming stays distinct from the row menu’s "<title> copy"', async ({
    page,
}) => {
    // Sanity check that the row-menu duplicate suffix ("copy", no dash) does not collide with
    // the stand's own "Save a copy" suffix ("— copy"), which a shared helper could confuse.
    await page.goto(appUrl());
    await newSongOnTheStand(page);
    await saveAs(page, 'Original tune');
    await backToSongbook(page);
    await page.getByTestId('all-songs-link').click();
    const row = page.locator('.all-songs-table .song-row', { hasText: 'Original tune' });
    await row.getByRole('button', { name: 'More actions for Original tune' }).click();
    await page.getByTestId('row-menu-duplicate').click();
    await expect(
        page.locator('.all-songs-table .song-name', { hasText: 'Original tune copy' }),
    ).toBeVisible();
});

/**
 * After a row delete, focus goes to the next row, or the heading once the list is empty
 * (#1440 review P3) — never to `<body>`, which is where the browser's own default restore lands
 * once the row that held focus before the confirm dialog opened no longer exists to restore it to.
 */
test('after a row delete, focus goes to the next row, or the heading once the list is empty', async ({
    page,
}) => {
    await seedStarters(page);
    await page.getByTestId('all-songs-link').click();

    // Title order: After hours, Blue pocket, Minor swing sketch. Deleting the MIDDLE row leaves
    // focus on what is now the row at that same position.
    await page
        .locator('.all-songs-table .song-row', { hasText: 'Blue pocket' })
        .getByRole('button', { name: 'More actions for Blue pocket' })
        .click();
    await page.getByTestId('row-menu-delete').click();
    await page.getByTestId('delete-guest-song-confirm').click();
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(2);
    await expect(
        page.locator('.all-songs-table .song-link', { hasText: 'Minor swing sketch' }),
    ).toBeFocused();

    // Deleting the rest empties the list — focus falls back to the page's own heading.
    await page
        .locator('.all-songs-table .song-row', { hasText: 'After hours' })
        .getByRole('button', { name: 'More actions for After hours' })
        .click();
    await page.getByTestId('row-menu-delete').click();
    await page.getByTestId('delete-guest-song-confirm').click();
    await page
        .locator('.all-songs-table .song-row', { hasText: 'Minor swing sketch' })
        .getByRole('button', { name: 'More actions for Minor swing sketch' })
        .click();
    await page.getByTestId('row-menu-delete').click();
    await page.getByTestId('delete-guest-song-confirm').click();
    await expect(page.locator('.all-songs-empty')).toBeVisible();
    await expect(page.getByRole('heading', { name: /All songs/ })).toBeFocused();
});
