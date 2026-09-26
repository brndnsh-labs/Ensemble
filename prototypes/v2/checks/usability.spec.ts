import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';

const blue = 'Blue pocket Blues · Saved locally';
async function openEditor(page: Page) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: blue }).click();
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
    await page.getByRole('button', { name: 'Song actions' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export file', exact: true }).click();
    const path = await (await download).path();
    const document = JSON.parse(await readFile(path!, 'utf8'));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    return document;
}

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

test('export and Save a copy include typed text but do not overwrite the original save', async ({
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
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Save a copy', exact: true }).click();
    await expect(page.locator('.song-title')).toHaveText('Blue pocket — copy');
    expect((await exportCurrent(page)).chart.arrangement.sections[0].value).toBe(
        'Am7 | D7 | Gmaj7',
    );
    expect(await savedBlue(page)).toEqual(original);
});

// #1331 — the guard's job is "new editor text must never silently become another chord", and
// it did that by comparing the parser's canonical spelling back to the typed text. Once the
// parser learned to normalise case, parentheses, Δ and the in-quality slash (#1320-#1324),
// that string comparison rejected exactly the spellings it had just learned to read.
test('a queued close event cannot shut a dialog that has already been reopened (#1402)', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: blue }).click();
    await page.getByRole('button', { name: 'Song actions' }).click();
    await expect(page.getByRole('button', { name: 'Export file', exact: true })).toBeVisible();
    // `close()` queues its `close` event. When an action closes the menu and "Song actions"
    // reopens it before that task runs, the stale event arrives at an OPEN dialog — this is it.
    await page.evaluate(() =>
        document.querySelector('dialog.modal-box')?.dispatchEvent(new Event('close')),
    );
    await page.waitForTimeout(100);
    await expect(page.getByRole('button', { name: 'Export file', exact: true })).toBeVisible();
    // A real close still reports.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Export file', exact: true })).toBeHidden();
});

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
    for (const action of ['Save a copy', 'Export file']) {
        await page.getByRole('button', { name: 'Song actions' }).click();
        await page.getByRole('button', { name: action, exact: true }).click();
        await expect(page.locator('.error-banner')).toContainText('unsupported chord spelling');
        await expect(page.getByLabel('Chord text')).toHaveValue('C | potato | G');
    }
    await page.getByLabel('Key', { exact: true }).selectOption('D');
    await expect(page.getByLabel('Key', { exact: true })).toHaveValue('C');
    await page.getByLabel('Feel', { exact: true }).selectOption('Jazz');
    await expect(page.getByLabel('Feel', { exact: true })).toHaveValue('Blues');
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
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Revert to saved' }).click();
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

test('transposition follows pending text and cannot be undone by stale editor text', async ({
    page,
}) => {
    await openEditor(page);
    await page.getByLabel('Key', { exact: true }).selectOption('D');
    await expect(page.getByLabel('Chord text')).toHaveValue(/^D7 \| G7/);
    await page.getByRole('button', { name: 'Update chart', exact: true }).click();
    await expect(page.locator('.chord-button').first()).toHaveText('D7');
    await page.getByLabel('Chord text').fill('Dm7 | G7');
    await page.getByLabel('Key', { exact: true }).selectOption('E');
    await expect(page.getByLabel('Chord text')).toHaveValue('Em7 | A7');
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await page.getByLabel('Section', { exact: true }).selectOption('a');
    await expect(page.getByLabel('Chord text')).toHaveValue('Em7 | A7');
    await page.getByLabel('Chord text').fill('F#m7 | B7');
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await page.getByRole('button', { name: 'Open chart →', exact: true }).click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(page.getByLabel('Chord text')).toHaveValue('F#m7 | B7');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect(page.locator('.chord-button').first()).toHaveText('F#m7');
});

test('tempo allows sequential typing, Enter, blur, Escape and single step commits', async ({
    page,
}) => {
    await openEditor(page);
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.click();
    await tempo.press('ControlOrMeta+A');
    await tempo.pressSequentially('90', { delay: 120 });
    await expect(tempo).toHaveValue('90');
    await tempo.press('Enter');
    await expect(tempo).toBeEnabled();
    expect((await exportCurrent(page)).chart.performance.bpm).toBe(90);
    await tempo.fill('135');
    await tempo.press('Tab');
    await expect(tempo).toBeEnabled();
    expect((await exportCurrent(page)).chart.performance.bpm).toBe(135);
    await tempo.fill('200');
    await tempo.press('Escape');
    await expect(tempo).toHaveValue('135');
    await tempo.fill('100');
    await page.getByRole('button', { name: 'Faster', exact: true }).click();
    await expect(tempo).toHaveValue('105');
    expect((await exportCurrent(page)).chart.performance.bpm).toBe(105);
    await tempo.fill('80');
    await page.getByRole('button', { name: 'Slower', exact: true }).click();
    await expect(tempo).toHaveValue('75');
    await tempo.fill('1');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('40');
    await tempo.fill('999');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');
});

test('Continue remembers opened songs and recovered setup without changing saved timestamps', async ({
    page,
}) => {
    await page.goto(appUrl());
    await expect(page.locator('.continue-card')).toContainText('A good place to start');
    await page.getByRole('button', { name: blue }).click();
    const before = await savedBlue(page);
    await page.getByRole('button', { name: 'Faster', exact: true }).click();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.locator('.continue-card')).toContainText('Blue pocket');
    await expect(page.locator('.continue-card')).toContainText('115 BPM');
    expect(await savedBlue(page)).toEqual(before);
    await page.reload();
    await expect(page.locator('.continue-card')).toContainText('Pick up where you left off');
    await expect(page.locator('.continue-card')).toContainText('Blue pocket');
    await expect(page.locator('.continue-card')).toContainText('115 BPM');
    await page.getByRole('button', { name: 'Open chart →', exact: true }).click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
    expect(await savedBlue(page)).toEqual(before);
});

test('last-opened preference failure does not prevent playback or saving', async ({ page }) => {
    await page.addInitScript(() => {
        for (const method of ['getItem', 'setItem'] as const) {
            const original = Storage.prototype[method];
            Storage.prototype[method] = function (key: string, ...args: string[]) {
                if (key === 'ensemble-v2-preview:last-opened') {
                    throw new DOMException('Storage unavailable', 'SecurityError');
                }
                return Reflect.apply(original, this, [key, ...args]);
            };
        }
    });
    await openEditor(page);
    await page.getByLabel('Chord text').fill('Dm7 | G7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await expect(page.locator('.error-banner')).toHaveCount(0);
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
    await page.getByRole('button', { name: 'Open chart →', exact: true }).click();
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
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Save a copy', exact: true }).click();
    await expect(page.locator('.song-title')).toHaveText('Blue pocket — copy');
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
            await expect(page.getByRole('heading', { name: 'Edit your chart' })).toBeInViewport();
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

test('the stand scales to its screen, holds still across play/pause and keeps mute state readable', async ({
    page,
}, info) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: blue }).click();
    await page.waitForSelector('.bar');
    // #1186 pinned a playing-only scale larger than idle; that made every play/pause
    // toggle reflow bar height, chord size and section letters at once, which read
    // as the chart jumping around. One scale now covers both states — toggling
    // performance-focus must not change any of these measurements.
    const measure = (focused: boolean) =>
        page.evaluate((f) => {
            document.querySelector('.app-shell')!.classList.toggle('performance-focus', f);
            const px = (selector: string, property: 'minHeight' | 'fontSize') =>
                Number.parseFloat(
                    getComputedStyle(document.querySelector(selector) as HTMLElement)[property],
                );
            return {
                bar: px('.bar', 'minHeight'),
                chord: px('.chord', 'fontSize'),
                letter: px('.section-letter', 'fontSize'),
                noOverflow: document.documentElement.scrollWidth <= innerWidth,
            };
        }, focused);
    for (const at of [
        { width: 1300, height: 940, bar: 130, chord: 42, letter: 16 },
        { width: 1600, height: 1100, bar: 140, chord: 48, letter: 19 },
        { width: 820, height: 1180, bar: 140, chord: 48, letter: 19 },
        // Phone portrait is the reference layout and holds its established size.
        { width: 402, height: 874, bar: 86, chord: 30, letter: 14 },
        { width: 874, height: 402, bar: 86, chord: 27, letter: 12 },
    ]) {
        await page.setViewportSize({ width: at.width, height: at.height });
        const idle = await measure(false);
        expect(idle.bar, `bar @${at.width}x${at.height}`).toBeGreaterThanOrEqual(at.bar);
        expect(idle.chord, `chord @${at.width}x${at.height}`).toBeGreaterThanOrEqual(at.chord);
        expect(idle.letter).toBeGreaterThanOrEqual(at.letter);
        expect(idle.noOverflow).toBe(true);
        const playing = await measure(true);
        expect(playing.bar, `play/pause jump @${at.width}x${at.height}`).toBe(idle.bar);
        expect(playing.chord, `play/pause jump @${at.width}x${at.height}`).toBe(idle.chord);
        expect(playing.letter, `play/pause jump @${at.width}x${at.height}`).toBe(idle.letter);
        expect(playing.noOverflow).toBe(true);
        await measure(false);
        await page.screenshot({
            path: info.outputPath(`stand-${at.width}x${at.height}.png`),
        });
    }
    // Phone must not grow: 402px cannot fit larger chords in a two-bar row.
    await page.setViewportSize({ width: 402, height: 874 });
    expect((await measure(false)).chord).toBeLessThanOrEqual(31);

    // The muted treatment (hollow dot, struck label, dropped chrome) existed in the
    // stylesheet but was unreachable: the button emitted no `off` class and rendered
    // a bare text node with no `span.label` to match.
    await page.setViewportSize({ width: 1300, height: 940 });
    await page.evaluate(() =>
        document.querySelector('.app-shell')!.classList.remove('performance-focus'),
    );
    const drums = page.getByRole('button', { name: 'Drums' });
    const chrome = () =>
        drums.evaluate((element) => {
            const label = element.querySelector('.label');
            return {
                background: getComputedStyle(element).backgroundColor,
                border: getComputedStyle(element).borderTopColor,
                strike: label ? getComputedStyle(label).textDecorationLine : 'missing',
            };
        });
    const on = await chrome();
    await drums.click();
    await expect(drums).toHaveAttribute('aria-pressed', 'false');
    await expect(drums).toHaveClass(/\boff\b/);
    const off = await chrome();
    expect(off.background).not.toBe(on.background);
    expect(off.border).not.toBe(on.border);
    expect(off.strike).toContain('line-through');
    expect(on.strike).not.toContain('line-through');
});

const luminance = (css: string) => {
    const [r, g, b] = css
        .replace(/rgba?\(|\)/g, '')
        .split(',')
        .slice(0, 3)
        .map((channel) => {
            const c = Number(channel) / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

test('stage mode darkens the stand, persists per device and follows the system when unset', async ({
    page,
}, info) => {
    await page.emulateMedia({ colorScheme: 'light' });
    const openStand = async () => {
        await page.goto(appUrl());
        await page.getByRole('button', { name: blue }).click();
        await page.waitForSelector('.bar');
    };
    const paint = () =>
        page.evaluate(() => {
            const style = (selector: string) =>
                getComputedStyle(document.querySelector(selector) as HTMLElement);
            const bar = document.querySelector('.bar') as HTMLElement;
            bar.classList.add('active');
            const activeBar = getComputedStyle(bar).backgroundColor;
            bar.classList.remove('active');
            return {
                paper: style('html').backgroundColor,
                chord: style('.chord').color,
                activeBar,
                theme: document.documentElement.dataset.theme ?? null,
            };
        });
    await openStand();
    const stageButton = page.getByRole('button', { name: 'Stage' });
    await expect(stageButton).toHaveAttribute('aria-pressed', 'false');
    const day = await paint();
    expect(day.theme).toBeNull();
    expect(luminance(day.paper)).toBeGreaterThan(0.8);
    expect(luminance(day.chord)).toBeLessThan(0.05);

    // #1208: one tap turns the whole stand dark, with the chart still readable.
    await stageButton.click();
    await expect(stageButton).toHaveAttribute('aria-pressed', 'true');
    const stage = await paint();
    expect(stage.theme).toBe('stage');
    expect(luminance(stage.paper)).toBeLessThan(0.02);
    expect(luminance(stage.chord)).toBeGreaterThan(0.8);
    expect(contrast(stage.chord, stage.paper)).toBeGreaterThan(12);
    expect(contrast(stage.chord, stage.activeBar)).toBeGreaterThan(4.5);
    await page.evaluate(() =>
        document.querySelector('.app-shell')!.classList.add('performance-focus'),
    );
    // The toggle stays reachable while the chart is focused for playback.
    await expect(stageButton).toBeVisible();
    await page.screenshot({ path: info.outputPath('stage-mode.png') });
    await page.evaluate(() =>
        document.querySelector('.app-shell')!.classList.remove('performance-focus'),
    );

    // The choice is a per-device preference: it survives reload and is applied
    // before hydration, and it is not written into the saved document.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'stage');
    await page.getByRole('button', { name: blue }).click();
    await expect(stageButton).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.stringify(await savedBlue(page))).not.toContain('stage');

    // Unset follows the system preference without writing a choice.
    await page.evaluate(() => localStorage.removeItem('ensemble-v2-preview:theme'));
    await page.emulateMedia({ colorScheme: 'dark' });
    await openStand();
    const system = await paint();
    expect(system.theme).toBeNull();
    expect(luminance(system.paper)).toBeLessThan(0.02);
    await expect(stageButton).toHaveAttribute('aria-pressed', 'true');
    await stageButton.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
    expect(luminance((await paint()).paper)).toBeGreaterThan(0.8);
});

test('a muted lane reads as muted at a distance and toggling never reflows the row', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: blue }).click();
    await page.waitForSelector('.bar');
    const drums = page.getByRole('button', { name: 'Drums', exact: true });
    const chrome = () =>
        drums.evaluate((element) => {
            const style = getComputedStyle(element);
            const dot = getComputedStyle(element.querySelector('.dot') as HTMLElement);
            return {
                width: element.getBoundingClientRect().width,
                background: style.backgroundColor,
                borderStyle: style.borderTopStyle,
                dotFill: dot.backgroundColor,
                weight: style.fontWeight,
            };
        });
    const on = await chrome();
    expect(on.borderStyle).toBe('solid');
    expect(on.background).not.toBe('rgba(0, 0, 0, 0)');
    await drums.click();
    // #1210: hollow chip — dashed border, hollow dot, transparent fill. The
    // accessible name stays "Drums" (a toggle's label must not change with its
    // state, per the ARIA button pattern); aria-pressed carries the state.
    await expect(drums).toHaveAttribute('aria-pressed', 'false');
    const off = await drums.evaluate((element) => {
        const style = getComputedStyle(element);
        const dot = getComputedStyle(element.querySelector('.dot') as HTMLElement);
        return {
            width: element.getBoundingClientRect().width,
            background: style.backgroundColor,
            borderStyle: style.borderTopStyle,
            dotFill: dot.backgroundColor,
            weight: style.fontWeight,
        };
    });
    expect(off.borderStyle).toBe('dashed');
    expect(off.background).toBe('rgba(0, 0, 0, 0)');
    expect(off.dotFill).toBe('rgba(0, 0, 0, 0)');
    expect(off.dotFill).not.toBe(on.dotFill);
    expect(off.weight).toBe(on.weight);
    expect(Math.abs(off.width - on.width)).toBeLessThan(1);
});
