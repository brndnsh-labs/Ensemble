import { validateChartDocument } from '@engine/songbook/codec';
import type { ChartDocument } from '@engine/songbook/types';
import type { InstrumentModule } from '@engine/types';
import { validateVoice } from './sounds';

const DATABASE = 'ensemble-v2-preview';
const STORE = 'documents';
const RECOVERY = 'ensemble-v2-preview:recovery:';
// Each page load is a separate writer. Recoveries are discoverable across reloads;
// a duplicated tab cannot inherit a live writer identity.
const writer = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'unavailable';
let database: Promise<IDBDatabase> | undefined;

export class ConflictError extends Error {
    constructor() {
        super(
            'This song was saved in another tab. Your changes are safe; save a copy or reopen the newer version.',
        );
    }
}

export function validated(candidate: unknown): ChartDocument {
    const result = validateChartDocument(candidate);
    if (result.kind !== 'ok') {
        const reason =
            result.kind === 'future-version'
                ? 'a newer document version'
                : result.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
        throw new Error(`Cannot open this chart: ${reason}. The source has not been changed.`);
    }
    for (const [module, lane] of Object.entries(result.value.chart.band)) {
        validateVoice(module as InstrumentModule, lane.voice);
    }
    return result.value;
}

function open(): Promise<IDBDatabase> {
    if (!database) {
        database = new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE, 1);
            request.onupgradeneeded = () =>
                request.result.createObjectStore(STORE, { keyPath: 'id' });
            request.onerror = () =>
                reject(
                    new Error(
                        'Local songbook storage is unavailable. Your current chart remains open.',
                    ),
                );
            request.onblocked = () =>
                reject(
                    new Error('Another tab is blocking the songbook upgrade. Close it and reload.'),
                );
            request.onsuccess = () => {
                request.result.onversionchange = () => {
                    request.result.close();
                    database = undefined;
                };
                resolve(request.result);
            };
        });
    }
    return database;
}

export async function list(): Promise<ChartDocument[]> {
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).getAll();
        request.onerror = () => reject(new Error('Unable to read your local songbook.'));
        request.onsuccess = () => {
            try {
                resolve(
                    request.result
                        .map(validated)
                        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
                );
            } catch (error) {
                reject(error);
            }
        };
    });
}

export async function save(
    candidate: ChartDocument,
    expected: number | null,
): Promise<ChartDocument> {
    const document = validated(candidate);
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const read = store.get(document.id);
        let committed: ChartDocument;
        let failure: Error | undefined;
        read.onsuccess = () => {
            const previous = read.result;
            if (
                (expected === null && previous) ||
                (expected !== null && previous?.revision !== expected)
            ) {
                failure = new ConflictError();
                tx.abort();
                return;
            }
            const now = new Date().toISOString();
            committed = {
                ...document,
                revision: expected === null ? 0 : expected + 1,
                createdAt: previous?.createdAt || now,
                updatedAt: now,
            };
            store.put(committed);
        };
        tx.oncomplete = () => resolve(committed!);
        tx.onerror = () =>
            reject(
                failure ||
                    new Error(
                        'Save failed. Storage may be full or unavailable. Your chart is still open.',
                    ),
            );
        tx.onabort = () =>
            reject(failure || new Error('Save was interrupted. Your chart is still open.'));
    });
}

/** Synchronous, per-writer recovery protects the final edit on close. */
export function recover(document: ChartDocument): void {
    validated(document);
    const key = `${RECOVERY}${writer}:${document.id}`;
    const json = JSON.stringify({ capturedAt: new Date().toISOString(), document });
    if (new TextEncoder().encode(json).byteLength > 1_048_576) {
        throw new Error('This draft is too large for preview recovery');
    }
    localStorage.setItem(key, json);
    if (localStorage.getItem(key) !== json) {
        throw new Error(
            'Unable to verify local recovery. Keep this tab open and export your chart.',
        );
    }
}

export function recoveriesFor(
    document: ChartDocument,
): Array<{ document: ChartDocument; capturedAt: string }> {
    const records: Array<{ document: ChartDocument; capturedAt: string }> = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(RECOVERY) || !key.endsWith(`:${document.id}`)) {
            continue;
        }
        const raw = localStorage.getItem(key);
        if (!raw || raw.length > 1_100_000) {
            continue;
        }
        try {
            const record = JSON.parse(raw);
            const candidate = validated(record.document);
            if (
                candidate.id === document.id &&
                typeof record.capturedAt === 'string' &&
                Number.isFinite(Date.parse(record.capturedAt))
            ) {
                records.push({ document: candidate, capturedAt: record.capturedAt });
            }
        } catch {
            /* Preserve unreadable recovery source; it is never overwritten by this writer. */
        }
    }
    records.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    return records;
}

export function recoveryFor(
    document: ChartDocument,
): { document: ChartDocument; conflict: boolean } | null {
    const record = recoveriesFor(document).find(
        (record) => record.capturedAt >= document.updatedAt,
    );
    return record
        ? { document: record.document, conflict: record.document.revision !== document.revision }
        : null;
}

export function clearOwnRecovery(id: string): void {
    localStorage.removeItem(`${RECOVERY}${writer}:${id}`);
}
