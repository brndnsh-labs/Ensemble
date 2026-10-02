import type { Page } from '@playwright/test';
import { appUrl, expect, seedStarters, test } from './fixtures';

/**
 * Collections on the All songs page, and Starred as a built-in collection (#1477) — the guest
 * songbook, on both projects. Against the three `seedStarters` songs: 'Blue pocket',
 * 'Minor swing sketch' and 'After hours' (title order: After hours, Blue pocket, Minor swing
 * sketch), so a collection's own order is told apart from the default Title sort.
 *
 * The account half — sync, the conflict merge, the sign-out warning, adopting a guest collection
 * on sign-in — is `account-collections.chromium.spec.ts` and `tests/browser/account-starred`.
 */

const rows = (page: Page) => page.locator('.all-songs-table .song-name');

async function openAllSongs(page: Page): Promise<void> {
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByRole('heading', { name: /All songs/ })).toContainText('· 3');
}

/** "Add to collection…" from a row's ⋯ menu, into an existing collection. */
async function addTo(page: Page, song: string, collection: string): Promise<void> {
    await page
        .locator('.all-songs-table .song-row', { hasText: song })
        .getByRole('button', { name: `More actions for ${song}` })
        .click();
    await page.getByTestId('row-menu-add-to-collection').click();
    // Entering the sub-view moves focus into it (#1477 review R5): the first collection it can join.
    await expect(
        page.locator('[data-testid="row-menu-collection"]:not(:disabled)').first(),
    ).toBeFocused();
    await page.getByTestId('row-menu-collection').filter({ hasText: collection }).click();
    await expect(page.getByTestId('shell-message')).toContainText(
        `Added “${song}” to “${collection}”`,
    );
}

/** "Add to collection…" from a row's ⋯ menu, into a NEW collection made right there. */
async function addToNew(page: Page, song: string, collection: string): Promise<void> {
    await page
        .locator('.all-songs-table .song-row', { hasText: song })
        .getByRole('button', { name: `More actions for ${song}` })
        .click();
    await page.getByTestId('row-menu-add-to-collection').click();
    // With no collection to join yet, focus lands on the name field (#1477 review R5).
    await expect(page.getByTestId('row-menu-new-collection-input')).toBeFocused();
    await page.getByTestId('row-menu-new-collection-input').fill(collection);
    await page.getByTestId('row-menu-new-collection-save').click();
    await expect(page.getByTestId('shell-message')).toContainText(
        `Added “${song}” to “${collection}”`,
    );
}

function collectionFilter(page: Page, name: string) {
    return page.getByTestId('collection-filter').filter({ hasText: name });
}

/** The phone layout has ~10px of slack: nothing on this page may scroll the page sideways. */
async function noSidewaysScroll(page: Page): Promise<void> {
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
    ).toBe(true);
}

test('a collection keeps its own order, and deleting it keeps every song', async ({ page }) => {
    await seedStarters(page);
    await openAllSongs(page);

    // Added in an order that is NOT title order: the collection's order is the one it shows.
    await addToNew(page, 'Minor swing sketch', 'Friday gig');
    await addTo(page, 'After hours', 'Friday gig');
    await addTo(page, 'Blue pocket', 'Friday gig');

    await expect(collectionFilter(page, 'Friday gig')).toHaveText('Friday gig 3');
    await collectionFilter(page, 'Friday gig').click();
    await expect(page.locator('.all-songs-select select').nth(1)).toHaveValue('collection');
    await expect(rows(page)).toHaveText(['Minor swing sketch', 'After hours', 'Blue pocket']);
    await noSidewaysScroll(page);

    // Another sort still applies inside the collection, and "Collection order" comes back.
    await page.locator('.all-songs-select select').nth(1).selectOption('title');
    await expect(rows(page)).toHaveText(['After hours', 'Blue pocket', 'Minor swing sketch']);
    await page.locator('.all-songs-select select').nth(1).selectOption('collection');
    await expect(rows(page)).toHaveText(['Minor swing sketch', 'After hours', 'Blue pocket']);

    // A song already in it says so rather than being added twice.
    await page
        .locator('.all-songs-table .song-row', { hasText: 'Blue pocket' })
        .getByRole('button', { name: 'More actions for Blue pocket' })
        .click();
    await page.getByTestId('row-menu-add-to-collection').click();
    await expect(
        page.getByTestId('row-menu-collection').filter({ hasText: 'Friday gig' }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');

    // Delete, box left unchecked: the collection goes, every song stays.
    await page.getByTestId('collection-delete').click();
    await expect(page.getByTestId('delete-collection-songs-stay')).toHaveText(
        'The 3 songs in it stay in your songbook.',
    );
    await expect(page.getByTestId('delete-collection-also-songs')).not.toBeChecked();
    await page.getByTestId('delete-collection-confirm').click();
    await expect(page.getByTestId('shell-message')).toContainText('Collection deleted');
    await expect(page.getByTestId('collection-filter')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^All songs/ })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    // Focus goes to the All songs filter (#1477 review R5): the Delete… button the dialog would
    // hand it back to went with the collection.
    await expect(page.getByRole('button', { name: /^All songs/ })).toBeFocused();
    await expect(page.getByRole('heading', { name: /All songs/ })).toContainText('· 3');
    await expect(rows(page)).toHaveCount(3);
});

test('“also delete” removes only the songs that are in no other collection', async ({ page }) => {
    await seedStarters(page);
    await openAllSongs(page);
    await addToNew(page, 'Minor swing sketch', 'Friday gig');
    await addTo(page, 'After hours', 'Friday gig');
    await addTo(page, 'Blue pocket', 'Friday gig');
    // Blue pocket is also in another collection, and After hours is starred — Starred counts as
    // another collection — so only Minor swing sketch is in Friday gig alone.
    await addToNew(page, 'Blue pocket', 'Practice');
    await page.getByRole('button', { name: 'Star After hours' }).click();
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 1');

    await collectionFilter(page, 'Friday gig').click();
    await page.getByTestId('collection-delete').click();
    await expect(page.getByTestId('delete-collection-also-songs')).not.toBeChecked();
    await page.getByTestId('delete-collection-also-songs').check();
    await expect(page.locator('.collection-delete-also')).toHaveText(
        'Also delete the 1 song that is in no other collection',
    );
    await page.getByTestId('delete-collection-confirm').click();
    await expect(page.getByTestId('shell-message')).toContainText(
        'Collection deleted, with 1 song',
    );

    await expect(page.getByRole('heading', { name: /All songs/ })).toContainText('· 2');
    await expect(rows(page)).toHaveText(['After hours', 'Blue pocket']);
    await expect(page.getByTestId('collection-filter')).toHaveText(['Practice 1']);
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 1');
});

test('Starred is a built-in collection: no rename, no delete, not offered to “Add to”', async ({
    page,
}) => {
    await seedStarters(page);
    await openAllSongs(page);
    await page.getByRole('button', { name: 'Star Blue pocket' }).click();
    await page.getByRole('button', { name: 'Star Minor swing sketch' }).click();
    await page.getByRole('button', { name: /^Starred/ }).click();
    // Starred shows in the order songs were starred.
    await expect(rows(page)).toHaveText(['Blue pocket', 'Minor swing sketch']);
    await expect(page.getByTestId('collection-bar')).toHaveCount(0);
    await expect(page.getByTestId('collection-rename')).toHaveCount(0);
    await expect(page.getByTestId('collection-delete')).toHaveCount(0);
    // It is not one of the user's collections either.
    await expect(page.getByTestId('collection-filter')).toHaveCount(0);
    await page
        .locator('.all-songs-table .song-row', { hasText: 'Blue pocket' })
        .getByRole('button', { name: 'More actions for Blue pocket' })
        .click();
    await page.getByTestId('row-menu-add-to-collection').click();
    await expect(page.getByTestId('row-menu-collection')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // The star survives a reload: it is stored in the collection, not in this page.
    await page.reload();
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 2');
});

test('New collection, then Rename, from the All songs page', async ({ page }) => {
    await seedStarters(page);
    await openAllSongs(page);
    await page.getByTestId('new-collection').click();
    await page.getByTestId('collection-name-input').fill('Practice');
    await page.getByTestId('collection-name-save').click();
    await expect(collectionFilter(page, 'Practice')).toHaveText('Practice 0');
    await collectionFilter(page, 'Practice').click();
    await expect(page.locator('.all-songs-empty')).toContainText('No songs in this collection yet');

    await page.getByTestId('collection-rename').click();
    await expect(page.getByTestId('collection-name-input')).toHaveValue('Practice');
    await page.getByTestId('collection-name-input').fill('Sunday practice');
    await page.getByTestId('collection-name-save').click();
    await expect(page.getByTestId('collection-bar').getByRole('heading')).toHaveText(
        'Sunday practice',
    );
    await expect(page.getByTestId('collection-filter')).toHaveText(['Sunday practice 0']);
    await noSidewaysScroll(page);
});

test('a guest’s device-local stars move into Starred on upgrade, and the old key stays', async ({
    page,
}) => {
    // Two stars written by #1440's build, before this one ever ran.
    const legacy = JSON.stringify(['starter-blues', 'starter-bossa']);
    await page.goto(appUrl('build.json'));
    await page.evaluate(
        (value) => localStorage.setItem('ensemble-v2-preview:starred', value),
        legacy,
    );
    await seedStarters(page);
    await page.getByTestId('all-songs-link').click();

    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 2');
    await page.getByRole('button', { name: /^Starred/ }).click();
    await expect(rows(page)).toHaveText(['Blue pocket', 'After hours']);
    // A copy: the old key is exactly as it was.
    expect(await page.evaluate(() => localStorage.getItem('ensemble-v2-preview:starred'))).toBe(
        legacy,
    );

    // Once: a song unstarred after the copy is not starred again by the next load.
    await page.getByRole('button', { name: 'Unstar Blue pocket' }).click();
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 1');
    // The star on screen is optimistic; reloading before its write commits would abort the write
    // and test nothing about the migration. Wait for the STORED Starred to hold one song.
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    new Promise<number>((resolve, reject) => {
                        const request = indexedDB.open('ensemble-v2-preview-collections', 1);
                        request.onerror = () => reject(request.error);
                        request.onsuccess = () => {
                            const db = request.result;
                            const read = db
                                .transaction('collections')
                                .objectStore('collections')
                                .get('collection-starred');
                            read.onsuccess = () => {
                                db.close();
                                resolve(
                                    (read.result as { songIds?: string[] } | undefined)?.songIds
                                        ?.length ?? -1,
                                );
                            };
                            read.onerror = () => reject(read.error);
                        };
                    }),
            ),
        )
        .toBe(1);
    await page.reload();
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByRole('button', { name: /^Starred/ })).toHaveText('Starred 1');
    expect(await page.evaluate(() => localStorage.getItem('ensemble-v2-preview:starred'))).toBe(
        legacy,
    );
});

/**
 * #1477 review R4: "the songs in no other collection" is decided when the delete is CONFIRMED,
 * not when its dialog opened — a song that joined another collection meanwhile (another tab, a
 * sync pass) is no longer in this one alone, and must not be deleted with it.
 */
test('“also delete” decides at confirm time, not from the count the dialog opened with', async ({
    page,
}) => {
    await seedStarters(page);
    await openAllSongs(page);
    await addToNew(page, 'Minor swing sketch', 'Friday gig');
    await collectionFilter(page, 'Friday gig').click();
    await page.getByTestId('collection-delete').click();
    await expect(page.locator('.collection-delete-also')).toHaveText(
        'Also delete the 1 song that is in no other collection',
    );

    // While the dialog is open, another tab puts the same song in a collection of its own.
    await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ensemble-v2-preview-collections', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('collections', 'readwrite');
            const now = new Date().toISOString();
            tx.objectStore('collections').put({
                kind: 'collection',
                schemaVersion: 1,
                id: 'other-tab-set',
                name: 'Other tab',
                revision: 0,
                createdAt: now,
                updatedAt: now,
                songIds: ['starter-jazz'],
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    });

    await page.getByTestId('delete-collection-also-songs').check();
    await page.getByTestId('delete-collection-confirm').click();
    await expect(page.getByTestId('shell-message')).toHaveText(
        'Collection deleted. Its songs are still in your songbook.',
    );
    // The song survived: it was in another collection by the time the delete ran.
    await expect(page.getByRole('heading', { name: /All songs/ })).toContainText('· 3');
    await expect(
        page.locator('.all-songs-table .song-name', { hasText: 'Minor swing sketch' }),
    ).toHaveCount(1);
});

/**
 * #1477 review C3: the confirm-time read may only NARROW what the dialog showed. A song that
 * arrived in the collection while the dialog was open (a sync, another tab) was never shown to
 * the musician as one the delete would take, so it is never deleted with it.
 */
test('“also delete” never deletes a song that arrived after the dialog opened', async ({
    page,
}) => {
    await seedStarters(page);
    await openAllSongs(page);
    await addToNew(page, 'Minor swing sketch', 'Friday gig');
    await collectionFilter(page, 'Friday gig').click();
    await page.getByTestId('collection-delete').click();
    await expect(page.locator('.collection-delete-also')).toHaveText(
        'Also delete the 1 song that is in no other collection',
    );

    // While the dialog is open, another tab adds Blue pocket to this same collection.
    await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ensemble-v2-preview-collections', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('collections', 'readwrite');
            const store = tx.objectStore('collections');
            const all = store.getAll();
            all.onsuccess = () => {
                const gig = all.result.find((row) => row.name === 'Friday gig');
                store.put({
                    ...gig,
                    revision: gig.revision + 1,
                    updatedAt: new Date().toISOString(),
                    songIds: [...gig.songIds, 'starter-blues'],
                });
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    });

    await page.getByTestId('delete-collection-also-songs').check();
    await page.getByTestId('delete-collection-confirm').click();
    await expect(page.getByTestId('shell-message')).toContainText(
        'Collection deleted, with 1 song',
    );
    // Only the song the dialog named went; the one that arrived meanwhile is still here.
    await expect(page.getByRole('heading', { name: /All songs/ })).toContainText('· 2');
    await expect(rows(page)).toHaveText(['After hours', 'Blue pocket']);
});
