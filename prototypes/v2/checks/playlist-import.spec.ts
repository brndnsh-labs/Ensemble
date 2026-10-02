import type { Page } from '@playwright/test';
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
    const refused = dialog.getByTestId('playlist-refused');
    await expect(refused).toContainText('1 song can’t be imported yet');
    await refused.locator('summary').click();
    await expect(refused).toContainText('Broken study');
    // A guest songbook has no cap to state.
    await expect(dialog.getByTestId('playlist-cap')).toHaveCount(0);

    await dialog.getByTestId('playlist-import').click();
    await expect(dialog).not.toBeVisible();

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
