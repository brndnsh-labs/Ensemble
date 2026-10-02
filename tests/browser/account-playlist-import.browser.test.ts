import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountApi, ApiResult } from '../../prototypes/v2/lib/account/api.js';
import { createAccountSession } from '../../prototypes/v2/lib/account/session.js';
import { createSyncLoop } from '../../prototypes/v2/lib/account/sync-loop.js';
import {
    type CollectionDocument,
    mergeSongIds,
    newCollection,
} from '../../prototypes/v2/lib/collections.js';
import { runOutboxPass } from '../../prototypes/v2/lib/sync/drain.js';
import {
    ACCOUNT_DATABASE,
    type AccountScope,
    digest,
    type PreparedSave,
} from '../../prototypes/v2/lib/sync/protocol.js';
import {
    AccountSongbook,
    ImportCapError,
    MAX_REMOTE_CANDIDATES,
} from '../../prototypes/v2/lib/sync/repository.js';
import type { SaveTransport } from '../../prototypes/v2/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * A whole iReal playlist imported into an account (#1478), against real IndexedDB in both engines:
 *
 * - the import is ONE transaction: 1,350 queued song creates and the collection, or nothing;
 * - the outbox drains it pass by pass, and a database reopened mid-drain — with a Save the server
 *   committed but whose reply never arrived — uploads every song exactly once;
 * - the account cap is checked in that transaction: past it nothing at all is written;
 * - the loop bumps `libraryVersion` once for the import and once per pass, never per song.
 *
 * The transports are local fakes with the server's receipt rule (one operation id answers with
 * its first reply forever): they prove the client's composition, not a cloud integration.
 */

const OWNER = 'owner-playlist';
const SONGS = 1_350;
const names: string[] = [];
const connections: AccountSongbook[] = [];

function connection(name: string): AccountSongbook {
    const instance = new AccountSongbook(name);
    connections.push(instance);
    return instance;
}

function freshName(): string {
    const name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    names.push(name);
    return name;
}

let name: string;
let book: AccountSongbook;
let scope: AccountScope;

beforeEach(async () => {
    name = freshName();
    book = connection(name);
    scope = (await book.switchAccount(OWNER))!;
});

afterEach(async () => {
    await Promise.all(connections.splice(0).map((instance) => instance.close()));
    for (const stale of names.splice(0)) {
        await new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(stale);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
        });
    }
});

/** `count` songs as a playlist import would hand them over: fresh ids, in playlist order. */
function playlistSongs(count: number, prefix = 'tune') {
    return Array.from({ length: count }, (_, index) => {
        const id = `${prefix}-${String(index + 1).padStart(4, '0')}`;
        return accountChart(`${prefix} ${index + 1}`, id);
    });
}

/** `collectionWrite`'s rule (`lib/playlist-import.ts`): create, or append to what is stored. */
function into(documentId: string, name: string, songIds: string[]) {
    return {
        documentId,
        edit: (current: CollectionDocument | null) => {
            if (current) {
                const merged = mergeSongIds(current.songIds, songIds);
                return merged.length === current.songIds.length
                    ? null
                    : { ...current, songIds: merged };
            }
            return { ...newCollection(name, songIds), id: documentId };
        },
    };
}

/**
 * An account that commits every Save once: a create needs absence, an update the exact revision,
 * and an operation id answers with its FIRST reply forever (the server's receipts) — so a request
 * re-sent after its reply was lost replays rather than committing twice. `commits` counts the
 * real commits per document; `loseReplyAt` makes that call's reply never arrive (after the server
 * committed it), the way a closed tab or a dead network loses one.
 */
function receiptCloud(options: { loseReplyAt?: number } = {}) {
    const documents = new Map<string, { revision: string; document: unknown }>();
    const receipts = new Map<string, unknown>();
    const commits = new Map<string, number>();
    let calls = 0;
    let revisions = 0;
    const transport: SaveTransport = async (request: PreparedSave) => {
        calls += 1;
        const cached = receipts.get(request.operationId);
        if (cached) {
            return cached;
        }
        const body = JSON.parse(request.body) as {
            expectedRevision: string | null;
            document: unknown;
        };
        const envelope = {
            ownerId: request.ownerId,
            documentId: request.documentId,
            operationId: request.operationId,
            digest: request.digest,
        };
        const current = documents.get(request.documentId);
        let reply: unknown;
        if ((current?.revision ?? null) !== body.expectedRevision) {
            reply = {
                ...envelope,
                kind: 'conflict',
                revision: current?.revision ?? 'cloud-none',
                remote: current ?? null,
            };
        } else {
            revisions += 1;
            const revision = `cloud-${revisions}`;
            documents.set(request.documentId, { revision, document: body.document });
            commits.set(request.documentId, (commits.get(request.documentId) ?? 0) + 1);
            reply = { ...envelope, kind: 'committed', revision };
        }
        receipts.set(request.operationId, reply);
        if (calls === options.loseReplyAt) {
            throw new Error('The reply was lost.');
        }
        return reply;
    };
    return { transport, documents, commits, calls: () => calls };
}

/** Sweep the outbox to its end with `transport`, as `drain` does; how many Saves committed. */
async function sweep(
    songbook: AccountSongbook,
    active: AccountScope,
    transport: SaveTransport,
): Promise<{ committed: number; stopped: boolean }> {
    let committed = 0;
    let cursor: string | undefined;
    for (let page = 0; page < 200; page += 1) {
        const result = await runOutboxPass(songbook, active, transport, {
            ...(cursor === undefined ? {} : { afterDocumentId: cursor }),
        });
        committed += result.counts.committed;
        if (result.kind === 'retry' || result.kind === 'aborted') {
            return { committed, stopped: true };
        }
        if (result.kind === 'complete' || result.resumeAfterDocumentId === null) {
            return { committed, stopped: false };
        }
        cursor = result.resumeAfterDocumentId;
    }
    throw new Error('The sweep did not end.');
}

describe('a whole-playlist import into an account (#1478)', () => {
    it('queues 1,350 songs and the collection in one transaction, in playlist order', async () => {
        const songs = playlistSongs(SONGS);
        const ids = songs.map((song) => song.id);
        const result = await book.importPlaylist(scope, songs, into('playlist', 'Jazz 1350', ids));
        expect(result.songs).toBe(SONGS);
        expect(result.collection?.document.songIds).toEqual(ids);
        expect(await book.documentCount(scope)).toBe(SONGS + 1);
        expect(await book.songsWaiting(scope)).toBe(SONGS);
        expect(await book.collectionOutbox(scope)).toEqual({ unsent: 1, refused: 0 });
        // Every song is a create: one queued Save each, chained on no revision.
        const [first] = await book.pending(scope, ids[0]);
        expect(first.base).toEqual({ revision: null });
        expect(first.localRevision).toBe(0);
        const [collection] = await book.listCollections(scope);
        expect(collection.document.name).toBe('Jazz 1350');
        expect(collection.resolvedSongIds).toEqual(ids);
    }, 120_000);

    it('drains every Save across a database reopened mid-drain, each song uploaded exactly once', async () => {
        const songs = playlistSongs(SONGS);
        const ids = songs.map((song) => song.id);
        await book.importPlaylist(scope, songs, into('playlist', 'Jazz 1350', ids));

        // The first drain stops at a Save the server committed but whose reply was lost.
        const cloud = receiptCloud({ loseReplyAt: 700 });
        const first = await sweep(book, scope, cloud.transport);
        expect(first).toEqual({ committed: 699, stopped: true });
        expect(cloud.documents.size).toBe(700);

        // The tab closes; a new page opens the same database and drains the rest.
        await book.close();
        const reopened = connection(name);
        const again = (await reopened.currentScope())!;
        expect(again.ownerId).toBe(OWNER);
        // The collection's id sorts first, so the 699 commits were it and 698 songs; the song whose
        // reply was lost is still waiting, its request frozen.
        expect(await reopened.songsWaiting(again)).toBe(SONGS - 698);
        const second = await sweep(reopened, again, cloud.transport);
        expect(second.stopped).toBe(false);
        // The lost reply's Save is replayed by its receipt, not committed a second time.
        expect(second.committed).toBe(SONGS + 1 - 699);
        expect(cloud.documents.size).toBe(SONGS + 1);
        expect([...cloud.commits.values()].every((count) => count === 1)).toBe(true);

        // Nothing is left waiting, every song mirrors its cloud revision, and the collection in
        // the account lists every song in playlist order.
        expect(await reopened.songsWaiting(again)).toBe(0);
        expect(await reopened.collectionOutbox(again)).toEqual({ unsent: 0, refused: 0 });
        expect(await reopened.documentCount(again)).toBe(SONGS + 1);
        const library = await reopened.list(again, { limit: 100 });
        expect(library.songs.every((song) => song.remoteRevision !== null)).toBe(true);
        const uploaded = cloud.documents.get('playlist')!.document as CollectionDocument;
        expect(uploaded.songIds).toEqual(ids);
    }, 300_000);

    it('bumps libraryVersion once for the import and once per pass, never per song', async () => {
        const cloud = receiptCloud();
        const api = {
            async get<T>(path: string): Promise<ApiResult<T>> {
                if (path.startsWith('/api/auth/session')) {
                    return { ok: true, status: 200, value: { accountId: OWNER } as T };
                }
                if (path.startsWith('/api/documents?')) {
                    const documents = [...cloud.documents.entries()]
                        .sort(([a], [b]) => (a < b ? -1 : 1))
                        .map(([documentId, { revision, document }]) => ({
                            documentId,
                            revision,
                            deleted: false,
                            bytes: JSON.stringify(document).length,
                            ...((document as { kind?: string }).kind === 'collection'
                                ? { kind: 'collection' }
                                : {}),
                        }));
                    return {
                        ok: true,
                        status: 200,
                        value: { documents, nextAfterDocumentId: null } as T,
                    };
                }
                throw new Error(`Unexpected GET ${path}`);
            },
            async post<T>(path: string, body: string): Promise<ApiResult<T>> {
                const request = JSON.parse(body);
                const value = await cloud.transport({
                    ownerId: request.ownerId,
                    documentId: request.documentId,
                    operationId: request.operationId,
                    digest: await digest(body),
                    body,
                } as PreparedSave);
                if (path !== '/api/documents/save') {
                    throw new Error(`Unexpected POST ${path}`);
                }
                return { ok: true, status: 200, value: value as T };
            },
        } as AccountApi;
        const loop = createSyncLoop(api, createAccountSession(api), book);
        await loop.attach(OWNER);
        const before = loop.getSnapshot();
        const songs = playlistSongs(200);
        const ids = songs.map((song) => song.id);
        await loop.importPlaylist(songs, into('playlist', 'Two hundred', ids), OWNER);
        const imported = loop.getSnapshot();
        expect(imported.libraryVersion).toBe(before.libraryVersion + 1);
        expect(imported.collectionsVersion).toBe(before.collectionsVersion + 1);
        expect(imported.songsWaiting).toBe(200);
        expect(imported.collectionSaves).toBe(1);

        await loop.run();
        const drained = loop.getSnapshot();
        // One pass sent all 201 Saves: one more song re-read, not 200.
        expect(drained.libraryVersion).toBe(imported.libraryVersion + 1);
        expect(drained.songsWaiting).toBe(0);
        expect(drained.collectionSaves).toBe(0);
        expect(cloud.documents.size).toBe(201);
    }, 120_000);
});

describe('the account cap, checked as the import writes (#1478)', () => {
    it('refuses an import past the cap and writes nothing; one that fits exactly lands', async () => {
        // An account with 10 documents of room: 1,989 songs and one collection.
        const held = playlistSongs(MAX_REMOTE_CANDIDATES - 11, 'held');
        await book.importPlaylist(
            scope,
            held,
            into(
                'held-collection',
                'Held',
                held.slice(0, 3).map((song) => song.id),
            ),
        );
        expect(await book.documentCount(scope)).toBe(MAX_REMOTE_CANDIDATES - 10);
        const waiting = await book.songsWaiting(scope);

        // Ten songs plus a new collection is eleven documents: one too many.
        const over = playlistSongs(10, 'over');
        const refusal = book.importPlaylist(
            scope,
            over,
            into(
                'over-collection',
                'Over',
                over.map((song) => song.id),
            ),
        );
        await expect(refusal).rejects.toBeInstanceOf(ImportCapError);
        await expect(refusal).rejects.toThrow(/up to 2,000 songs and collections.*has 1,990/);
        expect(await book.documentCount(scope)).toBe(MAX_REMOTE_CANDIDATES - 10);
        expect(await book.songsWaiting(scope)).toBe(waiting);
        expect(await book.read(scope, over[0].id)).toBeNull();
        expect(await book.readCollection(scope, 'over-collection')).toBeNull();

        // Ten songs ADDED to the existing collection need no new document: exactly the room.
        await book.importPlaylist(
            scope,
            over,
            into(
                'held-collection',
                'Held',
                over.map((song) => song.id),
            ),
        );
        expect(await book.documentCount(scope)).toBe(MAX_REMOTE_CANDIDATES);
        const extended = await book.readCollection(scope, 'held-collection');
        expect(extended?.document.songIds).toEqual([
            ...held.slice(0, 3).map((song) => song.id),
            ...over.map((song) => song.id),
        ]);
        // The extension is one more queued Save of the same collection, chained on the first.
        expect(await book.pendingCollection(scope, 'held-collection')).toHaveLength(2);
    }, 120_000);

    it('never overwrites a song it already holds: the whole import is refused', async () => {
        await book.save(scope, accountChart('Mine', 'tune-0002'), null);
        const songs = playlistSongs(3);
        await expect(
            book.importPlaylist(
                scope,
                songs,
                into(
                    'playlist',
                    'Three',
                    songs.map((song) => song.id),
                ),
            ),
        ).rejects.toThrow();
        expect((await book.read(scope, 'tune-0002'))?.document.title).toBe('Mine');
        expect(await book.read(scope, 'tune-0001')).toBeNull();
        expect(await book.readCollection(scope, 'playlist')).toBeNull();
        expect(await book.songsWaiting(scope)).toBe(1);
    });
});
