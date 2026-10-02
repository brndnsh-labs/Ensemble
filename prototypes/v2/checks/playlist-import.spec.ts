import type { Locator, Page } from '@playwright/test';
import { expect, seedStarters, test } from './fixtures';

/**
 * A whole iReal playlist imported as a collection (#1478) — the guest songbook, on both projects.
 * Against the three `seedStarters` songs ('Blue pocket', 'Minor swing sketch', 'After hours'), so
 * a playlist song titled 'Blue pocket' (no composer, like the starter) is a duplicate.
 *
 * The account half — one transaction, the cap, a drain across a reopened database — is
 * `tests/browser/account-playlist-import.browser.test.ts`; the summary's rules are
 * `lib/playlist-import.test.ts`.
 */

/** An open-protocol (irealbook) playlist: six fields a song, then the playlist's name. */
function playlist(name: string, songs: Array<[title: string, composer: string, body: string]>) {
    const fields = songs.flatMap(([title, composer, body]) => [
        title,
        composer,
        'Medium Swing',
        'C',
        'n',
        body,
    ]);
    return `irealbook://${encodeURIComponent([...fields, name].join('='))}`;
}

const FRIDAY = playlist('Friday set', [
    ['Second line', 'Ensemble', 'T44[C   |F7   |C   |G7   Z'],
    ['Broken study', 'Ensemble', 'T44[C   |Cnotachord   |G7   Z'],
    ['Blue pocket', '', 'T44[F7   |Bb7   |F7   |C7   Z'],
    ['Night walk', 'Ensemble', 'T44[A-7   |D7   |G^7   |G^7   Z'],
]);

const rows = (page: Page) => page.locator('.all-songs-table .song-name');

/** Nothing on the page, nor inside the modal dialog, may scroll sideways (iPhone 13 width too). */
async function noSidewaysScroll(page: Page, dialog: Locator): Promise<void> {
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
    ).toBe(true);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
    );
}

/** How many songs the guest songbook holds, read straight from its store. */
function guestSongCount(page: Page): Promise<number> {
    return page.evaluate(
        () =>
            new Promise<number>((resolve, reject) => {
                const request = indexedDB.open('ensemble-v2-preview', 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const db = request.result;
                    const counted = db.transaction('documents').objectStore('documents').count();
                    counted.onsuccess = () => {
                        db.close();
                        resolve(counted.result);
                    };
                    counted.onerror = () => reject(counted.error);
                };
            }),
    );
}

async function reviewLink(page: Page, source: string) {
    await page.getByRole('button', { name: 'Import chart', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Review import' });
    await dialog.getByText('Or paste an iReal link', { exact: true }).click();
    await dialog.getByLabel('iReal link', { exact: true }).fill(source);
    await dialog.getByRole('button', { name: 'Review link', exact: true }).click();
    return dialog;
}

test('a playlist imports as a collection named after it, holding its playable songs in order', async ({
    page,
}) => {
    await seedStarters(page);
    const dialog = await reviewLink(page, FRIDAY);

    // The summary, before anything is written.
    const summary = dialog.getByTestId('playlist-summary');
    await expect(summary).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /Import all 4 as a collection/ })).toBeChecked();
    await expect(dialog.getByTestId('playlist-collection-name')).toHaveValue('Friday set');
    await expect(dialog.getByTestId('playlist-counts')).toHaveText(
        '2 songs to import, as the new collection “Friday set”.',
    );
    await expect(dialog.getByTestId('playlist-duplicates')).toContainText(
        '1 song matches a song already in your songbook',
    );
    await expect(
        dialog.getByRole('checkbox', { name: 'Import duplicates anyway' }),
    ).not.toBeChecked();
    // Each skipped duplicate names the song it matched (#1478 review R6).
    const duplicates = dialog.getByTestId('playlist-duplicate-list');
    await duplicates.locator('summary').click();
    await expect(duplicates).toContainText(
        'Blue pocket matches “Blue pocket” (no composer), already in your songbook.',
    );
    const refused = dialog.getByTestId('playlist-refused');
    await expect(refused).toContainText('1 song can’t be imported yet');
    await refused.locator('summary').click();
    await expect(refused).toContainText('Broken study');
    // A guest songbook has no cap to state.
    await expect(dialog.getByTestId('playlist-cap')).toHaveCount(0);
    await noSidewaysScroll(page, dialog);

    await dialog.getByTestId('playlist-import').click();
    await expect(dialog).not.toBeVisible();
    // Focus lands on the page the import opened, not on the closed dialog's opener.
    await expect(page.getByRole('heading', { name: /All songs/ })).toBeFocused();

    // The All songs page opens on the new collection, in the playlist's order: the duplicate is
    // the starter the songbook already held, in its playlist position; the refused song is absent.
    await expect(page.getByTestId('shell-message')).toContainText(
        'Imported 2 songs into “Friday set”.',
    );
    await expect(page.getByRole('heading', { name: /All songs/ })).toContainText('· 5');
    await expect(
        page.getByTestId('collection-filter').filter({ hasText: 'Friday set' }),
    ).toHaveText('Friday set 3');
    await expect(page.getByTestId('collection-bar').getByRole('heading')).toHaveText('Friday set');
    await expect(rows(page)).toHaveText(['Second line', 'Blue pocket', 'Night walk']);

    // It survives a reload, and an imported song plays.
    await page.reload();
    await page.getByTestId('all-songs-link').click();
    await page.getByTestId('collection-filter').filter({ hasText: 'Friday set' }).click();
    await expect(rows(page)).toHaveText(['Second line', 'Blue pocket', 'Night walk']);
    await page
        .locator('.all-songs-table .song-row', { hasText: 'Night walk' })
        .locator('.song-name')
        .click();
    await expect(page.locator('.song-title')).toHaveText('Night walk');
    await expect(page.locator('.bar')).toHaveCount(4);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.locator('.chord[aria-current="true"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('duplicates import anyway with the checkbox, and a re-import adds to the same collection', async ({
    page,
}) => {
    await seedStarters(page);
    const dialog = await reviewLink(page, FRIDAY);
    await dialog.getByRole('checkbox', { name: 'Import duplicates anyway' }).check();
    await expect(dialog.getByTestId('playlist-counts')).toHaveText(
        '3 songs to import, as the new collection “Friday set”.',
    );
    await dialog.getByTestId('playlist-import').click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('heading', { name: /All songs/ })).toContainText('· 6');
    await expect(rows(page)).toHaveText(['Second line', 'Blue pocket', 'Night walk']);

    // The same playlist again: every song is now a duplicate, and the collection exists — so
    // there is nothing new, and no second "Friday set" is made.
    await page.getByRole('button', { name: '← Home', exact: true }).click();
    const again = await reviewLink(page, FRIDAY);
    await expect(again.getByTestId('playlist-counts')).toHaveText(
        'No new songs to import, added to your collection “Friday set”, which already exists.',
    );
    await expect(again.getByTestId('playlist-import')).toBeDisabled();
    await expect(again.getByTestId('playlist-import')).toHaveText('Nothing new to import');
    await again.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByTestId('collection-filter')).toHaveText(['Friday set 3']);
});

test('reading a long playlist can be cancelled, and cancelling writes nothing (review R5)', async ({
    page,
}) => {
    await seedStarters(page);
    // 2,000 tunes of 16 bars: seconds of reading and checking, sliced, with progress shown.
    const long = playlist(
        'Long',
        Array.from({ length: 2_000 }, (_, index): [string, string, string] => [
            `Long tune ${index + 1}`,
            'Ensemble',
            `T44[${'C   |F7   |'.repeat(7)}C   |G7   Z`,
        ]),
    );
    const dialog = await reviewLink(page, long);
    const progress = dialog.getByTestId('import-progress');
    await expect(progress).toBeVisible();
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await expect(cancel).toBeEnabled();
    await cancel.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Import chart', exact: true })).toBeFocused();
    expect(await guestSongCount(page)).toBe(3);

    // Escape cancels a read too, and the dialog opens fresh afterwards.
    const again = await reviewLink(page, long);
    await expect(again.getByTestId('import-progress')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(again).not.toBeVisible();
    await page.getByRole('button', { name: 'Import chart', exact: true }).click();
    await expect(page.getByTestId('playlist-summary')).toHaveCount(0);
    await expect(page.getByTestId('import-progress')).toHaveCount(0);
    expect(await guestSongCount(page)).toBe(3);
});

test('a retry after the collection failed to save never imports the songs twice (review R8)', async ({
    page,
}) => {
    await seedStarters(page);
    const dialog = await reviewLink(page, FRIDAY);
    await expect(dialog.getByTestId('playlist-counts')).toHaveText(
        '2 songs to import, as the new collection “Friday set”.',
    );
    // Make the guest collection store impossible to open at the version the app asks for: the songs land
    // (a database of their own) and the collection write fails.
    await page.evaluate(
        () =>
            new Promise<void>((resolve, reject) => {
                const request = indexedDB.open('ensemble-v2-preview-collections', 2);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    request.result.close();
                    resolve();
                };
            }),
    );
    // Every full read of the guest songbook from here on answers late, so the race this guards
    // is not left to timing: an error shown before the re-read lands is a stale summary.
    await page.evaluate(() => {
        const getAll = IDBObjectStore.prototype.getAll;
        IDBObjectStore.prototype.getAll = function (
            this: IDBObjectStore,
            ...args: Parameters<IDBObjectStore['getAll']>
        ) {
            const request = getAll.apply(this, args);
            if (this.name === 'documents') {
                Object.defineProperty(request, 'onsuccess', {
                    set(handler: (event: Event) => void) {
                        request.addEventListener('success', (event) =>
                            setTimeout(() => handler.call(request, event), 1_000),
                        );
                    },
                });
            }
            return request;
        };
    });
    await dialog.getByTestId('playlist-import').click();
    await expect(
        dialog.getByRole('alert').filter({ hasText: 'The songs were imported' }),
    ).toBeVisible();
    expect(await guestSongCount(page)).toBe(5);
    // Storage comes back, and the musician retries AT ONCE: the summary must already know the two
    // songs are in the songbook, so the retry makes the collection and imports nothing again.
    await page.evaluate(
        () =>
            new Promise<void>((resolve) => {
                const request = indexedDB.deleteDatabase('ensemble-v2-preview-collections');
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
            }),
    );
    await dialog.getByTestId('playlist-import').click();
    await expect(dialog).not.toBeVisible();
    expect(await guestSongCount(page)).toBe(5);
    await expect(rows(page)).toHaveText(['Second line', 'Blue pocket', 'Night walk']);
});

test('one song can still be picked from a playlist', async ({ page }) => {
    await seedStarters(page);
    const dialog = await reviewLink(page, FRIDAY);
    await dialog.getByRole('radio', { name: /Choose one song/ }).check();
    await expect(dialog.getByTestId('playlist-summary')).toHaveCount(0);
    await dialog.getByLabel('Song to import').selectOption({ label: 'Night walk' });
    await dialog.getByRole('button', { name: 'Add to songbook', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.song-title')).toHaveText('Night walk');
    await expect(page.locator('.bar')).toHaveCount(4);
});
