import type { Page } from '@playwright/test';
import { backToSongbook, newSongOnTheStand, saveAs } from './account-helpers';
import { appUrl, expect, seedStarters, test } from './fixtures';

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

    // Jumping to a letter scrolls the first song at or after it into view.
    await page.locator('.all-songs-select select').nth(1).selectOption('title');
    await page.locator('.az-index button', { hasText: 'M' }).click();
    await expect(
        page.locator('.all-songs-table .song-row', { hasText: 'Minor swing sketch' }),
    ).toBeInViewport();
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

test('a fresh device (no songs) shows no All songs link', async ({ page }) => {
    await page.goto(appUrl());
    await expect(page.getByTestId('all-songs-link')).toHaveCount(0);
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

test('deleting the open song and the Continue song both leave the songbook consistent', async ({
    page,
}) => {
    await seedStarters(page);
    // Open "Blue pocket" so it becomes the Continue song, then leave it — it is now BOTH the
    // Continue card and an ordinary row.
    await page.locator('.song-link', { hasText: 'Blue pocket' }).click();
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();
    await backToSongbook(page);
    await expect(page.locator('.continue-card')).toContainText('Blue pocket');

    // Delete the Continue song from the home row list, while it is NOT the open chart.
    const homeRow = page.locator('.song-table .song-row', { hasText: 'Blue pocket' });
    await homeRow.getByRole('button', { name: 'More actions for Blue pocket' }).click();
    await page.getByTestId('row-menu-delete').click();
    await page.getByTestId('delete-guest-song-confirm').click();
    await expect(page.locator('.song-table .song-row', { hasText: 'Blue pocket' })).toHaveCount(0);
    // The Continue card falls back cleanly rather than pointing at a dead id.
    await expect(page.locator('.continue-card')).not.toContainText('Blue pocket');

    // Now delete the OPEN chart: open "After hours", then delete it from the same row list.
    await page.locator('.song-link', { hasText: 'After hours' }).click();
    await expect(page.getByRole('heading', { name: 'After hours', exact: true })).toBeVisible();
    await backToSongbook(page);
    const openRow = page.locator('.song-table .song-row', { hasText: 'After hours' });
    await openRow.getByRole('button', { name: 'More actions for After hours' }).click();
    await page.getByTestId('row-menu-delete').click();
    await page.getByTestId('delete-guest-song-confirm').click();
    await expect(page.locator('.song-table .song-row', { hasText: 'After hours' })).toHaveCount(0);
    // The stand is left consistent: back at the songbook, nothing crashed, no dangling banner.
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
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
