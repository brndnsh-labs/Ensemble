import type { Locator, Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import { appUrl, expect, test } from './fixtures';

/**
 * #1723 — typing on the chart. In Edit chart a click on a bar opens a field in it; Tab, Shift-Tab
 * and Enter move bar to bar, and leaving a bar applies its chords as an unsaved change, with no
 * apply button (the edit panel is retired, #1726). Chords that don't read stay pending on their
 * bar, and Save refuses them.
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

async function editAutumnLeaves(page: Page) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: 'Autumn Leaves' });
    await row.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: 'Autumn Leaves', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
}

function field(page: Page, bar: number): Locator {
    return page.getByLabel(`Chords in bar ${bar}`, { exact: true });
}

/** Whether the field's whole text is selected, so typing replaces it. */
async function allSelected(locator: Locator): Promise<boolean> {
    return locator.evaluate(
        (node: HTMLInputElement) =>
            node.selectionStart === 0 && node.selectionEnd === node.value.length,
    );
}

/** The chord symbols bar `index` (0-based) of the first saved document holds. */
function savedSymbols(document: ChartDocument, index: number): string[] {
    if (document.schemaVersion !== 2) {
        throw new Error('expected a measure chart');
    }
    const measure = document.chart.score.sections.flatMap((section) => section.measures)[index];
    if (measure.content.kind !== 'events') {
        throw new Error('expected chord events');
    }
    return measure.content.events.map((event) => (event.kind === 'chord' ? event.symbol : '?'));
}

test('typing in bars applies each one on leaving it, and Save keeps them (#1723)', async ({
    page,
}) => {
    await editAutumnLeaves(page);
    const bars = page.locator('.bar');

    // A click on bar 6 opens its field, caret at the end of its chords.
    await bars.nth(5).click();
    await expect(field(page, 6)).toBeFocused();
    await expect(field(page, 6)).toHaveValue('D7');
    await expect(bars.nth(5)).toHaveClass(/\btyping\b/);
    // The open field never widens the page, a phone's included.
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.keyboard.type('b9');
    await expect(field(page, 6)).toHaveValue('D7b9');

    // Tab: bar 7, its chords selected, so typing replaces them. Space types a space, it does
    // not start the band.
    await page.keyboard.press('Tab');
    await expect(field(page, 7)).toBeFocused();
    await expect(field(page, 7)).toHaveValue('Gm7');
    expect(await allSelected(field(page, 7))).toBe(true);
    await page.keyboard.type('Gm7 C7');
    await expect(field(page, 7)).toHaveValue('Gm7 C7');
    // (Attached, not visible: on a phone the transport row folds away while a bar is typed, #1724.)
    await expect(
        page.getByRole('button', { name: 'Start playback', exact: true, includeHidden: true }),
    ).toBeAttached();

    // Leaving bar 6 applied it already; Enter leaves bar 7 for bar 8.
    await expect(bars.nth(5).locator('.chord')).toHaveText([/^D7(b|♭)9$/]);
    await page.keyboard.press('Enter');
    await expect(field(page, 8)).toBeFocused();
    await expect(bars.nth(6).locator('.chord')).toHaveCount(2);
    await expect(bars.nth(6).locator('.chord').nth(1)).toHaveText('C7');

    // No apply button was needed: nothing is pending (bar 6 was applied on leaving), and the
    // header says the chart is unsaved, not that chord text is waiting.
    await expect(page.locator('.song-subtitle')).not.toContainText('Unsaved chord text');
    await expect(page.locator('.song-subtitle .unsaved')).toBeVisible();
    await expect(bars.nth(5)).toHaveClass(/\bedited\b/);

    // Save writes both bars.
    expect(await documents(page)).toEqual([]);
    await page.getByRole('button', { name: 'Keep a copy', exact: true }).click();
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    const saved = await documents(page);
    expect(saved).toHaveLength(1);
    expect(savedSymbols(saved[0], 5)).toEqual(['D7b9']);
    expect(savedSymbols(saved[0], 6)).toEqual(['Gm7', 'C7']);
});

test('chords that do not read stay on their bar, and Save refuses them and lands there (#1723)', async ({
    page,
}) => {
    await editAutumnLeaves(page);
    const bars = page.locator('.bar');

    await bars.nth(2).click();
    await field(page, 3).fill('D7x');
    await expect(bars.nth(2)).toHaveClass(/\bunreadable\b/);
    await expect(bars.nth(2).locator('.bar-problem')).toHaveText('Can’t read “D7x”, try D7');

    // Leaving is still allowed; the bar keeps the text and its tint, the chart its old chord.
    await page.keyboard.press('Tab');
    await expect(field(page, 4)).toBeFocused();
    await expect(bars.nth(2)).toHaveClass(/\bunreadable\b/);
    await expect(bars.nth(2).locator('.chord')).toHaveText([/^B(b|♭)/]);
    await expect(page.locator('.song-subtitle')).toContainText('Unsaved chord text');

    // Save refuses, and opens the bar that needs fixing.
    await page.getByRole('button', { name: 'Keep a copy', exact: true }).click();
    await expect(field(page, 3)).toBeFocused();
    await expect(field(page, 3)).toHaveValue('D7x');
    expect(await documents(page)).toEqual([]);

    // Fixed, it applies on leaving, and Save goes through.
    await field(page, 3).fill('D7');
    await page.keyboard.press('Tab');
    await expect(bars.nth(2)).not.toHaveClass(/\bunreadable\b/);
    await expect(bars.nth(2).locator('.chord')).toHaveText(['D7']);
    await page.getByRole('button', { name: 'Keep a copy', exact: true }).click();
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    expect(savedSymbols((await documents(page))[0], 2)).toEqual(['D7']);
});

test('Esc puts the bar back and closes its field; Shift-Tab goes back across sections (#1723)', async ({
    page,
}) => {
    await editAutumnLeaves(page);
    const bars = page.locator('.bar');

    // Esc after typing: the bar's chords as last applied, the field closed, the bar selected.
    await bars.nth(1).click();
    await expect(field(page, 2)).toHaveValue('F7');
    await page.keyboard.type('x');
    await expect(bars.nth(1)).toHaveClass(/\bunreadable\b/);
    await page.keyboard.press('Escape');
    await expect(field(page, 2)).toHaveCount(0);
    await expect(bars.nth(1)).toHaveClass(/\bselected\b/);
    await expect(bars.nth(1)).not.toHaveClass(/\bunreadable\b/);
    await expect(bars.nth(1).locator('.chord')).toHaveText(['F7']);
    await expect(page.getByRole('button', { name: 'Edit bar 2', exact: true })).toBeFocused();
    // Nothing is left pending: the header holds no "Unsaved chord text".
    await expect(page.locator('.song-subtitle')).not.toContainText('Unsaved chord text');

    // The bar number opens the field from the keyboard.
    await page.keyboard.press('Enter');
    await expect(field(page, 2)).toBeFocused();
    await page.keyboard.press('Escape');

    // Shift-Tab from the first bar of the second A goes back to the last bar of the first.
    await bars.nth(8).click();
    await expect(field(page, 9)).toHaveValue('Cm7');
    await page.keyboard.press('Shift+Tab');
    await expect(field(page, 8)).toBeFocused();
    await expect(field(page, 8)).toHaveValue('Gm7');
    expect(await allSelected(field(page, 8))).toBe(true);

    // Back at the first bar.
    await bars.nth(0).click();
    await expect(field(page, 1)).toBeFocused();
    // At the first bar there is nowhere further back: the field closes and Shift-Tab is the
    // page's again, so the keyboard is never held in the chart (review P2).
    await page.keyboard.press('Shift+Tab');
    await expect(field(page, 1)).toHaveCount(0);
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['Cm7']);
});

test('Save straight from an open field keeps what was typed, and a tap opens a bar (#1723 review)', async ({
    page,
}, testInfo) => {
    await editAutumnLeaves(page);
    const bars = page.locator('.bar');
    // A real touch on the phone, a click on the laptop.
    if (testInfo.project.name === 'webkit-phone') {
        await bars.nth(1).tap();
    } else {
        await bars.nth(1).click();
    }
    await expect(field(page, 2)).toBeFocused();
    await page.keyboard.type('alt');
    await expect(field(page, 2)).toHaveValue('F7alt');
    // Save without leaving the bar: the field's own text must still be what is kept.
    await page.getByRole('button', { name: 'Keep a copy', exact: true }).click();
    await expect.poll(async () => (await documents(page)).length).toBe(1);
    expect(savedSymbols((await documents(page))[0], 1)).toEqual(['F7alt']);
});

test('Tab past the last bar closes the field and hands focus back to the page (#1723 review)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard');
    await editAutumnLeaves(page);
    await page.locator('.bar').last().click();
    await expect(field(page, 32)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(field(page, 32)).toHaveCount(0);
});
