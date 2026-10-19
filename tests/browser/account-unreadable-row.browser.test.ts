import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newCollection } from '../../web/lib/collections.js';
import { runLibraryDownload } from '../../web/lib/sync/download.js';
import { runOutboxPass } from '../../web/lib/sync/drain.js';
import {
    ACCOUNT_DATABASE,
    type AccountScope,
    type PreparedSave,
} from '../../web/lib/sync/protocol.js';
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
function committing(): {
    transport: SaveTransport;
    ids: string[];
    bodies: Array<{ expectedRevision: string | null; document: { title: string } }>;
} {
    const ids: string[] = [];
    const bodies: Array<{ expectedRevision: string | null; document: { title: string } }> = [];
    let next = 0;
    return {
        ids,
        bodies,
        transport: async (request) => {
            ids.push(request.documentId);
            bodies.push(JSON.parse(request.body));
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

    it('is not written over while a live draft holds it', async () => {
        await putCorruptSong('song-a');
        await put('drafts', {
            ownerId: OWNER,
            documentId: 'song-a',
            writerId: 'writer-old',
            document: accountChart('Experiment', 'song-a'),
            baseRevision: 0,
            capturedAt: new Date().toISOString(),
        });
        const result = await cloud(
            new Map([['song-a', { revision: 'r-new', document: accountChart('Clean', 'song-a') }]]),
        ).run();
        expect(result.superseded).toEqual(['song-a']);
        expect(await stored('songs', 'song-a')).toMatchObject({ document: corruptChart('song-a') });
    });

    it('is flagged, never removed, by a tombstone — once', async () => {
        await putCorruptSong('song-a');
        const tombstone = {
            run: () =>
                runLibraryDownload(
                    book,
                    scope,
                    {
                        async manifest() {
                            return {
                                kind: 'page',
                                page: {
                                    documents: [
                                        {
                                            documentId: 'song-a',
                                            revision: 'r-gone',
                                            deleted: true,
                                            bytes: 0,
                                        },
                                    ],
                                    nextAfterDocumentId: null,
                                },
                            };
                        },
                        async download() {
                            throw new Error('A tombstone needs no body.');
                        },
                    },
                    { isActive: () => false, minimumIntervalMs: 0 },
                ),
        };
        const first = await tombstone.run();
        expect(first.retainedDeleted).toEqual(['song-a']);
        expect(await book.remoteCandidate(scope, 'song-a')).toMatchObject({ kind: 'deleted' });
        expect(await stored('songs', 'song-a')).toMatchObject({ document: corruptChart('song-a') });
        // Settled: the next pass commits nothing for it again.
        const second = await tombstone.run();
        expect(second.retainedDeleted).toEqual([]);
        expect(second.unchanged).toEqual(['song-a']);
    });

    it('as a collection, is stepped over by both passes and replaced by the account’s copy', async () => {
        await put('collections', {
            ownerId: OWNER,
            documentId: 'set-a',
            document: { ...newCollection('Broken'), id: 'set-a', name: 42 },
            remoteRevision: 'r-old',
        });
        await book.saveCollection(scope, { ...newCollection('Set B'), id: 'set-b' }, null);
        expect((await book.collectionPage(scope)).unreadable).toEqual([
            { documentId: 'set-a', remoteRevision: 'r-old' },
        ]);

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
    /**
     * Song B: one Save acknowledged (a receipt), then two more queued, chained by `base`. The one
     * at `corrupt` (local revision 1, the head, by default; 2 is the newest) stops decoding.
     */
    async function chainedQueue(corrupt: 1 | 2 = 1): Promise<string> {
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
        // Only this one will not decode; the other is perfectly readable.
        const head = queue.find((op) => op.localRevision === corrupt)!;
        await put('operations', { ...head, snapshot: corruptChart('song-b') });
        return String(head.operationId);
    }

    it('retires the whole queue and re-queues the readable record, losing nothing and blocking no one', async () => {
        await chainedQueue();
        await book.save(scope, accountChart('A', 'song-a'), null);
        await book.save(scope, accountChart('C', 'song-c'), null);
        const receipts = (await all('receipts')).filter((row) => row.documentId === 'song-b');
        expect(receipts).toHaveLength(1);
        const queued = (await all('operations')).filter((op) => op.documentId === 'song-b');
        const sky = committing();

        const result = await runOutboxPass(book, scope, sky.transport);

        expect(result.kind).toBe('complete');
        // B2 — chained behind the head that would not read — still uploads, in the same pass,
        // on the record's own confirmed revision.
        expect(sky.ids).toEqual(['song-a', 'song-b', 'song-c']);
        expect(sky.bodies[1]).toMatchObject({ expectedRevision: 'r1', document: { title: 'B2' } });
        expect(result.counts).toMatchObject({ committed: 3, unreadable: 0 });
        // The WHOLE old queue went — never one operation out of its `base` chain — and the
        // re-queued Save was acknowledged like any other.
        const left = (await all('operations')).filter((op) => op.documentId === 'song-b');
        expect(left).toEqual([]);
        for (const op of queued) {
            expect((await all('receipts')).some((r) => r.operationId === op.operationId)).toBe(
                false,
            );
        }
        // Receipts stay: they record Saves already acknowledged, not work.
        const after = (await all('receipts')).filter((row) => row.documentId === 'song-b');
        expect(after).toEqual(expect.arrayContaining(receipts));
        expect(after).toHaveLength(2);
        expect(await book.read(scope, 'song-b')).toMatchObject({
            remoteRevision: 'r2',
            document: { title: 'B2' },
        });
    });

    it('never lets the same pass’s download write over unsent music it could not read', async () => {
        // Confirmed at r1, then edited: the record says r1 and holds the edit, as `save()`
        // leaves it. Then both the record and the queued Save stop decoding.
        const first = await book.save(scope, accountChart('B0', 'song-b'), null);
        await runOutboxPass(book, scope, committing().transport);
        await book.save(scope, { ...first.document, title: 'B1' }, first.document.revision);
        const [op] = (await all('operations')).filter((row) => row.documentId === 'song-b');
        await put('operations', { ...op, snapshot: corruptChart('song-b') });
        await put('songs', {
            ownerId: OWNER,
            documentId: 'song-b',
            document: corruptChart('song-b'),
            remoteRevision: 'r1',
        });

        // One pass: the outbox first, then the download, as `pass()` runs them.
        const outbox = await runOutboxPass(book, scope, committing().transport);
        expect(outbox.counts.unreadable).toBe(1);
        const sky = cloud(new Map([['song-b', { revision: 'r1', document: first.document }]]));
        const result = await sky.run();

        // Not fetched, not written: the edit is still here, for the export to hand back.
        expect(sky.downloads).toEqual([]);
        expect(result.advanced).toEqual([]);
        expect(await stored('songs', 'song-b')).toMatchObject({
            document: corruptChart('song-b'),
            remoteRevision: null,
        });
        expect((await book.unreadableSongs(scope)).map((row) => row.documentId)).toEqual([
            'song-b',
        ]);
        // Settled, not "still downloading".
        expect(result.complete).toBe(true);
        expect(result.library).toMatchObject({ unsettled: 0 });
        // And now unconfirmed, the musician can remove it from this device.
        expect(await book.purgeLocal(scope, ['song-b'])).toEqual({
            purged: ['song-b'],
            held: [],
        });
    });

    it('steps over a queue from a newer build, never retiring it', async () => {
        await book.save(scope, accountChart('A', 'song-a'), null);
        const b = await book.save(scope, accountChart('B', 'song-b'), null);
        const [op] = (await all('operations')).filter((row) => row.documentId === 'song-b');
        // A stale tab on an older build reads what a newer one queued.
        await put('operations', {
            ...op,
            snapshot: { ...b.document, schemaVersion: 99 },
        });
        const sky = committing();

        const result = await runOutboxPass(book, scope, sky.transport);

        expect(result.kind).toBe('complete');
        expect(sky.ids).toEqual(['song-a']);
        expect(result.counts).toMatchObject({ committed: 1, refused: 1, unreadable: 0 });
        expect((await all('operations')).filter((row) => row.documentId === 'song-b')).toHaveLength(
            1,
        );
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

    it('re-queues the newest Save that still reads when the record will not (#1782)', async () => {
        await chainedQueue();
        await book.save(scope, accountChart('A', 'song-a'), null);
        // The record stops reading too. B2, the newest Save, is the only copy of it that reads.
        await put('songs', {
            ownerId: OWNER,
            documentId: 'song-b',
            document: corruptChart('song-b'),
            remoteRevision: 'r1',
        });
        const sky = committing();

        const result = await runOutboxPass(book, scope, sky.transport);

        expect(result.kind).toBe('complete');
        expect(result.counts).toMatchObject({ committed: 2, unreadable: 0 });
        expect(sky.ids).toEqual(['song-a', 'song-b']);
        // On the record's own confirmed revision, as a readable record's re-queue is.
        expect(sky.bodies[1]).toMatchObject({ expectedRevision: 'r1', document: { title: 'B2' } });
        expect(await book.queued(scope, 'song-b')).toEqual([]);
        expect(await stored('songs', 'song-b')).toMatchObject({
            document: corruptChart('song-b'),
            remoteRevision: 'r2',
        });
        // And the account's copy, B2, then takes the unreadable bytes' place.
        const download = await cloud(
            new Map([
                ['song-a', { revision: 'r1', document: accountChart('A', 'song-a') }],
                [
                    'song-b',
                    { revision: 'r2', document: { ...accountChart('B2', 'song-b'), revision: 2 } },
                ],
            ]),
        ).run();
        expect(download.advanced).toContain('song-b');
        expect((await book.read(scope, 'song-b'))?.document.title).toBe('B2');
    });

    it('does not send an older Save in place of a newer one it cannot read (#1782)', async () => {
        // B2, the newest Save, stops decoding, and so does the record that holds it. B1 still
        // reads, but sending it would roll the song back once the account's copy came down.
        await chainedQueue(2);
        await put('songs', {
            ownerId: OWNER,
            documentId: 'song-b',
            document: corruptChart('song-b'),
            remoteRevision: 'r1',
        });
        const sky = committing();

        const result = await runOutboxPass(book, scope, sky.transport);

        expect(sky.ids).toEqual([]);
        expect(result.counts).toMatchObject({ committed: 0, unreadable: 1 });
        expect((await all('operations')).filter((op) => op.documentId === 'song-b')).toEqual([]);
        // Kept for the export, and never taken for a clean mirror.
        expect(await stored('songs', 'song-b')).toMatchObject({
            document: corruptChart('song-b'),
            remoteRevision: null,
        });
    });

    it('re-queues the newest of several readable Saves behind an unreadable head (#1782)', async () => {
        // Confirmed at r1, then B1, B2 and B3 queued. B1 (the head) and the record stop reading.
        const first = await book.save(scope, accountChart('B0', 'song-b'), null);
        await runOutboxPass(book, scope, committing().transport);
        let document = first.document;
        for (const title of ['B1', 'B2', 'B3']) {
            document = (await book.save(scope, { ...document, title }, document.revision)).document;
        }
        const head = (await all('operations')).find(
            (op) => op.documentId === 'song-b' && op.localRevision === 1,
        )!;
        await put('operations', { ...head, snapshot: corruptChart('song-b') });
        await put('songs', {
            ownerId: OWNER,
            documentId: 'song-b',
            document: corruptChart('song-b'),
            remoteRevision: 'r1',
        });
        const sky = committing();

        const result = await runOutboxPass(book, scope, sky.transport);

        expect(result.counts).toMatchObject({ committed: 1, unreadable: 0 });
        expect(sky.bodies).toMatchObject([{ expectedRevision: 'r1', document: { title: 'B3' } }]);
    });

    /**
     * A cloud that answers Song B with a conflict against `remote`, and commits every other song.
     * What a newer server says after a lost acknowledgement: it holds the musician's own Save.
     */
    function conflictingOn(remote: { revision: string; document: unknown }) {
        const ids: string[] = [];
        const bodies: Array<{ expectedRevision: string | null; document: { title: string } }> = [];
        const transport = async (request: PreparedSave) => {
            ids.push(request.documentId);
            bodies.push(JSON.parse(request.body));
            const receipt = {
                ownerId: request.ownerId,
                documentId: request.documentId,
                operationId: request.operationId,
                digest: request.digest,
            };
            return request.documentId === 'song-b'
                ? { ...receipt, kind: 'conflict', revision: remote.revision, remote }
                : { ...receipt, kind: 'committed', revision: 'r9' };
        };
        return { ids, bodies, transport };
    }

    it('steps over a conflict whose account version this build cannot read, and sends the rest (#1782)', async () => {
        // The item-3 shape: the head and the record will not read, B2 (newest) does and is sent.
        await chainedQueue();
        await put('songs', {
            ownerId: OWNER,
            documentId: 'song-b',
            document: corruptChart('song-b'),
            remoteRevision: 'r1',
        });
        await book.save(scope, accountChart('C', 'song-c'), null);
        // The account answers with a version this build cannot read.
        const sky = conflictingOn({ revision: 'r2', document: corruptChart('song-b') });

        const result = await runOutboxPass(book, scope, sky.transport);

        expect(result.kind).toBe('complete');
        // Song C, behind it in id order, still uploads.
        expect(sky.ids).toEqual(['song-b', 'song-c']);
        expect(result.counts).toMatchObject({ committed: 1, refused: 1, conflict: 0 });
        // Nothing parked and nothing lost: B2 is still queued, the record as it was.
        const queue = await book.queued(scope, 'song-b');
        expect(queue).toMatchObject([{ status: 'queued', snapshot: { title: 'B2' } }]);
        expect(queue[0].remote).toBeUndefined();
        expect(await stored('songs', 'song-b')).toMatchObject({
            document: corruptChart('song-b'),
            remoteRevision: 'r1',
        });
        // And the next pass does the same, rather than rejecting.
        const again = await runOutboxPass(book, scope, sky.transport);
        expect(again.kind).toBe('complete');
        expect(again.counts).toMatchObject({ refused: 1 });
    });

    it('after a lost acknowledgement, steps over the unreadable account copy, then Keep both settles it (#1782)', async () => {
        // Confirmed at r1. Then B1 is sent and the account commits it as r2, but the reply never
        // arrives; B2 is saved behind it. A newer build then cannot read B1, so neither its queued
        // Save nor the account's r2, which holds B1's own bytes.
        const first = await book.save(scope, accountChart('B0', 'song-b'), null);
        await runOutboxPass(book, scope, committing().transport);
        const second = await book.save(
            scope,
            { ...first.document, title: 'B1' },
            first.document.revision,
        );
        let committed: unknown = null;
        const lost = await runOutboxPass(book, scope, async (request) => {
            committed = JSON.parse(request.body).document;
            throw new Error('The reply was lost.');
        });
        expect(lost.kind).toBe('retry');
        await book.save(scope, { ...second.document, title: 'B2' }, second.document.revision);
        await book.save(scope, accountChart('C', 'song-c'), null);
        const sent = (await all('operations')).find(
            (op) => op.documentId === 'song-b' && op.localRevision === 1,
        )!;
        expect(sent.wireBody).not.toBeNull();
        await put('operations', { ...sent, snapshot: corruptChart('song-b') });

        // B2 is re-queued on r1 and the account refuses it against r2, which this build cannot
        // read: stepped over, not thrown on, and Song C still uploads.
        const stale = conflictingOn({ revision: 'r2', document: corruptChart('song-b') });
        const result = await runOutboxPass(book, scope, stale.transport);
        expect(result.kind).toBe('complete');
        expect(stale.ids).toEqual(['song-b', 'song-c']);
        expect(stale.bodies[0]).toMatchObject({
            expectedRevision: 'r1',
            document: { title: 'B2' },
        });
        expect(result.counts).toMatchObject({ committed: 1, refused: 1, conflict: 0 });
        expect(await book.queued(scope, 'song-b')).toMatchObject([
            { status: 'queued', snapshot: { title: 'B2' } },
        ]);
        expect(await book.read(scope, 'song-b')).toMatchObject({
            remoteRevision: 'r1',
            document: { title: 'B2' },
        });

        // Once the app reads that version (here: the account's B1 as sent), the same queued Save
        // meets an ordinary conflict, and Keep both keeps both lines.
        const updated = conflictingOn({ revision: 'r2', document: committed });
        const later = await runOutboxPass(book, scope, updated.transport);
        expect(later.counts).toMatchObject({ conflict: 1, refused: 0 });
        const kept = await book.keepBoth(scope, 'song-b');
        if (kept === 'none') {
            throw new Error('Keep both found nothing to settle.');
        }
        expect(kept).toMatchObject({ conflict: 'version', adopted: { title: 'B1' } });
        expect(await book.read(scope, 'song-b')).toMatchObject({
            remoteRevision: 'r2',
            document: { title: 'B1' },
        });
        expect((await book.read(scope, kept.documentId))?.document.title).toMatch(/^B2\b/);
        expect(await book.queued(scope, 'song-b')).toEqual([]);
    });
});
