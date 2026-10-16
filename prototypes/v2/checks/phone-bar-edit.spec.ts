import type { Locator, Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import { appUrl, expect, test } from './fixtures';

/**
 * #1724 — typing a bar on a phone. A bar is too narrow to type in, so at phone width its chords go
 * in one field docked on the on-screen keyboard: ‹ › move bar to bar as Shift-Tab and Tab do, a
 * row of chord-ending keys saves the keyboard's other layers, a root capitalises itself, and Done
 * closes it. Playwright's WebKit raises no on-screen keyboard (`visualViewport` never shrinks),
 * so these check the dock's place against the screen's foot, not against a keyboard.
 */

test.skip(({ isMobile }) => !isMobile, 'the phone layout');

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
    await row.getByRole('button', { name: 'Open' }).tap();
    await expect(page.getByRole('heading', { name: 'Autumn Leaves', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).tap();
}

function dock(page: Page): Locator {
    return page.locator('.bar-dock');
}

function field(page: Page, bar: number): Locator {
    return page.getByLabel(`Chords in bar ${bar}`, { exact: true });
}

function key(page: Page, name: string): Locator {
    return dock(page).getByRole('button', { name, exact: true });
}

async function allSelected(locator: Locator): Promise<boolean> {
    return locator.evaluate(
        (node: HTMLInputElement) =>
            node.selectionStart === 0 && node.selectionEnd === node.value.length,
    );
}

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

test('the test edit by taps: a bar, an ending key, ›, Done, and Save (#1724)', async ({ page }) => {
    await editAutumnLeaves(page);
    const bars = page.locator('.bar');

    await bars.nth(5).tap();
    await expect(field(page, 6)).toBeFocused();
    await expect(field(page, 6)).toHaveValue('D7');
    await expect(dock(page)).toContainText('Bar 6');
    // One field: the bar itself holds none, but shows the text and the typing ring.
    await expect(page.locator('.bar-input')).toHaveCount(0);
    await expect(bars.nth(5)).toHaveClass(/\btyping\b/);
    await expect(bars.nth(5).locator('.bar-draft')).toHaveText('D7');

    // The dock sits at the screen's foot, the bar being typed above it, and the transport row
    // and the edit panel have folded away for the chart.
    const viewport = page.viewportSize();
    const docked = await dock(page).boundingBox();
    expect(viewport && docked).toBeTruthy();
    if (viewport && docked) {
        expect(Math.abs(docked.y + docked.height - viewport.height)).toBeLessThanOrEqual(1);
        const bar = await bars.nth(5).boundingBox();
        expect(bar && bar.y + bar.height <= docked.y).toBe(true);
    }
    await expect(page.locator('.transport-bar')).toBeHidden();
    await expect(page.locator('.edit-panel')).toBeHidden();
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    // ♭9 adds to the chord, and the field keeps focus (and so the keyboard).
    await key(page, '♭9').tap();
    await expect(field(page, 6)).toHaveValue('D7b9');
    await expect(field(page, 6)).toBeFocused();
    await expect(bars.nth(5).locator('.bar-draft')).toHaveText('D7b9');

    // ›: bar 6 applied, bar 7's chords selected so typing replaces them.
    await key(page, 'Next bar').tap();
    await expect(field(page, 7)).toBeFocused();
    await expect(field(page, 7)).toHaveValue('Gm7');
    expect(await allSelected(field(page, 7))).toBe(true);
    await expect(dock(page)).toContainText('Bar 7');
    await expect(bars.nth(5).locator('.chord')).toHaveText([/^D7(b|♭)9$/]);
    await page.keyboard.type('Gm7 C7');
    await expect(field(page, 7)).toHaveValue('Gm7 C7');

    // Done: bar 7 applied, the dock gone, the transport and panel back.
    await key(page, 'Done').tap();
    await expect(dock(page)).toHaveCount(0);
    await expect(page.locator('.transport-bar')).toBeVisible();
    await expect(page.locator('.edit-panel')).toBeVisible();
    await expect(bars.nth(6).locator('.chord')).toHaveText(['Gm7', 'C7']);
    await expect(bars.nth(5).locator('.chord')).toHaveText([/^D7(b|♭)9$/]);
    await expect(page.locator('.song-subtitle .unsaved')).toBeVisible();

    expect(await documents(page)).toEqual([]);
    await page.getByRole('button', { name: 'Keep a copy', exact: true }).tap();
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    const saved = await documents(page);
    expect(saved).toHaveLength(1);
    expect(savedSymbols(saved[0], 5)).toEqual(['D7b9']);
    expect(savedSymbols(saved[0], 6)).toEqual(['Gm7', 'C7']);
});

test('‹ goes back, a root capitalises itself, and every key keeps the field (#1724)', async ({
    page,
}) => {
    await editAutumnLeaves(page);
    const bars = page.locator('.bar');

    await bars.nth(2).tap();
    await expect(field(page, 3)).toHaveValue(/^B(b|♭)maj7$/);
    await key(page, 'Previous bar').tap();
    await expect(field(page, 2)).toBeFocused();
    await expect(field(page, 2)).toHaveValue('F7');
    expect(await allSelected(field(page, 2))).toBe(true);

    // Typed over the selection, lowercase: the root comes out a capital, the rest as typed. A
    // slash bass is a root too; a flat's `b` after its letter is not.
    await page.keyboard.type('c7');
    await expect(field(page, 2)).toHaveValue('C7');
    await page.keyboard.type(' bb/d');
    await expect(field(page, 2)).toHaveValue('C7 Bb/D');

    // Every ending key, and the hold, leaves the field focused. With the whole bar selected an
    // ending goes on the end; `/` holds a beat, spaced as its own word.
    await field(page, 2).fill('G');
    await key(page, 'm7').tap();
    await expect(field(page, 2)).toHaveValue('Gm7');
    await key(page, 'Hold a beat').tap();
    await expect(field(page, 2)).toHaveValue('Gm7 /');
    await expect(field(page, 2)).toBeFocused();
    await field(page, 2).fill('D7');
    await field(page, 2).evaluate((node: HTMLInputElement) => node.select());
    await key(page, '♭9').tap();
    await expect(field(page, 2)).toHaveValue('D7b9');
    // Nor does the hold wipe a selected bar: it is added after the chords (#1724 review).
    await field(page, 2).evaluate((node: HTMLInputElement) => node.select());
    await key(page, 'Hold a beat').tap();
    await expect(field(page, 2)).toHaveValue('D7b9 /');
    for (const name of ['7', 'maj7', 'm7♭5', '9', '13', '♯11', 'dim7', '6', 'alt']) {
        await key(page, name).tap();
        await expect(field(page, 2)).toBeFocused();
    }

    // At the first bar there is nowhere to go back to.
    await bars.nth(0).tap();
    await expect(field(page, 1)).toBeFocused();
    await expect(key(page, 'Previous bar')).toHaveAttribute('aria-disabled', 'true');
    // Forced: Playwright holds back from a control marked disabled. A press on it does nothing,
    // and takes nothing from the field.
    await key(page, 'Previous bar').tap({ force: true });
    await expect(field(page, 1)).toBeFocused();
});

test('a key tapped by mistake and taken back leaves the bar as it was (#1724 review)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-phone', 'the phone dock');
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    await page
        .locator('.standards-table .song-row', { hasText: 'Autumn Leaves' })
        .getByRole('button', { name: 'Open' })
        .click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    const bars = page.locator('.bar');
    await bars.nth(5).tap();
    await expect(field(page, 6)).toHaveValue('D7');
    // A key, then Backspace: the field and the bar's draft must agree. Writing around React's
    // value tracker once dropped the Backspace, keeping "D79" while the field read "D7".
    await key(page, '9').tap();
    await expect(field(page, 6)).toHaveValue('D79');
    await page.keyboard.press('Backspace');
    await expect(field(page, 6)).toHaveValue('D7');
    await key(page, 'Next bar').tap();
    await expect(field(page, 7)).toBeFocused();
    await expect(bars.nth(5)).not.toHaveClass(/\bunreadable\b/);
    await expect(bars.nth(5).locator('.chord')).toHaveText(['D7']);
});
