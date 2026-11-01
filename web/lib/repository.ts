import { isRetiredSchema } from '@core/songbook/document-v2';
import type { InstrumentModule } from '@core/types';
import {
    assertBuiltInKept,
    BuiltInCollectionError,
    type CollectionDocument,
    resolvedSongIds,
    validateCollection,
} from './collections';
import { type ChartDocument, validateDocument } from './documents';
import {
    HOME_FILL_SPARE,
    type HomeRead,
    type HomeRequest,
    type HomeSlice,
    readable,
    rememberingValidator,
    settleHome,
} from './home';
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
            'This song was saved in another tab. Your changes are safe; duplicate it or reopen the newer version.',
        );
    }
}

/** A chart the app can open; a text chart is refused with `OLD_FORMAT_REFUSAL`. */
export function validated(candidate: unknown): ChartDocument {
    const document = validateDocument(candidate);
    for (const [module, lane] of Object.entries(document.chart.band)) {
        validateVoice(module as InstrumentModule, lane.voice);
    }
    return document;
}

function open(): Promise<IDBDatabase> {
    if (!database) {
        const opening = new Promise<IDBDatabase>((resolve, reject) => {
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
        database = opening;
        // A failed open is not remembered: the next read tries again, as `openCollections`
        // does, instead of answering every call with one transient error until a reload.
        void opening.catch(() => {
            if (database === opening) {
                database = undefined;
            }
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
                        // A text chart left on this device (schema 1, retired in #1740) is not
                        // read at all, and not a reason to refuse the rest: it was left out of
                        // every list before, and still is. Its bytes stay stored, untouched.
                        .filter((row) => !isRetiredSchema(row))
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
    const validate = rememberingValidator(validated);
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
            // Only READABLE opened songs fill a row: an unreadable one is counted and left out
            // (`settleHome`), so the fill tops the list up past it rather than leaving it short.
            const wanted =
                request.rows - result.recent.filter((raw) => readable(validate, raw)).length;
            if (wanted <= 0) {
                return;
            }
            const listed = new Set(request.recentIds);
            let good = 0;
            let steps = 0;
            const cursor = store.openCursor();
            cursor.onsuccess = () => {
                const at = cursor.result;
                if (!at || good >= wanted || steps >= wanted + HOME_FILL_SPARE) {
                    return;
                }
                if (!listed.has(String(at.primaryKey))) {
                    steps += 1;
                    result.fill.push(at.value);
                    if (readable(validate, at.value)) {
                        good += 1;
                    }
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
    return settleHome(read, validate, request);
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
                // (e.g. an imported chart's original timestamp) with
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
 * Write a whole import's songs to the guest songbook in ONE transaction (#1478): every one of them
 * or none. Each is a create — `add`, never `put` — so an id the songbook already holds refuses the
 * whole batch rather than overwriting a song. One transaction rather than one per song: a
 * 1,350-song playlist is one commit, and the shell re-reads the songbook once afterwards.
 *
 * Every document is validated BEFORE the transaction opens, handing the event loop back through
 * `pace` between slices when given — validating a whole playlist in one go would stall the page.
 * Each lands at revision 0 with this write's `updatedAt`, exactly as `save`'s create does.
 */
export async function importSongs(
    candidates: readonly ChartDocument[],
    pace?: { shouldYield: () => boolean; yieldNow: () => Promise<void> },
): Promise<ChartDocument[]> {
    const documents: ChartDocument[] = [];
    for (const candidate of candidates) {
        documents.push(validated(candidate));
        if (pace?.shouldYield()) {
            await pace.yieldNow();
        }
    }
    if (new Set(documents.map((document) => document.id)).size !== documents.length) {
        throw new Error('An import cannot use one id twice.');
    }
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const now = new Date().toISOString();
        const committed = documents.map((document) => ({
            ...document,
            revision: 0,
            updatedAt: now,
        }));
        for (const document of committed) {
            store.add(document);
        }
        tx.oncomplete = () => resolve(committed);
        tx.onerror = () =>
            reject(new Error('The import failed. Storage may be full. Nothing was imported.'));
        tx.onabort = () => reject(new Error('The import was interrupted. Nothing was imported.'));
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

/** Every readable recovery slot for `document`'s id, newest first. */
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
 * Remove EVERY writer's recovery slot for one guest document, not just this page load's.
 *
 * `clearOwnRecovery` is the right tool after a Save: another tab editing the same song is holding
 * its own live experiment, and this writer has no business discarding it. A delete (`remove`)
 * and a chart back at its committed version are the opposite case: the song, or the edit, is
 * gone, so a slot an earlier page load left behind must not bring it back. So the whole id goes.
 * (Sign-out swept these by account id until #1743; no build since #1299 writes one there.)
 */
export function clearRecovery(id: string): void {
    for (const key of recoveryKeysFor(id)) {
        localStorage.removeItem(key);
    }
}

/**
 * A standard's or a shared link's unsaved changes (#1979): the device draft that makes Back from
 * an edited one keep the edit, as a song's recovery slot does, instead of dropping it.
 *
 * The same `localStorage` mechanism as `recover` — one slot per writer, the newest read back —
 * under a prefix of its OWN, never `RECOVERY`'s. A recovery slot is found by document id
 * (`recoveryKeysFor`), and a shared link carries its sender's song id: a slot under that id would
 * be offered as "your unsaved changes" the next time a song with the same id opens. So these are
 * found by a draft key instead (`standardDraftKey`, `sharedLinkDraftKey`), and nothing that reads
 * a song's recovery (Older drafts, a delete's sweep, the sign-out count) ever sees one.
 *
 * A DEVICE draft, signed in or not (Brandon's call on #1979: "keep a device draft"): a standard
 * or a link belongs to no songbook until "Keep a copy" decides one, so it is not an account chart
 * (whose experiments live in the account database, #1299) and not a guest song either. So it
 * outlives a sign-out, as the device's other conveniences do — accepted: what it holds is a
 * public catalog chart, or a link's chart, with the changes made on it.
 *
 * Bounded (`SHARED_DRAFT_LIMIT`): a song's slot goes when the song is saved or deleted, but an
 * edited link nobody opens again would keep its slot for ever, and this namespace shares its
 * quota with every song's recovery.
 */
const SHARED_DRAFT = 'ensemble-v2-preview:shared-draft:';
/** The most shared drafts this device keeps; the oldest beyond it go on the next write. */
export const SHARED_DRAFT_LIMIT = 24;

/** A standard's draft key: its catalog id, which every open of it rebuilds the same. */
export function standardDraftKey(standardId: string): string {
    return `standard:${standardId}`;
}

/**
 * A shared link's draft key: a digest of the chart the link carries. Reopening the same link
 * finds its draft; a different link to the same song (a later share, other bars) is a different
 * snapshot and opens as sent. Not the sender's song id, which every share of that song repeats.
 * `null` where the browser has no digest (an insecure origin): the link then opens as it always
 * did, with nothing kept.
 */
export async function sharedLinkDraftKey(document: ChartDocument): Promise<string | null> {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        return null;
    }
    try {
        const bytes = new TextEncoder().encode(JSON.stringify(document));
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        return `link:${Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    } catch {
        return null;
    }
}

/** Every shared-draft slot this device holds, parsed; `draftKey` narrows to one draft. */
function sharedDraftSlots(
    draftKey?: string,
): Array<{ storageKey: string; raw: string | null; capturedAt: string }> {
    const slots: Array<{ storageKey: string; raw: string | null; capturedAt: string }> = [];
    for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i);
        if (!storageKey?.startsWith(SHARED_DRAFT)) {
            continue;
        }
        // `<prefix><writer>:<draft key>` — a writer id holds no colon, a draft key may.
        const rest = storageKey.slice(SHARED_DRAFT.length);
        const at = rest.indexOf(':');
        if (draftKey !== undefined && (at < 0 || rest.slice(at + 1) !== draftKey)) {
            continue;
        }
        const raw = localStorage.getItem(storageKey);
        let capturedAt = '';
        try {
            const parsed = raw ? JSON.parse(raw) : null;
            capturedAt = typeof parsed?.capturedAt === 'string' ? parsed.capturedAt : '';
        } catch {
            /* An unreadable slot sorts oldest, so it is the first the limit lets go. */
        }
        slots.push({ storageKey, raw, capturedAt });
    }
    return slots;
}

/** A standard's or a shared link's kept changes, and the chart they were made on. */
export interface SharedDraft {
    document: ChartDocument;
    /**
     * The chart as it landed when the changes began — what "Changed" is measured against and
     * Revert to original goes back to. Kept with the draft rather than rebuilt: a standard's
     * bars get fresh ids on every build, so a rebuilt one never compares equal to the draft.
     * So a release that corrects a standard leaves an existing draft, and its Revert to
     * original, on the version the changes were made on; accepted, as the draft holds it anyway.
     */
    base: ChartDocument;
}

/**
 * Keeps `document` (made on `base`) as this writer's draft of `draftKey`.
 *
 * Other writers' slots for the same key go: this tab landed the newest of them, so they are
 * superseded (a concurrent tab on the same standard writes its own again on its next change).
 * Then the oldest slots beyond `SHARED_DRAFT_LIMIT` go. A write the storage refuses for room
 * lets the oldest OTHER shared drafts go, one at a time, and tries again — never a song's
 * recovery slot. Throws, as `recover` does, when the write cannot be made or verified.
 */
export function keepSharedDraft(
    draftKey: string,
    base: ChartDocument,
    document: ChartDocument,
): void {
    validated(document);
    validated(base);
    const storageKey = `${SHARED_DRAFT}${writer}:${draftKey}`;
    const json = JSON.stringify({ capturedAt: new Date().toISOString(), base, document });
    if (new TextEncoder().encode(json).byteLength > 1_048_576) {
        throw new Error('This draft is too large to keep on this device');
    }
    for (const slot of sharedDraftSlots(draftKey)) {
        if (slot.storageKey !== storageKey) {
            localStorage.removeItem(slot.storageKey);
        }
    }
    const others = () =>
        sharedDraftSlots()
            .filter((slot) => slot.storageKey !== storageKey)
            .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    for (;;) {
        try {
            localStorage.setItem(storageKey, json);
            break;
        } catch (error) {
            // Only a full storage is made room in; storage that is blocked keeps every draft.
            const full =
                error instanceof DOMException &&
                (error.name === 'QuotaExceededError' ||
                    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                    error.code === 22);
            const oldest = full ? others().pop() : undefined;
            if (!oldest) {
                throw error;
            }
            localStorage.removeItem(oldest.storageKey);
        }
    }
    if (localStorage.getItem(storageKey) !== json) {
        throw new Error('Unable to verify the draft on this device');
    }
    for (const slot of others().slice(SHARED_DRAFT_LIMIT - 1)) {
        localStorage.removeItem(slot.storageKey);
    }
}

/**
 * The newest readable draft of `draftKey` whose chart is still `documentId` (a slot is never
 * trusted to be the chart it is keyed for), or `null`. Never throws: storage that cannot be read
 * opens the chart as it came.
 */
export function sharedDraftFor(draftKey: string, documentId: string): SharedDraft | null {
    try {
        const slots = sharedDraftSlots(draftKey);
        slots.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
        for (const slot of slots) {
            if (!slot.raw || slot.raw.length > 1_100_000) {
                continue;
            }
            try {
                const record = JSON.parse(slot.raw);
                const document = validated(record.document);
                const base = validated(record.base);
                if (document.id === documentId && base.id === documentId) {
                    return { document, base };
                }
            } catch {
                /* Unreadable: left for the limit to retire, never overwritten in place. */
            }
        }
    } catch {
        /* No storage: nothing kept. */
    }
    return null;
}

/** Removes every writer's draft of `draftKey`: the chart is back as it came, or was kept. */
export function clearSharedDraft(draftKey: string): void {
    for (const slot of sharedDraftSlots(draftKey)) {
        localStorage.removeItem(slot.storageKey);
    }
}

/**
 * Guest collections (#1474) live in a database of their OWN, not in a new store of the songbook's.
 *
 * #1474 drafted a `collections` store added to `ensemble-v2-preview` by a version bump. That
 * database holds a guest's only copy of every song, and a bump would be its first schema change
 * since it shipped: every tab still open on the old build would lose its songbook connection
 * (`onversionchange` closes it, and a reopen at version 1 then fails) until reloaded, and WebKit is
 * the engine where an open of this very database has already been measured losing its object
 * stores (`lib/account/held-account.ts`). Nothing a collection needs is worth that: no write ever
 * spans a song and a collection, so the two never need one transaction — the reason the ACCOUNT
 * collections do share a database (`lib/sync/database.ts`) is the outbox, which guests have none
 * of. So the songbook database is not opened at a new version, not upgraded and not written by
 * anything here; it is only read, for the ids `listCollections` resolves against.
 */
const COLLECTIONS_DATABASE = 'ensemble-v2-preview-collections';
const COLLECTIONS = 'collections';
let collectionsDatabase: Promise<IDBDatabase> | undefined;

function openCollections(): Promise<IDBDatabase> {
    if (!collectionsDatabase) {
        const opening = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(COLLECTIONS_DATABASE, 1);
            request.onupgradeneeded = () =>
                request.result.createObjectStore(COLLECTIONS, { keyPath: 'id' });
            request.onerror = () =>
                reject(new Error('Collection storage is unavailable. Your songs are unaffected.'));
            request.onblocked = () =>
                reject(
                    new Error('Another tab is blocking collection storage. Close it and reload.'),
                );
            request.onsuccess = () => {
                request.result.onversionchange = () => {
                    request.result.close();
                    collectionsDatabase = undefined;
                };
                resolve(request.result);
            };
        });
        collectionsDatabase = opening;
        void opening.catch(() => {
            if (collectionsDatabase === opening) {
                collectionsDatabase = undefined;
            }
        });
    }
    return collectionsDatabase;
}

/** A guest collection as a reader shows it: the stored document, plus the songs that resolve. */
export interface GuestCollection {
    /** What a Save builds on. `songIds` is never pruned of songs that no longer resolve. */
    document: CollectionDocument;
    /** The collection's songs this songbook holds right now, in the collection's order. */
    resolvedSongIds: string[];
}

function songIds(): Promise<Set<string>> {
    return open().then(
        (db) =>
            new Promise<Set<string>>((resolve, reject) => {
                const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
                request.onerror = () => reject(new Error('Unable to read your local songbook.'));
                request.onsuccess = () => resolve(new Set(request.result.map(String)));
            }),
    );
}

/**
 * Every guest collection, each with the songs in it that resolve (#1474). A song id that does not
 * resolve — the song was deleted — is left out of `resolvedSongIds` and kept in the document:
 * deleting a song never rewrites a collection. Like `list()`, a collection that does not validate
 * fails the read rather than being skipped.
 */
export async function listCollections(): Promise<GuestCollection[]> {
    const [db, songs] = await Promise.all([openCollections(), songIds()]);
    const rows = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(COLLECTIONS, 'readonly').objectStore(COLLECTIONS).getAll();
        request.onerror = () => reject(new Error('Unable to read your collections.'));
        request.onsuccess = () => resolve(request.result);
    });
    return rows.map((row) => {
        const document = validateCollection(row);
        return {
            document,
            resolvedSongIds: resolvedSongIds(document, (id) => songs.has(id)),
        };
    });
}

/**
 * Read-modify-write one guest collection in ONE transaction (#1477): `edit` gets the stored
 * document (null when there is none) and returns the next one, or null to write nothing. The
 * committed copy takes the next revision and a fresh `updatedAt`.
 *
 * What a star toggle and "Add to collection…" write through, and the only guest collection
 * write: a read in one transaction and a compare-and-swap write in another would let two quick
 * toggles race, the second failing on a conflict nobody else caused. `edit` runs synchronously
 * inside the transaction; a throw aborts it and rejects with its own sentence.
 */
export async function editCollection(
    id: string,
    edit: (current: CollectionDocument | null) => CollectionDocument | null,
): Promise<CollectionDocument | null> {
    const db = await openCollections();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(COLLECTIONS, 'readwrite');
        const store = tx.objectStore(COLLECTIONS);
        const read = store.get(id);
        let committed: CollectionDocument | null = null;
        let failure: Error | undefined;
        read.onsuccess = () => {
            try {
                const previous = read.result === undefined ? null : validateCollection(read.result);
                const next = edit(previous);
                if (next === null) {
                    return;
                }
                if (next.id !== id) {
                    throw new Error('A collection edit cannot change its id.');
                }
                assertBuiltInKept(previous, next);
                committed = validateCollection({
                    ...next,
                    revision: previous === null ? 0 : previous.revision + 1,
                    createdAt: previous?.createdAt ?? next.createdAt,
                    updatedAt: new Date().toISOString(),
                });
                store.put(committed);
            } catch (error) {
                failure = error instanceof Error ? error : new Error(String(error));
                tx.abort();
            }
        };
        tx.oncomplete = () => resolve(committed);
        tx.onerror = () =>
            reject(failure || new Error('Saving the collection failed. Storage may be full.'));
        tx.onabort = () => reject(failure || new Error('Saving the collection was interrupted.'));
    });
}

/**
 * Delete one guest collection (#1474). Never its songs (#1443 decision 3): nothing here touches
 * the songbook database. A built-in collection is refused here, by storage, with
 * `BuiltInCollectionError` (#1477 review R2); the UI offers no way to ask either.
 */
export async function deleteCollection(id: string): Promise<void> {
    const db = await openCollections();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(COLLECTIONS, 'readwrite');
        const store = tx.objectStore(COLLECTIONS);
        let failure: Error | undefined;
        // Read and delete in one transaction, so a built-in is refused here and not only by the
        // UI (#1477 review R2).
        const read = store.get(id);
        read.onsuccess = () => {
            if ((read.result as CollectionDocument | undefined)?.builtIn) {
                failure = new BuiltInCollectionError('deleted');
                tx.abort();
                return;
            }
            store.delete(id);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () =>
            reject(failure || new Error('Delete failed. Storage may be unavailable.'));
        tx.onabort = () => reject(failure || new Error('Delete was interrupted.'));
    });
}
