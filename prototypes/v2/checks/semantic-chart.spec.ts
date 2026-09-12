import { readFile } from 'node:fs/promises';
import { test as base, expect, type Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';

const test = base.extend<{ disconnect: () => Promise<void> }>({
    disconnect: async ({ browserName, context, request }, use) => {
        await use(async () => {
            if (browserName === 'webkit') {
                // Same real connection refusal used by the existing offline regression:
                // this avoids WebKit's setOffline cached-navigation implementation error.
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

async function convertBlue(page: Page) {
    await page.goto('/v2/');
    await page
        .getByRole('button', { name: '♪ Blue pocket Blues · Saved locally', exact: true })
        .click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page
        .getByRole('button', { name: 'Try the bar editor · keep original', exact: true })
        .click();
    await expect(page.getByLabel('Chords in this bar')).toBeVisible();
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

test('2+1+1 editor saves a source-preserving copy, transposes and reopens offline', async ({
    page,
    disconnect,
}, info) => {
    await convertBlue(page);
    const original = (await documents(page)).find((document) => document.id === 'starter-blues');
    await page.getByLabel('Song title').fill('Uneven blues');
    await page.getByLabel('Chords in this bar').fill('C Dm G7');
    await page.getByLabel('Length of chord 1 (C)', { exact: true }).selectOption('2');
    await page.getByLabel('Length of chord 2 (Dm)', { exact: true }).selectOption('1');
    await page.getByLabel('Length of chord 3 (G7)', { exact: true }).selectOption('1');
    // A transform must commit pending measures before it transposes, then retire the old buffers.
    await page.getByLabel('Key', { exact: true }).selectOption('D');
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('D:2 Em:1 A7:1');
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
        .toContain('/v2/sw.js');
    await disconnect();
    await page.reload();
    await page
        .getByRole('button', { name: '♪ Uneven blues Blues · Saved locally', exact: true })
        .click();
    await expect(page.getByLabel('Key', { exact: true })).toHaveValue('D');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect.poll(() => page.locator('.chord[aria-current="true"]').count()).toBe(1);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    expect((await documents(page)).find((document) => document.id === saved.id)).toEqual(saved);
});

test('unfinished bars survive selection, errors and hidden editor; Save commits every bar', async ({
    page,
}) => {
    await convertBlue(page);
    const original = await documents(page);
    await page.getByLabel('Chords in this bar').fill('C Dm G7');
    await page.getByRole('button', { name: 'Next bar', exact: true }).click();
    await page.getByLabel('Chords in this bar').fill('not-a-chord');
    await page.getByRole('button', { name: 'Previous bar', exact: true }).click();
    for (const name of ['Save', 'Back to songbook', 'Start playback']) {
        await page.getByRole('button', { name, exact: true }).click();
        await expect(page.locator('.error-banner')).toBeVisible();
        expect(await documents(page)).toEqual(original);
    }
    await page.getByRole('button', { name: 'Previous bar', exact: true }).click();
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('C Dm G7');
    await page.getByLabel('Chords in this bar').fill('C:2 Dm:1 G7:1');
    await page.getByRole('button', { name: 'Next bar', exact: true }).click();
    await page.getByLabel('Chords in this bar').fill('F A7');
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
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
    await page.getByLabel('Chords in this bar').fill('unwanted');
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Revert to saved' }).click();
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('C:2 Dm:1 G7:1');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('new charts support bar key/meter changes, growing the chart, recovery and detached import', async ({
    page,
}) => {
    await page.goto('/v2/');
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await page.getByLabel('Song title').fill('Mixed meter sketch');
    await page.getByRole('button', { name: 'Next bar', exact: true }).click();
    await page.getByText('Key or meter change', { exact: true }).click();
    await page.getByLabel('Key from this bar').selectOption('G');
    await page.getByLabel('Meter from this bar').selectOption('3/4');
    await page.getByLabel('Chords in this bar').fill('I V');
    await page.getByRole('button', { name: 'Next bar', exact: true }).click();
    await page.getByLabel('Meter from this bar').selectOption('4/4');
    await page.getByLabel('Chords in this bar').fill('I');
    await page.getByRole('button', { name: '＋ Bar', exact: true }).click();
    await expect(page.locator('.bar')).toHaveCount(5);
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await expect(page.locator('.bar')).toHaveCount(6);
    const exported = await exportCurrent(page);
    if (exported.schemaVersion !== 2) {
        throw new Error('Expected semantic document');
    }
    expect(exported.chart.score.sections[0].measures[1]).toMatchObject({ key: 'G', meter: '3/4' });
    expect(exported.chart.score.sections[0].measures[2]).toMatchObject({ meter: '4/4' });
    await page.reload();
    await page.getByRole('button', { name: /Untitled song .*Saved locally/, exact: true }).click();
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
    await page.goto('/v2/');
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await page.getByRole('button', { name: 'Next bar', exact: true }).click();
    await page.getByText('Key or meter change', { exact: true }).click();
    await page.getByLabel('Mode from this bar').selectOption('minor');
    await page.getByRole('button', { name: 'Update chart', exact: true }).click();
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
    await convertBlue(page);
    const original = (await documents(page)).find((document) => document.schemaVersion === 2)!;
    const second = await context.newPage();
    await second.goto('/v2/');
    await second
        .getByRole('button', { name: `♪ ${original.title} Blues · Saved locally`, exact: true })
        .click();
    await second.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page.getByLabel('Chords in this bar').fill('C:2 Dm:1 G7:1');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const newer = (await documents(page)).find((document) => document.id === original.id)!;
    await second.getByLabel('Chords in this bar').fill('F:3 G7:1');
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(second.locator('.error-banner')).toContainText('saved in another tab');
    await expect(second.getByLabel('Chords in this bar')).toHaveValue('F:3 G7:1');
    expect((await documents(page)).find((document) => document.id === original.id)).toEqual(newer);
    await second.getByRole('button', { name: 'Song actions' }).click();
    await second.getByRole('button', { name: 'Save a copy', exact: true }).click();
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
    const unsupported = structuredClone(copy);
    unsupported.chart.score.sections[0].measures[0].content = {
        kind: 'events',
        events: [{ kind: 'no-chord', duration: [4, 1] }],
    };
    await second.getByLabel('Import Ensemble document').setInputFiles({
        name: 'not-yet-playable.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(unsupported)),
    });
    await expect(second.locator('.error-banner')).toContainText('cannot be played yet');
    expect(await documents(second)).toEqual(beforeImport);
    await expect(second.locator('.bar').first().locator('.chord')).toHaveText(['F', 'G7']);
});
