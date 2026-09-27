import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homeRequest } from '../../prototypes/v2/lib/home.js';
import type { AccountScope } from '../../prototypes/v2/lib/sync/protocol.js';
import { ACCOUNT_DATABASE } from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * The account songbook's home read (#1441) against real IndexedDB in both engines: the owner's
 * `count()`, the Continue song and the recently opened ones by id, a bounded cursor fill — all
 * inside the owner's key range, and tolerant of a corrupt record that a full `list` refuses.
 */

const A = 'owner-a';
const B = 'owner-b';

let name: string;
let book: AccountSongbook;
let scopeA: AccountScope;

/** Writes a raw row straight into `songs`, bypassing every validator. */
function putRaw(row: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('songs', 'readwrite');
            tx.objectStore('songs').put(row);
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        };
    });
}

beforeEach(async () => {
    name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    book = new AccountSongbook(name);
    scopeA = (await book.switchAccount(A))!;
});

afterEach(async () => {
    await book.close();
    await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
});

describe('AccountSongbook.home (#1441)', () => {
    it('reads the opened songs by id and counts only this owner', async () => {
        for (let i = 0; i < 12; i++) {
            await book.save(scopeA, accountChart(`Song ${i}`, `song-${i}`), null);
        }
        // Another owner's songs are outside the range, for the count as much as the fill.
        await putRaw({
            ownerId: B,
            documentId: 'song-b',
            document: accountChart('B', 'song-b'),
            remoteRevision: null,
        });
        const opened = new Map([
            ['song-7', '2026-01-01T00:03:00.000Z'],
            ['song-2', '2026-01-01T00:02:00.000Z'],
        ]);
        const slice = await book.home(scopeA, homeRequest(opened, 'song-7'));
        expect(slice.count).toBe(12);
        expect(slice.continued?.id).toBe('song-7');
        expect(slice.rows.slice(0, 2).map((row) => row.id)).toEqual(['song-7', 'song-2']);
        expect(slice.rows).toHaveLength(8);
        expect(slice.rows.some((row) => row.id === 'song-b')).toBe(false);
    });

    it('survives a corrupt record a full list refuses', async () => {
        for (let i = 0; i < 9; i++) {
            await book.save(scopeA, accountChart(`Song ${i}`, `song-${i}`), null);
        }
        // Sorts after every `song-*` id, so neither the by-id reads nor the fill reach it.
        await putRaw({
            ownerId: A,
            documentId: 'zz-corrupt',
            document: { id: 'zz-corrupt', title: 42 },
            remoteRevision: null,
        });
        const opened = new Map(
            Array.from({ length: 8 }, (_, i) => [`song-${i}`, `2026-01-01T00:0${i}:00.000Z`]),
        );
        const slice = await book.home(scopeA, homeRequest(opened, null));
        expect(slice.count).toBe(10);
        expect(slice.rows).toHaveLength(8);
        expect(slice.unreadable).toBe(0);
        await expect(book.list(scopeA, { limit: 100 })).rejects.toThrow();
    });

    it('counts and leaves out a corrupt record it does read', async () => {
        await book.save(scopeA, accountChart('Good', 'good'), null);
        await putRaw({
            ownerId: A,
            documentId: 'bad',
            document: { id: 'bad', title: 42 },
            remoteRevision: null,
        });
        const slice = await book.home(
            scopeA,
            homeRequest(new Map([['bad', '2026-01-01T00:00:00.000Z']]), 'bad'),
        );
        expect(slice.continued).toBeNull();
        expect(slice.rows.map((row) => row.id)).toEqual(['good']);
        expect(slice.unreadable).toBe(2);
    });
});
