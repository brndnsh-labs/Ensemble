import type { InstrumentModule } from '@engine/types';
import { type ChartDocument, validateDocument } from './documents';
import { type HomeRead, type HomeRequest, type HomeSlice, settleHome } from './home';
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

/**
 * What the songbook home shows, without reading the whole songbook (#1441): the store's `count()`,
 * the Continue document and the recently opened ones by id, and — only when fewer than
 * `request.rows` of those exist — a bounded cursor fill (`HomeRead.fill`). One read-only
 * transaction, so the count and the rows describe the same moment.
 *
 * Unlike `list()`, a document that does not validate does not fail the read: it is left out and
 * counted (`settleHome`), so one corrupt chart cannot blank the home page. `list()` keeps refusing
 * a songbook it cannot wholly read, which is what the All songs page reports.
 */
export async function home(request: HomeRequest): Promise<HomeSlice> {
    const db = await open();
    const read = await new Promise<HomeRead<unknown>>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const store = tx.objectStore(STORE);
        const result: HomeRead<unknown> = { count: 0, continued: undefined, recent: [], fill: [] };
        const counted = store.count();
        counted.onsuccess = () => {
            result.count = counted.result;
        };
        if (request.continueId !== null) {
            const continued = store.get(request.continueId);
            continued.onsuccess = () => {
                result.continued = continued.result;
            };
        }
        const found: unknown[] = new Array(request.recentIds.length);
        let pending = request.recentIds.length;
        const fill = () => {
            result.recent = found.filter((value) => value !== undefined);
            const wanted = request.rows - result.recent.length;
            if (wanted <= 0) {
                return;
            }
            const listed = new Set(request.recentIds);
            const cursor = store.openCursor();
            cursor.onsuccess = () => {
                const at = cursor.result;
                if (!at || result.fill.length >= wanted) {
                    return;
                }
                if (!listed.has(String(at.primaryKey))) {
                    result.fill.push(at.value);
                }
                at.continue();
            };
        };
        if (pending === 0) {
            fill();
        }
        request.recentIds.forEach((id, index) => {
            const row = store.get(id);
            row.onsuccess = () => {
                found[index] = row.result;
                pending -= 1;
                if (pending === 0) {
                    fill();
                }
            };
        });
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(new Error('Unable to read your local songbook.'));
        tx.onabort = () => reject(new Error('Unable to read your local songbook.'));
    });
    return settleHome(read, validated, request.rows);
}

/**
 * One song by id (#1441), or null when this songbook no longer holds it. Opening a row, renaming
 * or duplicating it and exporting it all read the one document they act on rather than the whole
 * songbook. A stored document that does not validate throws `validated`'s own reason, which is the
 * honest answer for a song the musician just asked to open.
 */
export async function get(id: string): Promise<ChartDocument | null> {
    const db = await open();
    const raw = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        request.onerror = () => reject(new Error('Unable to read your local songbook.'));
        request.onsuccess = () => resolve(request.result);
    });
    return raw === undefined ? null : validated(raw);
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
                // An update keeps the row's ORIGINAL createdAt. A brand-new row (no
                // `previous`) instead honours the candidate's own `createdAt` — always
                // present on `ChartDocument` — rather than overwriting real provenance
                // (e.g. a v1 import's saved-progression timestamp, `import-v1.ts`) with
                // this write's wall-clock time.
                createdAt: previous?.createdAt ?? document.createdAt,
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
 * Delete one song from the guest songbook (#1440) — the local-only counterpart to the account
 * songbook's tombstone route (`app/account/delete-song.tsx`), which this must never stand in for:
 * an account song deletes through that route alone, never a local-only removal.
 *
 * Every writer's recovery slot for this id goes with it. A deleted song's draft is an orphan by
 * definition — leaving it behind would resurrect the song as a "recovered draft" the next time
 * this device's storage is scanned by id, which is exactly the dangling state deleting is meant
 * to leave none of.
 */
export async function remove(id: string): Promise<void> {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Delete failed. Storage may be unavailable.'));
        tx.onabort = () => reject(new Error('Delete was interrupted.'));
    });
    clearRecovery(id);
}

/**
 * Rename one song in place (#1440) — the title only, everything else untouched. Reuses `save`'s
 * own compare-and-swap and `updatedAt`/`revision` bump rather than duplicating it, so a rename
 * "syncs like any Save" by construction instead of by a second copy of that rule.
 */
export async function rename(id: string, title: string): Promise<ChartDocument> {
    const db = await open();
    const current = await new Promise<ChartDocument>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(id);
        request.onerror = () => reject(new Error('Unable to read your local songbook.'));
        request.onsuccess = () => {
            if (!request.result) {
                reject(new Error('Song no longer exists.'));
                return;
            }
            try {
                resolve(validated(request.result));
            } catch (error) {
                reject(error);
            }
        };
    });
    return save({ ...current, title }, current.revision);
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
