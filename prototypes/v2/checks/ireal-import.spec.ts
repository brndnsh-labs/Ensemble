import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';

const test = base.extend<{ disconnect: () => Promise<void> }>({
    disconnect: async ({ browserName, context, request }, use) => {
        await use(async () => {
            if (browserName === 'webkit') {
                // Real socket refusal matches the preview's existing WebKit offline harness.
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

async function exportCurrent(page: Page): Promise<ChartDocument> {
    await page.getByRole('button', { name: 'Song actions' }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export file', exact: true }).click();
    const path = await (await downloaded).path();
    const document = JSON.parse(await readFile(path!, 'utf8')) as ChartDocument;
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    return document;
}

function openProtocol(body: string) {
    return `irealbook://${encodeURIComponent(`Original browser study=Ensemble=Medium Swing=C=n=${body}`)}`;
}

test('an iReal HTML preview is inert, explicitly added, transposed, exported and reopened offline', async ({
    page,
    disconnect,
}, info) => {
    const fixture = JSON.parse(
        await readFile(
            resolve(dirname(info.file), '../../../docs/design/fixtures/ensemble-v2-charts.json'),
            'utf8',
        ),
    ) as { realExport: { sanitizedUrl: string } };
    // The HTML is original test scaffolding around the checked-in sanitized chart. Its
    // resource and script must remain inert text, never appended to the application's DOM.
    const source = `<!doctype html><html><body><img src="https://example.invalid/import-pixel"><script>throw new Error('Import HTML executed')</script><a href="${fixture.realExport.sanitizedUrl}">Blues fixture</a></body></html>`;
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Import chart', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Review import' });
    await expect(dialog).toBeVisible();
    const before = await savedDocuments(page);
    await dialog.getByLabel('Import chart file', { exact: true }).setInputFiles({
        name: 'original-blues-study.html',
        mimeType: 'text/html',
        buffer: Buffer.from(source),
    });
    await expect(
        dialog.getByRole('button', { name: 'Add to songbook', exact: true }),
    ).toBeEnabled();
    await expect(dialog).toContainText('Blues fixture');
    expect(await savedDocuments(page)).toEqual(before);
    expect(requests.some((url) => url.includes('import-pixel'))).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath('import-review.png') });

    await dialog.getByRole('button', { name: 'Add to songbook', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.song-title')).toHaveText('Blues fixture');
    await expect(page.getByLabel('Key', { exact: true })).toHaveValue('C');
    await expect(page.locator('.bar')).toHaveCount(12);
    const imported = (await savedDocuments(page)).find(
        (document) => document.title === 'Blues fixture',
    );
    expect(imported?.schemaVersion).toBe(2);
    if (imported?.schemaVersion !== 2) {
        throw new Error('Expected a newly saved semantic import');
    }
    expect(imported.importSource).toEqual({ format: 'irealb', text: source });
    expect(before.some((document) => document.id === imported.id)).toBe(false);
    const written = imported.chart.score.sections.flatMap((section) => section.measures);
    expect(written).toHaveLength(12);
    expect(written.filter((measure) => measure.content.kind === 'repeat')).toHaveLength(3);

    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await expect(page.locator('.chord[aria-current="true"]')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('import-stand.png') });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await page.getByLabel('Key', { exact: true }).selectOption('D');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const exported = await exportCurrent(page);
    expect(exported.schemaVersion).toBe(2);
    if (exported.schemaVersion !== 2) {
        throw new Error('Expected a semantic export');
    }
    expect(exported.importSource).toEqual(imported.importSource);
    expect(exported.chart.score.key).toBe('D');
    const transposed = exported.chart.score.sections.flatMap((section) => section.measures);
    expect(transposed.map((measure) => measure.id)).toEqual(written.map((measure) => measure.id));
    expect(transposed.filter((measure) => measure.content.kind === 'repeat')).toEqual(
        written.filter((measure) => measure.content.kind === 'repeat'),
    );
    const saved = (await savedDocuments(page)).find((document) => document.id === imported.id);
    expect(saved).toEqual(exported);
    expect((await savedDocuments(page)).filter((document) => document.id !== imported.id)).toEqual(
        before,
    );

    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
        .toContain('/v2/sw.js');
    await disconnect();
    await page.reload();
    await page.getByRole('button', { name: /^♪ Blues fixture .*Saved locally$/ }).click();
    await expect(page.getByLabel('Key', { exact: true })).toHaveValue('D');
    await expect(page.locator('.bar')).toHaveCount(12);
    expect((await savedDocuments(page)).find((document) => document.id === imported.id)).toEqual(
        saved,
    );
    expect(errors).toEqual([]);
});

test('an unsupported pasted chart preserves the songbook and downloads its exact original source', async ({
    page,
}) => {
    await page.goto('/v2/');
    await page.getByRole('button', { name: 'Import chart', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Review import' });
    await dialog.getByText('Or paste an iReal link', { exact: true }).click();
    const source = openProtocol('T44[C   |Cnotachord   |G7   Z');
    const before = await savedDocuments(page);
    await dialog.getByLabel('iReal link', { exact: true }).fill(source);
    await dialog.getByRole('button', { name: 'Review link', exact: true }).click();
    await expect(dialog.getByLabel('iReal link', { exact: true })).toHaveValue(source);
    await expect(
        dialog.getByRole('button', { name: 'Add to songbook', exact: true }),
    ).toBeDisabled();
    await expect(dialog).toContainText(/unsupported|cannot|unrecognized|unknown/i);
    expect(await savedDocuments(page)).toEqual(before);

    const downloading = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download original source', exact: true }).click();
    const downloaded = await downloading;
    expect(downloaded.suggestedFilename()).toMatch(/\.txt$/);
    expect(await readFile((await downloaded.path())!, 'utf8')).toBe(source);
    expect(await savedDocuments(page)).toEqual(before);
});

for (const study of [
    {
        name: 'multi-chord repeated bars',
        body: 'T44[C ,Dm,G7|x   |F   Z',
        labels: ['C', 'Dm', 'G7', '%', 'F'],
        visits: [
            { start: 0, end: 8, name: 'C' },
            { start: 8, end: 12, name: 'Dm' },
            { start: 12, end: 16, name: 'G7' },
            { start: 16, end: 24, name: '%' },
            { start: 24, end: 28, name: '%' },
            { start: 28, end: 32, name: '%' },
            { start: 32, end: 48, name: 'F' },
        ],
    },
    {
        name: 'D.C. al Fine',
        body: 'T44[C   |Dm   <Fine>|G7   <D.C. al Fine>Z',
        labels: ['C', 'Dm', 'G7'],
        visits: [
            { start: 0, end: 16, name: 'C' },
            { start: 16, end: 32, name: 'Dm' },
            { start: 32, end: 48, name: 'G7' },
            { start: 48, end: 64, name: 'C' },
            { start: 64, end: 80, name: 'Dm' },
        ],
    },
]) {
    test(`${study.name} imports and highlights exact performed visits on the compact stand`, async ({
        page,
    }) => {
        await page.goto('/v2/');
        await page.getByRole('button', { name: 'Import chart', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Review import' });
        await dialog.getByText('Or paste an iReal link', { exact: true }).click();
        await dialog.getByLabel('iReal link', { exact: true }).fill(openProtocol(study.body));
        await dialog.getByRole('button', { name: 'Review link', exact: true }).click();
        await dialog.getByLabel('Import tempo', { exact: true }).fill('240');
        await dialog.getByRole('button', { name: 'Add to songbook', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await expect(page.locator('.chord')).toHaveText(study.labels);
        const visits: { start: number; end: number; name: string }[] = [];
        await page.exposeFunction('recordImportHighlight', (visit: (typeof visits)[number]) => {
            if (visits.at(-1)?.start !== visit.start) {
                visits.push(visit);
            }
        });
        await page.evaluate(() => {
            new MutationObserver(() => {
                const chord = document.querySelector('.chord[aria-current="true"]');
                if (chord) {
                    const host = window as unknown as {
                        recordImportHighlight: (visit: {
                            start: number;
                            end: number;
                            name: string;
                        }) => Promise<void>;
                    };
                    void host.recordImportHighlight({
                        start: Number(chord.getAttribute('data-start-step')),
                        end: Number(chord.getAttribute('data-end-step')),
                        name: chord.textContent?.trim() ?? '',
                    });
                }
            }).observe(document, {
                subtree: true,
                attributes: true,
                attributeFilter: ['aria-current', 'data-start-step'],
            });
        });
        await page.getByRole('button', { name: 'Start playback', exact: true }).click();
        await expect
            .poll(() => visits.length, { timeout: 15_000 })
            .toBeGreaterThan(study.visits.length);
        await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
        expect(visits.slice(0, study.visits.length + 1)).toEqual([
            ...study.visits,
            study.visits[0],
        ]);
        await expect(page.locator('.bar')).toHaveCount(3);
    });
}
