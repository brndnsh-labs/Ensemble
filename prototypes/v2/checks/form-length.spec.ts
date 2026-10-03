import type { Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import { appUrl, editorRevealed, expect, seedStarters, songLink, test } from './fixtures';

/**
 * #1511: the chart footer's "N bars · repeats continuously" is the form-length control. It
 * sets the same `score.choruses` the Edit panel's Choruses select does (#1475), and on a text
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

/** The Edit panel's Choruses select, read with the panel open, then closed again. */
async function editPanelChoruses(page: Page): Promise<string> {
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    const value = await page.getByLabel('Choruses', { exact: true }).inputValue();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    return value;
}

test('the footer sets how many times a measure chart plays, and the band stops after them', async ({
    page,
}) => {
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
    await expect(page.locator('.form-length-note')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(footer).toBeFocused();
    // The popover stays inside the viewport and the page never scrolls sideways.
    await footer.click();
    const box = await page.locator('.form-length-menu').boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await footer.click();
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
    expect(await editPanelChoruses(page)).toBe('2');

    // One unsaved edit, which Save keeps like the Edit panel's.
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

    // "Repeats continuously" clears the count, in the document and the Edit panel.
    await pick(page, 'Repeats continuously');
    await expect(footer).toHaveText('4 bars · repeats continuously');
    expect(await editPanelChoruses(page)).toBe('loop');
    await save.click();
    await expect(save).toBeDisabled();
    const cleared = (await documents(page)).find((d) => d.title === 'Footer choruses');
    expect(cleared?.schemaVersion === 2 && 'choruses' in cleared.chart.score).toBe(false);
    expect(pageErrors).toEqual([]);
});

test('on a shared text chart, a count makes the measure copy and counts it (#1511)', async ({
    page,
}) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    // v1's plain-text `?prog=` link, which opens as an unsaved schema-1 shared draft.
    await page.goto(appUrl(`?prog=${encodeURIComponent('C7 | F7 | C7 | G7')}&key=C&bpm=120`));
    await expect(page.getByRole('heading', { name: 'Shared song' })).toBeVisible();
    const footer = footerButton(page);
    await expect(footer).toHaveText('4 bars · repeats continuously');

    await footer.click();
    const menu = formMenu(page);
    await expect(page.locator('.form-length-note')).toHaveText(
        'Counting choruses turns this chart into bars; the original is kept.',
    );
    await expect(menu).toHaveAttribute('aria-describedby', 'form-length-note');
    await expect(
        menu.getByRole('menuitemradio', { name: 'Repeats continuously', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await menu.getByRole('menuitemradio', { name: 'Plays 2 times', exact: true }).click();

    await expect(page.getByTestId('stand-toast')).toContainText('Editable copy created');
    await expect(footer).toHaveText('4 bars · plays 2 times, then ends');
    await expect(page.locator('.chart-bottom')).not.toContainText('repeats continuously');
    // The copy is a measure chart: the Edit panel holds the bar editor and agrees on the count.
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(page.getByLabel('Chords in this bar')).toBeVisible();
    await expect(page.getByLabel('Choruses', { exact: true })).toHaveValue('2');
    await page.getByRole('button', { name: 'Chart', exact: true }).click();

    // What the conversion stored is the button's copy, with the count as one unsaved edit on
    // top; the link itself was never stored, so nothing but the copy is in the songbook.
    let stored = await documents(page);
    expect(stored.map((d) => [d.schemaVersion, d.title])).toEqual([
        [2, 'Shared song — editable copy'],
    ]);
    expect(stored[0].schemaVersion === 2 && 'choruses' in stored[0].chart.score).toBe(false);
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await save.click();
    await expect(save).toBeDisabled();
    stored = await documents(page);
    expect(stored).toHaveLength(1);
    expect(stored[0].schemaVersion === 2 && stored[0].chart.score.choruses).toBe(2);
    expect(pageErrors).toEqual([]);
});

test('on a saved text chart, a count converts a copy and leaves the original untouched', async ({
    page,
}) => {
    await seedStarters(page);
    const original = (await documents(page)).find((d) => d.id === 'starter-blues');
    expect(original?.schemaVersion).toBe(1);
    await songLink(page, 'Blue pocket', 'Blues').click();
    const footer = footerButton(page);
    await expect(footer).toHaveText('12 bars · repeats continuously');

    await pick(page, 'Plays 3 times');
    await expect(footer).toHaveText('12 bars · plays 3 times, then ends');
    expect(await editPanelChoruses(page)).toBe('3');
    const stored = await documents(page);
    // The original is exactly as it was; the copy is a new measure chart beside it.
    expect(stored.find((d) => d.id === 'starter-blues')).toEqual(original);
    expect(stored.filter((d) => d.schemaVersion === 2).map((d) => d.title)).toEqual([
        'Blue pocket — editable copy',
    ]);
});
