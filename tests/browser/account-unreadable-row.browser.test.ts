import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newCollection } from '../../web/lib/collections.js';
import { runLibraryDownload } from '../../web/lib/sync/download.js';
import { runOutboxPass } from '../../web/lib/sync/drain.js';
import { ACCOUNT_DATABASE, type AccountScope } from '../../web/lib/sync/protocol.js';
import { AccountSongbook } from '../../web/lib/sync/repository.js';
import type { SaveTransport } from '../../web/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * One stored row this build cannot read must not stop account sync for good (#1769). Before, the
 * library read refused a whole page over it and the outbox refused a queue it could not decode, so
 * every later pass on the device rejected at the same row and nothing uploaded or downloaded
 * again. Each test seeds one bad row beside good ones. Real IndexedDB in both engines, because the
 * cursor, the index and the one-transaction queue retirement are the point.
 */

const OWNER = 'owner-a';
let name: string;
let book: AccountSongbook;
let scope: AccountScope;
const connections: AccountSongbook[] = [];

function connection(): AccountSongbook {
    const instance = new AccountSongbook(name);
    connections.push(instance);
    return instance;
}

/** A direct connection, for rows the repository's own API would never write. */
async function raw<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        return await work(db);
    } finally {
        db.close();
    }
}

function put(store: string, row: Record<string, unknown>): Promise<void> {
    return raw(
        (db) =>
            new Promise<void>((resolve, reject) => {
                const tx = db.transaction(store, 'readwrite');
                tx.objectStore(store).put(row);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            }),
    );
}

/** Every row of one store, settled on the transaction (WebKit holds the connection until then). */
function all<T = Record<string, unknown>>(store: string): Promise<T[]> {
    return raw(
        (db) =>
            new Promise<T[]>((resolve, reject) => {
                const tx = db.transaction(store, 'readonly');
                const request = tx.objectStore(store).getAll();
                tx.oncomplete = () => resolve(request.result as T[]);
                tx.onerror = () => reject(tx.error);
            }),
    );
}

async function stored(store: string, documentId: string): Promise<Record<string, unknown>> {
    return (await all(store)).find((row) => row.documentId === documentId)!;
}

/** A chart that will not validate: a non-string title. */
function corruptChart(id: string) {
    return { ...accountChart('Corrupt', id), title: 42 };
}

/** A song row this build cannot read, as an older or broken build might have left it. */
function putCorruptSong(documentId: string, remoteRevision: string | null = 'r-old') {
    return put('songs', {
        ownerId: OWNER,
        documentId,
        document: corruptChart(documentId),
        remoteRevision,
    });
}

/** A cloud that commits every Save it is handed and records which ids it saw. */
function committing(): { transport: SaveTransport; ids: string[] } {
    const ids: string[] = [];
    let next = 0;
    return {
        ids,
        transport: async (request) => {
            ids.push(request.documentId);
            next += 1;
            return {
                ownerId: request.ownerId,
                documentId: request.documentId,
                operationId: request.operationId,
                digest: request.digest,
                kind: 'committed',
                revision: `r${next}`,
            };
        },
    };
}

/** One download pass over a cloud holding exactly `docs`; records which bodies it fetched. */
function cloud(docs: Map<string, { revision: string; document: unknown }>) {
    const downloads: string[] = [];
    const run = () =>
        runLibraryDownload(
            book,
            scope,
            {
                async manifest() {
                    return {
                        kind: 'page',
                        page: {
                            documents: [...docs.entries()].map(([documentId, entry]) => ({
                                documentId,
                                revision: entry.revision,
                                deleted: false,
                                bytes: 100,
                                ...((entry.document as { kind?: string }).kind === 'collection'
                                    ? { kind: 'collection' }
                                    : {}),
                            })),
                            nextAfterDocumentId: null,
                        },
                    };
                },
                async download(documentId) {
                    downloads.push(documentId);
                    const entry = docs.get(documentId)!;
                    return {
                        kind: 'body',
                        body: { documentId, revision: entry.revision, document: entry.document },
                    };
                },
            },
            { isActive: () => false, minimumIntervalMs: 0 },
        );
    return { run, downloads };
}

beforeEach(async () => {
    name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    book = connection();
    scope = (await book.switchAccount(OWNER))!;
});

afterEach(async () => {
    await Promise.all(connections.splice(0).map((instance) => instance.close()));
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Test connection leaked.'));
    });
});

describe('a mirror row that will not decode (#1769)', () => {
    it('is stepped over and reported by the outbox pass, which still uploads every other song', async () => {
        await book.save(scope, accountChart('A', 'song-a'), null);
        await putCorruptSong('song-b');
        await book.save(scope, accountChart('C', 'song-c'), null);
        const sky = committing();

        const result = await runOutboxPass(book, scope, sky.transport);

        expect(result.kind).toBe('complete');
        expect(sky.ids).toEqual(['song-a', 'song-c']);
        // Nothing queued for it, so nothing was retired either.
        expect(result.counts).toMatchObject({ committed: 2, idle: 1, unreadable: 0 });
        // Left exactly as it was.
        expect(await stored('songs', 'song-b')).toMatchObject({ document: corruptChart('song-b') });
    });

    it('is reported by the download, which carries on and replaces it with the account’s clean copy', async () => {
        await putCorruptSong('song-a');
        await book.save(scope, accountChart('B', 'song-b'), null);
        await runOutboxPass(book, scope, committing().transport);
        const clean = { ...accountChart('Clean', 'song-a'), revision: 3 };
        const sky = cloud(
            new Map<string, { revision: string; document: unknown }>([
                ['song-a', { revision: 'r-new', document: clean }],
                ['song-b', { revision: 'r9', document: { ...accountChart('B2', 'song-b') } }],
            ]),
        );

        const result = await sky.run();

        expect(result.complete).toBe(true);
        expect(result.failures).toEqual([]);
        expect(result.unreadable).toEqual(['song-a']);
        expect(result.advanced).toEqual(['song-a', 'song-b']);
        expect(await book.read(scope, 'song-a')).toMatchObject({
            remoteRevision: 'r-new',
            document: { title: 'Clean', revision: 3 },
        });
        expect((await book.read(scope, 'song-b'))?.document.title).toBe('B2');
        // Readable now, so the next pass has nothing left to ask for.
        sky.downloads.length = 0;
        const again = await sky.run();
        expect(sky.downloads).toEqual([]);
        expect(again.unreadable).toEqual([]);
    });

    it('preserves a newer-format body as for a readable row, so it is not fetched again every pass', async () => {
        await putCorruptSong('song-a');
        const future = { schemaVersion: 99, id: 'song-a', title: 'from the future' };
        const sky = cloud(new Map([['song-a', { revision: 'r7', document: future }]]));

        const first = await sky.run();
        expect(first.unsupported).toEqual(['song-a']);
        expect(first.complete).toBe(true);
        // The row is never written over by a body this build cannot read.
        expect(await stored('songs', 'song-a')).toMatchObject({ document: corruptChart('song-a') });

        sky.downloads.length = 0;
        await sky.run();
        expect(sky.downloads).toEqual([]);
    });

    it('as a collection, is stepped over by both passes and replaced by the account’s copy', async () => {
        await put('collections', {
            ownerId: OWNER,
            documentId: 'set-a',
            document: { ...newCollection('Broken'), id: 'set-a', name: 42 },
            remoteRevision: 'r-old',
        });
        await book.saveCollection(scope, { ...newCollection('Set B'), id: 'set-b' }, null);
        expect((await book.collectionPage(scope)).unreadable).toEqual(['set-a']);

        const sky = committing();
        const outbox = await runOutboxPass(book, scope, sky.transport);
        expect(outbox.kind).toBe('complete');
        expect(sky.ids).toEqual(['set-b']);

        const clean = { ...newCollection('Set A'), id: 'set-a' };
        const result = await cloud(
            new Map([['set-a', { revision: 'r-new', document: clean }]]),
        ).run();
        expect(result.complete).toBe(true);
        expect(result.unreadable).toEqual(['set-a']);
        expect(await book.readCollection(scope, 'set-a')).toMatchObject({
            remoteRevision: 'r-new',
            document: { name: 'Set A' },
        });
    });
});

describe('a queued Save that will not decode (#1769)', () => {
    /** Song B: one Save acknowledged (a receipt), then two more queued, chained by `base`. */
    async function chainedQueue(): Promise<string> {
        const first = await book.save(scope, accountChart('B0', 'song-b'), null);
        await runOutboxPass(book, scope, committing().transport);
        const second = await book.save(
            scope,
            { ...first.document, title: 'B1' },
            first.document.revision,
        );
        await book.save(scope, { ...second.document, title: 'B2' }, second.document.revision);
        const queue = (await all('operations')).filter((op) => op.documentId === 'song-b');
        expect(queue).toHaveLength(2);
        // Only the HEAD will not decode; the op chained behind it is perfectly readable.
        const head = queue.find((op) => op.localRevision === 1)!;
        await put('operations', { ...head, snapshot: corruptChart('song-b') });
        return String(head.operationId);
    }

    it('retires that document’s whole queue, keeps its receipts, and does not block the others', async () => {
        await chainedQueue();
        await book.save(scope, accountChart('A', 'song-a'), null);
        await book.save(scope, accountChart('C', 'song-c'), null);
        const receipts = (await all('receipts')).filter((row) => row.documentId === 'song-b');
        expect(receipts).toHaveLength(1);
        const sky = committing();

        const result = await runOutboxPass(book, scope, sky.transport);

        expect(result.kind).toBe('complete');
        expect(sky.ids).toEqual(['song-a', 'song-c']);
        expect(result.counts).toMatchObject({ committed: 2, unreadable: 1 });
        // The WHOLE queue went — never one operation out of its `base` chain.
        expect((await all('operations')).filter((op) => op.documentId === 'song-b')).toEqual([]);
        expect(await book.queued(scope, 'song-b')).toEqual([]);
        // Receipts stay: they record Saves already acknowledged, not work.
        expect((await all('receipts')).filter((row) => row.documentId === 'song-b')).toEqual(
            receipts,
        );
        // The saved record is left as it was.
        expect((await book.read(scope, 'song-b'))?.document.title).toBe('B2');

        // The next pass has nothing left to retire, and B can be Saved and uploaded again.
        const again = await runOutboxPass(book, scope, sky.transport);
        expect(again.counts.unreadable).toBe(0);
        const saved = (await book.read(scope, 'song-b'))!;
        await book.save(scope, { ...saved.document, title: 'B3' }, saved.document.revision);
        await runOutboxPass(book, scope, sky.transport);
        expect(sky.ids.at(-1)).toBe('song-b');
        expect(await book.queued(scope, 'song-b')).toEqual([]);
    });

    it('still sends a readable queue whose record will not read, and the download then heals the record', async () => {
        await book.save(scope, accountChart('D', 'song-d'), null);
        // The record goes bad under a Save that is still readable.
        await put('songs', {
            ownerId: OWNER,
            documentId: 'song-d',
            document: corruptChart('song-d'),
            remoteRevision: null,
        });
        const sky = committing();

        const result = await runOutboxPass(book, scope, sky.transport);

        expect(result.kind).toBe('complete');
        expect(sky.ids).toEqual(['song-d']);
        expect(await book.queued(scope, 'song-d')).toEqual([]);
        // Its bytes are kept, now labelled with the revision the account confirmed…
        expect(await stored('songs', 'song-d')).toMatchObject({
            document: corruptChart('song-d'),
            remoteRevision: 'r1',
        });
        // …which is what lets the download put the account's copy in their place.
        const clean = accountChart('D', 'song-d');
        const download = await cloud(
            new Map([['song-d', { revision: 'r1', document: clean }]]),
        ).run();
        expect(download.advanced).toEqual(['song-d']);
        expect((await book.read(scope, 'song-d'))?.document.title).toBe('D');
    });
});
