import type { Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import {
    appUrl,
    editorRevealed,
    expect,
    formLength,
    type PointerRecorder,
    pickFormLength,
    recordPointer,
    songLink,
    test,
} from './fixtures';

/**
 * #1475: a chart that counts its choruses plays that many and stops; "Repeats continuously" (the
 * default, option value `loop`) plays on. Observed through the chart's own pointer — every time its
 * first chord becomes current is one more pass of the form — and the transport's Play/Stop button,
 * never by sampling the clock, so a slow CI WebKit only takes longer.
 */

/** How many passes of the form have started: the new song's form opens on its only C. */
const passes = async (pointer: PointerRecorder) =>
    (await pointer.chordNames()).filter((name) => name === 'C').length;

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

const footerButton = (page: Page) => page.locator('.chart-bottom').getByRole('button');
const formMenu = (page: Page) => page.getByRole('menu', { name: 'How many times the form plays' });

test('a chart set to 2 choruses plays two and stops; Loop plays on; the count saves (#1475)', async ({
    page,
}) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const pointer = await recordPointer(page);
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Two choruses');
    // The new song's four bars (C, G, Am, F) are the form: short, so a pass is quick. The count
    // is the chart footer's form-length menu (#1511), its one home since #1756.
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    expect(await formLength(page)).toBe('Repeats continuously');
    await pickFormLength(page, 'Plays 2 times');
    await expect(footerButton(page)).toHaveText('4 bars · plays 2 times, then ends');
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');
    // Saved with its fast tempo, so the reopened song below plays as quickly.
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await save.click();
    await expect(save).toBeDisabled();
    await expect(page.locator('.error-banner')).toHaveCount(0);
    // The count is in the stored document, as `score.choruses`.
    const stored = (await documents(page)).find((d) => d.title === 'Two choruses');
    expect(stored?.schemaVersion === 2 && stored.chart.score.choruses).toBe(2);

    const play = page.getByRole('button', { name: 'Start playback', exact: true });
    const stop = page.getByRole('button', { name: 'Stop playback', exact: true });

    // Two choruses, then the transport returns to stopped by itself.
    await pointer.arm();
    await play.click();
    await expect(stop).toBeVisible();
    // The footer is hidden while the band plays, and comes back saying the same thing.
    await expect(footerButton(page)).toBeHidden();
    await expect(play).toBeVisible({ timeout: 45_000 });
    expect(await passes(pointer)).toBe(2);
    await expect(footerButton(page)).toHaveText('4 bars · plays 2 times, then ends');
    // It stopped after the second chorus's last bar (F), not inside it.
    expect((await pointer.chordNames()).at(-1)).toBe('F');
    // Nothing more plays once it has stopped.
    await expect(page.locator('.chord[aria-current="true"]')).toHaveCount(0);

    // The count saved, and reopens with the song.
    await page.reload();
    await songLink(page, 'Two choruses').first().click();
    expect(await formLength(page)).toBe('Plays 2 times');

    // Back to Loop: the band plays on past the second pass.
    await pickFormLength(page, 'Repeats continuously');
    expect(await formLength(page)).toBe('Repeats continuously');
    await expect(footerButton(page)).toHaveText('4 bars · repeats continuously');
    // Clearing the count writes no `choruses` key at all, not a null or a zero.
    await save.click();
    await expect(save).toBeDisabled();
    const cleared = (await documents(page)).find((d) => d.title === 'Two choruses');
    expect(cleared?.schemaVersion === 2 && 'choruses' in cleared.chart.score).toBe(false);
    await pointer.arm();
    await play.click();
    await expect.poll(() => passes(pointer), { timeout: 45_000 }).toBeGreaterThanOrEqual(3);
    await expect(stop).toBeVisible();
    await stop.click();
    await expect(play).toBeVisible();

    await pointer.disarm();
    expect(pageErrors).toEqual([]);
});

test('the footer is the form-length menu: its choices, keys and placement (#1511, #1756)', async ({
    page,
}, testInfo) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Footer menu');
    await page.getByRole('button', { name: 'Chart', exact: true }).click();

    // The new song's four bars (C, G, Am, F), on the loop every chart starts on.
    const footer = footerButton(page);
    await expect(footer).toHaveText('4 bars · repeats continuously');
    await expect(footer).toHaveAttribute('aria-haspopup', 'menu');
    await expect(footer).toHaveAttribute('aria-expanded', 'false');

    // The menu: the current choice checked, Escape closes it and hands focus back.
    await footer.click();
    await expect(footer).toHaveAttribute('aria-expanded', 'true');
    const menu = formMenu(page);
    await expect(menu.getByRole('menuitemradio')).toHaveText([
        'Repeats continuously',
        'Plays once',
        'Plays 2 times',
        'Plays 3 times',
        'Plays 4 times',
        'Plays 6 times',
        'Plays 8 times',
        'Plays 12 times',
        'Plays 16 times',
    ]);
    const loop = menu.getByRole('menuitemradio', { name: 'Repeats continuously', exact: true });
    await expect(loop).toHaveAttribute('aria-checked', 'true');
    await expect(loop).toBeFocused();
    // A measure chart has nothing to convert, so the menu says nothing about it.
    await expect(page.locator('.menu-note')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(footer).toBeFocused();
    // The menu's keys are its own: arrowing through it and Escaping out closes the menu and
    // gives focus back to the footer.
    await footer.click();
    await page.keyboard.press('ArrowDown');
    await expect(
        menu.getByRole('menuitemradio', { name: 'Plays once', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('End');
    await expect(
        menu.getByRole('menuitemradio', { name: 'Plays 16 times', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(footer).toBeFocused();
    // The menu (a popover on a laptop, a sheet on a phone) stays inside the viewport and the page
    // never scrolls sideways.
    await footer.click();
    const box = await page.locator('.form-length-menu').boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    // The footer toggles it shut on a laptop; on a phone the sheet's backdrop covers the footer,
    // and a tap there closes it.
    if (testInfo.project.name === 'webkit-phone') {
        await page.mouse.click(5, 5);
    } else {
        await footer.click();
    }
    await expect(menu).toHaveCount(0);

    await pickFormLength(page, 'Plays once');
    await expect(footer).toHaveText('4 bars · plays once, then ends');
    await pickFormLength(page, 'Plays 2 times');
    await expect(footer).toHaveText('4 bars · plays 2 times, then ends');
    await expect(page.locator('.chart-bottom')).not.toContainText('repeats continuously');
    await footer.click();
    await expect(
        menu.getByRole('menuitemradio', { name: 'Plays 2 times', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    expect(await formLength(page)).toBe('Plays 2 times');
});
