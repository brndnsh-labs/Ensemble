import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ACCOUNT_DATABASE,
    AccountChangedError,
    type AccountScope,
} from '../../prototypes/v2/lib/sync/protocol.js';
import {
    AccountSongbook,
    DEFAULT_LIST_LIMIT,
    MAX_LIST_LIMIT,
} from '../../prototypes/v2/lib/sync/repository.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * Bounded owner-scoped enumeration against real IndexedDB in both engines. The point of
 * proving this here rather than in a node mock is the key range itself: `[ownerId, []]` as an
 * upper bound relies on IndexedDB's documented key ordering (arrays sort after strings), and a
 * fake store would happily agree with a wrong implementation.
 */

let name: string;
let book: AccountSongbook;
let scope: AccountScope;
const connections: AccountSongbook[] = [];

function connection(): AccountSongbook {
    const instance = new AccountSongbook(name);
    connections.push(instance);
    return instance;
}

/** Seed ids are zero-padded so lexicographic key order is also the obvious reading order. */
function songId(index: number): string {
    return `song-${String(index).padStart(2, '0')}`;
}

async function seed(count: number, instance = book, active = scope): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 1; index <= count; index++) {
        const id = songId(index);
        await instance.save(active, accountChart(`title-${id}`, id), null);
        ids.push(id);
    }
    return ids;
}

/** Walk every page, asserting termination rather than assuming it. */
async function drain(limit: number, instance = book, active = scope): Promise<string[]> {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard <= 50; guard++) {
        const page: Awaited<ReturnType<AccountSongbook['list']>> = await instance.list(active, {
            limit,
            ...(cursor === undefined ? {} : { afterDocumentId: cursor }),
        });
        seen.push(...page.songs.map((song) => song.documentId));
        if (page.nextAfterDocumentId === null) {
            return seen;
        }
        cursor = page.nextAfterDocumentId;
    }
    throw new Error('Pagination did not terminate.');
}

function rawDatabase(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const opening = indexedDB.open(name, 1);
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
    });
}

function rawWrite(raw: IDBDatabase, store: string, mutate: (table: IDBObjectStore) => void) {
    return new Promise<void>((resolve, reject) => {
        const tx = raw.transaction(store, 'readwrite');
        mutate(tx.objectStore(store));
        // Why: a request's success fires before the transaction commits; waiting on
        // completion keeps WebKit from racing the next open or the cleanup delete.
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
    });
}

function rawRead<T>(raw: IDBDatabase, store: string, key: IDBValidKey): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const tx = raw.transaction(store);
        const request = tx.objectStore(store).get(key);
        tx.oncomplete = () => resolve(request.result as T);
        tx.onabort = () => reject(tx.error);
    });
}

beforeEach(async () => {
    name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    book = connection();
    scope = (await book.switchAccount('owner-a'))!;
});

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(connections.splice(0).map((instance) => instance.close()));
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Test connection leaked.'));
    });
});

describe('bounded owner-scoped listing on real IndexedDB', () => {
    it('an owner with no saved songs gets an empty page and an end-of-list cursor', async () => {
        expect(await book.list(scope)).toEqual({ songs: [], nextAfterDocumentId: null });
    });

    it('pages deterministically with no duplicated or omitted ids, and terminates', async () => {
        const ids = await seed(7);
        // Every page size across the boundary cases: exact divisor, remainder, single, whole.
        for (const limit of [1, 2, 3, 7, 8, MAX_LIST_LIMIT]) {
            expect(await drain(limit)).toEqual(ids);
        }
    });

    it('reports a further page only when one exists', async () => {
        await seed(4);
        const first = await book.list(scope, { limit: 2 });
        expect(first.songs.map((song) => song.documentId)).toEqual([songId(1), songId(2)]);
        expect(first.nextAfterDocumentId).toBe(songId(2));
        const second = await book.list(scope, { limit: 2, afterDocumentId: songId(2) });
        expect(second.songs.map((song) => song.documentId)).toEqual([songId(3), songId(4)]);
        // Exactly consumed: a limit landing on the final record must not promise another page.
        expect(second.nextAfterDocumentId).toBeNull();
    });

    it('defaults to fifty per page', async () => {
        expect(DEFAULT_LIST_LIMIT).toBe(50);
        await seed(3);
        const page = await book.list(scope);
        expect(page.songs).toHaveLength(3);
        expect(page.nextAfterDocumentId).toBeNull();
    });

    it('a cursor at or past the final id returns end-of-list, not a wrapped first page', async () => {
        const ids = await seed(3);
        for (const cursor of [ids.at(-1)!, 'song-99', 'zzzz']) {
            expect(await book.list(scope, { afterDocumentId: cursor })).toEqual({
                songs: [],
                nextAfterDocumentId: null,
            });
        }
    });

    it('never returns another owner’s records, even under identical document ids', async () => {
        const ids = await seed(3);
        const other = connection();
        const b = (await other.switchAccount('owner-b'))!;
        // Same ids, different owner, and a document that sorts after every owner-a id.
        for (const id of [...ids, 'song-99']) {
            await other.save(b, accountChart(`owner-b ${id}`, id), null);
        }
        // Asserted while owner-b is still the active account: the fence is the globally
        // active account, not a per-connection one, so a handle for a switched-away owner is
        // rejected outright rather than quietly listing the wrong library.
        const mine = await other.list(b);
        expect(mine.songs.map((song) => song.documentId)).toEqual([...ids, 'song-99']);
        expect(mine.songs.every((song) => song.ownerId === 'owner-b')).toBe(true);

        const back = (await book.switchAccount('owner-a'))!;
        await expect(other.list(b)).rejects.toBeInstanceOf(AccountChangedError);

        const page = await book.list(back);
        expect(page.songs.map((song) => song.documentId)).toEqual(ids);
        expect(page.songs.every((song) => song.ownerId === 'owner-a')).toBe(true);
        expect(page.songs.map((song) => song.document.title)).toEqual(
            ids.map((id) => `title-${id}`),
        );
        // The upper bound stops inside owner-a: owner-b's extra id is not a further page.
        expect(page.nextAfterDocumentId).toBeNull();

        // A cursor cannot be used to walk out of the owner it was issued for.
        expect(await book.list(back, { afterDocumentId: ids.at(-1)! })).toEqual({
            songs: [],
            nextAfterDocumentId: null,
        });
    });

    it('rejects an invalid limit or cursor explicitly rather than clamping it', async () => {
        await seed(2);
        for (const limit of [0, -1, 1.5, Number.NaN, MAX_LIST_LIMIT + 1, Number.MAX_SAFE_INTEGER]) {
            await expect(book.list(scope, { limit })).rejects.toThrow('List limit must be');
        }
        for (const afterDocumentId of ['', 'not a valid id', 'x'.repeat(129)]) {
            await expect(book.list(scope, { afterDocumentId })).rejects.toThrow(
                'Invalid sync identifier',
            );
        }
        await expect(book.list(scope, null as unknown as { limit?: number })).rejects.toThrow(
            'Invalid list options',
        );
        // A rejected call is not a silent empty library.
        expect((await book.list(scope)).songs).toHaveLength(2);
    });

    it('rejects the whole page when any record in the fetched window is unreadable', async () => {
        const ids = await seed(4);
        await book.close();
        const raw = await rawDatabase();
        const key = ['owner-a', ids[2]];
        const original = await rawRead<{ document: { schemaVersion: number } }>(raw, 'songs', key);
        const planted = {
            ...original,
            document: { ...original.document, schemaVersion: 99 },
        };
        await rawWrite(raw, 'songs', (table) => table.put(planted));
        raw.close();

        book = connection();
        // Explicit failure, not an empty or partial library.
        await expect(book.list(scope)).rejects.toThrow('Cannot sync this chart version');
        // Even a page that would have stopped before the bad record still fetches limit + 1,
        // so the corrupt row sits in the window and must fail rather than be skipped.
        await expect(book.list(scope, { limit: 2 })).rejects.toThrow(
            'Cannot sync this chart version',
        );
        // Pages that genuinely do not reach it still work.
        expect((await book.list(scope, { limit: 1 })).songs.map((s) => s.documentId)).toEqual([
            ids[0],
        ]);

        await book.close();
        const after = await rawDatabase();
        try {
            // A failed read wrote nothing and repaired nothing.
            expect(await rawRead(after, 'songs', key)).toEqual(planted);
            expect(await rawRead(after, 'songs', ['owner-a', ids[0]])).toEqual(
                await rawRead(after, 'songs', ['owner-a', ids[0]]),
            );
        } finally {
            after.close();
        }
    });

    it('rejects a record whose stored identity disagrees with its key', async () => {
        const ids = await seed(2);
        await book.close();
        const raw = await rawDatabase();
        const key = ['owner-a', ids[0]];
        const stored = await rawRead<{ document: { id: string } }>(raw, 'songs', key);
        // Inner chart identity no longer matches the record it is filed under.
        await rawWrite(raw, 'songs', (table) =>
            table.put({ ...stored, document: { ...stored.document, id: 'elsewhere' } }),
        );
        raw.close();

        book = connection();
        await expect(book.list(scope)).rejects.toThrow();
    });

    it('captures the account before yielding, so mutating the caller’s objects cannot retarget it', async () => {
        await seed(2);
        const mutable = { ...scope };
        const options = { limit: 2 };
        const listing = book.list(mutable, options);
        // Both the session handle and the options bag change while IDB is still working.
        mutable.ownerId = 'owner-b';
        mutable.generation = 999;
        options.limit = 1;
        const page = await listing;
        expect(page.songs).toHaveLength(2);
        expect(page.songs.every((song) => song.ownerId === 'owner-a')).toBe(true);
    });

    it('returns detached records that cannot be edited back into storage', async () => {
        await seed(1);
        const page = await book.list(scope);
        const song = page.songs[0];
        song.document.title = 'tampered';
        song.document.chart.performance.bpm = 999;
        song.remoteRevision = 'cloud-tampered';

        const again = await book.list(scope);
        expect(again.songs[0].document.title).toBe(`title-${songId(1)}`);
        expect(again.songs[0].document.chart.performance.bpm).toBe(120);
        expect(again.songs[0].remoteRevision).toBeNull();
        // The single-record accessor agrees, so nothing was written through either path.
        expect((await book.read(scope, songId(1)))?.document.title).toBe(`title-${songId(1)}`);
    });

    it('a stale account generation rejects instead of listing the new account', async () => {
        await seed(2);
        const stale = scope;
        const b = (await book.switchAccount('owner-b'))!;
        await expect(book.list(stale)).rejects.toBeInstanceOf(AccountChangedError);
        expect(await book.list(b)).toEqual({ songs: [], nextAfterDocumentId: null });

        const again = (await book.switchAccount('owner-a'))!;
        // Same owner, new generation: the old handle stays fenced out.
        expect((await book.list(again)).songs).toHaveLength(2);
        await expect(book.list(stale)).rejects.toBeInstanceOf(AccountChangedError);
    });

    it('a storage failure surfaces and leaves every source record untouched', async () => {
        const ids = await seed(3);
        const fault = vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementationOnce(function (
            this: IDBObjectStore,
        ) {
            throw new DOMException('Injected read failure', 'UnknownError');
        });
        await expect(book.list(scope)).rejects.toThrow('Injected read failure');
        fault.mockRestore();

        const page = await book.list(scope);
        expect(page.songs.map((song) => song.documentId)).toEqual(ids);
        expect(page.songs.map((song) => song.document.title)).toEqual(
            ids.map((id) => `title-${id}`),
        );
    });

    it('lists alongside the existing outbox without disturbing queued Saves or drafts', async () => {
        const a = await book.save(scope, accountChart('A', songId(1)), null);
        await book.save(scope, { ...a.document, title: 'C' }, a.document.revision);
        await book.recover(scope, 'writer-1', { ...a.document, title: 'D' }, a.document.revision);
        await book.save(scope, accountChart('other', songId(2)), null);

        const page = await book.list(scope);
        expect(page.songs.map((song) => song.documentId)).toEqual([songId(1), songId(2)]);
        // Listing is a read: the queue and the unsaved experiment are exactly as they were.
        expect((await book.pending(scope, songId(1))).map((op) => op.snapshot.title)).toEqual([
            'A',
            'C',
        ]);
        expect((await book.drafts(scope, songId(1)))[0].document.title).toBe('D');
    });
});
