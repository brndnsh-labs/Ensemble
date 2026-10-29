import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import {
    appUrl,
    test as base,
    editorRevealed,
    expect,
    exportAs,
    keyButton,
    leaveBar,
    openBar,
    pickSongKey,
    songLink,
    songMenuAction,
} from './fixtures';

const test = base.extend<{ disconnect: () => Promise<void> }>({
    disconnect: async ({ browserName, context, request }, use) => {
        await use(async () => {
            if (browserName === 'webkit') {
                // The preview's existing offline regression uses real socket refusal to avoid
                // WebKit's setOffline cached-navigation implementation error. No cache is faked.
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

async function savedDocuments(page: Page): Promise<ChartDocument[]> {
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

async function newSong(page: Page, title: string) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await expect(page.locator('.bar .chord')).toHaveText(['C', 'G', 'Am', 'F']);
    await page.getByLabel('Song title').fill(title);
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    // The title is the song's first change, which keeps it (#1707): wait for that save.
    await expect.poll(async () => (await savedDocuments(page)).length).toBeGreaterThan(0);
}

/**
 * Bar `bar`'s own repeat and ending markers: the per-bar view of the Repeats and endings dialog,
 * from the bar menu's "Repeat or ending…" (#1758; in the bar menu itself before). The markers are
 * a draft change like the bar's chords: applied on leaving the bar, kept by Save. Where the
 * pending bars' markers make no form yet, the dialog opens on them; otherwise on the guide.
 */
async function barForm(page: Page, bar: number): Promise<Locator> {
    await openBar(page, bar);
    const menu = page.getByRole('dialog', { name: `Bar ${bar} menu`, exact: true });
    if (!(await menu.isVisible())) {
        await page.getByRole('button', { name: 'Bar menu', exact: true }).click();
    }
    await menu.getByRole('button', { name: /^Repeat or ending/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Repeats and endings', exact: true });
    await expect(dialog).toBeVisible();
    const perBar = dialog.getByRole('button', { name: /^Per-bar markers for / });
    if (await perBar.isVisible()) {
        await expect(dialog.getByLabel('Start repeat here', { exact: true })).toHaveCount(0);
        await perBar.click();
    }
    await expect(dialog.getByLabel('Start repeat here', { exact: true })).toBeVisible();
    return dialog;
}

/** Closes the markers (Esc) back to typing; the bar's field stays open, its draft kept. */
async function closeBarMenu(page: Page) {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Repeats and endings' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: /^Bar \d+ menu$/ })).toHaveCount(0);
}

/** Sets bar 3 to end a repeat after ending 1, and bar 4 to be ending 2, through their menus. */
async function addEndings(page: Page) {
    let menu = await barForm(page, 3);
    await menu.getByLabel('Ending passes', { exact: true }).fill('1');
    await menu.getByLabel('Total repeat passes', { exact: true }).fill('2');
    await closeBarMenu(page);
    menu = await barForm(page, 4);
    await menu.getByLabel('Ending passes', { exact: true }).fill('2');
    await menu.getByLabel('End ending here', { exact: true }).check();
    await closeBarMenu(page);
}

async function exportCurrent(page: Page): Promise<ChartDocument> {
    const downloaded = page.waitForEvent('download');
    await exportAs(page, 'Song file');
    const path = await (await downloaded).path();
    const document = JSON.parse(await readFile(path!, 'utf8'));
    return document;
}

function expectWrittenForm(document: ChartDocument, symbols: string[]) {
    expect(document.schemaVersion).toBe(2);
    if (document.schemaVersion !== 2) {
        throw new Error('Expected semantic document');
    }
    expect(document.chart.score.sections).toHaveLength(1);
    const section = document.chart.score.sections[0];
    expect(section.repeat).toBe(1);
    // These four written bars perform as C G Am C G F, but expansion must never be saved.
    expect(section.measures).toHaveLength(4);
    expect(section.measures.map((bar) => bar.content)).toEqual(
        symbols.map((symbol) => ({
            kind: 'events',
            events: [{ kind: 'chord', symbol, duration: [4, 1] }],
        })),
    );
    expect(section.measures.map((bar) => ({ start: bar.start, end: bar.end }))).toEqual([
        { start: [{ kind: 'repeat-start' }], end: undefined },
        { start: undefined, end: undefined },
        { start: [{ kind: 'ending-start', passes: [1] }], end: [{ kind: 'repeat-end', times: 2 }] },
        { start: [{ kind: 'ending-start', passes: [2] }], end: [{ kind: 'ending-end' }] },
    ]);
}

async function expectWrittenStand(page: Page, symbols: string[]) {
    await expect(page.locator('.bar')).toHaveCount(4);
    await expect(page.locator('.bar .chord')).toHaveText(symbols);
    await expect(
        page.locator('.bar').nth(0).getByLabel('Start repeat', { exact: true }),
    ).toBeVisible();
    await expect(
        page.locator('.bar').nth(2).getByLabel('End repeat, 2 total passes', { exact: true }),
    ).toBeVisible();
    await expect(
        page.locator('.bar').nth(2).getByLabel('Ending passes 1', { exact: true }),
    ).toBeVisible();
    await expect(
        page.locator('.bar').nth(3).getByLabel('Ending passes 2', { exact: true }),
    ).toBeVisible();
}

test('a form built bar by bar applies without a refusal, saves from the hidden editor, transposes and reopen offline as four written bars', async ({
    page,
    disconnect,
}, info) => {
    // Six opens of the Repeats and endings dialog, a save, a transpose and an offline reload: 17s
    // idle on webkit-phone, 44-46s under contention, where headless WebKit paints the first
    // frames after a dialog opens slowly and the click waits on them (#1944).
    test.setTimeout(90_000);
    await newSong(page, 'Two ending study');
    const before = await savedDocuments(page);
    await (await barForm(page, 1)).getByLabel('Start repeat here', { exact: true }).check();
    await closeBarMenu(page);

    // A repeat start with no end is half a form (#1726): leaving the bar keeps it pending — the
    // bar lightly tinted, no refusal while the form is still being built.
    await leaveBar(page);
    await expect(page.locator('.bar').nth(0)).toHaveClass(/\bpending\b/);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(page.locator('.bar.repeat-start')).toHaveCount(0);
    // Still pending with the editor hidden — never applied — it is in what Save commits: Save
    // says what is missing, commits nothing, and brings the editor back.
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.workspace-body.editing')).toHaveCount(0);
    await expect(page.locator('.bar.repeat-start')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.error-banner')).toContainText(/repeat/i);
    await expect(page.locator('.workspace-body.editing')).toHaveCount(1);
    await expect(page.locator('.bar').nth(0)).toHaveClass(/\bpending\b/);
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    await expect(page.locator('.bar.repeat-start')).toHaveCount(0);
    expect(await savedDocuments(page)).toEqual(before);
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(
        (await barForm(page, 1)).getByLabel('Start repeat here', { exact: true }),
    ).toBeChecked();
    await closeBarMenu(page);

    // The rest of the form, bar by bar: no refusal on any leave on the way.
    await addEndings(page);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(
        (await barForm(page, 1)).getByLabel('Start repeat here', { exact: true }),
    ).toBeChecked();
    await closeBarMenu(page);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    const third = await barForm(page, 3);
    await expect(third.getByLabel('Ending passes', { exact: true })).toHaveValue('1');
    await expect(third.getByLabel('Total repeat passes', { exact: true })).toHaveValue('2');
    await closeBarMenu(page);
    // The finished form applied as the bars were left: on the chart before any Save.
    await expect(
        page.locator('.bar').nth(0).getByLabel('Start repeat', { exact: true }),
    ).toBeVisible();
    // Out of the editor with bar 3 still open, then Save.
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.bar-input')).toHaveCount(0);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expectWrittenStand(page, ['C', 'G', 'Am', 'F']);
    const exported = await exportCurrent(page);
    expectWrittenForm(exported, ['C', 'G', 'Am', 'F']);
    const original = before.find((document) => document.id === exported.id)!;
    if (original.schemaVersion !== 2 || exported.schemaVersion !== 2) {
        throw new Error('Expected semantic source and export');
    }
    const writtenIds = original.chart.score.sections[0].measures.map((bar) => bar.id);
    expect(exported.chart.score.sections[0].measures.map((bar) => bar.id)).toEqual(writtenIds);
    expect((await savedDocuments(page)).filter((document) => document.id !== exported.id)).toEqual(
        before.filter((document) => document.id !== exported.id),
    );

    await pickSongKey(page, 'D');
    await expectWrittenStand(page, ['D', 'A', 'Bm', 'G']);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const saved = (await savedDocuments(page)).find((document) => document.id === exported.id)!;
    expectWrittenForm(saved, ['D', 'A', 'Bm', 'G']);
    if (saved.schemaVersion !== 2) {
        throw new Error('Expected semantic save');
    }
    expect(saved.chart.score.sections[0].measures.map((bar) => bar.id)).toEqual(writtenIds);
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    const reopened = await barForm(page, 3);
    await expect(reopened.getByLabel('Ending passes', { exact: true })).toHaveValue('1');
    await expect(reopened.getByLabel('Total repeat passes', { exact: true })).toHaveValue('2');
    await reopened.locator('.form-controls').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.screenshot({ path: info.outputPath('form-editor.png'), fullPage: true });

    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
        .toContain(appUrl('sw.js'));
    await disconnect();
    await page.reload();
    await songLink(page, 'Two ending study').click();
    await expect(keyButton(page)).toHaveAccessibleName('Key: D');
    await expectWrittenStand(page, ['D', 'A', 'Bm', 'G']);
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    const fourth = await barForm(page, 4);
    await expect(fourth.getByLabel('Ending passes', { exact: true })).toHaveValue('2');
    await expect(fourth.getByLabel('End ending here', { exact: true })).toBeChecked();
    expect((await savedDocuments(page)).find((document) => document.id === saved.id)).toEqual(
        saved,
    );
});

test('invalid raw form edits survive failed Save until Revert, and malformed form imports leave every saved song intact', async ({
    page,
}) => {
    // The same form built the same way, then the raw editor and the imports: 16s idle, 45-46s
    // under contention (#1944).
    test.setTimeout(90_000);
    await newSong(page, 'Protected form');
    await (await barForm(page, 1)).getByLabel('Start repeat here', { exact: true }).check();
    await closeBarMenu(page);
    await addEndings(page);
    await leaveBar(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const saved = await exportCurrent(page);
    expectWrittenForm(saved, ['C', 'G', 'Am', 'F']);
    const before = await savedDocuments(page);

    await (await barForm(page, 3)).getByLabel('Total repeat passes', { exact: true }).fill('2oops');
    await closeBarMenu(page);
    await (await barForm(page, 4)).getByLabel('Ending passes', { exact: true }).fill('2,');
    await closeBarMenu(page);
    await leaveBar(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.error-banner')).toContainText('whole number from 1 to 64');
    // The raw text stays in the bars' drafts until Revert.
    await expect(
        (await barForm(page, 3)).getByLabel('Total repeat passes', { exact: true }),
    ).toHaveValue('2oops');
    await closeBarMenu(page);
    await expect((await barForm(page, 4)).getByLabel('Ending passes', { exact: true })).toHaveValue(
        '2,',
    );
    await closeBarMenu(page);
    await leaveBar(page);
    expect(await savedDocuments(page)).toEqual(before);
    await expectWrittenStand(page, ['C', 'G', 'Am', 'F']);

    await songMenuAction(page, 'Revert to saved');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const third = await barForm(page, 3);
    await expect(third.getByLabel('Total repeat passes', { exact: true })).toHaveValue('2');
    await expect(third.getByLabel('Ending passes', { exact: true })).toHaveValue('1');
    await closeBarMenu(page);
    const fourth = await barForm(page, 4);
    await expect(fourth.getByLabel('Ending passes', { exact: true })).toHaveValue('2');
    await expect(fourth.getByLabel('End ending here', { exact: true })).toBeChecked();
    await closeBarMenu(page);
    await leaveBar(page);
    expect(await savedDocuments(page)).toEqual(before);

    const invalid = structuredClone(saved);
    if (invalid.schemaVersion !== 2) {
        throw new Error('Expected semantic document');
    }
    // Structurally valid authored data, but no closing repeat: import must run the same
    // performance preflight as editing, before creating any new document or adopting music.
    delete invalid.chart.score.sections[0].measures[2].end;
    await page.getByLabel('Import Ensemble document').setInputFiles({
        name: 'unpaired-repeat.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(invalid)),
    });
    await expect(page.locator('.error-banner')).toContainText(/repeat/i);
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    expect(await savedDocuments(page)).toEqual(before);
    await expect(page.getByLabel('Song title')).toHaveValue('Protected form');
    await expectWrittenStand(page, ['C', 'G', 'Am', 'F']);
});

test('a joined section discloses its own repeat count instead of inheriting the block heading (F1)', async ({
    page,
}) => {
    await newSong(page, 'Section count study');
    const source = await exportCurrent(page);
    if (source.schemaVersion !== 2) {
        throw new Error('Expected semantic fixture');
    }
    const first = source.chart.score.sections[0];
    first.label = 'A';
    const second = {
        ...structuredClone(first),
        id: 'joined-b',
        label: 'B',
        seamless: true,
        measures: first.measures
            .slice(0, 2)
            .map((bar, index) => ({ ...structuredClone(bar), id: `joined-b-${index}` })),
    };
    source.chart.score.sections.push(second);
    for (const [aPasses, bPasses] of [
        [1, 2],
        [2, 1],
    ]) {
        first.repeat = aPasses;
        second.repeat = bPasses;
        await page.getByLabel('Import Ensemble document').setInputFiles({
            name: 'joined-sections.ensemble',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(source)),
        });
        await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
        await expect(page.locator('.section')).toHaveCount(1);
        await expect(page.locator('.bar')).toHaveCount(6);
        await expect(
            page
                .locator('.bar')
                .nth(4)
                .getByLabel(`Section B, ${bPasses} total passes`, { exact: true }),
        ).toBeVisible();
        if (aPasses === 1) {
            await expect(page.locator('.section-repeat')).toHaveCount(0);
        } else {
            await expect(page.locator('.section-repeat')).toHaveText('Section ×2');
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true,
        );
    }
});
