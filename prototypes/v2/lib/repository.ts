import type { InstrumentModule } from '@engine/types';
import { type ChartDocument, validateDocument } from './documents';
import { validateVoice } from './sounds';
// Each page load is a separate writer; the account `drafts` store keys on the same id (#1299).
import { writerId as writer } from './writer';

const DATABASE = 'ensemble-v2-preview';
const STORE = 'documents';
const RECOVERY = 'ensemble-v2-preview:recovery:';
let database: Promise<IDBDatabase> | undefined;

export class ConflictError extends Error {
    constructor() {
        super(
            'This song was saved in another tab. Your changes are safe; save a copy or reopen the newer version.',
        );
    }
}

export function validated(candidate: unknown): ChartDocument {
    const document = validateDocument(candidate);
    for (const [module, lane] of Object.entries(document.chart.band)) {
        validateVoice(module as InstrumentModule, lane.voice);
    }
    return document;
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

/**
 * Synchronous, per-writer recovery protects the final edit on close.
 *
 * A GUEST chart's, and only a guest chart's (#1299): an account chart's unsaved experiment is
 * retained in that account's own database (`AccountSongbook.recover`), so it is cleared by
 * signing out and never leaves account content in this shared `localStorage` namespace.
 */
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

/**
 * Every writer's recovery key for one document id — the one place the key shape is interpreted.
 *
 * Collected into an array rather than acted on during the scan: `localStorage.removeItem` inside a
 * `localStorage.key(i)` loop renumbers every index behind it, which silently skips entries.
 */
function recoveryKeysFor(id: string): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(RECOVERY) && key.endsWith(`:${id}`)) {
            keys.push(key);
        }
    }
    return keys;
}

/**
 * How many recovery slots this device holds for one document, whoever wrote them (#1269).
 *
 * A key count, not a parse: a slot whose JSON no longer validates still holds that chart's text on
 * this device, and a reader that dropped it could report "nothing is at stake" about bytes it is
 * about to delete. Over-reporting is the safe direction here — it offers an export nobody needed;
 * under-reporting destroys work after saying it would not.
 */
export function recoverySlotCount(id: string): number {
    return recoveryKeysFor(id).length;
}

export function recoveriesFor(
    document: ChartDocument,
): Array<{ document: ChartDocument; capturedAt: string }> {
    const records: Array<{ document: ChartDocument; capturedAt: string }> = [];
    for (const key of recoveryKeysFor(document.id)) {
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

/**
 * Remove EVERY writer's recovery slot for one document (#1269), not just this page load's.
 *
 * `clearOwnRecovery` is the right tool after a Save: another tab editing the same song is holding
 * its own live experiment, and this writer has no business discarding it. Signing out is the
 * opposite case — the account's local data is being removed from a possibly shared device, a slot
 * an earlier page load left behind holds that chart's text in plaintext, and a tab still open on
 * the same account is losing its session too. So the whole id goes.
 */
export function clearRecovery(id: string): void {
    for (const key of recoveryKeysFor(id)) {
        localStorage.removeItem(key);
    }
}
