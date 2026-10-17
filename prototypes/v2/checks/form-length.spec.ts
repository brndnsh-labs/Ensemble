import type { Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import { appUrl, closeSongMenu, editorRevealed, expect, openWholeSong, test } from './fixtures';

/**
 * #1511: the chart footer's "N bars · repeats continuously" is the form-length control. It
 * sets the same `score.choruses` the Song menu's Choruses select does (#1475, #1726), and on a text
 * (schema 1) chart a pick first makes the measure copy "Try the bar editor · keep original"
 * makes. Passes are counted from the chart's own pointer, as `choruses.spec.ts` does.
 */

declare global {
    interface Window {
        /** The name of each chord the stand made current, in order, while armed. */
        __formEvidence: { armed: boolean; current: string[] };
    }
}

async function observePointer(page: Page) {
    await page.addInitScript(() => {
        const evidence = { armed: false, current: [] as string[] };
        window.__formEvidence = evidence;
        // The mutation RECORDS, not the DOM: a starved tab can batch two transitions.
        new MutationObserver((records) => {
            if (!evidence.armed) {
                return;
            }
            for (const record of records) {
                const target = record.target as Element;
                if (
                    target.classList?.contains('chord') &&
                    record.attributeName === 'aria-current' &&
                    record.oldValue !== 'true' &&
                    target.getAttribute('aria-current') === 'true'
                ) {
                    evidence.current.push(target.textContent?.trim() ?? '');
                }
            }
        }).observe(document, {
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['aria-current'],
        });
    });
}

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

async function pick(page: Page, choice: string) {
    await footerButton(page).click();
    await expect(formMenu(page)).toBeVisible();
    await formMenu(page).getByRole('menuitemradio', { name: choice, exact: true }).click();
    await expect(formMenu(page)).toHaveCount(0);
}

/** The Song menu's Choruses select, read in Edit with the menu open, then closed again. */
async function songMenuChoruses(page: Page): Promise<string> {
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await openWholeSong(page);
    const value = await page.getByLabel('Choruses', { exact: true }).inputValue();
    await closeSongMenu(page);
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    return value;
}

test('the footer sets how many times a measure chart plays, and the band stops after them', async ({
    page,
}, testInfo) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await observePointer(page);
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Footer choruses');
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');

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

    await pick(page, 'Plays once');
    await expect(footer).toHaveText('4 bars · plays once, then ends');
    await pick(page, 'Plays 2 times');
    await expect(footer).toHaveText('4 bars · plays 2 times, then ends');
    await expect(page.locator('.chart-bottom')).not.toContainText('repeats continuously');
    await footer.click();
    await expect(
        menu.getByRole('menuitemradio', { name: 'Plays 2 times', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    expect(await songMenuChoruses(page)).toBe('2');

    // One unsaved edit, which Save keeps like the Song menu's.
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();
    const stored = (await documents(page)).find((d) => d.title === 'Footer choruses');
    expect(stored?.schemaVersion === 2 && stored.chart.score.choruses).toBe(2);

    // Two choruses, then the transport returns to stopped by itself; the footer, hidden while
    // playing, comes back saying the same thing.
    const play = page.getByRole('button', { name: 'Start playback', exact: true });
    const stop = page.getByRole('button', { name: 'Stop playback', exact: true });
    await page.evaluate(() => {
        window.__formEvidence.current = [];
        window.__formEvidence.armed = true;
    });
    await play.click();
    await expect(stop).toBeVisible();
    await expect(footer).toBeHidden();
    await expect(play).toBeVisible({ timeout: 45_000 });
    await page.evaluate(() => {
        window.__formEvidence.armed = false;
    });
    const heard = await page.evaluate(() => window.__formEvidence.current);
    expect(heard.filter((name) => name === 'C')).toHaveLength(2);
    expect(heard.at(-1)).toBe('F');
    await expect(footer).toHaveText('4 bars · plays 2 times, then ends');

    // "Repeats continuously" clears the count, in the document and the Song menu.
    await pick(page, 'Repeats continuously');
    await expect(footer).toHaveText('4 bars · repeats continuously');
    expect(await songMenuChoruses(page)).toBe('loop');
    await save.click();
    await expect(save).toBeDisabled();
    const cleared = (await documents(page)).find((d) => d.title === 'Footer choruses');
    expect(cleared?.schemaVersion === 2 && 'choruses' in cleared.chart.score).toBe(false);
    expect(pageErrors).toEqual([]);
});
