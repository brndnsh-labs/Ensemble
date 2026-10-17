import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import {
    appUrl,
    closeKeyPopover,
    editorRevealed,
    expect,
    exportAs,
    formLength,
    keyButton,
    leaveBar,
    openBar,
    openKeyPopover,
    pickSongKey,
    seedGuestDocuments,
    settled,
    songLink,
    songMenuAction,
    starterTextCharts,
    typeBar,
} from './fixtures';
import { test } from './foundation-helpers';

/**
 * The text chart's own UI (schemaVersion 1, #1733): the edit panel's Section select, Chord text,
 * Update chart and ＋ Section, its "Edit section" links, and "Try the bar editor · keep original".
 * The suite's starter songs are measure charts now (`starterDocuments`); every assertion about the
 * text-chart path moved here from the spec it lived in, unchanged, against the same three songs as
 * text charts. This file goes with the text-chart UI (#1739).
 */

/** The three starter songs as text charts, written straight into the guest store. */
async function seedTextCharts(page: Page, path = ''): Promise<void> {
    await seedGuestDocuments(page, starterTextCharts(), path);
}

async function openEditor(page: Page) {
    await seedTextCharts(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
}
async function savedBlue(page: Page) {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ensemble-v2-preview', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise<{
                title: string;
                revision: number;
                updatedAt: string;
                chart: {
                    arrangement: { key: string; sections: { value: string }[] };
                    performance: { bpm: number };
                };
            }>((resolve, reject) => {
                const read = db
                    .transaction('documents')
                    .objectStore('documents')
                    .get('starter-blues');
                read.onsuccess = () => resolve(read.result);
                read.onerror = () => reject(read.error);
            });
        } finally {
            db.close();
        }
    });
}
async function exportCurrent(page: Page) {
    const download = page.waitForEvent('download');
    await exportAs(page, 'Song file');
    const path = await (await download).path();
    const document = JSON.parse(await readFile(path!, 'utf8'));
    return document;
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

const home = (page: Page) => expect(page.locator('main.home').first()).toBeVisible();
const onSong = (page: Page, title: string) =>
    expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
const footerButton = (page: Page) => page.locator('.chart-bottom').getByRole('button');
const formMenu = (page: Page) => page.getByRole('menu', { name: 'How many times the form plays' });

async function pick(page: Page, choice: string) {
    await footerButton(page).click();
    await expect(formMenu(page)).toBeVisible();
    await formMenu(page).getByRole('menuitemradio', { name: choice, exact: true }).click();
    await expect(formMenu(page)).toHaveCount(0);
}

async function convertBlue(page: Page) {
    await seedTextCharts(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page
        .getByRole('button', { name: 'Try the bar editor · keep original', exact: true })
        .click();
    await editorRevealed(page);
    await expect(page.locator('.sheet .bar').first()).toBeVisible();
}

// From usability.spec.ts.

test('typed chords are unsaved work: Save includes every edited section without Update', async ({
    page,
}) => {
    await openEditor(page);
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    const second = await page.getByLabel('Section', { exact: true }).inputValue();
    await page.getByLabel('Section', { exact: true }).selectOption('a');
    await page.getByLabel('Chord text').fill('Dm7 G7 | Cmaj7 | A7');
    await page.getByLabel('Section', { exact: true }).selectOption(second);
    await page.getByLabel('Chord text').fill('Fmaj7 | E7 | Am7 | G7');
    await page.getByLabel('Section', { exact: true }).selectOption('a');
    await expect(page.getByLabel('Chord text')).toHaveValue('Dm7 G7 | Cmaj7 | A7');
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.song-subtitle')).toContainText('Unsaved chord text');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect((await savedBlue(page)).chart.arrangement.sections.map((s) => s.value)).toEqual([
        'Dm7 G7 | Cmaj7 | A7',
        'Fmaj7 | E7 | Am7 | G7',
    ]);
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page.getByLabel('Chord text').fill('Am7 | D7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect((await savedBlue(page)).chart.arrangement.sections[0].value).toBe('Am7 | D7');
});

test('export and Duplicate include typed text but do not overwrite the original save', async ({
    page,
}) => {
    await openEditor(page);
    const original = await savedBlue(page);
    await page.getByLabel('Chord text').fill('Dm7 | G7 | Cmaj7');
    expect((await exportCurrent(page)).chart.arrangement.sections[0].value).toBe(
        'Dm7 | G7 | Cmaj7',
    );
    expect(await savedBlue(page)).toEqual(original);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await page.getByLabel('Chord text').fill('Am7 | D7 | Gmaj7');
    await songMenuAction(page, 'Duplicate');
    // While editing, the title is the header's input (#1726).
    await expect(page.getByLabel('Song title')).toHaveValue('Blue pocket — copy');
    expect((await exportCurrent(page)).chart.arrangement.sections[0].value).toBe(
        'Am7 | D7 | Gmaj7',
    );
    expect(await savedBlue(page)).toEqual(original);
});

// #1331 — the guard's job is "new editor text must never silently become another chord", and
// it did that by comparing the parser's canonical spelling back to the typed text. Once the
// parser learned to normalise case, parentheses, Δ and the in-quality slash (#1320-#1324),
// that string comparison rejected exactly the spellings it had just learned to read.
test('the editor accepts every spelling the playback parser understands', async ({ page }) => {
    await openEditor(page);
    const supported = [
        'CMaj7 | CM7 | CΔ7', // capitalised / Greek-delta major 7ths
        'Cm7(b5) | G7(b9) | C13(#11b9)', // parenthesised alterations
        'CmMaj7 | Cm/maj7 | Cmadd9', // minor-major and minor added tone
        'Gsus | G7sus | G9sus4 | G13sus', // suspension shorthand
        'C6/9 | Cm6/9 | C69 | Cmaj7b5', // in-quality slash, and the exact maj7b5
        'Cm7#5 | C-7#5 | Cm(b6) | C-b6', // #1340 — written altered 5ths and the added b6
        'Cmaj7/G | Am7/E', // real slash basses still split
    ].join(' | ');
    await page.getByLabel('Chord text').fill(supported);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.error-banner')).toHaveCount(0);
    expect((await savedBlue(page)).chart.arrangement.sections[0].value).toBe(supported);
});

test('the editor still rejects a partly-understood spelling', async ({ page }) => {
    await openEditor(page);
    // `m7#11` consumes `m7` and drops the `#11`: the chord would silently lose its alteration,
    // which is the case this guard exists for. A leading slash is unfinished text.
    // (#1340 swapped the example from `Cm7#5`, which is now a real quality — see the accepted
    // list above. The guard is about partial matches, so it needs a spelling that still is one.)
    for (const token of ['Cm7#11', 'C/9', 'Cm7add11']) {
        await page.getByLabel('Chord text').fill(`Dm7 | ${token}`);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.locator('.error-banner')).toContainText(
            `unsupported chord spelling “${token}”`,
        );
    }
});

test('unsupported text blocks save, export, navigation and transforms without losing any buffer', async ({
    page,
}) => {
    await openEditor(page);
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    const second = await page.getByLabel('Section', { exact: true }).inputValue();
    await page.getByLabel('Chord text').fill('C | potato | G');
    await page.getByLabel('Section', { exact: true }).selectOption('a');
    await page.getByLabel('Chord text').fill('Dm7 | G7');
    const original = await savedBlue(page);
    for (const action of ['Save', 'Update chart', 'Back to songbook', 'Start playback']) {
        await page.getByRole('button', { name: action, exact: true }).click();
        await expect(page.locator('.error-banner')).toContainText(
            'Section B: unsupported chord spelling “potato”',
        );
        await expect(page.getByLabel('Chord text')).toHaveValue('C | potato | G');
        await expect(page.getByLabel('Section', { exact: true })).toHaveValue(second);
        expect(await savedBlue(page)).toEqual(original);
    }
    for (const action of [
        () => songMenuAction(page, 'Duplicate'),
        () => exportAs(page, 'Song file'),
    ]) {
        await action();
        await expect(page.locator('.error-banner')).toContainText('unsupported chord spelling');
        await expect(page.getByLabel('Chord text')).toHaveValue('C | potato | G');
        // The refusal closes Export… onto the editor it names.
        await expect(page.getByTestId('export-dialog')).toBeHidden();
    }
    await pickSongKey(page, 'D');
    await expect(keyButton(page)).toHaveAccessibleName('Key: C');
    await page.getByLabel('Style', { exact: true }).selectOption('Jazz');
    await expect(page.getByLabel('Style', { exact: true })).toHaveValue('Blues');
    await page.getByLabel('Section', { exact: true }).selectOption('a');
    await expect(page.getByLabel('Chord text')).toHaveValue('Dm7 | G7');
    // Invalid text remains tab-only, and the browser receives an unload guard.
    expect(
        await page.evaluate(() => {
            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
        }),
    ).toBe(true);
    await songMenuAction(page, 'Revert to saved');
    await expect(page.getByLabel('Chord text')).toHaveValue(
        original.chart.arrangement.sections[0].value,
    );
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('editor validation consumes complete supported spellings and preserves rejected input', async ({
    page,
}) => {
    await openEditor(page);
    const original = await savedBlue(page);
    for (const text of [
        '',
        'C || G',
        'Cmaj7junk',
        'C/Egarbage',
        'C/',
        'C/E/G',
        '%',
        'N.C.',
        'C7 x2',
        'B♭7', // the unicode flat is deliberately not in the vocabulary
        'C '.repeat(501),
    ]) {
        await page.getByLabel('Chord text').fill(text);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.locator('.error-banner')).toBeVisible();
        await expect(page.getByLabel('Chord text')).toHaveValue(text);
        expect(await savedBlue(page)).toEqual(original);
    }
    // `C13(#11b9)` moved here from the reject list above (#1331): the parser reads
    // parenthesised alterations now, and #1329 maps this one to 7b9 instead of a 13 whose
    // natural 9 contradicts the written b9. The editor rejected it for the old reason — the
    // canonical spelling no longer equals the typed text.
    const supported =
        '| Dm7 G7 | Cmaj7 | #ivm7b5 VII7alt | 1 4 57 | C6/9 | G7/B IVmaj9/5 | B#maj7 Cbmaj7 | C13(#11b9) |';
    await page.getByLabel('Chord text').fill(supported);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect((await savedBlue(page)).chart.arrangement.sections[0].value).toBe(supported);
});

test('a text chart’s Key popover holds Key and Chord notation, not Mode or Meter (#1757)', async ({
    page,
}) => {
    await seedTextCharts(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    const popover = await openKeyPopover(page);
    await expect(popover.getByLabel('Key', { exact: true })).toBeVisible();
    await expect(popover.getByLabel('Chord notation', { exact: true })).toBeVisible();
    // A text chart has no song meter or mode of its own to set.
    await expect(popover.getByLabel('Mode', { exact: true })).toHaveCount(0);
    await expect(popover.getByLabel('Meter', { exact: true })).toHaveCount(0);
    await closeKeyPopover(page);
});

test('transposition follows pending text and cannot be undone by stale editor text', async ({
    page,
}) => {
    await openEditor(page);
    await pickSongKey(page, 'D');
    await expect(page.getByLabel('Chord text')).toHaveValue(/^D7 \| G7/);
    await page.getByRole('button', { name: 'Update chart', exact: true }).click();
    await expect(page.locator('.chord-button').first()).toHaveText('D7');
    await page.getByLabel('Chord text').fill('Dm7 | G7');
    await pickSongKey(page, 'E');
    await expect(page.getByLabel('Chord text')).toHaveValue('Em7 | A7');
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await page.getByLabel('Section', { exact: true }).selectOption('a');
    await expect(page.getByLabel('Chord text')).toHaveValue('Em7 | A7');
    await page.getByLabel('Chord text').fill('F#m7 | B7');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await page.getByRole('button', { name: 'Open chart', exact: true }).click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(page.getByLabel('Chord text')).toHaveValue('F#m7 | B7');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect(page.locator('.chord-button').first()).toHaveText('F#m7');
});

test('a failed Save retains typed chords through recovery, navigation and retry', async ({
    page,
}) => {
    await openEditor(page);
    const original = await savedBlue(page);
    await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        Object.assign(window, { __failSave: true });
        IDBObjectStore.prototype.put = function (...args) {
            const request = Reflect.apply(put, this, args);
            if (
                this.name === 'documents' &&
                (window as unknown as { __failSave: boolean }).__failSave
            ) {
                this.transaction.abort();
            }
            return request;
        };
    });
    await page.getByLabel('Chord text').fill('Fmaj7 | E7 | Am7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.error-banner')).toContainText('Your chart is still open');
    expect(await savedBlue(page)).toEqual(original);
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Open chart', exact: true }).click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(page.getByLabel('Chord text')).toHaveValue('Fmaj7 | E7 | Am7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect((await savedBlue(page)).chart.arrangement.sections[0].value).toBe('Fmaj7 | E7 | Am7');
});

test('a revision conflict retains typed chords and allows an independent copy', async ({
    page,
    context,
}) => {
    await openEditor(page);
    const second = await context.newPage();
    await openEditor(second);
    await second.getByLabel('Chord text').fill('Am7 | D7');
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const newer = await savedBlue(page);
    await page.getByLabel('Chord text').fill('Dm7 | G7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.error-banner')).toContainText('saved in another tab');
    await expect(page.getByLabel('Chord text')).toHaveValue('Dm7 | G7');
    expect(await savedBlue(page)).toEqual(newer);
    await songMenuAction(page, 'Duplicate');
    // While editing, the title is the header's input (#1726).
    await expect(page.getByLabel('Song title')).toHaveValue('Blue pocket — copy');
    expect((await exportCurrent(page)).chart.arrangement.sections[0].value).toBe('Dm7 | G7');
    expect(await savedBlue(page)).toEqual(newer);
});

test('Edit chart and Edit section reveal the input across laptop, phone and tablet layouts', async ({
    page,
}, info) => {
    await openEditor(page);
    for (const viewport of [
        { width: 1300, height: 940 },
        { width: 402, height: 874 },
        { width: 874, height: 402 },
        { width: 820, height: 1180 },
    ]) {
        await page.setViewportSize(viewport);
        await page.getByRole('button', { name: 'Chart', exact: true }).click();
        await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
        // The panel slides in (#1700); its boxes are measured once it has arrived.
        await settled(page.locator('.edit-panel'));
        await expect(page.getByLabel('Chord text')).toBeInViewport();
        await expect(page.getByLabel('Chord text')).toBeFocused();
        expect((await page.getByLabel('Song title').boundingBox())!.height).toBeLessThan(65);
        expect(
            (await page.getByLabel('Section', { exact: true }).boundingBox())!.height,
        ).toBeGreaterThanOrEqual(44);
        expect(
            await page
                .getByLabel('Chord text')
                .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
        ).toBeGreaterThanOrEqual(16);
        if (viewport.width === 402) {
            // A phone docks the editor below the chart (#1705): both are on screen, the panel
            // scrolled to its input rather than to its heading.
            await expect(page.locator('.edit-panel')).toBeInViewport();
            await expect(page.locator('.chart-scroll')).toBeInViewport();
        }
        await page.getByRole('button', { name: 'Edit section', exact: true }).first().click();
        await expect(page.getByLabel('Chord text')).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true,
        );
        await page.screenshot({
            path: info.outputPath(`editor-${viewport.width}x${viewport.height}.png`),
        });
    }
});

// From foundation.spec.ts: the text half of "responsive chart and editor fit".
for (const [width, height] of [
    [1300, 940],
    [402, 874],
    [874, 402],
    [820, 1180],
]) {
    test(`unapplied chord text survives playback ${width}x${height}`, async ({ page }) => {
        await seedTextCharts(page);
        await songLink(page, 'Blue pocket', 'Blues').click();
        await page.setViewportSize({ width, height });
        await expect(
            page.getByRole('button', { name: 'Start playback', exact: true }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
        await expect(page.getByLabel('Chord text')).toBeVisible();
        const unapplied = 'Dm7 | G7 | Cmaj7 | A7';
        await page.getByLabel('Chord text').fill(unapplied);
        await page.getByRole('button', { name: 'Start playback', exact: true }).click();
        await expect(page.getByLabel('Chord text')).toBeHidden();
        await page.getByRole('button', { name: 'Stop playback' }).click();
        await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
        await expect(page.getByLabel('Chord text')).toHaveValue(unapplied);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true,
        );
    });
}

test('file export/import is detached; invalid input never changes the active song', async ({
    page,
}) => {
    // Model slow device file I/O. Assertions must wait for import completion,
    // not confuse the disabled-during-import Save button with a finished save.
    await page.addInitScript(() => {
        const read = File.prototype.text;
        File.prototype.text = async function () {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return read.call(this);
        };
    });
    await seedTextCharts(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('My writing sketch');
    await page.getByLabel('Chord text').fill('Am7 | D7 | Gmaj7 | Cmaj7');
    await page.getByRole('button', { name: 'Update chart' }).click();
    await expect(page.locator('.bar')).toHaveCount(4);
    const download = page.waitForEvent('download');
    await exportAs(page, 'Song file');
    const exported = await download;
    const path = await exported.path();
    expect(path).toBeTruthy();
    await page.getByLabel('Import Ensemble document').setInputFiles(path!);
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(
        page.getByRole('heading', { name: 'My writing sketch', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Import Ensemble document').setInputFiles({
        name: 'invalid.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from('{"schemaVersion":999}'),
    });
    await expect(
        page.getByRole('alert').filter({ hasText: 'Cannot open this chart' }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'My writing sketch', exact: true }),
    ).toBeVisible();
});

test('all existing feels and key/mutes survive a save; long charts scroll legibly', async ({
    page,
    disconnect,
}) => {
    await seedTextCharts(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''))
        .toContain(appUrl('sw.js'));
    await disconnect();
    const genres = await page
        .getByLabel('Style', { exact: true })
        .locator('option')
        .allTextContents();
    expect(genres).toHaveLength(13);
    for (const genre of genres) {
        await page.getByLabel('Style', { exact: true }).selectOption(genre);
        await expect(page.getByLabel('Style', { exact: true })).toBeEnabled();
        await expect(page.locator('.error-banner[role="alert"]')).toHaveCount(0);
    }
    await pickSongKey(page, 'Eb');
    await page.getByRole('button', { name: 'Bass', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.reload();
    await songLink(page, 'Blue pocket').click();
    await expect(keyButton(page)).toHaveAccessibleName('Key: E♭');
    await expect(page.getByRole('button', { name: 'Bass', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page
        .getByLabel('Chord text')
        .fill(
            Array.from({ length: 64 }, (_, i) => ['Cmaj7', 'Am7', 'Dm7', 'G7'][i % 4]).join(' | '),
        );
    await page.getByRole('button', { name: 'Update chart' }).click();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await page.setViewportSize({ width: 402, height: 874 });
    await expect(page.locator('.bar')).toHaveCount(64);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    expect(
        await page
            .locator('.chord')
            .first()
            .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(28);
    // #1460 — the Resume-follow pill only exists while playing (hidden when stopped, per
    // acceptance), so proving a manual scroll turns Following off now needs the band running.
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await page.locator('.chart-scroll').press('PageDown');
    await expect(page.getByTestId('resume-follow')).toBeVisible();

    // #1460 review P3 spec gap — tapping the pill re-applies the scroll: on this overflowing
    // 64-bar chart, scrolling several rows further away first proves the playing row was
    // genuinely out of view, not still in view by coincidence.
    const scrollEl = page.locator('.chart-scroll');
    const activeInView = () =>
        scrollEl.evaluate((el) => {
            const active = el.querySelector('.bar[data-active="true"]');
            if (!active) {
                return null;
            }
            const sr = el.getBoundingClientRect();
            const ar = active.getBoundingClientRect();
            return ar.top >= sr.top && ar.bottom <= sr.bottom;
        });
    await page.locator('.chart-scroll').press('PageDown');
    await page.locator('.chart-scroll').press('PageDown');
    await expect.poll(activeInView).toBe(false);

    // #1460 re-review P3 — `.chart-scroll`'s bottom padding must still let the LAST row clear
    // the stack once it shows something (the pill, here) — the whole reason the padding formula
    // reads the stack's own measured height rather than staying a fixed guess. Waited for the
    // message toast to go empty first, so the stack holds exactly the pill and nothing else —
    // otherwise a still-showing "Saved on this device" from this test's earlier reload/re-open
    // would inflate `--stand-stack-height` and make this a race against that message's own ~4s
    // auto-dismiss rather than a check of the padding formula itself.
    await expect(page.getByTestId('stand-toast')).toHaveAttribute('data-empty', 'true');
    // `.chart-scroll` has `scroll-behavior: smooth`, which — per the CSSOM View spec — also
    // governs a direct `scrollTop` assignment, not just `scrollTo()`/`scrollIntoView()`. An
    // explicit `behavior: 'instant'` is what actually jumps immediately instead of leaving this
    // read mid-animation.
    await scrollEl.evaluate((el) => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
    });
    const lastBarBox = await page.locator('.bar').last().boundingBox();
    const pillBox = await page.getByTestId('resume-follow').boundingBox();
    expect(lastBarBox).not.toBeNull();
    expect(pillBox).not.toBeNull();
    expect(lastBarBox!.y + lastBarBox!.height).toBeLessThanOrEqual(pillBox!.y);

    await page.getByTestId('resume-follow').click();
    await expect(page.getByTestId('resume-follow')).toHaveCount(0);
    await expect.poll(activeInView).toBe(true);
    await page.getByRole('button', { name: 'Stop playback' }).click();
});

// From semantic-chart.spec.ts.
test('2+1+1 editor saves a source-preserving copy, transposes and reopens offline', async ({
    page,
    disconnect,
}, info) => {
    await convertBlue(page);
    const original = (await documents(page)).find((document) => document.id === 'starter-blues');
    await page.getByLabel('Song title').fill('Uneven blues');
    await typeBar(page, 1, 'C:2 Dm:1 G7:1');
    // Leaving the bar applies it; the transpose then carries it (and retires the old buffers).
    await leaveBar(page);
    await pickSongKey(page, 'D');
    await expect(await openBar(page, 1)).toHaveValue('D:2 Em:1 A7:1');
    await leaveBar(page);
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['D', 'Em', 'A7']);
    expect(
        await page
            .locator('.bar')
            .first()
            .locator('.chord')
            .evaluateAll((nodes) =>
                nodes.map((node) => [
                    node.getAttribute('data-start-step'),
                    node.getAttribute('data-end-step'),
                ]),
            ),
    ).toEqual([
        ['0', '8'],
        ['8', '12'],
        ['12', '16'],
    ]);
    await page.screenshot({ path: info.outputPath('measure-editor.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const saved = (await documents(page)).find((document) => document.title === 'Uneven blues')!;
    expect(saved.schemaVersion).toBe(2);
    if (saved.schemaVersion !== 2) {
        throw new Error('Expected semantic document');
    }
    expect(saved.chart.score.sections[0].measures[0].content).toEqual({
        kind: 'events',
        events: [
            { kind: 'chord', symbol: 'D', duration: [2, 1] },
            { kind: 'chord', symbol: 'Em', duration: [1, 1] },
            { kind: 'chord', symbol: 'A7', duration: [1, 1] },
        ],
    });
    expect((await documents(page)).find((document) => document.id === 'starter-blues')).toEqual(
        original,
    );
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
        .toContain(appUrl('sw.js'));
    await disconnect();
    await page.reload();
    await songLink(page, 'Uneven blues', 'Blues').click();
    await expect(keyButton(page)).toHaveAccessibleName('Key: D');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => page.locator('.chord[aria-current="true"]').count()).toBe(1);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    expect((await documents(page)).find((document) => document.id === saved.id)).toEqual(saved);
});

// From history-navigation.spec.ts.
test('an unsaved edit survives Back the way it survives the back button', async ({ page }) => {
    await seedTextCharts(page);
    await songLink(page, 'Blue pocket').first().click();
    await onSong(page, 'Blue pocket');
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page.getByLabel('Chord text').fill('Dm7 | G7 | Cmaj7 | A7');
    await page.goBack();
    await home(page);
    await songLink(page, 'Blue pocket').first().click();
    await onSong(page, 'Blue pocket');
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['Dm7']);
});

// From form-length.spec.ts.
test('on a saved text chart, a count converts a copy and leaves the original untouched', async ({
    page,
}) => {
    await seedTextCharts(page);
    const original = (await documents(page)).find((d) => d.id === 'starter-blues');
    expect(original?.schemaVersion).toBe(1);
    await songLink(page, 'Blue pocket', 'Blues').click();
    const footer = footerButton(page);
    await expect(footer).toHaveText('12 bars · repeats continuously');

    await pick(page, 'Plays 3 times');
    await expect(footer).toHaveText('12 bars · plays 3 times, then ends');
    expect(await formLength(page)).toBe('Plays 3 times');
    const stored = await documents(page);
    // The original is exactly as it was; the copy is a new measure chart beside it.
    expect(stored.find((d) => d.id === 'starter-blues')).toEqual(original);
    expect(stored.filter((d) => d.schemaVersion === 2).map((d) => d.title)).toEqual([
        'Blue pocket — editable copy',
    ]);
});

// From form-length.spec.ts, where it opened a schema-1 draft through a v1 `?prog=` link (#1735).
// Seeded as a saved text chart instead, so the original stays beside the copy.
test('on an opened text chart, a count makes the measure copy and counts it (#1511)', async ({
    page,
}) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await seedTextCharts(page);
    const original = (await documents(page)).find((d) => d.id === 'starter-blues');
    expect(original?.schemaVersion).toBe(1);
    await songLink(page, 'Blue pocket', 'Blues').click();
    const footer = footerButton(page);
    await expect(footer).toHaveText('12 bars · repeats continuously');

    await footer.click();
    const menu = formMenu(page);
    await expect(menu).toHaveAccessibleDescription(
        'Counting choruses turns this chart into bars; the original is kept.',
    );
    await expect(
        menu.getByRole('menuitemradio', { name: 'Repeats continuously', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await menu.getByRole('menuitemradio', { name: 'Plays 2 times', exact: true }).click();

    await expect(page.getByTestId('stand-toast')).toContainText('Editable copy created');
    await expect(footer).toHaveText('12 bars · plays 2 times, then ends');
    await expect(page.locator('.chart-bottom')).not.toContainText('repeats continuously');
    // The copy is a measure chart: Edit opens its bars, not the text panel, and the footer's
    // menu holds the count.
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(page.locator('.edit-panel')).toHaveCount(0);
    await expect(await openBar(page, 1)).toBeVisible();
    await leaveBar(page);
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    expect(await formLength(page)).toBe('Plays 2 times');

    // What the conversion stored is the button's copy, with the count as one unsaved edit on
    // top; the original is untouched beside it.
    let stored = await documents(page);
    expect(stored.find((d) => d.id === 'starter-blues')).toEqual(original);
    const copies = stored.filter((d) => d.schemaVersion === 2);
    expect(copies.map((d) => d.title)).toEqual(['Blue pocket — editable copy']);
    expect(copies[0].schemaVersion === 2 && 'choruses' in copies[0].chart.score).toBe(false);
    // That unsaved count is retained like any edit to a library song: one recovery slot, the
    // copy's, so closing the tab before Save does not lose it.
    const copyId = copies[0].id;
    const recoveryKeys = () =>
        page.evaluate(() =>
            Object.keys(localStorage).filter((key) =>
                key.startsWith('ensemble-v2-preview:recovery:'),
            ),
        );
    await expect.poll(recoveryKeys).toHaveLength(1);
    expect((await recoveryKeys())[0].endsWith(`:${copyId}`)).toBe(true);
    await page.reload();
    await songLink(page, 'Blue pocket — editable copy').first().click();
    await expect(footer).toHaveText('12 bars · plays 2 times, then ends');
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await save.click();
    await expect(save).toBeDisabled();
    stored = await documents(page);
    expect(stored).toHaveLength(4);
    const saved = stored.find((d) => d.id === copyId);
    expect(saved?.schemaVersion === 2 && saved.chart.score.choruses).toBe(2);
    expect(stored.find((d) => d.id === 'starter-blues')).toEqual(original);
    expect(pageErrors).toEqual([]);
});
