import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import {
    appUrl,
    barField,
    test as base,
    closeKeyPopover,
    editorRevealed,
    expect,
    exportAs,
    keyButton,
    leaveBar,
    openBar,
    openKeyPopover,
    openSectionContext,
    openSectionMenu,
    pickSongKey,
    seedStarters,
    songLink,
    songMenuAction,
    typeBar,
} from './fixtures';

const test = base.extend<{ disconnect: () => Promise<void> }>({
    disconnect: async ({ browserName, context, request }, use) => {
        await use(async () => {
            if (browserName === 'webkit') {
                // Same real connection refusal used by the existing offline regression:
                // this avoids WebKit's setOffline cached-navigation implementation error.
                expect((await request.post('/__test/network?offline=1')).ok()).toBe(true);
                await expect(
                    request.get(appUrl('not-cached'), { timeout: 3000 }),
                ).rejects.toThrow();
            } else {
                await context.setOffline(true);
            }
        });
        if (browserName === 'webkit') {
            await request.post('/__test/network?offline=0');
        }
    },
});

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

/** Blue pocket, a measure chart (#1733), open in Edit chart. */
async function editBlue(page: Page) {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await editorRevealed(page);
    await expect(page.locator('.sheet .bar').first()).toBeVisible();
}

/** The open bar's menu (#1725): ⋯ on the bar, or in the dock on a phone. */
async function openBarMenu(page: Page, bar: number) {
    await page.getByRole('button', { name: 'Bar menu', exact: true }).click();
    const menu = page.getByRole('dialog', { name: `Bar ${bar} menu`, exact: true });
    await expect(menu).toBeVisible();
    return menu;
}

/** Unfolds the open bar menu's "Key or meter from here" group. */
async function openKeyOrMeter(page: Page) {
    await page.locator('summary', { hasText: 'Key or meter from here' }).click();
}

/** Closes the bar menu back to typing (Esc), leaving the bar's field open. */
async function closeBarMenu(page: Page) {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /^Bar \d+ menu$/ })).toHaveCount(0);
}

async function exportCurrent(page: Page): Promise<ChartDocument> {
    const downloaded = page.waitForEvent('download');
    await exportAs(page, 'Song file');
    const path = await (await downloaded).path();
    const document = JSON.parse(await readFile(path!, 'utf8'));
    return document;
}

test('2+1+1 editor saves the song, transposes and reopens offline', async ({
    page,
    disconnect,
}, info) => {
    await editBlue(page);
    const before = await documents(page);
    const original = before.find((document) => document.id === 'starter-blues')!;
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
    // Save writes the song itself, one revision on; no other song is touched.
    expect(saved.id).toBe('starter-blues');
    expect(saved.revision).toBe(original.revision + 1);
    expect((await documents(page)).filter((document) => document.id !== saved.id)).toEqual(
        before.filter((document) => document.id !== saved.id),
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

test('unfinished bars survive selection, errors and hidden editor; Save commits every bar', async ({
    page,
}) => {
    await editBlue(page);
    const original = await documents(page);
    // Lengths written out: three bare chords in 4/4 would wait for a split choice (#1980).
    await typeBar(page, 1, 'C:2 Dm:1 G7:1');
    // Moving on applies bar 1; bar 2's unreadable text stays pending on its bar.
    await typeBar(page, 2, 'not-a-chord');
    await leaveBar(page);
    await expect(page.locator('.bar.unreadable')).toHaveCount(1);
    for (const name of ['Save', 'Back to songbook', 'Start playback']) {
        // A refused change opens the bar that needs fixing; on a phone that is the bar dock,
        // which folds the transport away until Done (#1724).
        await leaveBar(page);
        await page.getByRole('button', { name, exact: true }).click();
        await expect(page.locator('.error-banner')).toBeVisible();
        await expect(barField(page, 2)).toBeFocused();
        expect(await documents(page)).toEqual(original);
    }
    await leaveBar(page);
    // With the editor hidden, the unreadable bar is still pending: Save refuses it and opens it.
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.bar.unreadable')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.error-banner')).toBeVisible();
    await expect(barField(page, 2)).toBeFocused();
    expect(await documents(page)).toEqual(original);
    await leaveBar(page);
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['C', 'Dm', 'G7']);
    await typeBar(page, 1, 'C:2 Dm:1 G7:1');
    await typeBar(page, 2, 'F A7');
    // Out of the editor with bar 2 still open: pressing Chart leaves the bar, which applies it
    // (a bar still pending once the editor is hidden is in semantic-form-editor.spec.ts).
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.bar-input, .bar-dock')).toHaveCount(0);
    await expect(page.locator('.bar').nth(1).locator('.chord')).toHaveText(['F', 'A7']);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const exported = await exportCurrent(page);
    if (exported.schemaVersion !== 2) {
        throw new Error('Expected semantic document');
    }
    expect(exported.chart.score.sections[0].measures.slice(0, 2).map((bar) => bar.content)).toEqual(
        [
            {
                kind: 'events',
                events: [
                    { kind: 'chord', symbol: 'C', duration: [2, 1] },
                    { kind: 'chord', symbol: 'Dm', duration: [1, 1] },
                    { kind: 'chord', symbol: 'G7', duration: [1, 1] },
                ],
            },
            {
                kind: 'events',
                events: [
                    { kind: 'chord', symbol: 'F', duration: [2, 1] },
                    { kind: 'chord', symbol: 'A7', duration: [2, 1] },
                ],
            },
        ],
    );
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await typeBar(page, 1, 'unwanted');
    await songMenuAction(page, 'Revert to saved');
    await expect(page.locator('.bar.unreadable')).toHaveCount(0);
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['C', 'Dm', 'G7']);
    await expect(await openBar(page, 1)).toHaveValue('C:2 Dm:1 G7:1');
    await leaveBar(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('new charts support bar key/meter changes, growing the chart, recovery and detached import', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Mixed meter sketch');
    await openBar(page, 2);
    await openBarMenu(page, 2);
    await openKeyOrMeter(page);
    await page.getByLabel('Key from this bar').selectOption('G');
    await page.getByLabel('Meter from this bar').selectOption('3/4');
    await closeBarMenu(page);
    await barField(page, 2).fill('I V');
    await openBar(page, 3);
    await openBarMenu(page, 3);
    await openKeyOrMeter(page);
    await page.getByLabel('Meter from this bar').selectOption('4/4');
    await closeBarMenu(page);
    await barField(page, 3).fill('I');
    // Grow the chart: a bar after the last one (the bar menu), then a section (the letter's menu).
    await openBar(page, 4);
    await openBarMenu(page, 4);
    await page.getByRole('button', { name: 'Insert bar after', exact: true }).click();
    await expect(page.locator('.bar')).toHaveCount(5);
    await leaveBar(page);
    await (await openSectionMenu(page, 'A'))
        .getByRole('button', { name: 'Add section after', exact: true })
        .click();
    await expect(page.locator('.bar')).toHaveCount(6);
    await leaveBar(page);
    const exported = await exportCurrent(page);
    if (exported.schemaVersion !== 2) {
        throw new Error('Expected semantic document');
    }
    expect(exported.chart.score.sections[0].measures[1]).toMatchObject({ key: 'G', meter: '3/4' });
    expect(exported.chart.score.sections[0].measures[2]).toMatchObject({ meter: '4/4' });
    // The new song is kept on its first change (#1707): wait for it before leaving the page.
    await expect.poll(async () => (await documents(page)).length).toBeGreaterThan(0);
    await page.reload();
    await songLink(page, 'Untitled song').click();
    await expect(page.locator('.song-title')).toHaveText('Mixed meter sketch');
    await expect(page.locator('.bar')).toHaveCount(6);
    await page.getByLabel('Import Ensemble document').setInputFiles({
        name: 'chart.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(exported)),
    });
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    const imported = (await documents(page)).find((document) => document.title === exported.title)!;
    expect(imported.id).not.toBe(exported.id);
    expect(imported.chart).toEqual(exported.chart);
});

test('a mode-only change is visible on the music stand and survives Save', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await openBar(page, 2);
    await openBarMenu(page, 2);
    await openKeyOrMeter(page);
    await page.getByLabel('Mode from this bar').selectOption('minor');
    await closeBarMenu(page);
    await leaveBar(page);
    await expect(page.locator('.bar').nth(1).locator('.bar-context')).toHaveText('Cm · 4/4');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    const saved = (await documents(page)).find((document) => document.schemaVersion === 2)!;
    if (saved.schemaVersion !== 2) {
        throw new Error('Expected semantic document');
    }
    expect(saved.chart.score.sections[0].measures[1].isMinor).toBe(true);
});

test('semantic revision conflicts keep both takes, and unsupported imports never create a partial song', async ({
    page,
    context,
}) => {
    await editBlue(page);
    const original = (await documents(page)).find((document) => document.id === 'starter-blues')!;
    const second = await context.newPage();
    await second.goto(appUrl());
    await songLink(second, original.title, 'Blues').click();
    await second.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await typeBar(page, 1, 'C:2 Dm:1 G7:1');
    await leaveBar(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const newer = (await documents(page)).find((document) => document.id === original.id)!;
    // Saved straight from the open bar, not left first: Save commits what is typed.
    await typeBar(second, 1, 'F:3 G7:1');
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(second.locator('.error-banner')).toContainText('saved in another tab');
    await expect(await openBar(second, 1)).toHaveValue('F:3 G7:1');
    await leaveBar(second);
    expect((await documents(page)).find((document) => document.id === original.id)).toEqual(newer);
    await songMenuAction(second, 'Duplicate');
    const copy = await exportCurrent(second);
    expect(copy.id).not.toBe(original.id);
    if (copy.schemaVersion !== 2) {
        throw new Error('Expected semantic document');
    }
    expect(copy.chart.score.sections[0].measures[0].content).toEqual({
        kind: 'events',
        events: [
            { kind: 'chord', symbol: 'F', duration: [3, 1] },
            { kind: 'chord', symbol: 'G7', duration: [1, 1] },
        ],
    });
    const beforeImport = await documents(second);
    // A valid chart the form compiler refuses: a D.C. al 2nd ending with no Fine to stop at.
    const unsupported = structuredClone(copy);
    const measures = unsupported.chart.score.sections[0].measures;
    measures[0].start = [{ kind: 'repeat-start' }];
    measures[1].start = [{ kind: 'ending-start', passes: [1] }];
    measures[1].end = [{ kind: 'repeat-end', times: 2 }, { kind: 'ending-end' }];
    measures[2].start = [{ kind: 'ending-start', passes: [2] }];
    measures[2].end = [{ kind: 'ending-end' }];
    measures[3].end = [
        { kind: 'jump', from: 'start', destination: { kind: 'ending', pass: 2 }, repeats: 'skip' },
    ];
    await second.getByLabel('Import Ensemble document').setInputFiles({
        name: 'not-yet-playable.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(unsupported)),
    });
    await expect(second.locator('.error-banner')).toContainText('needs a Fine');
    expect(await documents(second)).toEqual(beforeImport);
    await expect(second.locator('.bar').first().locator('.chord')).toHaveText(['F', 'G7']);
});

test('Song mode writes score.isMinor only, and Save keeps it (#1375)', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    const menu = await openKeyPopover(page);
    const mode = menu.getByLabel('Mode', { exact: true });

    await mode.selectOption('minor');

    await closeKeyPopover(page);
    await expect(page.locator('.bar-context').first()).toHaveText('Cm · 4/4');
    // The transport's Key button names a minor key with its "m".
    await expect(keyButton(page)).toHaveAccessibleName('Key: Cm');
    // Chord names are not rewritten, and the key stays C — no relative-key swap.
    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F']);

    // A section that states its own mode keeps it through a song-level change.
    const section = await openSectionMenu(page, 'A');
    await openSectionContext(section);
    await section.getByLabel('Section mode').selectOption('major');
    await expect(page.locator('.bar-context').first()).toHaveText('C · 4/4');
    await section.press('Escape');
    await expect(section).toBeHidden();
    await openKeyPopover(page);
    await mode.selectOption('major');
    await mode.selectOption('minor');
    await closeKeyPopover(page);
    const again = await openSectionMenu(page, 'A');
    await openSectionContext(again);
    await expect(again.getByLabel('Section mode')).toHaveValue('major');
    await again.press('Escape');
    await expect(again).toBeHidden();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const saved = (await documents(page)).find((document) => document.title === 'Untitled song');
    if (saved?.schemaVersion !== 2) {
        throw new Error('Expected the new song as a semantic document');
    }
    expect(saved.chart.score.isMinor).toBe(true);
    expect(saved.chart.score.key).toBe('C');
    expect(saved.chart.score.sections[0].isMinor).toBe(false);
});

test('a 5/4 bar takes a 2+3 grouping, Save keeps it, and a meter change clears it (#1376)', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await openBar(page, 1);
    await openBarMenu(page, 1);
    await openKeyOrMeter(page);
    // 4/4 has one natural grouping, so there is nothing to choose.
    await expect(page.getByLabel('Beat grouping from this bar')).toHaveCount(0);
    await closeBarMenu(page);
    await leaveBar(page);

    const menu = await openKeyPopover(page);
    await menu.getByLabel('Meter', { exact: true }).selectOption('5/4');
    await closeKeyPopover(page);
    await openBar(page, 1);
    await openBarMenu(page, 1);
    await openKeyOrMeter(page);
    const grouping = page.getByLabel('Beat grouping from this bar');
    await expect(grouping.locator('option')).toHaveText(['Continue (3+2)', '3+2', '2+3']);
    await grouping.selectOption('2+3');
    await closeBarMenu(page);
    await leaveBar(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const saved = (await documents(page)).find((document) => document.schemaVersion === 2);
    if (saved?.schemaVersion !== 2) {
        throw new Error('Expected semantic document');
    }
    expect(saved.chart.score.sections[0].measures[0].grouping).toEqual([2, 3]);

    // The existing rule: a meter change resets a grouping written for the old meter.
    const again = await openKeyPopover(page);
    await again.getByLabel('Meter', { exact: true }).selectOption('4/4');
    await closeKeyPopover(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const resaved = (await documents(page)).find((document) => document.id === saved.id);
    if (resaved?.schemaVersion !== 2) {
        throw new Error('Expected semantic document');
    }
    expect(resaved.chart.score.sections[0].measures[0]).not.toHaveProperty('grouping');
});
