import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CollectionDocument, newCollection } from '../../prototypes/v2/lib/collections.js';
import {
    deleteCollection as deleteGuestCollection,
    getCollection as getGuestCollection,
    listCollections as listGuestCollections,
    list as listGuestSongs,
    saveCollection as saveGuestCollection,
} from '../../prototypes/v2/lib/repository.js';
import { ACCOUNT_DATABASE_VERSION } from '../../prototypes/v2/lib/sync/database.js';
import { runLibraryDownload } from '../../prototypes/v2/lib/sync/download.js';
import { runOutboxPass } from '../../prototypes/v2/lib/sync/drain.js';
import {
    ACCOUNT_DATABASE,
    type AccountScope,
    type PreparedDelete,
    type PreparedSave,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { decodeSaveRequest } from '../../prototypes/v2/lib/sync/request.js';
import type { SaveTransport } from '../../prototypes/v2/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * Collections, the second synced document kind (#1474), against real IndexedDB in both engines.
 *
 * Every transport here is a local fake, as in `account-outbox-pass` — but one that hands each
 * request to the SERVER'S own decoder (`decodeSaveRequest`) before answering, so a collection the
 * outbox freezes is proven to be bytes the account API accepts, not merely bytes the fake liked.
 *
 * The upgrade tests at the bottom are the issue's brake: version 2 of the account database only
 * ADDS a store, and the guest songbook database is not upgraded at all. Both prove every row that
 * existed before is byte-identical after.
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

function collection(
    id: string,
    songIds: string[] = [],
    overrides: Partial<CollectionDocument> = {},
): CollectionDocument {
    return {
        kind: 'collection',
        schemaVersion: 1,
        id,
        name: `Set ${id}`,
        revision: 0,
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-01T12:00:00.000Z',
        songIds,
        ...overrides,
    };
}

/** A server that decodes every request with the API's own decoder, and commits or conflicts. */
function cloud(
    options: { conflict?: Map<string, { revision: string; document: unknown } | null> } = {},
) {
    const counters = new Map<string, number>();
    const receipts = new Map<string, unknown>();
    const calls: PreparedSave[] = [];
    const kinds: string[] = [];
    const transport: SaveTransport = async (request) => {
        calls.push(request);
        // The account API's front door: refuses anything it would refuse over HTTP.
        const decoded = await decodeSaveRequest(request.body, request.ownerId);
        kinds.push('kind' in decoded.document ? decoded.document.kind : 'chart');
        const cached = receipts.get(request.operationId);
        if (cached) {
            return cached;
        }
        const envelope = {
            ownerId: request.ownerId,
            documentId: request.documentId,
            operationId: request.operationId,
            digest: request.digest,
        };
        const conflict = options.conflict?.get(request.documentId);
        if (conflict !== undefined) {
            return {
                ...envelope,
                kind: 'conflict',
                revision: conflict?.revision ?? 'cloud-gone',
                remote: conflict,
            };
        }
        const revision = `cloud-${request.documentId}-${(counters.get(request.documentId) ?? 0) + 1}`;
        counters.set(request.documentId, (counters.get(request.documentId) ?? 0) + 1);
        const response = { ...envelope, kind: 'committed', revision };
        receipts.set(request.operationId, response);
        return response;
    };
    return { transport, calls, kinds };
}

function deleted(request: PreparedDelete) {
    return {
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        kind: 'deleted',
        revision: request.expectedRevision,
    };
}

async function deleteDatabase(database: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Test connection leaked.'));
    });
}

beforeEach(async () => {
    name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    book = connection();
    scope = (await book.switchAccount(OWNER))!;
});

afterEach(async () => {
    await Promise.all(connections.splice(0).map((instance) => instance.close()));
    await deleteDatabase(name);
});

describe('an account collection through the outbox (#1474)', () => {
    it('save → drain → receipt: the record is confirmed and the queue is empty', async () => {
        const saved = await book.saveCollection(scope, collection('set-a', ['song-1']), null);
        expect(saved.remoteRevision).toBeNull();
        expect(await book.pendingCollection(scope, 'set-a')).toHaveLength(1);

        const server = cloud();
        const result = await runOutboxPass(book, scope, server.transport);
        expect(result.kind).toBe('complete');
        expect(result.counts.committed).toBe(1);
        expect(server.kinds).toEqual(['collection']);

        const confirmed = await book.readCollection(scope, 'set-a');
        expect(confirmed?.remoteRevision).toBe('cloud-set-a-1');
        expect(confirmed?.document.songIds).toEqual(['song-1']);
        expect(await book.pendingCollection(scope, 'set-a')).toEqual([]);

        // A second Save chains on the confirmed revision, and the receipt it leaves replays.
        await book.saveCollection(
            scope,
            { ...confirmed!.document, songIds: ['song-1', 'song-2'] },
            0,
        );
        const [queued] = await book.pendingCollection(scope, 'set-a');
        expect(queued.base).toEqual({ revision: 'cloud-set-a-1' });
        await runOutboxPass(book, scope, server.transport);
        expect((await book.readCollection(scope, 'set-a'))?.remoteRevision).toBe('cloud-set-a-2');
    });

    it('walks songs and collections in one id order, one cursor across both kinds', async () => {
        await book.save(scope, accountChart('B', 'b-song'), null);
        await book.saveCollection(scope, collection('a-set'), null);
        await book.saveCollection(scope, collection('c-set'), null);
        const server = cloud();
        const result = await runOutboxPass(book, scope, server.transport);
        expect(result.kind).toBe('complete');
        expect(server.calls.map((call) => call.documentId)).toEqual(['a-set', 'b-song', 'c-set']);
        expect(server.kinds).toEqual(['collection', 'chart', 'collection']);
        expect((await book.read(scope, 'b-song'))?.remoteRevision).toBe('cloud-b-song-1');
    });

    it('pages a mixed library by the same cursor, missing and repeating nothing', async () => {
        const ids: string[] = [];
        for (let index = 0; index < 20; index++) {
            const id = `doc-${String(index).padStart(2, '0')}`;
            ids.push(id);
            if (index % 2 === 0) {
                await book.save(scope, accountChart(id, id), null);
            } else {
                await book.saveCollection(scope, collection(id), null);
            }
        }
        // 20 documents, pages of 25: the first page is the whole library.
        const server = cloud();
        const first = await runOutboxPass(book, scope, server.transport);
        expect(first.kind).toBe('complete');
        expect(server.calls.map((call) => call.documentId)).toEqual(ids);

        // Over a page: 30 collections and the 20 above, resumed by cursor until complete.
        for (let index = 20; index < 50; index++) {
            await book.saveCollection(scope, collection(`doc-${index}`), null);
        }
        const again = cloud();
        let cursor: string | undefined;
        for (let pass = 0; pass < 5; pass++) {
            const result = await runOutboxPass(book, scope, again.transport, {
                ...(cursor === undefined ? {} : { afterDocumentId: cursor }),
            });
            if (result.kind === 'complete') {
                break;
            }
            expect(result.kind).toBe('more');
            cursor = result.resumeAfterDocumentId!;
        }
        // Only the 30 new ones were still queued; each was sent exactly once, in id order.
        expect(again.calls.map((call) => call.documentId)).toEqual(
            Array.from({ length: 30 }, (_, i) => `doc-${i + 20}`),
        );
    });

    it('a conflict parks the collection with the remote version and blocks only it', async () => {
        await book.saveCollection(scope, collection('set-a', ['song-1']), null);
        await book.save(scope, accountChart('B', 'song-b'), null);
        const remote = collection('set-a', ['song-9'], { name: 'Theirs', revision: 4 });
        const server = cloud({
            conflict: new Map([['set-a', { revision: 'cloud-theirs', document: remote }]]),
        });
        const result = await runOutboxPass(book, scope, server.transport);
        expect(result.counts).toMatchObject({ conflict: 1, committed: 1 });

        const [parked] = await book.pendingCollection(scope, 'set-a');
        expect(parked.status).toBe('conflict');
        expect(parked.remote?.revision).toBe('cloud-theirs');
        expect(parked.remote?.document).toEqual(remote);
        // The local record is untouched; the song behind it went out.
        expect((await book.readCollection(scope, 'set-a'))?.document.name).toBe('Set set-a');
        expect((await book.read(scope, 'song-b'))?.remoteRevision).toBe('cloud-song-b-1');
        // A conflicted head is never re-sent.
        expect(await book.prepare(scope, 'set-a')).toBe('conflict');
    });

    it('refuses a conflict reply whose remote is a different kind, writing nothing', async () => {
        await book.saveCollection(scope, collection('set-a'), null);
        const server = cloud({
            conflict: new Map([
                ['set-a', { revision: 'cloud-chart', document: accountChart('X', 'set-a') }],
            ]),
        });
        await expect(runOutboxPass(book, scope, server.transport)).rejects.toThrow(
            'does not match',
        );
        const [head] = await book.pendingCollection(scope, 'set-a');
        expect(head.status).toBe('queued');
    });

    it('a refused head (#1298) retires with the next Save, as a song’s does', async () => {
        await book.saveCollection(scope, collection('set-a'), null);
        const [head] = await book.pendingCollection(scope, 'set-a');
        await book.prepare(scope, 'set-a');
        expect(await book.refuse(scope, 'set-a', head.operationId, 'too-large')).toBe('refused');
        expect(await book.prepare(scope, 'set-a')).toBe('refused');
        await book.saveCollection(scope, collection('set-a', [], { revision: 0 }), 0);
        const queue = await book.pendingCollection(scope, 'set-a');
        expect(queue).toHaveLength(1);
        expect(queue[0].status).toBe('queued');
        expect(queue[0].localRevision).toBe(1);
    });

    it('keeps one id space: a collection cannot take a song’s id', async () => {
        await book.save(scope, accountChart('A', 'shared'), null);
        await expect(book.saveCollection(scope, collection('shared'), null)).rejects.toThrow(
            'already belongs to a song',
        );
        // And a chart path never hands back a collection's queue.
        await book.saveCollection(scope, collection('set-a'), null);
        await expect(book.pending(scope, 'set-a')).rejects.toThrow();
        expect(await book.queued(scope, 'set-a')).toHaveLength(1);
    });

    it('compare-and-swaps on the local revision', async () => {
        await book.saveCollection(scope, collection('set-a'), null);
        await expect(book.saveCollection(scope, collection('set-a'), null)).rejects.toThrow(
            'saved elsewhere',
        );
        await expect(book.saveCollection(scope, collection('set-a'), 5)).rejects.toThrow(
            'saved elsewhere',
        );
    });
});

describe('reading collections: a song that no longer resolves is filtered, never rewritten', () => {
    it('resolves against the songs this device holds, keeping the stored order and ids', async () => {
        await book.save(scope, accountChart('One', 'song-1'), null);
        await book.save(scope, accountChart('Three', 'song-3'), null);
        await book.saveCollection(scope, collection('set-a', ['song-3', 'song-2', 'song-1']), null);
        const [listed] = await book.listCollections(scope);
        expect(listed.resolvedSongIds).toEqual(['song-3', 'song-1']);
        expect(listed.document.songIds).toEqual(['song-3', 'song-2', 'song-1']);
        // The read wrote nothing: no Save was queued beyond the collection's own create.
        expect(await book.pendingCollection(scope, 'set-a')).toHaveLength(1);
    });

    it('is owner-scoped, and signing out removes the collections with everything else', async () => {
        await book.saveCollection(scope, collection('set-a'), null);
        const other = (await book.switchAccount('owner-b'))!;
        expect(await book.listCollections(other)).toEqual([]);
        await book.switchAccount(null);
        await book.clearAccount(OWNER);
        const back = (await book.switchAccount(OWNER))!;
        expect(await book.listCollections(back)).toEqual([]);
        expect(await book.queued(back, 'set-a')).toEqual([]);
    });
});

describe('deleting a collection', () => {
    it('removes a never-confirmed collection with nothing in flight, and its queue', async () => {
        await book.saveCollection(scope, collection('set-a'), null);
        expect(await book.deleteCollection(scope, 'set-a')).toBe('removed');
        expect(await book.readCollection(scope, 'set-a')).toBeNull();
        expect(await book.queued(scope, 'set-a')).toEqual([]);
        expect(await book.deleteCollection(scope, 'set-a')).toBe('missing');
    });

    it('refuses a local removal once a Save of it may be at the server', async () => {
        await book.saveCollection(scope, collection('set-a'), null);
        await book.prepare(scope, 'set-a');
        expect(await book.deleteCollection(scope, 'set-a')).toBe('queued');
        expect(await book.readCollection(scope, 'set-a')).not.toBeNull();
    });

    it('sends a confirmed collection through the cloud delete, never a local one', async () => {
        await book.saveCollection(scope, collection('set-a', ['song-1']), null);
        await book.save(scope, accountChart('One', 'song-1'), null);
        await runOutboxPass(book, scope, cloud().transport);
        expect(await book.deleteCollection(scope, 'set-a')).toBe('cloud');

        const request = await book.prepareDelete(scope, 'set-a');
        if (typeof request === 'string') {
            throw new Error(`Expected a prepared delete, got ${request}`);
        }
        expect(request.expectedRevision).toBe('cloud-set-a-1');
        // A retry is the same frozen request.
        expect(await book.prepareDelete(scope, 'set-a')).toEqual(request);
        expect(await book.acknowledgeDelete(scope, request, deleted(request))).toBe('removed');
        expect(await book.readCollection(scope, 'set-a')).toBeNull();
        // Its songs are untouched (#1443 decision 3).
        expect(await book.read(scope, 'song-1')).not.toBeNull();
    });

    it('a delete acknowledged under a queued Save retains the collection', async () => {
        await book.saveCollection(scope, collection('set-a'), null);
        await runOutboxPass(book, scope, cloud().transport);
        const request = await book.prepareDelete(scope, 'set-a');
        if (typeof request === 'string') {
            throw new Error(`Expected a prepared delete, got ${request}`);
        }
        await book.saveCollection(scope, collection('set-a', ['song-1']), 0);
        expect(await book.acknowledgeDelete(scope, request, deleted(request))).toBe(
            'retained-deleted',
        );
        expect((await book.readCollection(scope, 'set-a'))?.document.songIds).toEqual(['song-1']);
    });
});

describe('a collection through the library download', () => {
    function manifestCloud(
        rows: Array<{ id: string; revision: string; document?: unknown; deleted?: boolean }>,
    ) {
        const downloads: string[] = [];
        return {
            downloads,
            transport: {
                async manifest() {
                    return {
                        kind: 'page' as const,
                        page: {
                            documents: rows.map((row) => ({
                                documentId: row.id,
                                revision: row.revision,
                                deleted: row.deleted === true,
                                bytes: 100,
                                ...(row.document && 'kind' in (row.document as object)
                                    ? { kind: (row.document as { kind: string }).kind }
                                    : {}),
                            })),
                            nextAfterDocumentId: null,
                        },
                    };
                },
                async download(documentId: string) {
                    downloads.push(documentId);
                    const row = rows.find((entry) => entry.id === documentId);
                    return {
                        kind: 'body' as const,
                        body: { documentId, revision: row!.revision, document: row!.document },
                    };
                },
            },
        };
    }

    function run(transport: ReturnType<typeof manifestCloud>['transport']) {
        return runLibraryDownload(book, scope, transport, {
            isActive: () => false,
            minimumIntervalMs: 0,
        });
    }

    it('adopts a new collection into its own store and counts only songs as documents', async () => {
        const remote = collection('set-a', ['song-1']);
        const server = manifestCloud([
            { id: 'set-a', revision: 'r1', document: remote },
            { id: 'song-1', revision: 'r1', document: accountChart('One', 'song-1') },
        ]);
        const result = await run(server.transport);
        expect(result.complete).toBe(true);
        expect(result.advanced).toEqual(expect.arrayContaining(['set-a', 'song-1']));
        expect(result.documents).toEqual({ required: 1, verified: 1 });
        expect(await book.readCollection(scope, 'set-a')).toEqual({
            ownerId: OWNER,
            documentId: 'set-a',
            document: remote,
            remoteRevision: 'r1',
        });
        expect(await book.read(scope, 'set-a')).toBeNull();
        // A second pass asks for nothing: both are mirrored at their revisions.
        server.downloads.length = 0;
        expect((await run(server.transport)).complete).toBe(true);
        expect(server.downloads).toEqual([]);
    });

    it('a tombstone removes a clean collection mirror', async () => {
        await book.saveCollection(scope, collection('set-a'), null);
        await runOutboxPass(book, scope, cloud().transport);
        const result = await run(
            manifestCloud([{ id: 'set-a', revision: 'cloud-set-a-1', deleted: true }]).transport,
        );
        expect(result.removed).toEqual(['set-a']);
        expect(await book.readCollection(scope, 'set-a')).toBeNull();
    });

    it('a tombstone under a queued Save retains it; the Save then meets it as a conflict', async () => {
        await book.saveCollection(scope, collection('set-a'), null);
        await runOutboxPass(book, scope, cloud().transport);
        await book.saveCollection(scope, collection('set-a', ['song-1']), 0);
        const result = await run(
            manifestCloud([{ id: 'set-a', revision: 'cloud-set-a-1', deleted: true }]).transport,
        );
        expect(result.retainedDeleted).toEqual(['set-a']);
        expect(await book.readCollection(scope, 'set-a')).not.toBeNull();
        await runOutboxPass(book, scope, cloud({ conflict: new Map([['set-a', null]]) }).transport);
        const [parked] = await book.pendingCollection(scope, 'set-a');
        expect(parked.status).toBe('conflict');
        expect(parked.remote).toBeNull();
    });

    it('never adopts a newer remote body over a queued Save', async () => {
        await book.saveCollection(scope, collection('set-a'), null);
        await runOutboxPass(book, scope, cloud().transport);
        await book.saveCollection(scope, collection('set-a', ['mine']), 0);
        const theirs = collection('set-a', ['theirs'], { revision: 3 });
        const result = await run(
            manifestCloud([{ id: 'set-a', revision: 'r-theirs', document: theirs }]).transport,
        );
        expect(result.superseded).toEqual(['set-a']);
        expect((await book.readCollection(scope, 'set-a'))?.document.songIds).toEqual(['mine']);
    });

    it('skips a row of a kind this build does not know, rather than failing the pass', async () => {
        const server = manifestCloud([
            { id: 'later', revision: 'r1', document: { kind: 'playlist-2030' } },
        ]);
        const result = await run(server.transport);
        expect(result.complete).toBe(true);
        expect(result.failures).toEqual([]);
        expect(server.downloads).toEqual([]);
    });
});

/** Every row of every store, serialized — the byte-level "before" of an upgrade. */
async function dump(
    database: string,
): Promise<{ version: number; stores: Record<string, string> }> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(database);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        const stores: Record<string, string> = {};
        for (const store of Array.from(db.objectStoreNames)) {
            stores[store] = await new Promise<string>((resolve, reject) => {
                const tx = db.transaction(store, 'readonly');
                const keys = tx.objectStore(store).getAllKeys();
                const values = tx.objectStore(store).getAll();
                tx.oncomplete = () =>
                    resolve(JSON.stringify({ keys: keys.result, values: values.result }));
                tx.onerror = () => reject(tx.error);
            });
        }
        return { version: db.version, stores };
    } finally {
        db.close();
    }
}

async function seedVersionOne(
    database: string,
    create: (db: IDBDatabase) => void,
    rows: Record<string, unknown[]>,
): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(database, 1);
        request.onupgradeneeded = () => create(request.result);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(Object.keys(rows), 'readwrite');
        for (const [store, values] of Object.entries(rows)) {
            for (const value of values) {
                tx.objectStore(store).put(value);
            }
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

describe('upgrades are additive: every existing row is byte-identical afterwards', () => {
    it('opens a version-1 account database full of songs at version 2', async () => {
        await book.close();
        connections.splice(0);
        await deleteDatabase(name);
        // The exact version-1 schema `AccountDatabase` created before #1474.
        const songs = Array.from({ length: 40 }, (_, index) => {
            const id = `song-${String(index).padStart(2, '0')}`;
            return {
                ownerId: OWNER,
                documentId: id,
                document: accountChart(`Song ${index}`, id),
                remoteRevision: index % 2 === 0 ? `r-${index}` : null,
            };
        });
        await seedVersionOne(
            name,
            (db) => {
                db.createObjectStore('songs', { keyPath: ['ownerId', 'documentId'] });
                db.createObjectStore('operations', {
                    keyPath: ['ownerId', 'operationId'],
                }).createIndex('song', ['ownerId', 'documentId']);
                db.createObjectStore('receipts', { keyPath: ['ownerId', 'operationId'] });
                db.createObjectStore('drafts', {
                    keyPath: ['ownerId', 'documentId', 'writerId'],
                }).createIndex('song', ['ownerId', 'documentId']);
                db.createObjectStore('meta', { keyPath: 'key' });
            },
            {
                songs,
                operations: [
                    {
                        ownerId: OWNER,
                        documentId: 'song-01',
                        operationId: 'op-1',
                        localRevision: 0,
                        snapshot: songs[1].document,
                        base: { revision: null },
                        wireBody: null,
                        status: 'queued',
                    },
                ],
                receipts: [
                    {
                        ownerId: OWNER,
                        documentId: 'song-00',
                        operationId: 'op-0',
                        digest: 'a'.repeat(64),
                        revision: 'r-0',
                    },
                ],
                drafts: [
                    {
                        ownerId: OWNER,
                        documentId: 'song-02',
                        writerId: 'writer-1',
                        document: songs[2].document,
                        baseRevision: 0,
                        capturedAt: '2026-09-09T13:00:00.000Z',
                    },
                ],
                meta: [
                    { key: 'active', ownerId: OWNER, generation: 3 },
                    { key: `star:${OWNER}:song-03`, ownerId: OWNER, documentId: 'song-03' },
                ],
            },
        );
        const before = await dump(name);
        expect(before.version).toBe(1);

        const upgraded = connection();
        const active = (await upgraded.currentScope())!;
        expect(active).toEqual({ ownerId: OWNER, generation: 3 });
        // The library reads exactly as it did, through the upgraded store.
        const page = await upgraded.list(active, { limit: 100 });
        expect(page.songs.map((song) => song.documentId)).toEqual(
            songs.map((song) => song.documentId),
        );
        expect(await upgraded.listCollections(active)).toEqual([]);
        await upgraded.close();

        const after = await dump(name);
        expect(after.version).toBe(ACCOUNT_DATABASE_VERSION);
        expect(Object.keys(after.stores).sort()).toEqual(
            [...Object.keys(before.stores), 'collections'].sort(),
        );
        for (const [store, rows] of Object.entries(before.stores)) {
            expect(after.stores[store], store).toBe(rows);
        }
        expect(after.stores.collections).toBe(JSON.stringify({ keys: [], values: [] }));
    });
});

describe('guest collections (#1474) live beside the songbook, never inside it', () => {
    const GUEST = 'ensemble-v2-preview';
    const GUEST_COLLECTIONS = 'ensemble-v2-preview-collections';

    afterAll(async () => {
        // The guest repository holds module-level connections that close on `versionchange`,
        // which a delete fires, so neither delete is blocked by them.
        await deleteDatabase(GUEST_COLLECTIONS);
        await deleteDatabase(GUEST);
    });

    it('saves, lists and deletes without upgrading or writing the songbook database', async () => {
        const songs = ['one', 'two', 'three'].map((id) => ({
            ...accountChart(`Guest ${id}`, id),
        }));
        await seedVersionOne(GUEST, (db) => db.createObjectStore('documents', { keyPath: 'id' }), {
            documents: songs,
        });
        const before = await dump(GUEST);

        const created = await saveGuestCollection(
            newCollection('Gig', ['three', 'gone', 'one']),
            null,
        );
        expect(created.revision).toBe(0);
        const [listed] = await listGuestCollections();
        expect(listed.document.songIds).toEqual(['three', 'gone', 'one']);
        expect(listed.resolvedSongIds).toEqual(['three', 'one']);

        const updated = await saveGuestCollection({ ...created, songIds: ['one'] }, 0);
        expect(updated.revision).toBe(1);
        await expect(saveGuestCollection({ ...created, name: 'Stale' }, 0)).rejects.toThrow(
            'saved in another tab',
        );
        expect((await getGuestCollection(created.id))?.songIds).toEqual(['one']);

        await deleteGuestCollection(created.id);
        expect(await getGuestCollection(created.id)).toBeNull();
        // Deleting a collection never deletes its songs, and the songbook still reads.
        expect((await listGuestSongs()).map((song) => song.id).sort()).toEqual([
            'one',
            'three',
            'two',
        ]);

        const after = await dump(GUEST);
        expect(after.version).toBe(1);
        expect(after.stores).toEqual(before.stores);
    });
});
