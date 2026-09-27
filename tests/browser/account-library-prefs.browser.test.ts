import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountScope, ChartDocument } from '../../prototypes/v2/lib/sync/protocol.js';
import { ACCOUNT_DATABASE } from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * Per-song opened-at and starred preferences (#1440) against real IndexedDB in both engines.
 *
 * Three claims a fake store cannot prove:
 *
 * 1. **Recording an open never touches the `songs`/`operations` stores.** A preference read has to
 *    prove it did not accidentally commit a document edit or queue a Save — the acceptance
 *    criterion this suite exists to pin.
 * 2. **Both preferences are scoped per owner**, the way `lastOpenedKey`/candidates/deletions
 *    already are: account A's stars and opens are invisible to account B on the same device.
 * 3. **`clearAccount` removes both**, alongside everything else a sign-out clears.
 */

const A = 'owner-a';
const B = 'owner-b';

let name: string;
let book: AccountSongbook;
let scopeA: AccountScope;
const connections: AccountSongbook[] = [];

function connection(): AccountSongbook {
    const instance = new AccountSongbook(name);
    connections.push(instance);
    return instance;
}

function chart(title: string, id: string, revision = 0): ChartDocument {
    return { ...accountChart(title, id), revision };
}

/** Reads the `songs`/`operations` stores directly to prove opening writes neither. */
function tableCount(table: 'songs' | 'operations'): Promise<number> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const count = db.transaction(table, 'readonly').objectStore(table).count();
            count.onsuccess = () => {
                db.close();
                resolve(count.result);
            };
            count.onerror = () => {
                db.close();
                reject(count.error);
            };
        };
    });
}

beforeEach(async () => {
    name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    book = connection();
    scopeA = (await book.switchAccount(A))!;
});

afterEach(async () => {
    await Promise.all(connections.splice(0).map((instance) => instance.close()));
    await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
});

describe('opened-at (#1440)', () => {
    it('records a timestamp readable back from the whole-map read', async () => {
        await book.recordOpened(scopeA, 'song-1');
        const map = await book.openedAtMap(scopeA);
        expect(map.has('song-1')).toBe(true);
        expect(Number.isFinite(Date.parse(map.get('song-1')!))).toBe(true);
    });

    it('never writes the songs or operations stores, against a populated database', async () => {
        // A real song with a queued Save — the review's own point (#1440 P5): an empty database
        // proves nothing about a write that would only ever touch an EXISTING row or queue, and
        // this is exactly that shape (`recordOpened` writes one `meta` key by owner+documentId,
        // never a `songs`/`operations` row).
        await book.save(scopeA, chart('Song one', 'song-1'), null);
        await book.save(scopeA, chart('Song two', 'song-2'), null);
        const songsBefore = await tableCount('songs');
        const operationsBefore = await tableCount('operations');
        expect(songsBefore).toBe(2);
        expect(operationsBefore).toBeGreaterThan(0);

        await book.recordOpened(scopeA, 'song-1');

        expect(await tableCount('songs')).toBe(songsBefore);
        expect(await tableCount('operations')).toBe(operationsBefore);
    });

    it('re-opening replaces the timestamp rather than duplicating a row', async () => {
        await book.recordOpened(scopeA, 'song-1');
        const first = (await book.openedAtMap(scopeA)).get('song-1');
        await new Promise((resolve) => setTimeout(resolve, 5));
        await book.recordOpened(scopeA, 'song-1');
        const map = await book.openedAtMap(scopeA);
        expect(map.size).toBe(1);
        expect(map.get('song-1')).not.toBe(first);
    });

    it('scopes opens per owner — B never sees A’s opened songs', async () => {
        await book.recordOpened(scopeA, 'song-1');
        const scopeB = (await book.switchAccount(B))!;
        const mapB = await book.openedAtMap(scopeB);
        expect(mapB.has('song-1')).toBe(false);
    });

    it('clearAccount removes every opened-at row for that owner, and only that owner', async () => {
        await book.recordOpened(scopeA, 'song-1');
        await book.recordOpened(scopeA, 'song-2');
        const scopeB = (await book.switchAccount(B))!;
        await book.recordOpened(scopeB, 'song-3');

        await book.clearAccount(A);

        const scopeA2 = (await book.switchAccount(A))!;
        expect((await book.openedAtMap(scopeA2)).size).toBe(0);
        // B's own row is untouched (#1440 review P5) — `clearAccount`'s owner-bound ranges must
        // not reach past the owner they were named with.
        const scopeB2 = (await book.switchAccount(B))!;
        const mapB = await book.openedAtMap(scopeB2);
        expect(mapB.size).toBe(1);
        expect(mapB.has('song-3')).toBe(true);
    });
});

describe('starred songs (#1440)', () => {
    it('stars and unstars a song', async () => {
        await book.setStarred(scopeA, 'song-1', true);
        expect(await book.starredIds(scopeA)).toEqual(new Set(['song-1']));
        await book.setStarred(scopeA, 'song-1', false);
        expect(await book.starredIds(scopeA)).toEqual(new Set());
    });

    it('scopes stars per owner — B never sees A’s stars', async () => {
        await book.setStarred(scopeA, 'song-1', true);
        const scopeB = (await book.switchAccount(B))!;
        expect(await book.starredIds(scopeB)).toEqual(new Set());
    });

    it('clearAccount removes every star for that owner, and only that owner', async () => {
        await book.setStarred(scopeA, 'song-1', true);
        await book.setStarred(scopeA, 'song-2', true);
        const scopeB = (await book.switchAccount(B))!;
        await book.setStarred(scopeB, 'song-3', true);

        await book.clearAccount(A);

        const scopeA2 = (await book.switchAccount(A))!;
        expect(await book.starredIds(scopeA2)).toEqual(new Set());
        // B's own star is untouched (#1440 review P5) — same fence as opened-at above.
        const scopeB2 = (await book.switchAccount(B))!;
        expect(await book.starredIds(scopeB2)).toEqual(new Set(['song-3']));
    });
});
