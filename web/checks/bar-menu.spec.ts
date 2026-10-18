import type { Locator, Page, TestInfo } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import { appUrl, expect, test } from './fixtures';

/**
 * #1725 — the bar menu. The bar being typed has a ⋯ (on the bar on a laptop, with Ctrl/⌘+. from
 * its field; in the dock on a phone, where it is a sheet) holding the bar's structure: chord
 * lengths as a beat ruler, key or meter from here, repeats and endings, the fermata, and adding
 * or removing a bar. Its changes are the bar's draft, applied on leaving the bar like typing.
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

const phone = (testInfo: TestInfo) => testInfo.project.name === 'webkit-phone';

/** A real tap on the phone, a click on a laptop. */
async function press(locator: Locator, testInfo: TestInfo) {
    if (phone(testInfo)) {
        await locator.tap();
    } else {
        await locator.click();
    }
}

async function editAutumnLeaves(page: Page, testInfo: TestInfo) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: 'Autumn Leaves' });
    await press(row.getByRole('button', { name: 'Open' }), testInfo);
    await expect(page.getByRole('heading', { name: 'Autumn Leaves', exact: true })).toBeVisible();
    await press(page.getByRole('button', { name: 'Edit chart', exact: true }), testInfo);
}

function field(page: Page, bar: number): Locator {
    return page.getByLabel(`Chords in bar ${bar}`, { exact: true });
}

function menu(page: Page, bar: number): Locator {
    return page.getByRole('dialog', { name: `Bar ${bar} menu`, exact: true });
}

/** Open bar `bar`'s field, then its menu by its ⋯ (the bar's on a laptop, the dock's on a phone). */
async function openMenu(page: Page, testInfo: TestInfo, bar: number): Promise<Locator> {
    const bars = page.locator('.bar');
    await press(bars.nth(bar - 1), testInfo);
    await expect(field(page, bar)).toBeFocused();
    const trigger = phone(testInfo)
        ? page.locator('.bar-dock').getByRole('button', { name: 'Bar menu', exact: true })
        : bars.nth(bar - 1).getByRole('button', { name: 'Bar menu', exact: true });
    await press(trigger, testInfo);
    await expect(menu(page, bar)).toBeVisible();
    return menu(page, bar);
}

/** Back to the bar's field from its menu: Esc on a laptop, "Back to typing" on a phone. */
async function backToTyping(page: Page, testInfo: TestInfo, bar: number) {
    if (phone(testInfo)) {
        await menu(page, bar).getByRole('button', { name: 'Back to typing' }).tap();
    } else {
        await page.keyboard.press('Escape');
    }
    await expect(menu(page, bar)).toHaveCount(0);
    await expect(field(page, bar)).toBeFocused();
}

/** Leave the bar for the next one: Tab on a laptop, › on a phone. */
async function nextBar(page: Page, testInfo: TestInfo) {
    if (phone(testInfo)) {
        await page
            .locator('.bar-dock')
            .getByRole('button', { name: 'Next bar', exact: true })
            .tap();
    } else {
        await page.keyboard.press('Tab');
    }
}

function savedBar(document: ChartDocument, index: number) {
    if (document.schemaVersion !== 2) {
        throw new Error('expected a measure chart');
    }
    return document.chart.score.sections.flatMap((section) => section.measures)[index];
}

test('the ruler sets chord lengths the field and the saved bar agree on (#1725)', async ({
    page,
}, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    await press(page.locator('.bar').nth(6), testInfo);
    await field(page, 7).fill('Gm7 C7');
    const bar = await openMenu(page, testInfo, 7);

    // The two chords share the bar: one split, at the second of four beats.
    const split = bar.getByRole('slider', { name: 'Split between Gm7 and C7' });
    await expect(split).toHaveAttribute('aria-valuenow', '2');
    await expect(split).toHaveAttribute('aria-valuetext', 'Gm7 2 beats, C7 2 beats');

    // The arrow keys move it a beat; the bar's text says so in the form the parser reads.
    await split.focus();
    await page.keyboard.press('ArrowRight');
    await expect(split).toHaveAttribute('aria-valuenow', '3');
    await expect(field(page, 7)).toHaveValue('Gm7:3 C7:1');
    await page.keyboard.press('ArrowLeft');
    await expect(field(page, 7)).toHaveValue('Gm7 C7');

    // A drag: from the split to three quarters along the bar.
    const track = await bar.locator('.bar-ruler').boundingBox();
    const handle = await split.boundingBox();
    expect(track && handle).toBeTruthy();
    if (track && handle) {
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
        await page.mouse.down();
        await page.mouse.move(track.x + track.width * 0.6, track.y + track.height / 2, {
            steps: 4,
        });
        await page.mouse.move(track.x + track.width * 0.74, track.y + track.height / 2, {
            steps: 4,
        });
        await page.mouse.up();
    }
    await expect(split).toHaveAttribute('aria-valuenow', '3');
    await expect(field(page, 7)).toHaveValue('Gm7:3 C7:1');

    // Back to the field; typed lengths draw on the ruler too, holds as the chord held.
    await backToTyping(page, testInfo, 7);
    await field(page, 7).fill('Gm7 / C7 /');
    if (phone(testInfo)) {
        await page
            .locator('.bar-dock')
            .getByRole('button', { name: 'Bar menu', exact: true })
            .tap();
    } else {
        await page.keyboard.press('Control+.');
    }
    await expect(
        menu(page, 7).getByRole('slider', { name: 'Split between Gm7 and C7' }),
    ).toHaveAttribute('aria-valuenow', '2');
    await expect(menu(page, 7).locator('.bar-ruler-span')).toHaveCount(2);
    await menu(page, 7).getByRole('slider').focus();
    await page.keyboard.press('ArrowRight');
    await expect(field(page, 7)).toHaveValue('Gm7:3 C7:1');
    await backToTyping(page, testInfo, 7);

    // Leaving the bar applies it; Save keeps three beats and one.
    await nextBar(page, testInfo);
    await expect(field(page, 8)).toBeFocused();
    await expect(page.locator('.bar').nth(6).locator('.chord')).toHaveText(['Gm7', 'C7']);
    await press(page.getByRole('button', { name: 'Keep a copy', exact: true }), testInfo);
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    const [saved] = await documents(page);
    const content = savedBar(saved, 6).content;
    expect(content.kind === 'events' && content.events).toEqual([
        { kind: 'chord', symbol: 'Gm7', duration: [3, 1] },
        { kind: 'chord', symbol: 'C7', duration: [1, 1] },
    ]);
});

test('hold last chord, and a key change from bar 9, are the bar’s draft (#1725)', async ({
    page,
}, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    const bar = await openMenu(page, testInfo, 9);

    await press(bar.getByLabel('Hold last chord'), testInfo);
    await expect(bar.getByLabel('Hold last chord')).toBeChecked();
    await press(bar.getByText('Key or meter from here'), testInfo);
    await bar.getByLabel('Key from this bar').selectOption('D');
    await expect(bar.getByText('Key or meter from here')).toContainText('Dm · 4/4');
    // A draft, not yet the chart: bar 9 marks no change until it is left.
    await expect(page.locator('.bar').nth(8).locator('.bar-context')).toHaveCount(0);

    await backToTyping(page, testInfo, 9);
    await nextBar(page, testInfo);
    await expect(field(page, 10)).toBeFocused();
    const bars = page.locator('.bar');
    await expect(bars.nth(8).locator('.bar-context')).toContainText('Dm · 4/4');
    await expect(bars.nth(8).locator('.chord.has-fermata')).toHaveCount(1);

    await press(page.getByRole('button', { name: 'Keep a copy', exact: true }), testInfo);
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    const [saved] = await documents(page);
    const nine = savedBar(saved, 8);
    expect(nine.key).toBe('D');
    expect(nine.content.kind === 'events' && nine.content.events.at(-1)?.fermata).toBe(true);
});

test('insert bar after, and delete bar, from the menu (#1725)', async ({ page }, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    const bars = page.locator('.bar');
    await expect(bars).toHaveCount(32);

    // Insert after bar 7: a new bar 8, open for typing with its tonic selected.
    let bar = await openMenu(page, testInfo, 7);
    await press(bar.getByRole('button', { name: 'Insert bar after' }), testInfo);
    await expect(bars).toHaveCount(33);
    await expect(field(page, 8)).toBeFocused();
    await expect(field(page, 8)).toHaveValue('Gm');
    await page.keyboard.type('C7');
    await nextBar(page, testInfo);
    await expect(field(page, 9)).toBeFocused();
    await expect(bars.nth(7).locator('.chord')).toHaveText(['C7']);
    await expect(field(page, 9)).toHaveValue('Gm7');

    // Delete bar 8 again: the bar before it opens.
    await press(bars.nth(7), testInfo);
    bar = await openMenu(page, testInfo, 8);
    await press(bar.getByRole('button', { name: 'Delete bar' }), testInfo);
    await expect(bars).toHaveCount(32);
    await expect(field(page, 7)).toBeFocused();
    // Bar 7 itself is untouched, and the old bar 9 is bar 8 again.
    await expect(field(page, 7)).toHaveValue('Gm7');
    await expect(bars.nth(7).locator('.chord')).toHaveText(['Gm7']);
    await nextBar(page, testInfo);
    await expect(bars.nth(6).locator('.chord')).toHaveText(['Gm7']);
});

test('insert and delete refuse while a pending bar does not read (#1725)', async ({
    page,
}, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    const bars = page.locator('.bar');
    await press(bars.nth(2), testInfo);
    await field(page, 3).fill('D7x');
    await nextBar(page, testInfo);
    await expect(field(page, 4)).toBeFocused();

    // Both commit pending bars first, so both stop at the one that does not read and open it.
    let bar = await openMenu(page, testInfo, 4);
    await press(bar.getByRole('button', { name: 'Insert bar after' }), testInfo);
    await expect(field(page, 3)).toBeFocused();
    await expect(field(page, 3)).toHaveValue('D7x');
    await expect(bars).toHaveCount(32);

    bar = await openMenu(page, testInfo, 4);
    await press(bar.getByRole('button', { name: 'Delete bar' }), testInfo);
    await expect(field(page, 3)).toBeFocused();
    await expect(field(page, 3)).toHaveValue('D7x');
    await expect(bars).toHaveCount(32);
    await expect(bars.nth(3).locator('.chord')).toHaveText([/^E(b|♭)maj7$/]);
});

test('repeat or ending opens the Repeats and endings dialog on the bar, and Apply works (#1725)', async ({
    page,
}, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    const bars = page.locator('.bar');
    // Bar 19 is the B section's third bar: the dialog opens there, on that bar.
    await press(bars.nth(18), testInfo);
    await field(page, 19).fill('Gm7 C7');
    const menu19 = await openMenu(page, testInfo, 19);
    await press(menu19.getByRole('button', { name: 'Repeat or ending…' }), testInfo);
    const guide = page.getByRole('dialog', { name: 'Repeats and endings', exact: true });
    await expect(guide).toBeVisible();
    await expect(guide.getByLabel('Section').locator('option:checked')).toHaveText('B');
    await expect(guide.getByLabel('Repeated body start bar')).toHaveValue('2');
    await guide.getByLabel('Repeated body end bar').selectOption({ value: '3' });
    await press(guide.getByRole('button', { name: 'Apply', exact: true }), testInfo);
    await expect(guide).toHaveCount(0);
    await expect(bars.nth(18).getByLabel('Start repeat', { exact: true })).toBeVisible();
    await expect(
        bars.nth(19).getByLabel('End repeat, 2 total passes', { exact: true }),
    ).toBeVisible();
    // The bar's pending chords went in with the form, and the bar is still open for typing.
    await expect(field(page, 19)).toBeFocused();
    await expect(field(page, 19)).toHaveValue('Gm7 C7');
    await nextBar(page, testInfo);
    await expect(bars.nth(18).locator('.chord')).toHaveText(['Gm7', 'C7']);
});

test('repeat or ending, cancelled, leaves the bar open with its draft (#1725)', async ({
    page,
}, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    await press(page.locator('.bar').nth(2), testInfo);
    await field(page, 3).fill('Bbmaj7 G7');
    const bar = await openMenu(page, testInfo, 3);
    await press(bar.getByRole('button', { name: 'Repeat or ending…' }), testInfo);
    const dialog = page.getByRole('dialog', { name: 'Repeats and endings', exact: true });
    await expect(dialog).toBeVisible();
    await expect(menu(page, 3)).toHaveCount(0);

    // Closed, the bar is still open with its pending chords, and has focus again.
    await press(dialog.getByRole('button', { name: 'Cancel', exact: true }), testInfo);
    await expect(dialog).toHaveCount(0);
    await expect(field(page, 3)).toBeFocused();
    await expect(field(page, 3)).toHaveValue('Bbmaj7 G7');
});

test('on a laptop: Esc returns to the field, and a press outside leaves the bar (#1725)', async ({
    page,
}, testInfo) => {
    test.skip(phone(testInfo), 'the laptop popover');
    await editAutumnLeaves(page, testInfo);
    const bars = page.locator('.bar');
    await bars.nth(6).click();
    await field(page, 7).fill('Gm7 C7');
    await page.keyboard.press('Control+.');
    await expect(menu(page, 7)).toBeVisible();
    // The menu has focus, and the field stays open beside it.
    await expect(menu(page, 7).getByRole('slider')).toBeFocused();
    await expect(bars.nth(6)).toHaveClass(/\btyping\b/);
    await page.keyboard.press('Escape');
    await expect(menu(page, 7)).toHaveCount(0);
    await expect(field(page, 7)).toBeFocused();
    await expect(field(page, 7)).toHaveValue('Gm7 C7');

    // ⋯ opens it; a press on the song's title (outside the chart) closes it and leaves the bar,
    // applying it as any leave does.
    await bars.nth(6).getByRole('button', { name: 'Bar menu', exact: true }).click();
    await expect(menu(page, 7)).toBeVisible();
    await page.getByRole('heading', { name: 'Autumn Leaves', exact: true }).click();
    await expect(menu(page, 7)).toHaveCount(0);
    await expect(bars.nth(6)).not.toHaveClass(/\btyping\b/);
    await expect(bars.nth(6).locator('.chord')).toHaveText(['Gm7', 'C7']);
});

test('on a phone: ⋯ in the dock opens the sheet and keeps the draft (#1725)', async ({
    page,
}, testInfo) => {
    test.skip(!phone(testInfo), 'the phone dock');
    await editAutumnLeaves(page, testInfo);
    const bars = page.locator('.bar');
    await bars.nth(6).tap();
    await page.keyboard.type(' C7');
    await expect(field(page, 7)).toHaveValue('Gm7 C7');
    await page.locator('.bar-dock').getByRole('button', { name: 'Bar menu', exact: true }).tap();
    const sheet = menu(page, 7);
    await expect(sheet).toBeVisible();
    // A sheet from the screen's foot (once its slide up has settled, #1758), the bar still open
    // beneath with its draft.
    await sheet.evaluate((box) => Promise.all(box.getAnimations().map((a) => a.finished)));
    const viewport = page.viewportSize();
    const box = await sheet.boundingBox();
    if (viewport && box) {
        expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(1);
    }
    await expect(bars.nth(6)).toHaveClass(/\btyping\b/);
    await expect(field(page, 7)).toHaveValue('Gm7 C7');
    await expect(sheet.locator('.bar-ruler-span')).toHaveCount(2);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await sheet.getByRole('button', { name: 'Back to typing' }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(field(page, 7)).toBeFocused();
    await expect(field(page, 7)).toHaveValue('Gm7 C7');
});
