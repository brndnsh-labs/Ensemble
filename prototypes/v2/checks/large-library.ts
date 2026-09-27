import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import { appUrl, expect } from './fixtures';

/**
 * Guest songbook storage (#1442). Kept in sync by hand with `lib/repository.ts`'s private
 * `DATABASE`/`STORE` constants — they are not exported, so this is the one other place that
 * has to know the names.
 */
export const SEED_DB = 'ensemble-v2-preview';
export const SEED_STORE = 'documents';

/** The v2-schema half of `ChartDocument` — see `lib/documents.ts`'s `ChartDocument` union. */
type ChartDocumentV2 = Extract<ChartDocument, { schemaVersion: 2 }>;
type ScoreMeasure = ChartDocumentV2['chart']['score']['sections'][number]['measures'][number];

/** Every document currently in the guest store, raw (no `validated()` pass). */
export async function readRawDocuments(page: Page): Promise<unknown[]> {
    return page.evaluate(
        async ({ dbName, storeName }) => {
            const db = await new Promise<IDBDatabase>((resolvePromise, reject) => {
                const request = indexedDB.open(dbName, 1);
                request.onupgradeneeded = () =>
                    request.result.createObjectStore(storeName, { keyPath: 'id' });
                request.onsuccess = () => resolvePromise(request.result);
                request.onerror = () => reject(request.error);
            });
            try {
                return await new Promise<unknown[]>((resolvePromise, reject) => {
                    const request = db
                        .transaction(storeName, 'readonly')
                        .objectStore(storeName)
                        .getAll();
                    request.onsuccess = () => resolvePromise(request.result);
                    request.onerror = () => reject(request.error);
                });
            } finally {
                db.close();
            }
        },
        { dbName: SEED_DB, storeName: SEED_STORE },
    );
}

/**
 * Wall time of the raw `IDBObjectStore.getAll()` call alone — the "read" half of what
 * `repository.list()` does (`getAll` → `.map(validated)` → `.sort`). There is no exported hook
 * onto `list()` itself (a debug hook would be a product change, out of scope for a
 * measurement-only story, #1442), so this is the closest reachable proxy: whatever `list()`
 * costs beyond this is validation + sort, done in-process on the same data.
 */
export async function rawReadMs(page: Page): Promise<number> {
    return page.evaluate(
        async ({ dbName, storeName }) => {
            const db = await new Promise<IDBDatabase>((resolvePromise, reject) => {
                const request = indexedDB.open(dbName, 1);
                request.onupgradeneeded = () =>
                    request.result.createObjectStore(storeName, { keyPath: 'id' });
                request.onsuccess = () => resolvePromise(request.result);
                request.onerror = () => reject(request.error);
            });
            try {
                const start = performance.now();
                await new Promise<unknown[]>((resolvePromise, reject) => {
                    const request = db
                        .transaction(storeName, 'readonly')
                        .objectStore(storeName)
                        .getAll();
                    request.onsuccess = () => resolvePromise(request.result);
                    request.onerror = () => reject(request.error);
                });
                return performance.now() - start;
            } finally {
                db.close();
            }
        },
        { dbName: SEED_DB, storeName: SEED_STORE },
    );
}

/** Chromium's non-standard heap counter; WebKit has no equivalent, so this reads `null` there. */
export async function heapBytes(page: Page): Promise<number | null> {
    return page.evaluate(() => {
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        return memory ? memory.usedJSHeapSize : null;
    });
}

export interface LongTaskSample {
    /** False on WebKit: the Long Tasks API isn't implemented there at all. */
    supported: boolean;
    /** Tasks over 50ms observed during the scroll. */
    count: number;
    longestMs: number;
}

/**
 * Scrolls the full songbook list top to bottom and reports long tasks (>50ms) seen during it.
 * Chromium supports `PerformanceObserver({entryTypes: ['longtask']})`; WebKit does not, so
 * `supported: false` there rather than a fabricated zero.
 */
export async function scrollAndSampleLongTasks(page: Page): Promise<LongTaskSample> {
    await page.evaluate(() => {
        const w = window as unknown as { __perfLongTasks: number[] };
        w.__perfLongTasks = [];
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    w.__perfLongTasks.push(entry.duration);
                }
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch {
            // WebKit: no 'longtask' entry type. __perfLongTasks stays empty; supported: false below.
        }
    });
    await page.evaluate(async () => {
        const max = document.scrollingElement?.scrollHeight ?? document.body.scrollHeight;
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        const step = Math.max(200, Math.floor(max / 40));
        for (let y = 0; y <= max; y += step) {
            window.scrollTo(0, y);
            await frame();
        }
        window.scrollTo(0, max);
        await frame();
    });
    return page.evaluate(() => {
        const supportedTypes =
            (PerformanceObserver as unknown as { supportedEntryTypes?: string[] })
                .supportedEntryTypes ?? [];
        const w = window as unknown as { __perfLongTasks: number[] };
        const long = (w.__perfLongTasks ?? []).filter((duration) => duration > 50);
        return {
            supported: supportedTypes.includes('longtask'),
            count: long.length,
            longestMs: long.length ? Math.max(...long) : 0,
        };
    });
}

/** A `repeat` measure resolved back to the concrete chord events it stands in for. */
function resolvedContent(measures: ScoreMeasure[], measure: ScoreMeasure): ScoreMeasure['content'] {
    let current = measure;
    while (current.content.kind === 'repeat') {
        const { measureId } = current.content;
        const source = measures.find((m) => m.id === measureId);
        if (!source) {
            throw new Error(`seed: repeat source ${measureId} not found`);
        }
        current = source;
    }
    return current.content;
}

/**
 * Tiles one imported chart's chord content out to `bars` measures — a real iReal-ish 32-bar
 * chart instead of the tiny 4-bar starter (#1442). Every `repeat` (`%`) measure is resolved to
 * its concrete chord events first: tiling would otherwise carry a `content.measureId`
 * cross-reference forward into a copy where that id no longer means the same bar. Navigation
 * (`start`/`end` directions) is dropped for the same reason — a repeat/ending bracket that
 * lands mid-loop after tiling is no longer the form it was written for, and (per
 * `lib/documents.ts`'s `blankSong`) a chart with no navigation at all is already a normal,
 * valid shape.
 */
function tileTo32Bars(template: ChartDocumentV2, bars = 32): ChartDocumentV2 {
    const source = template.chart.score.sections.flatMap((section) => section.measures);
    const resolved = source.map((measure) => resolvedContent(source, measure));
    const tiled: ScoreMeasure[] = [];
    while (tiled.length < bars) {
        for (const content of resolved) {
            if (tiled.length >= bars) {
                break;
            }
            tiled.push({ id: randomUUID(), content } as ScoreMeasure);
        }
    }
    return {
        ...template,
        chart: {
            ...template.chart,
            score: {
                ...template.chart.score,
                sections: [{ id: randomUUID(), label: 'A', repeat: 1, measures: tiled }],
            },
        },
    };
}

/** One real, validated chart via the app's own iReal import path — not a hand-built fixture. */
async function importTemplate(page: Page): Promise<ChartDocumentV2> {
    const fixture = JSON.parse(
        await readFile(
            resolve(dirname(__filename), '../../../docs/design/fixtures/ensemble-v2-charts.json'),
            'utf8',
        ),
    ) as { realExport: { sanitizedUrl: string } };
    const source = `<!doctype html><html><body><a href="${fixture.realExport.sanitizedUrl}">Perf fixture</a></body></html>`;
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Import chart', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Review import' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Import chart file', { exact: true }).setInputFiles({
        name: 'perf-fixture.html',
        mimeType: 'text/html',
        buffer: Buffer.from(source),
    });
    await expect(
        dialog.getByRole('button', { name: 'Add to songbook', exact: true }),
    ).toBeEnabled();
    await dialog.getByRole('button', { name: 'Add to songbook', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const documents = (await readRawDocuments(page)) as ChartDocumentV2[];
    // The imported title is the iReal data's OWN embedded title field, not the anchor text
    // (`ireal-import.spec.ts` relies on the same fact) — the fixture's is "Blues fixture".
    const imported = documents.find((document) => document.title === 'Blues fixture');
    if (!imported) {
        throw new Error('seed: the iReal import fixture did not land a document');
    }
    return imported;
}

/**
 * Seeds the guest songbook with `n` realistic 32-bar charts for a large-library measurement
 * (#1442). Leaves the page on the songbook, on the now-seeded data — call `page.goto(appUrl())`
 * (or `page.reload()`) afterward to measure a cold load against it.
 *
 * One real chart is produced via the app's own iReal import (so the band/performance settings
 * and chord data are genuine, not hand-authored), tiled out to 32 bars, then written straight
 * into the IndexedDB store in a single transaction — this never goes through `repository.save`,
 * so seeding itself isn't part of what gets measured. The store is cleared first so the seeded
 * count is exactly `n`, not `n + 1` for the import's own template row.
 */
export async function seedGuestSongs(page: Page, n: number): Promise<void> {
    const template = tileTo32Bars(await importTemplate(page));
    const baseTime = Date.parse('2026-01-01T00:00:00.000Z');
    const documents: ChartDocumentV2[] = Array.from({ length: n }, (_, i) => {
        const stamp = new Date(baseTime + i * 1000).toISOString();
        return {
            ...template,
            id: randomUUID(),
            title: `Guest song ${i + 1}`,
            revision: 0,
            createdAt: stamp,
            updatedAt: stamp,
        };
    });
    await page.evaluate(
        async ({ dbName, storeName, documents }) => {
            const db = await new Promise<IDBDatabase>((resolvePromise, reject) => {
                const request = indexedDB.open(dbName, 1);
                request.onupgradeneeded = () =>
                    request.result.createObjectStore(storeName, { keyPath: 'id' });
                request.onsuccess = () => resolvePromise(request.result);
                request.onerror = () => reject(request.error);
            });
            try {
                await new Promise<void>((resolvePromise, reject) => {
                    const tx = db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    store.clear();
                    for (const document of documents) {
                        store.put(document);
                    }
                    tx.oncomplete = () => resolvePromise();
                    tx.onerror = () => reject(tx.error);
                });
            } finally {
                db.close();
            }
        },
        { dbName: SEED_DB, storeName: SEED_STORE, documents },
    );
}
