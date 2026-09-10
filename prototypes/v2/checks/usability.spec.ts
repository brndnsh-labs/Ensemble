import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';

const blue = 'Blue pocket Blues · Saved locally';
async function openEditor(page: Page) {
    await page.goto('/v2/');
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
        'B♭7',
        'C13(#11b9)',
        'C '.repeat(501),
    ]) {
        await page.getByLabel('Chord text').fill(text);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.locator('.error-banner')).toBeVisible();
        await expect(page.getByLabel('Chord text')).toHaveValue(text);
        expect(await savedBlue(page)).toEqual(original);
    }
    const supported =
        '| Dm7 G7 | Cmaj7 | #ivm7b5 VII7alt | 1 4 57 | C6/9 | G7/B IVmaj9/5 | B#maj7 Cbmaj7 |';
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
    await page.goto('/v2/');
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

test('the stand scales to its screen in both states and keeps mute state readable', async ({
    page,
}, info) => {
    await page.goto('/v2/');
    await page.getByRole('button', { name: blue }).click();
    await page.waitForSelector('.bar');
    // #1186 — the stand's size is governed by .song-open / .performance-focus, not
    // by the base .bar/.chord rules, and the playing state used to be a flat 36px
    // chord in a 96px bar on every screen. Both states are pinned per breakpoint so
    // a later edit cannot quietly reintroduce a screen-independent scale.
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
        { width: 1300, height: 940, idle: [130, 42], playing: [150, 52], letter: 16 },
        { width: 1600, height: 1100, idle: [140, 48], playing: [165, 60], letter: 19 },
        { width: 820, height: 1180, idle: [140, 48], playing: [165, 60], letter: 19 },
        // Phone portrait is the reference layout and holds its established sizes:
        // enlarging chords wraps two-chord bars at this width.
        { width: 402, height: 874, idle: [86, 30], playing: [96, 30], letter: 14 },
        { width: 874, height: 402, idle: [86, 27], playing: [96, 36], letter: 12 },
    ]) {
        await page.setViewportSize({ width: at.width, height: at.height });
        for (const [focused, expected] of [
            [false, at.idle],
            [true, at.playing],
        ] as const) {
            const m = await measure(focused);
            expect(
                m.bar,
                `bar @${at.width}x${at.height} focused=${focused}`,
            ).toBeGreaterThanOrEqual(expected[0]);
            expect(
                m.chord,
                `chord @${at.width}x${at.height} focused=${focused}`,
            ).toBeGreaterThanOrEqual(expected[1]);
            expect(m.letter).toBeGreaterThanOrEqual(at.letter);
            expect(m.noOverflow).toBe(true);
        }
        await page.screenshot({
            path: info.outputPath(`stand-${at.width}x${at.height}.png`),
        });
    }
    // Phone must not grow: 402px cannot fit larger chords in a two-bar row.
    await page.setViewportSize({ width: 402, height: 874 });
    expect((await measure(false)).chord).toBeLessThanOrEqual(31);
    expect((await measure(true)).chord).toBeLessThanOrEqual(31);

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
