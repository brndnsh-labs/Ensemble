import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newCollection } from '../../prototypes/v2/lib/collections.js';
import { runLibraryDownload } from '../../prototypes/v2/lib/sync/download.js';
import { OUTBOX_PAGE_LIMIT, runOutboxPass } from '../../prototypes/v2/lib/sync/drain.js';
import {
    ACCOUNT_DATABASE,
    type AccountScope,
    candidateKey,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import type { SaveTransport } from '../../prototypes/v2/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * A text chart (schema 1) left in the account mirror after #1740 retired the format. It decoded
 * until then, so every place that read one must now step over it rather than throw: a throw in
 * the list read stops every outbox pass and every download for good (#1769's wedge). Real
 * IndexedDB in both engines, because the cursor and the transactions are the point.
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

/** The same chart as an older build stored it, in the retired format. */
function textChart(id: string, title = 'Old') {
    const { chart, ...envelope } = accountChart(title, id);
    return {
        ...envelope,
        schemaVersion: 1,
        chart: {
            arrangement: {
                sections: [{ id: 'a', label: 'A', value: 'C7 | F7', repeat: 1 }],
                key: 'C',
                timeSignature: '4/4',
                grouping: null,
                isMinor: false,
                notation: 'name',
            },
            performance: chart.performance,
            band: chart.band,
        },
    };
}

/** A direct connection, for rows the repository's own API no longer writes. */
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

function storedSong(documentId: string): Promise<unknown> {
    return raw(
        (db) =>
            new Promise((resolve, reject) => {
                // Settled on the transaction, not the request: WebKit holds the connection open
                // until it completes, and `afterEach`'s delete would find it still there.
                const tx = db.transaction('songs', 'readonly');
                const request = tx.objectStore('songs').get([OWNER, documentId]);
                tx.oncomplete = () => resolve(request.result);
                tx.onerror = () => reject(tx.error);
            }),
    );
}

/** A text-chart song row as an older build left it: confirmed by the server, nothing queued. */
function putTextChartSong(documentId: string): Promise<void> {
    return put('songs', {
        ownerId: OWNER,
        documentId,
        document: textChart(documentId),
        remoteRevision: 'r-old',
    });
}

/** A cloud that commits every Save it is handed and records which ids it saw. */
function committing(): { transport: SaveTransport; ids: string[] } {
    const ids: string[] = [];
    return {
        ids,
        transport: async (request) => {
            ids.push(request.documentId);
            return {
                ownerId: request.ownerId,
                documentId: request.documentId,
                operationId: request.operationId,
                digest: request.digest,
                kind: 'committed',
                revision: 'r1',
            };
        },
    };
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

describe('a text chart left in the account mirror (#1740)', () => {
    it('is stepped over by the library read, and the cursor still moves past it', async () => {
        await book.save(scope, accountChart('B', 'song-b'), null);
        await putTextChartSong('song-a');
        await putTextChartSong('song-c');
        // A page of one, so a page can be wholly a text chart: it hands back no song but still
        // names where the next page starts.
        const first = await book.list(scope, { limit: 1 });
        expect(first).toEqual({ songs: [], nextAfterDocumentId: 'song-a' });
        const second = await book.list(scope, { limit: 1, afterDocumentId: 'song-a' });
        expect(second.songs.map((song) => song.documentId)).toEqual(['song-b']);
        expect(second.nextAfterDocumentId).toBe('song-b');
        const all = await book.list(scope, { limit: 100 });
        expect(all.songs.map((song) => song.documentId)).toEqual(['song-b']);
        // Untouched.
        expect(await storedSong('song-a')).toMatchObject({ document: textChart('song-a') });
    });

    it('does not stop an outbox pass: every other song still uploads', async () => {
        // Text charts on both sides of a queued song, and more than one page of documents, so
        // the pass has to walk past them across pages. A collection sorting after every song
        // shares the page: a songs page that listed fewer songs than it read must not let the
        // merge jump to it past songs no page has read yet.
        await book.saveCollection(scope, { ...newCollection('Set'), id: 'zz-set' }, null);
        await putTextChartSong('song-000');
        for (let index = 1; index <= OUTBOX_PAGE_LIMIT + 2; index += 1) {
            const id = `song-${String(index).padStart(3, '0')}`;
            if (index % 5 === 0) {
                await putTextChartSong(id);
            } else {
                await book.save(scope, accountChart(id, id), null);
            }
        }
        const cloud = committing();
        let cursor: string | undefined;
        for (let pass = 0; pass < 5; pass += 1) {
            const result = await runOutboxPass(book, scope, cloud.transport, {
                ...(cursor === undefined ? {} : { afterDocumentId: cursor }),
            });
            if (result.kind === 'complete') {
                break;
            }
            expect(result.kind).toBe('more');
            cursor = result.resumeAfterDocumentId ?? undefined;
        }
        const expected = Array.from({ length: OUTBOX_PAGE_LIMIT + 2 }, (_, i) => i + 1)
            .filter((index) => index % 5 !== 0)
            .map((index) => `song-${String(index).padStart(3, '0')}`);
        expect(cloud.ids).toEqual([...expected, 'zz-set']);
    });

    it('does not stop a download: the rest is adopted, and the row is never written over', async () => {
        await putTextChartSong('song-a');
        const clean = { ...accountChart('Clean', 'song-a'), revision: 4 };
        const other = { ...accountChart('Other', 'song-b'), revision: 0 };
        const docs = new Map<string, { revision: string; document: unknown }>([
            ['song-a', { revision: 'r-new', document: clean }],
            ['song-b', { revision: 'r1', document: other }],
            // A text chart the server still holds is refused like any body it cannot read.
            ['song-c', { revision: 'r1', document: textChart('song-c') }],
        ]);
        const result = await runLibraryDownload(
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
                                bytes: JSON.stringify(entry.document).length,
                            })),
                            nextAfterDocumentId: null,
                        },
                    };
                },
                async download(documentId) {
                    const entry = docs.get(documentId)!;
                    return {
                        kind: 'body',
                        body: { documentId, revision: entry.revision, document: entry.document },
                    };
                },
            },
            { isActive: () => false, minimumIntervalMs: 0 } as Parameters<
                typeof runLibraryDownload
            >[3],
        );
        expect(result.advanced).toEqual(['song-b']);
        expect(result.failures).toEqual([
            expect.objectContaining({ documentId: 'song-c', reason: 'malformed-body' }),
        ]);
        expect((await book.read(scope, 'song-b'))?.document.title).toBe('Other');
        // The only copy of whatever the old row holds here stays exactly as it was.
        expect(await storedSong('song-a')).toMatchObject({
            document: textChart('song-a'),
            remoteRevision: 'r-old',
        });
        expect(await storedSong('song-c')).toBeUndefined();
    });

    it('is handed back, as stored, for a sign-out or deletion export', async () => {
        await book.save(scope, accountChart('B', 'song-b'), null);
        await putTextChartSong('song-a');
        await put('songs', { ownerId: OWNER, documentId: 'song-z', document: { title: 42 } });
        expect(await book.unreadableSongs(scope)).toEqual([
            { documentId: 'song-a', raw: JSON.stringify(textChart('song-a')) },
            { documentId: 'song-z', raw: JSON.stringify({ title: 42 }) },
        ]);
    });

    it('as a stored candidate or a draft, is left out rather than failing the read', async () => {
        await book.save(scope, accountChart('B', 'song-b'), null);
        await put('meta', {
            key: candidateKey(OWNER, 'song-b'),
            ownerId: OWNER,
            kind: 'version',
            documentId: 'song-b',
            revision: 'r9',
            document: textChart('song-b'),
        });
        expect(await book.remoteCandidates(scope)).toEqual([]);
        await put('drafts', {
            ownerId: OWNER,
            documentId: 'song-b',
            writerId: 'writer-old',
            document: textChart('song-b'),
            baseRevision: 0,
            capturedAt: new Date().toISOString(),
        });
        expect(await book.drafts(scope, 'song-b')).toEqual([]);
    });
});
