import type { Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import { appUrl, expect, test } from './fixtures';

/**
 * The read-only standards catalog (#1439): a fresh device's guest songbook is genuinely empty
 * now that `lib/starters.ts` no longer auto-seeds it, and the catalog (`lib/standards.ts`) is
 * what fills the "good place to start" role instead — never written to storage until Save.
 */

async function documents(page: Page): Promise<ChartDocument[]> {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ensemble-v2-preview', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise<ChartDocument[]>((resolve, reject) => {
                const request = db.transaction('documents').objectStore('documents').getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } finally {
            db.close();
        }
    });
}

test('a fresh device has zero saved songs and all 28 standards in the catalog', async ({
    page,
}) => {
    await page.goto(appUrl());
    await expect(page.getByRole('heading', { name: 'Let’s play something.' })).toBeVisible();
    // Nothing seeded: the library table has no rows, and the catalog fills the featured card
    // instead ("A good place to start" — never "Pick up where you left off", which only a real
    // last-opened song earns).
    await expect(page.locator('.song-table .song-row')).toHaveCount(0);
    await expect(page.locator('.continue-card')).toContainText('A good place to start');
    expect(await documents(page)).toEqual([]);

    await page.getByRole('button', { name: 'Browse standards' }).click();
    await expect(page.getByRole('heading', { name: 'Standards.' })).toBeVisible();
    await expect(page.locator('.standards-table .song-row')).toHaveCount(28);

    // Shelf chips filter the list; "All" always accounts for the other three. Toggle buttons
    // (`aria-pressed`), not tabs — there is no tabpanel here, just a filtered table.
    const blues = page.getByRole('button', { name: 'Blues', exact: true });
    const jazz = page.getByRole('button', { name: 'Jazz standards', exact: true });
    const grooves = page.getByRole('button', { name: 'Grooves', exact: true });
    await blues.click();
    await expect(blues).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.standards-table .song-row')).toHaveCount(4);
    await jazz.click();
    await expect(page.locator('.standards-table .song-row')).toHaveCount(11);
    await grooves.click();
    await expect(page.locator('.standards-table .song-row')).toHaveCount(13);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('.standards-table .song-row')).toHaveCount(28);

    // Nothing about browsing ever touches storage.
    expect(await documents(page)).toEqual([]);
});

test('opening a standard lands an unsaved draft that plays and changes key/feel; Save mints a fresh copy, the catalog untouched', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse standards' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: '12-Bar Blues' });
    await expect(row).toContainText('Blues');
    await expect(row).toContainText('100');
    await row.getByRole('button', { name: 'Open' }).click();

    await expect(page.getByRole('heading', { name: '12-Bar Blues', exact: true })).toBeVisible();
    await expect(page.locator('.playback-footer [role="status"]')).toContainText(
        'Opened a standard · not saved yet',
    );
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['C7']);
    expect(await documents(page)).toEqual([]);

    // Key and feel change like any chart, on the unsaved draft.
    await page.getByLabel('Key', { exact: true }).selectOption('D');
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['D7']);
    await page.getByLabel('Feel', { exact: true }).selectOption('Jazz');
    await expect(page.getByLabel('Feel', { exact: true })).toHaveValue('Jazz');

    // It plays.
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop playback' }).click();

    expect(await documents(page)).toEqual([]);

    // Save mints a fresh copy; the catalog entry itself is never stored.
    const keepACopy = page.getByRole('button', { name: 'Keep a copy', exact: true });
    await expect(keepACopy).toBeEnabled();
    await keepACopy.click();
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    const saved = await documents(page);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).not.toBe('standard-12-bar-blues');
    expect(saved[0].title).toBe('12-Bar Blues');

    // The catalog itself is unaffected: opening it again still lands a fresh, unsaved draft.
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.locator('.song-table .song-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Browse standards' }).click();
    await expect(page.locator('.standards-table .song-row')).toHaveCount(28);
});

/**
 * A shared draft — a standard here, a `#chart=`/v1 link in `share-link.spec.ts` /
 * `v1-share-link.spec.ts` — belongs to no songbook yet (`landDraftOnStand`'s own doc comment:
 * "no recovery-storage write"). `draft()` used to write one anyway on every edit, keyed under
 * the standard's own catalog id (`ensemble-v2-preview:recovery:<writer>:standard-…`) — a slot
 * nothing but a Save, which this never is, ever clears, so "Preserved drafts (N)" grew by one per
 * edited-but-unsaved visit.
 */
test('editing an open standard writes nothing to recovery storage', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse standards' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: '12-Bar Blues' });
    await row.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: '12-Bar Blues', exact: true })).toBeVisible();

    // Every one of these routes through `draft()`.
    await page.getByLabel('Key', { exact: true }).selectOption('D');
    await page.getByLabel('Tempo', { exact: true }).fill('140');
    await page.getByLabel('Tempo', { exact: true }).press('Enter');
    await page.getByLabel('Feel', { exact: true }).selectOption('Jazz');

    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    Object.keys(localStorage).filter((key) =>
                        key.startsWith('ensemble-v2-preview:recovery:'),
                    ).length,
            ),
        )
        .toBe(0);

    await page.getByRole('button', { name: 'Song actions' }).click();
    await expect(page.getByText(/Preserved drafts \(/)).toHaveCount(0);
});
