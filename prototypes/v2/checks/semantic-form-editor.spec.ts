import { readFile } from 'node:fs/promises';
import { test as base, expect, type Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';

const test = base.extend<{ disconnect: () => Promise<void> }>({
    disconnect: async ({ browserName, context, request }, use) => {
        await use(async () => {
            if (browserName === 'webkit') {
                // The preview's existing offline regression uses real socket refusal to avoid
                // WebKit's setOffline cached-navigation implementation error. No cache is faked.
                expect((await request.post('/__test/network?offline=1')).ok()).toBe(true);
                await expect(request.get('/v2/not-cached', { timeout: 3000 })).rejects.toThrow();
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
    await page.goto('/v2/');
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('C');
    await expect(page.locator('.bar .chord')).toHaveText(['C', 'G', 'Am', 'F']);
    await page.getByLabel('Song title').fill(title);
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    await expect(page.getByLabel('Start repeat here', { exact: true })).not.toBeVisible();
    await page.getByText('Advanced · per-bar repeat and ending markers', { exact: true }).click();
}

async function selectBar(page: Page, index: number) {
    await page.getByLabel('Bar to edit', { exact: true }).selectOption({ index });
}

async function addEndings(page: Page) {
    await selectBar(page, 2);
    await page.getByLabel('Ending passes', { exact: true }).fill('1');
    await page.getByLabel('Total repeat passes', { exact: true }).fill('2');
    await selectBar(page, 3);
    await page.getByLabel('Ending passes', { exact: true }).fill('2');
    await page.getByLabel('End ending here', { exact: true }).check();
}

async function exportCurrent(page: Page): Promise<ChartDocument> {
    await page.getByRole('button', { name: 'Song actions' }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export file', exact: true }).click();
    const path = await (await downloaded).path();
    const document = JSON.parse(await readFile(path!, 'utf8'));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
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

test('pending forms save atomically from the hidden editor, transpose and reopen offline as four written bars', async ({
    page,
    disconnect,
}, info) => {
    await newSong(page, 'Two ending study');
    const before = await savedDocuments(page);
    await page.getByLabel('Start repeat here', { exact: true }).check();

    for (const action of ['Update chart', 'Save']) {
        await page.getByRole('button', { name: action, exact: true }).click();
        await expect(page.locator('.error-banner')).toContainText(/repeat/i);
        await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
        await expect(page.getByLabel('Start repeat here', { exact: true })).toBeChecked();
        await expect(page.locator('.bar .chord')).toHaveText(['C', 'G', 'Am', 'F']);
        await expect(page.locator('.bar.repeat-start')).toHaveCount(0);
        expect(await savedDocuments(page)).toEqual(before);
        await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    }

    await addEndings(page);
    await selectBar(page, 0);
    await expect(page.getByLabel('Start repeat here', { exact: true })).toBeChecked();
    await selectBar(page, 2);
    await expect(page.getByLabel('Ending passes', { exact: true })).toHaveValue('1');
    await expect(page.getByLabel('Total repeat passes', { exact: true })).toHaveValue('2');
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.getByLabel('Chords in this bar')).not.toBeVisible();
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

    await page.getByLabel('Key', { exact: true }).selectOption('D');
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
    await selectBar(page, 2);
    await expect(page.getByLabel('Ending passes', { exact: true })).toHaveValue('1');
    await expect(page.getByLabel('Total repeat passes', { exact: true })).toHaveValue('2');
    await page.locator('.form-controls').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.screenshot({ path: info.outputPath('form-editor.png'), fullPage: true });

    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
        .toContain('/v2/sw.js');
    await disconnect();
    await page.reload();
    await page
        .getByRole('button', { name: /^♪ Two ending study .*Saved locally$/, exact: true })
        .click();
    await expect(page.getByLabel('Key', { exact: true })).toHaveValue('D');
    await expectWrittenStand(page, ['D', 'A', 'Bm', 'G']);
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page.getByText('Advanced · per-bar repeat and ending markers', { exact: true }).click();
    await selectBar(page, 3);
    await expect(page.getByLabel('Ending passes', { exact: true })).toHaveValue('2');
    await expect(page.getByLabel('End ending here', { exact: true })).toBeChecked();
    expect((await savedDocuments(page)).find((document) => document.id === saved.id)).toEqual(
        saved,
    );
});

test('invalid raw form edits survive failed Save until Revert, and malformed form imports leave every saved song intact', async ({
    page,
}) => {
    await newSong(page, 'Protected form');
    await page.getByLabel('Start repeat here', { exact: true }).check();
    await addEndings(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const saved = await exportCurrent(page);
    expectWrittenForm(saved, ['C', 'G', 'Am', 'F']);
    const before = await savedDocuments(page);

    await selectBar(page, 2);
    await page.getByLabel('Total repeat passes', { exact: true }).fill('2oops');
    await selectBar(page, 3);
    await page.getByLabel('Ending passes', { exact: true }).fill('2,');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.error-banner')).toContainText('whole number from 1 to 64');
    await expect(page.getByLabel('Total repeat passes', { exact: true })).toHaveValue('2oops');
    await selectBar(page, 3);
    await expect(page.getByLabel('Ending passes', { exact: true })).toHaveValue('2,');
    expect(await savedDocuments(page)).toEqual(before);
    await expectWrittenStand(page, ['C', 'G', 'Am', 'F']);

    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Revert to saved' }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await selectBar(page, 2);
    await expect(page.getByLabel('Total repeat passes', { exact: true })).toHaveValue('2');
    await expect(page.getByLabel('Ending passes', { exact: true })).toHaveValue('1');
    await selectBar(page, 3);
    await expect(page.getByLabel('Ending passes', { exact: true })).toHaveValue('2');
    await expect(page.getByLabel('End ending here', { exact: true })).toBeChecked();
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
    await expect(page.locator('.song-title')).toHaveText('Protected form');
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
