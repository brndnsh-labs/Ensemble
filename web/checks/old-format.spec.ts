import type { Page } from '@playwright/test';
import { encodeChartLink } from '../../core/songbook/chart-link';
import type { ChartDocumentV2 } from '../../core/songbook/score-types';
import { OLD_FORMAT_REFUSAL } from '../lib/documents';
import { bandForGenre } from '../lib/standards';
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
 * The text chart (schemaVersion 1) is retired (#1739, #1740): no reader for it is left. One
 * arriving anyway — an old file, an old link — is refused in plain words, and nothing is written;
 * one still sitting in a songbook is left out, never a crash.
 */

/** A text chart as v1 wrote one. */
function textChart() {
    const stamp = '2026-09-01T12:00:00.000Z';
    return {
        schemaVersion: 1,
        id: 'old-text-chart',
        title: 'Old text chart',
        createdAt: stamp,
        updatedAt: stamp,
        revision: 1,
        chart: {
            arrangement: {
                key: 'C',
                isMinor: false,
                timeSignature: '4/4',
                grouping: null,
                notation: 'name',
                sections: [{ id: 'a', label: 'A', value: 'C | F | G7 | C', repeat: 1 }],
            },
            performance: { bpm: 120, seed: '', randomizeSeed: false },
            band: bandForGenre('Blues'),
        },
    };
}

/** Every row in the guest songbook, as stored. */
function stored(page: Page): Promise<unknown[]> {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ensemble-v2-preview', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise<unknown[]>((resolve, reject) => {
                const request = db.transaction('documents').objectStore('documents').getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } finally {
            db.close();
        }
    });
}

test('an old text-chart file is refused in plain words, and nothing is imported', async ({
    page,
}) => {
    await seedStarters(page);
    await expect(page.locator('main.home')).toBeVisible();
    const before = await stored(page);
    await page.getByLabel('Import Ensemble document').setInputFiles({
        name: 'old.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(textChart())),
    });
    await expect(page.locator('.error-banner[role="alert"]')).toContainText(OLD_FORMAT_REFUSAL);
    await expect(page.locator('main.home')).toBeVisible();
    expect(await stored(page)).toEqual(before);
});

test('an old text-chart link is refused in plain words, not opened', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(appUrl(await encodeChartLink(textChart() as unknown as ChartDocumentV2)));
    await expect(page.locator('.error-banner[role="alert"]')).toContainText(OLD_FORMAT_REFUSAL);
    await expect(page.locator('main.home')).toBeVisible();
    expect(await stored(page)).toEqual([]);
    expect(errors).toEqual([]);
});

test('a text chart left in the songbook is left out of it, and the rest still opens', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await seedGuestDocuments(page, [...starterDocuments(), textChart()]);
    await expect(page.locator('.home-table .song-row')).toHaveCount(3);
    // The one read of everything lists the rest rather than refusing the songbook over it.
    await page.getByTestId('all-songs-link').click();
    await expect(page.locator('.all-songs-table .song-row')).toHaveCount(3);
    await expect(page.getByTestId('library-failure')).toHaveCount(0);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(page.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();
    // Left exactly where it is.
    expect(await stored(page)).toContainEqual(textChart());
    expect(errors).toEqual([]);
});
