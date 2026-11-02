import { readFile } from 'node:fs/promises';
import type { ChartDocumentV2 } from '@core/songbook/score-types';
import type { Page } from '@playwright/test';
import {
    closeBarDock,
    expect,
    exportAs,
    keyButton,
    leaveBar,
    openBar,
    openSectionMenu,
    phoneWidth,
    pickSongKey,
    seedStarters,
    settled,
    songLink,
    songMenuAction,
    test,
    typeBar,
} from './fixtures';

async function openEditor(page: Page) {
    await seedStarters(page);
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
            return await new Promise<ChartDocumentV2>((resolve, reject) => {
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
/** The chord symbols of bar `bar` (from 1) of section `section` (from 0). */
function symbols(document: ChartDocumentV2, bar: number, section = 0): string[] {
    const content = document.chart.score.sections[section].measures[bar - 1].content;
    if (content.kind !== 'events') {
        throw new Error('expected chord events');
    }
    return content.events.map((event) => (event.kind === 'chord' ? event.symbol : '?'));
}
async function exportCurrent(page: Page) {
    const download = page.waitForEvent('download');
    await exportAs(page, 'Song file');
    const path = await (await download).path();
    const document = JSON.parse(await readFile(path!, 'utf8'));
    return document;
}

test('typed chords are unsaved work: Save includes every edited section without leaving the bar', async ({
    page,
}) => {
    await openEditor(page);
    // A second section after A (#1726): its one bar is bar 13.
    await (await openSectionMenu(page, 'A'))
        .getByRole('button', { name: 'Add section after', exact: true })
        .click();
    await leaveBar(page);
    await expect(page.locator('.bar')).toHaveCount(13);
    await typeBar(page, 1, 'Dm7 G7');
    await typeBar(page, 13, 'Fmaj7 E7');
    // Section A kept its bar while section B was typed.
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['Dm7', 'G7']);
    await expect(page.locator('.song-subtitle')).toContainText('Unsaved chord text');
    // Save straight from the open bar: it keeps every section's bars.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const saved = await savedBlue(page);
    expect(symbols(saved, 1, 0)).toEqual(['Dm7', 'G7']);
    expect(symbols(saved, 1, 1)).toEqual(['Fmaj7', 'E7']);
    await typeBar(page, 1, 'Am7 D7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect(symbols(await savedBlue(page), 1)).toEqual(['Am7', 'D7']);
});

test('a practice nudge is said apart from a chart change, and both wait for Save (#1706)', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    const status = page.locator('.song-subtitle > span').first();
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(status).toHaveText('Saved on this device');

    await page.getByRole('button', { name: 'Faster', exact: true }).click();
    await expect(status).toHaveText('Practice settings changed · Save to keep');
    await expect(status).toHaveClass('practice-changed');
    await expect(save).toBeEnabled();
    // Undone by hand, nothing is left to keep.
    await page.getByRole('button', { name: 'Slower', exact: true }).click();
    await expect(status).toHaveText('Saved on this device');
    await expect(save).toBeDisabled();

    // Transposing rewrites the chords: a chart change, whatever else changed with it.
    await page.getByRole('button', { name: 'Faster', exact: true }).click();
    const before = (await keyButton(page).getAttribute('aria-label'))?.replace('Key: ', '');
    await pickSongKey(page, before === 'D' ? 'E' : 'D');
    await expect(status).toHaveText('Unsaved changes on this device');
    await expect(status).toHaveClass('unsaved');

    // Nothing was written until Save, which keeps both.
    const stored = await savedBlue(page);
    expect(stored.chart.score.key).not.toBe(before === 'D' ? 'E' : 'D');
    await save.click();
    await expect(save).toBeDisabled();
    await expect(status).toHaveText('Saved on this device');
    const kept = await savedBlue(page);
    expect(kept.chart.performance.bpm).toBe(stored.chart.performance.bpm + 5);
    expect(kept.chart.score.key).toBe(before === 'D' ? 'E' : 'D');
});

test('export and Duplicate include a typed bar but do not overwrite the original save', async ({
    page,
}) => {
    await openEditor(page);
    const original = await savedBlue(page);
    await typeBar(page, 1, 'Dm7 G7');
    expect(symbols(await exportCurrent(page), 1)).toEqual(['Dm7', 'G7']);
    expect(await savedBlue(page)).toEqual(original);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await typeBar(page, 1, 'Am7 D7');
    await songMenuAction(page, 'Duplicate');
    // While editing, the title is the header's input (#1726).
    await expect(page.getByLabel('Song title')).toHaveValue('Blue pocket — copy');
    expect(symbols(await exportCurrent(page), 1)).toEqual(['Am7', 'D7']);
    expect(await savedBlue(page)).toEqual(original);
});

test('a queued close event cannot shut a dialog that has already been reopened (#1402)', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await songMenuAction(page, 'Export…');
    const dialog = page.getByTestId('export-dialog');
    await expect(dialog).toBeVisible();
    // `close()` queues its `close` event. When an action closes a dialog and it is reopened
    // before that task runs, the stale event arrives at an OPEN dialog — this is it.
    await page.evaluate(() =>
        document.querySelector('[data-testid="export-dialog"]')?.dispatchEvent(new Event('close')),
    );
    await page.waitForTimeout(100);
    await expect(dialog).toBeVisible();
    // A real close still reports.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
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

// #1485 — opening a song remounts the tempo field (`key={current.id}`), and its sync effect used
// to set the text to the song's tempo once more on mount. That effect runs a task after the
// commit, so a tempo typed in between was overwritten by it: on a loaded CI runner a
// `fill('240')` right after an import read back `100`. This types in the commit's own microtask,
// the earliest moment the field exists, which lands inside that window every time.
test('a tempo typed the moment a song opens is not overwritten by the field mounting (#1485)', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    const document = await exportCurrent(page);
    document.title = 'Blue pocket (imported)';
    await page.evaluate(() => {
        const opened = window.document.getElementById('tempo');
        const typed = window as unknown as { typed?: string };
        const watch = new MutationObserver(() => {
            const field = window.document.getElementById('tempo') as HTMLInputElement | null;
            if (!field || field === opened || field.disabled) {
                return;
            }
            watch.disconnect();
            // A keystroke as React sees one: the prototype setter skips React's value tracker.
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
                field,
                '137',
            );
            field.dispatchEvent(new Event('input', { bubbles: true }));
            typed.typed = field.value;
        });
        watch.observe(window.document, { subtree: true, childList: true, attributes: true });
    });
    await page.getByLabel('Import Ensemble document').setInputFiles({
        name: 'imported.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(document)),
    });
    await expect
        .poll(() => page.evaluate(() => (window as unknown as { typed?: string }).typed))
        .toBe('137');
    const tempo = page.getByLabel('Tempo', { exact: true });
    // Long enough for the mount's effects to have run, so a regression has had its chance.
    await page.waitForTimeout(500);
    await expect(tempo).toHaveValue('137');
    await tempo.press('Enter');
    expect((await exportCurrent(page)).chart.performance.bpm).toBe(137);
});

test('Continue remembers opened songs and recovered setup without changing saved timestamps', async ({
    page,
}) => {
    await seedStarters(page);
    await expect(page.locator('.continue-card')).toContainText('From your songbook');
    await songLink(page, 'Blue pocket', 'Blues').click();
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
    await page.getByRole('button', { name: 'Open chart', exact: true }).click();
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
    await typeBar(page, 1, 'Dm7 G7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect(symbols(await savedBlue(page), 1)).toEqual(['Dm7', 'G7']);
    // On a phone the transport is back once the bar dock is done (#1724).
    await leaveBar(page);
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
    await typeBar(page, 1, 'Fmaj7 E7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.error-banner')).toContainText('Your chart is still open');
    expect(await savedBlue(page)).toEqual(original);
    await leaveBar(page);
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Open chart', exact: true }).click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['Fmaj7', 'E7']);
    await expect(await openBar(page, 1)).toHaveValue('Fmaj7 E7');
    await leaveBar(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect(symbols(await savedBlue(page), 1)).toEqual(['Fmaj7', 'E7']);
});

test('a revision conflict retains typed chords and allows an independent copy', async ({
    page,
    context,
}) => {
    await openEditor(page);
    const second = await context.newPage();
    await openEditor(second);
    await typeBar(second, 1, 'Am7 D7');
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const newer = await savedBlue(page);
    await typeBar(page, 1, 'Dm7 G7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.error-banner')).toContainText('saved in another tab');
    await expect(await openBar(page, 1)).toHaveValue('Dm7 G7');
    expect(await savedBlue(page)).toEqual(newer);
    await leaveBar(page);
    await songMenuAction(page, 'Duplicate');
    // While editing, the title is the header's input (#1726).
    await expect(page.getByLabel('Song title')).toHaveValue('Blue pocket — copy');
    expect(symbols(await exportCurrent(page), 1)).toEqual(['Dm7', 'G7']);
    expect(await savedBlue(page)).toEqual(newer);
});

test('Edit chart, a bar and the section menu are in reach across laptop, phone and tablet layouts', async ({
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
        await leaveBar(page);
        await page.getByRole('button', { name: 'Chart', exact: true }).click();
        await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
        const field = await openBar(page, 1);
        await expect(field).toBeInViewport();
        expect((await page.getByLabel('Song title').boundingBox())!.height).toBeLessThan(65);
        expect(
            await field.evaluate((element) =>
                Number.parseFloat(getComputedStyle(element).fontSize),
            ),
        ).toBeGreaterThanOrEqual(16);
        if (phoneWidth(page)) {
            // A phone types the bar in the dock over the keyboard (#1724), with the chart on
            // screen above it.
            await expect(page.locator('.bar-dock')).toBeInViewport();
            await expect(page.locator('.chart-scroll')).toBeInViewport();
        }
        await closeBarDock(page);
        await leaveBar(page);
        const menu = await openSectionMenu(page, 'A');
        await expect(menu).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true,
        );
        await page.screenshot({
            path: info.outputPath(`editor-${viewport.width}x${viewport.height}.png`),
        });
        await menu.press('Escape');
        await expect(menu).toBeHidden();
    }
});

test('the stand scales to its screen and keeps mute state readable', async ({ page }, info) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.waitForSelector('.bar');
    // Play/pause holding the chart still is `chart-fit.spec.ts`'s, on real playback.
    const measure = () =>
        page.evaluate(async () => {
            // Past the re-fit a viewport resize sets off (`useChartFit`'s ResizeObserver, #1712):
            // `data-fits` is still the last size's until it runs, so it can't be waited on.
            for (let i = 0; i < 3; i++) {
                await new Promise(requestAnimationFrame);
            }
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
        });
    // The stand is a page (#1712): a 12-bar blues takes a step that fills the screen it is on,
    // four bars to a row everywhere, never under the 18px floor, and a bigger screen never sets
    // it smaller.
    let previous = { area: 0, chord: 0 };
    for (const at of [
        { width: 402, height: 874 },
        { width: 874, height: 402 },
        { width: 820, height: 1180 },
        { width: 1300, height: 940 },
        { width: 1600, height: 1100 },
    ]) {
        await page.setViewportSize({ width: at.width, height: at.height });
        await expect(page.locator('.chart-scroll[data-fits="true"]')).toBeVisible();
        const idle = await measure();
        expect(idle.chord, `chord @${at.width}x${at.height}`).toBeGreaterThanOrEqual(18);
        expect(idle.letter).toBeGreaterThanOrEqual(11);
        expect(idle.noOverflow).toBe(true);
        const area = at.width * at.height;
        if (area > previous.area && at.width >= 820) {
            expect(idle.chord, `chord @${at.width}x${at.height}`).toBeGreaterThanOrEqual(
                previous.chord,
            );
        }
        previous = { area, chord: idle.chord };
        await page.screenshot({
            path: info.outputPath(`stand-${at.width}x${at.height}.png`),
        });
    }
    expect(
        await page.evaluate(() => {
            const bars = [...document.querySelectorAll('.bar')];
            const top = bars[0].getBoundingClientRect().top;
            return bars.filter((bar) => bar.getBoundingClientRect().top === top).length;
        }),
    ).toBe(4);

    // The muted treatment (hollow dot, struck label, dropped chrome) existed in the
    // stylesheet but was unreachable: the button emitted no `off` class and rendered
    // a bare text node with no `span.label` to match.
    await page.setViewportSize({ width: 1300, height: 940 });
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
    await settled(drums);
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
        await seedStarters(page);
        await songLink(page, 'Blue pocket', 'Blues').click();
        await page.waitForSelector('.bar');
    };
    const paint = () =>
        page.evaluate(() => {
            const style = (selector: string) =>
                getComputedStyle(document.querySelector(selector) as HTMLElement);
            const bar = document.querySelector('.bar') as HTMLElement;
            bar.classList.add('active');
            const activeBar = getComputedStyle(bar).backgroundColor;
            // The playing bar is a solid fill with its own text colour (#1991).
            const activeChord = getComputedStyle(bar.querySelector('.chord') as HTMLElement).color;
            bar.classList.remove('active');
            return {
                paper: style('html').backgroundColor,
                chord: style('.chord').color,
                activeBar,
                activeChord,
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
    expect(contrast(stage.activeChord, stage.activeBar)).toBeGreaterThan(4.5);
    await page.screenshot({ path: info.outputPath('stage-mode.png') });

    // The choice is a per-device preference: it survives reload and is applied
    // before hydration, and it is not written into the saved document.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'stage');
    await songLink(page, 'Blue pocket', 'Blues').click();
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
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
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
    await settled(drums);
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
