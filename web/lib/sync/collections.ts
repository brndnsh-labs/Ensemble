import {
    assertBuiltInKept,
    BuiltInCollectionError,
    isCollectionCandidate,
    mergeSongIds,
    resolvedSongIds,
} from '../collections';
import type { AccountDatabase, Transaction } from './database';
import {
    type AccountScope,
    type ChartDocument,
    type CollectionDocument,
    collectionSnapshot,
    deletionKey,
    identifier,
    LocalRevisionError,
    localRevision,
    MAX_PENDING_SAVES,
    remoteRevision,
    type SavedCollection,
    type SavedSong,
    type SaveOperation,
    type SyncDocument,
    snapshot,
} from './protocol';
import { copyScope, savedCollection } from './records';
import type {
    CollectionDeletion,
    CollectionListing,
    CollectionOutcome,
    CollectionPage,
    ListOptions,
    ReconcileOptions,
    ReconcileOutcome,
} from './repository';
import {
    DEFAULT_LIST_LIMIT,
    MAX_LIST_LIMIT,
    MAX_REMOTE_CANDIDATES,
    queueOf,
    readableRecord,
    storedCollection,
    unreadableRow,
} from './repository-internal';

/**
 * `commitDeleted`'s collection half (#1474), shared by the same two callers: a downloaded tombstone
 * (`reconcileCollection`) and this device's own acknowledged delete (`acknowledgeDelete`). Simpler
 * than a chart's because a collection has no drafts and is never "on the stand": the only local
 * work that can exist for it is a queued Save — and no candidate row is written for a held one,
 * because that Save is already the record of the divergence. Sent, it meets the tombstone as a
 * `'gone'` conflict (`acknowledge`), which is where the musician is told.
 */
export function commitCollectionDeleted(
    tx: Pick<Transaction<never>, 'table'>,
    scope: AccountScope,
    documentId: string,
    collection: SavedCollection | null,
    held: boolean,
    expected: string | null | undefined,
): ReconcileOutcome {
    if (!collection) {
        return 'unchanged';
    }
    if (held || collection.remoteRevision === null || collection.remoteRevision !== expected) {
        return 'retained-deleted';
    }
    tx.table('collections').delete([scope.ownerId, documentId]);
    tx.table('meta').delete(deletionKey(scope.ownerId, documentId));
    return 'removed';
}

/**
 * The write half of `saveCollection`, inside its transaction: `save`'s queue rules for a chart,
 * restated for a collection's record. A refused head (#1298) retires with everything chained
 * behind it; otherwise the new operation chains onto the newest queued one, or onto the record's
 * confirmed remote revision when nothing is queued.
 */
function enqueueCollection(
    tx: Pick<Transaction<never>, 'table'>,
    scope: AccountScope,
    document: CollectionDocument,
    previous: SavedCollection | null,
    expected: number | null,
    operationId: string,
    queue: SaveOperation<CollectionDocument>[],
): SavedCollection {
    const refusedHead = queue[0]?.status === 'refused' ? queue[0] : null;
    const retired = refusedHead ? queue : [];
    const active = refusedHead ? [] : queue;
    if (active.length >= MAX_PENDING_SAVES) {
        throw new Error('Too many pending Saves for this collection. Sync before saving again.');
    }
    const now = new Date().toISOString();
    const saved = collectionSnapshot({
        ...document,
        revision: expected === null ? 0 : expected + 1,
        createdAt: previous?.document.createdAt ?? now,
        updatedAt: now,
    });
    const record: SavedCollection = {
        ownerId: scope.ownerId,
        documentId: saved.id,
        document: saved,
        remoteRevision: previous?.remoteRevision ?? null,
    };
    const predecessor = active.at(-1);
    for (const stale of retired) {
        tx.table('operations').delete([scope.ownerId, stale.operationId]);
    }
    tx.table('collections').put(record);
    tx.table('operations').add({
        ownerId: scope.ownerId,
        documentId: saved.id,
        operationId,
        localRevision: saved.revision,
        snapshot: saved,
        base: predecessor
            ? { operationId: predecessor.operationId }
            : { revision: record.remoteRevision },
        wireBody: null,
        status: 'queued',
    } satisfies SaveOperation<CollectionDocument>);
    return record;
}

/**
 * One fresh queued Save for a collection record already written in the caller's transaction —
 * `enqueueCollection`'s operation half, for `mergeCollectionConflicts`, which has just retired the
 * id's whole queue and so names its base directly: the remote revision it merged onto, or null for
 * a create under a fresh id. The operation id is minted here, as every other Save's is.
 */
function queueCollectionSave(
    tx: Pick<Transaction<never>, 'table'>,
    scope: AccountScope,
    document: CollectionDocument,
    base: { revision: string | null },
): void {
    if (base.revision !== null) {
        remoteRevision(base.revision);
    }
    tx.table('operations').add({
        ownerId: scope.ownerId,
        documentId: document.id,
        operationId: crypto.randomUUID(),
        localRevision: document.revision,
        snapshot: document,
        base,
        wireBody: null,
        status: 'queued',
    } satisfies SaveOperation<CollectionDocument>);
}

/**
 * Every queued Save of this owner's COLLECTIONS, read inside the caller's transaction (#1478): the
 * collection ids from the `collections` store's keys, then each id's own queue through the
 * operations index — never the whole outbox. After a whole-playlist import the outbox can hold over
 * a thousand queued SONG Saves, and the readers of this (the chip's count after every observation,
 * the conflict merge after every sweep) want a handful of collection rows. A queued collection
 * Save always has its record (`enqueueCollection` writes both), so reading by record loses none.
 * The rows are concatenated in collection-id order, each id's in index order.
 */
function collectionOperations<T>(
    tx: Transaction<T>,
    scope: AccountScope,
    consume: (rows: SaveOperation<SyncDocument>[]) => void,
) {
    const owned = IDBKeyRange.bound([scope.ownerId], [scope.ownerId, []], false, true);
    tx.read(tx.table('collections').getAllKeys(owned), (keys: IDBValidKey[]) => {
        const queues: SaveOperation<SyncDocument>[][] = new Array(keys.length);
        let pending = keys.length;
        if (pending === 0) {
            return consume([]);
        }
        keys.forEach((key, index) => {
            const documentId = (key as [string, string])[1];
            tx.read(
                tx.table('operations').index('song').getAll([scope.ownerId, documentId]),
                (rows: SaveOperation<SyncDocument>[]) => {
                    queues[index] = rows.filter(
                        (row) => row && isCollectionCandidate(row.snapshot),
                    );
                    pending -= 1;
                    if (pending === 0) {
                        consume(queues.flat());
                    }
                },
            );
        });
    });
}

/** How many documents of either kind this owner holds here, read inside the caller's transaction. */
function documentCount<T>(
    tx: Transaction<T>,
    scope: AccountScope,
    consume: (count: number, collections: number) => void,
) {
    const owned = IDBKeyRange.bound([scope.ownerId], [scope.ownerId, []], false, true);
    tx.read(tx.table('songs').count(owned), (songs: number) => {
        tx.read(tx.table('collections').count(owned), (collections: number) =>
            consume(songs + collections, collections),
        );
    });
}

/**
 * How many documents an import may assume the ACCOUNT holds (#1478 review R1, C4): what this
 * device holds, or — when the caller knows what the account's manifest lists — its live charts plus
 * the larger of its live collections and this device's, whichever total is larger. This device's
 * rows alone undercount an account another device filled; the manifest alone misses what is still
 * queued here. A create past the server's cap ends every outbox pass.
 */
export function heldByAccount(
    local: number,
    localCollections: number,
    remote?: { charts: number; collections: number },
): number {
    return remote === undefined
        ? local
        : Math.max(local, remote.charts + Math.max(localCollections, remote.collections));
}

/**
 * A collection create refused on this device because the account is already at its document cap
 * (#1477). Its sentence is the one a song Save at the cap is answered with (`SYNC_MESSAGES.quota`'s
 * remedy), minus "Saved on this device" — nothing was.
 */
export class CollectionCapError extends Error {
    constructor() {
        super(
            `Your account library is full (${MAX_REMOTE_CANDIDATES} songs and collections). Delete a song in the cloud to make room.`,
        );
    }
}

/**
 * The account cap check a whole-playlist import makes (#1478): null when `documents` more fit
 * beside the `held` documents this device knows the account holds, else the sentence that refuses
 * the import — stating the cap and the usage, because the import writes nothing rather than half a
 * playlist. The count is what this device holds (songs and collections, the server's own unit), so
 * it can miss documents another device added; the server stays the authority, and refuses a Save
 * past its cap on upload. A guest songbook has no cap and never asks.
 */
export function capRefusal(
    documents: number,
    held: number,
    cap = MAX_REMOTE_CANDIDATES,
): string | null {
    if (held + documents <= cap) {
        return null;
    }
    const format = (value: number) => value.toLocaleString('en-US');
    const room = Math.max(0, cap - held);
    return `Your account can hold ${format(cap)} songs and collections, and this device counts ${format(held)} in it. This import adds ${format(documents)}, ${format(held + documents - cap)} more than fit${room > 0 ? ` (there is room for ${format(room)})` : ''}. Nothing has been imported.`;
}

/**
 * A whole-playlist import refused on this device because the account has no room for it (#1478):
 * the import writes nothing rather than half a playlist. Its sentence is `capRefusal`'s;
 * `documents` and `held` are the numbers it was decided on.
 */
export class ImportCapError extends Error {
    readonly documents: number;
    readonly held: number;

    constructor(documents: number, held: number) {
        super(capRefusal(documents, held) ?? 'Your account library is full.');
        this.documents = documents;
        this.held = held;
    }
}

/** `AccountSongbook.pendingCollection`: see the delegate for the contract. */
export async function pendingCollectionIn(
    database: AccountDatabase,
    scope: AccountScope,
    documentId: string,
): Promise<SaveOperation<CollectionDocument>[]> {
    scope = copyScope(scope);
    identifier(documentId);
    return database.run('readonly', scope, (tx) =>
        queueOf(tx, scope, documentId, collectionSnapshot, tx.finish),
    );
}

/** `AccountSongbook.readCollection`: see the delegate for the contract. */
export async function readCollectionIn(
    database: AccountDatabase,
    scope: AccountScope,
    documentId: string,
): Promise<SavedCollection | null> {
    scope = copyScope(scope);
    identifier(documentId);
    return database.run('readonly', scope, (tx) => {
        tx.read(
            tx.table('collections').get([scope.ownerId, documentId]),
            (row: SavedCollection | undefined) =>
                tx.finish(storedCollection(row, scope, documentId)),
        );
    });
}

/** `AccountSongbook.collectionPage`: see the delegate for the contract. */
export async function collectionPageIn(
    database: AccountDatabase,
    scope: AccountScope,
    options: ListOptions = {},
): Promise<CollectionPage> {
    scope = copyScope(scope);
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('Invalid list options.');
    }
    const { afterDocumentId, limit = DEFAULT_LIST_LIMIT } = options;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
        throw new Error(`List limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`);
    }
    if (afterDocumentId !== undefined) {
        identifier(afterDocumentId);
    }
    return database.run('readonly', scope, (tx) => {
        // The same owner-tight bounds `list` pages songs with; see it for why.
        const range = IDBKeyRange.bound(
            afterDocumentId === undefined ? [scope.ownerId] : [scope.ownerId, afterDocumentId],
            [scope.ownerId, []],
            afterDocumentId !== undefined,
            true,
        );
        tx.read(tx.table('collections').getAll(range, limit + 1), (rows: SavedCollection[]) => {
            // `list`'s rule (#1769): a row that will not read is stepped over and named in
            // `unreadable`, never a reason to fail the page.
            const page = rows.slice(0, limit).map((row) => {
                identifier(row?.documentId);
                return readableRecord(() => savedCollection(row, scope, row.documentId));
            });
            tx.finish({
                collections: page.filter((record) => record !== 'unreadable'),
                nextAfterDocumentId: rows.length > limit ? rows[limit - 1].documentId : null,
                unreadable: rows
                    .slice(0, limit)
                    .filter((_, index) => page[index] === 'unreadable')
                    .map(unreadableRow),
            });
        });
    });
}

/** `AccountSongbook.listCollections`: see the delegate for the contract. */
export async function listCollectionsIn(
    database: AccountDatabase,
    scope: AccountScope,
): Promise<CollectionListing[]> {
    scope = copyScope(scope);
    const owned = IDBKeyRange.bound([scope.ownerId], [scope.ownerId, []], false, true);
    return database.run('readonly', scope, (tx) => {
        tx.read(tx.table('songs').getAllKeys(owned), (keys: IDBValidKey[]) => {
            const songs = new Set(keys.map((key) => (key as [string, string])[1]));
            tx.read(
                tx.table('collections').getAll(owned, MAX_REMOTE_CANDIDATES + 1),
                (rows: SavedCollection[]) => {
                    if (rows.length > MAX_REMOTE_CANDIDATES) {
                        throw new Error('Account collections exceed the supported limit.');
                    }
                    tx.finish(
                        rows.map((row) => {
                            identifier(row?.documentId);
                            const saved = savedCollection(row, scope, row.documentId);
                            return {
                                ...saved,
                                resolvedSongIds: resolvedSongIds(saved.document, (id) =>
                                    songs.has(id),
                                ),
                            };
                        }),
                    );
                },
            );
        });
    });
}

/** `AccountSongbook.saveCollection`: see the delegate for the contract. */
export async function saveCollectionIn(
    database: AccountDatabase,
    scope: AccountScope,
    candidate: unknown,
    expected: number | null,
): Promise<SavedCollection> {
    scope = copyScope(scope);
    const document = collectionSnapshot(candidate);
    localRevision(expected);
    // Always fresh, never caller-supplied — `save` says why.
    const operationId = crypto.randomUUID();
    return database.run('readwrite', scope, (tx) => {
        tx.read(
            tx.table('songs').getKey([scope.ownerId, document.id]),
            (song: IDBValidKey | undefined) => {
                if (song !== undefined) {
                    throw new Error('This id already belongs to a song.');
                }
                tx.read(
                    tx.table('collections').get([scope.ownerId, document.id]),
                    (row: SavedCollection | undefined) => {
                        const previous = storedCollection(row, scope, document.id);
                        if (
                            expected === null ? previous : previous?.document.revision !== expected
                        ) {
                            throw new LocalRevisionError();
                        }
                        // A built-in stays built in, under its own name (#1477 review R2).
                        assertBuiltInKept(previous?.document ?? null, document);
                        queueOf(tx, scope, document.id, collectionSnapshot, (queue) => {
                            tx.finish(
                                enqueueCollection(
                                    tx,
                                    scope,
                                    document,
                                    previous,
                                    expected,
                                    operationId,
                                    queue,
                                ),
                            );
                        });
                    },
                );
            },
        );
    });
}

/** `AccountSongbook.deleteCollection`: see the delegate for the contract. */
export async function deleteCollectionIn(
    database: AccountDatabase,
    scope: AccountScope,
    documentId: string,
    /**
     * `dryRun`: answer what a delete WOULD do and write nothing (#1477 review R4) — what a
     * delete that first removes songs asks, so a collection that turns out to be still
     * uploading stops the whole thing before a single song is gone.
     */
    options: { dryRun?: boolean } = {},
): Promise<CollectionDeletion> {
    scope = copyScope(scope);
    identifier(documentId);
    const dryRun = options.dryRun === true;
    return database.run(dryRun ? 'readonly' : 'readwrite', scope, (tx) => {
        tx.read(
            tx.table('collections').get([scope.ownerId, documentId]),
            (row: SavedCollection | undefined) => {
                const collection = storedCollection(row, scope, documentId);
                if (!collection) {
                    return tx.finish('missing');
                }
                if (collection.document.builtIn) {
                    // Refused by storage, not only by the UI (#1477 review R2): a tombstone on
                    // Starred's fixed id would split it across devices.
                    throw new BuiltInCollectionError('deleted');
                }
                queueOf(tx, scope, documentId, collectionSnapshot, (queue) => {
                    if (collection.remoteRevision !== null) {
                        // A confirmed collection with a Save still queued is `'queued'`, not
                        // `'cloud'` (#1477 review P2-1): deleted in the cloud now, the record
                        // would be RETAINED for that Save, which would then meet the tombstone
                        // as a `remote: null` conflict — and `mergeCollectionConflicts` moves
                        // such a list to a fresh id, re-creating the collection the musician
                        // just deleted on every device. The outbox settles the Save first.
                        return tx.finish(queue.length > 0 ? 'queued' : 'cloud');
                    }
                    if (queue.some((operation) => operation.wireBody !== null)) {
                        return tx.finish('queued');
                    }
                    if (dryRun) {
                        return tx.finish('removed');
                    }
                    for (const operation of queue) {
                        tx.table('operations').delete([scope.ownerId, operation.operationId]);
                    }
                    tx.table('collections').delete([scope.ownerId, documentId]);
                    tx.finish('removed');
                });
            },
        );
    });
}

/** `AccountSongbook.editCollection`: see the delegate for the contract. */
export async function editCollectionIn(
    database: AccountDatabase,
    scope: AccountScope,
    documentId: string,
    edit: (current: CollectionDocument | null) => CollectionDocument | null,
): Promise<SavedCollection | null> {
    scope = copyScope(scope);
    identifier(documentId);
    const operationId = crypto.randomUUID();
    return database.run('readwrite', scope, (tx) => {
        tx.read(
            tx.table('songs').getKey([scope.ownerId, documentId]),
            (song: IDBValidKey | undefined) => {
                if (song !== undefined) {
                    throw new Error('This id already belongs to a song.');
                }
                tx.read(
                    tx.table('collections').get([scope.ownerId, documentId]),
                    (row: SavedCollection | undefined) => {
                        const previous = storedCollection(row, scope, documentId);
                        const proposed = edit(previous?.document ?? null);
                        if (proposed === null) {
                            return tx.finish(null);
                        }
                        const document = collectionSnapshot(proposed);
                        if (document.id !== documentId) {
                            throw new Error('A collection edit cannot change its id.');
                        }
                        assertBuiltInKept(previous?.document ?? null, document);
                        const enqueue = () =>
                            queueOf(tx, scope, documentId, collectionSnapshot, (queue) => {
                                tx.finish(
                                    enqueueCollection(
                                        tx,
                                        scope,
                                        document,
                                        previous,
                                        previous?.document.revision ?? null,
                                        operationId,
                                        queue,
                                    ),
                                );
                            });
                        if (previous) {
                            return enqueue();
                        }
                        documentCount(tx, scope, (count) => {
                            if (count >= MAX_REMOTE_CANDIDATES) {
                                throw new CollectionCapError();
                            }
                            enqueue();
                        });
                    },
                );
            },
        );
    });
}

/** `AccountSongbook.documentCount`: see the delegate for the contract. */
export async function documentCountIn(
    database: AccountDatabase,
    scope: AccountScope,
): Promise<number> {
    scope = copyScope(scope);
    return database.run('readonly', scope, (tx) => {
        documentCount(tx, scope, (count) => tx.finish(count));
    });
}

/** `AccountSongbook.documentCounts`: see the delegate for the contract. */
export async function documentCountsIn(
    database: AccountDatabase,
    scope: AccountScope,
): Promise<{ documents: number; collections: number }> {
    scope = copyScope(scope);
    return database.run('readonly', scope, (tx) => {
        documentCount(tx, scope, (documents, collections) => tx.finish({ documents, collections }));
    });
}

/** `AccountSongbook.importPlaylist`: see the delegate for the contract. */
export async function importPlaylistIn(
    database: AccountDatabase,
    scope: AccountScope,
    candidates: readonly unknown[],
    collection: {
        documentId: string;
        edit: (current: CollectionDocument | null) => CollectionDocument | null;
    },
    options: {
        pace?: { shouldYield: () => boolean; yieldNow: () => Promise<void> };
        /**
         * The live charts and collections the account's manifest listed at this device's
         * latest settled download (#1478 review R1, C4). The cap is counted against
         * `heldByAccount`, never this device's rows alone. The sync loop supplies it, and
         * refuses before this when the library is not settled at all.
         */
        remote?: { charts: number; collections: number };
    } = {},
): Promise<{ songs: number; collection: SavedCollection | null }> {
    const { pace, remote } = options;
    scope = copyScope(scope);
    identifier(collection.documentId);
    const songs: ChartDocument[] = [];
    for (const candidate of candidates) {
        songs.push(snapshot(candidate));
        if (pace?.shouldYield()) {
            await pace.yieldNow();
        }
    }
    const ids = new Set(songs.map((song) => song.id));
    if (ids.size !== songs.length || ids.has(collection.documentId)) {
        throw new Error('An import cannot use one id twice.');
    }
    // Always fresh, never caller-supplied — `save` says why.
    const operationIds = songs.map(() => crypto.randomUUID());
    const collectionOperationId = crypto.randomUUID();
    return database.run('readwrite', scope, (tx) => {
        documentCount(tx, scope, (local, collections) => {
            const held = heldByAccount(local, collections, remote);
            tx.read(
                tx.table('songs').getKey([scope.ownerId, collection.documentId]),
                (song: IDBValidKey | undefined) => {
                    if (song !== undefined) {
                        throw new Error('This id already belongs to a song.');
                    }
                },
            );
            tx.read(
                tx.table('collections').get([scope.ownerId, collection.documentId]),
                (row: SavedCollection | undefined) => {
                    const previous = storedCollection(row, scope, collection.documentId);
                    const needed = songs.length + (previous ? 0 : 1);
                    if (held + needed > MAX_REMOTE_CANDIDATES) {
                        throw new ImportCapError(needed, held);
                    }
                    const now = new Date().toISOString();
                    for (const [index, candidate] of songs.entries()) {
                        const key = [scope.ownerId, candidate.id];
                        tx.read(
                            tx.table('collections').getKey(key),
                            (taken: IDBValidKey | undefined) => {
                                if (taken !== undefined) {
                                    throw new Error('This id already belongs to a collection.');
                                }
                            },
                        );
                        // Validated above, before the transaction; a create's own revision
                        // and stamps cannot make a valid document invalid.
                        const saved: ChartDocument = {
                            ...candidate,
                            revision: 0,
                            createdAt: now,
                            updatedAt: now,
                        };
                        // `add`, never `put`: a song this owner already holds refuses the
                        // whole import (a ConstraintError aborts the transaction).
                        tx.table('songs').add({
                            ownerId: scope.ownerId,
                            documentId: saved.id,
                            document: saved,
                            remoteRevision: null,
                        } satisfies SavedSong);
                        tx.table('operations').add({
                            ownerId: scope.ownerId,
                            documentId: saved.id,
                            operationId: operationIds[index],
                            localRevision: 0,
                            snapshot: saved,
                            base: { revision: null },
                            wireBody: null,
                            status: 'queued',
                        } satisfies SaveOperation);
                    }
                    const proposed = collection.edit(previous?.document ?? null);
                    if (proposed === null) {
                        return tx.finish({ songs: songs.length, collection: null });
                    }
                    const document = collectionSnapshot(proposed);
                    if (document.id !== collection.documentId) {
                        throw new Error('A collection edit cannot change its id.');
                    }
                    assertBuiltInKept(previous?.document ?? null, document);
                    queueOf(tx, scope, document.id, collectionSnapshot, (queue) => {
                        tx.finish({
                            songs: songs.length,
                            collection: enqueueCollection(
                                tx,
                                scope,
                                document,
                                previous,
                                previous?.document.revision ?? null,
                                collectionOperationId,
                                queue,
                            ),
                        });
                    });
                },
            );
        });
    });
}

/** `AccountSongbook.mergeCollectionConflicts`: see the delegate for the contract. */
export async function mergeCollectionConflictsIn(
    database: AccountDatabase,
    scope: AccountScope,
): Promise<number> {
    scope = copyScope(scope);
    const owned = IDBKeyRange.bound([scope.ownerId], [scope.ownerId, []], false, true);
    return database.run('readwrite', scope, (tx) => {
        // The collections' own queues only (#1478 review R3): this runs after every outbox
        // sweep, and the whole outbox can be a playlist import's thousand queued songs.
        collectionOperations(tx, scope, (rows) => {
            const ids = [
                ...new Set(
                    rows
                        .filter(
                            (row) =>
                                row?.status === 'conflict' && isCollectionCandidate(row.snapshot),
                        )
                        .map((row) => row.documentId),
                ),
            ];
            let merged = 0;
            let pending = ids.length;
            if (pending === 0) {
                return tx.finish(0);
            }
            const settled = () => {
                pending -= 1;
                if (pending === 0) {
                    tx.finish(merged);
                }
            };
            /** Every id this sweep resolves, and the Starreds already merged INTO (C1). */
            const conflicted = new Set(ids);
            const mergedInto = new Set<string>();
            const mergeEach = (starred: Map<string, SavedCollection>) => {
                for (const documentId of ids) {
                    identifier(documentId);
                    tx.read(
                        tx.table('collections').get([scope.ownerId, documentId]),
                        (row: SavedCollection | undefined) => {
                            const record = storedCollection(row, scope, documentId);
                            queueOf(tx, scope, documentId, collectionSnapshot, (queue) => {
                                const head = queue[0];
                                if (!record || head?.status !== 'conflict') {
                                    return settled();
                                }
                                const remote = head.remote;
                                const gone = !(remote && isCollectionCandidate(remote.document));
                                // A gone Starred merges INTO another Starred — but only one
                                // this transaction leaves alone (#1477 review C1). A target
                                // that is itself conflicted in this sweep has its queue
                                // retired and its record rewritten below; chaining onto it
                                // from a snapshot read earlier would chain onto a retired
                                // Save, a `base` no receipt will ever resolve, and wedge the
                                // outbox for good. So that merge waits, untouched, for the
                                // next sweep — which the target's own merge here guarantees
                                // (`merged > 0`) — and reads both afresh then. One merge INTO
                                // a target per transaction, for the same reason.
                                const siblings =
                                    gone && record.document.builtIn === 'starred'
                                        ? [...starred.values()].filter(
                                              (entry) => entry.documentId !== documentId,
                                          )
                                        : [];
                                const into = siblings.find(
                                    (entry) =>
                                        !conflicted.has(entry.documentId) &&
                                        !mergedInto.has(entry.documentId),
                                );
                                if (siblings.length > 0 && !into) {
                                    return settled();
                                }
                                for (const operation of queue) {
                                    tx.table('operations').delete([
                                        scope.ownerId,
                                        operation.operationId,
                                    ]);
                                }
                                const now = new Date().toISOString();
                                if (!gone && remote) {
                                    const theirs = collectionSnapshot(remote.document);
                                    const document = collectionSnapshot({
                                        ...record.document,
                                        songIds: mergeSongIds(
                                            record.document.songIds,
                                            theirs.songIds,
                                        ),
                                        revision: record.document.revision + 1,
                                        updatedAt: now,
                                    });
                                    tx.table('collections').put({
                                        ...record,
                                        document,
                                        remoteRevision: remote.revision,
                                    } satisfies SavedCollection);
                                    queueCollectionSave(tx, scope, document, {
                                        revision: remote.revision,
                                    });
                                    if (starred.has(documentId)) {
                                        starred.set(documentId, {
                                            ...record,
                                            document,
                                            remoteRevision: remote.revision,
                                        });
                                    }
                                } else if (into) {
                                    // The account has no Starred at this id, but this device
                                    // holds another one: its stars go THERE, one Save, and this
                                    // record leaves — never a second Starred beside the first.
                                    mergedInto.add(into.documentId);
                                    tx.table('collections').delete([scope.ownerId, documentId]);
                                    tx.table('meta').delete(deletionKey(scope.ownerId, documentId));
                                    starred.delete(documentId);
                                    queueOf(
                                        tx,
                                        scope,
                                        into.documentId,
                                        collectionSnapshot,
                                        (siblingQueue) => {
                                            const saved = enqueueCollection(
                                                tx,
                                                scope,
                                                collectionSnapshot({
                                                    ...into.document,
                                                    songIds: mergeSongIds(
                                                        into.document.songIds,
                                                        record.document.songIds,
                                                    ),
                                                }),
                                                into,
                                                into.document.revision,
                                                crypto.randomUUID(),
                                                siblingQueue,
                                            );
                                            starred.set(into.documentId, saved);
                                            merged += 1;
                                            settled();
                                        },
                                    );
                                    return;
                                } else {
                                    const fresh = collectionSnapshot({
                                        ...record.document,
                                        id: crypto.randomUUID(),
                                        revision: 0,
                                        createdAt: now,
                                        updatedAt: now,
                                    });
                                    tx.table('collections').delete([scope.ownerId, documentId]);
                                    tx.table('meta').delete(deletionKey(scope.ownerId, documentId));
                                    tx.table('collections').put({
                                        ownerId: scope.ownerId,
                                        documentId: fresh.id,
                                        document: fresh,
                                        remoteRevision: null,
                                    } satisfies SavedCollection);
                                    queueCollectionSave(tx, scope, fresh, { revision: null });
                                    if (starred.has(documentId)) {
                                        starred.delete(documentId);
                                        starred.set(fresh.id, {
                                            ownerId: scope.ownerId,
                                            documentId: fresh.id,
                                            document: fresh,
                                            remoteRevision: null,
                                        });
                                    }
                                }
                                merged += 1;
                                settled();
                            });
                        },
                    );
                }
            };
            tx.read(
                tx.table('collections').getAll(owned, MAX_REMOTE_CANDIDATES + 1),
                (all: SavedCollection[]) => {
                    // Every built-in Starred this owner holds here, kept current as this
                    // transaction writes: a `'gone'` Starred merges INTO another rather than
                    // minting a sibling (#1477 review R2). One unreadable row is skipped here —
                    // it is the per-id read below that decides each merge.
                    const starred = new Map<string, SavedCollection>();
                    for (const row of all) {
                        try {
                            const saved = savedCollection(row, scope, row.documentId);
                            if (saved.document.builtIn === 'starred') {
                                starred.set(saved.documentId, saved);
                            }
                        } catch {
                            // Not a Starred this merge can build on.
                        }
                    }
                    mergeEach(starred);
                },
            );
        });
    });
}

/** `AccountSongbook.collectionOutbox`: see the delegate for the contract. */
export async function collectionOutboxIn(
    database: AccountDatabase,
    scope: AccountScope,
): Promise<{ unsent: number; refused: number }> {
    scope = copyScope(scope);
    return database.run('readonly', scope, (tx) => {
        // Only the collections' own queues are read (#1478): this runs on every observation.
        collectionOperations(tx, scope, (rows) => {
            const queues = new Map<string, SaveOperation<SyncDocument>[]>();
            for (const row of rows) {
                queues.set(row.documentId, [...(queues.get(row.documentId) ?? []), row]);
            }
            let unsent = 0;
            let refused = 0;
            for (const queue of queues.values()) {
                unsent += queue.length;
                const head = [...queue].sort((a, b) => a.localRevision - b.localRevision)[0];
                if (head?.status === 'refused') {
                    refused += queue.length;
                }
            }
            tx.finish({ unsent, refused });
        });
    });
}

/** `AccountSongbook.songsWaiting`: see the delegate for the contract. */
export async function songsWaitingIn(
    database: AccountDatabase,
    scope: AccountScope,
): Promise<number> {
    scope = copyScope(scope);
    const owned = IDBKeyRange.bound([scope.ownerId], [scope.ownerId, []], false, true);
    return database.run('readonly', scope, (tx) => {
        tx.read(tx.table('collections').getAllKeys(owned), (keys: IDBValidKey[]) => {
            const collections = new Set(keys.map((key) => (key as [string, string])[1]));
            let songs = 0;
            let last: string | null = null;
            tx.read(
                tx.table('operations').index('song').openKeyCursor(owned),
                (cursor: IDBCursor | null) => {
                    if (!cursor) {
                        return tx.finish(songs);
                    }
                    // The index sorts by (owner, document), so one document's queue is a run.
                    const documentId = (cursor.key as [string, string])[1];
                    if (documentId !== last) {
                        last = documentId;
                        if (!collections.has(documentId)) {
                            songs += 1;
                        }
                    }
                    cursor.continue();
                },
            );
        });
    });
}

/** `AccountSongbook.reconcileCollection`: see the delegate for the contract. */
export async function reconcileCollectionIn(
    database: AccountDatabase,
    scope: AccountScope,
    outcome: CollectionOutcome,
    options: Pick<ReconcileOptions, 'expectedRemoteRevision'> = {},
): Promise<ReconcileOutcome> {
    scope = copyScope(scope);
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('Invalid reconcile options.');
    }
    const expected = options.expectedRemoteRevision;
    if (expected !== undefined && expected !== null) {
        remoteRevision(expected);
    }
    // Validated and rebuilt before the transaction opens, as `remoteOutcome` does for a chart.
    if (!outcome || typeof outcome !== 'object') {
        throw new Error('Invalid remote observation.');
    }
    identifier(outcome.documentId);
    remoteRevision(outcome.revision);
    const documentId = outcome.documentId;
    const revision = outcome.revision;
    let document: CollectionDocument | null = null;
    if (outcome.kind === 'version') {
        document = collectionSnapshot(outcome.document);
        if (document.id !== documentId) {
            throw new Error('Remote version identity does not match its document.');
        }
    } else if (outcome.kind !== 'deleted') {
        throw new Error('Unknown remote observation kind.');
    }
    return database.run('readwrite', scope, (tx) => {
        // The mirror of `reconcile`'s check (#1474 review R1): an id this device holds as a
        // SONG is not a collection's to write, so nothing is written beside it.
        let heldAsSong = false;
        tx.read(
            tx.table('songs').getKey([scope.ownerId, documentId]),
            (song: IDBValidKey | undefined) => {
                heldAsSong = song !== undefined;
            },
        );
        tx.read(
            tx.table('collections').get([scope.ownerId, documentId]),
            (row: SavedCollection | undefined) => {
                if (heldAsSong) {
                    return tx.finish(document === null ? 'unchanged' : 'superseded');
                }
                const record = row
                    ? readableRecord(() => savedCollection(row, scope, documentId))
                    : null;
                // A queue this build cannot read is still a queue (#1769): it holds the record
                // as a readable one does, rather than failing the pass.
                const decided = (queued: number) => {
                    const held = queued > 0;
                    if (record === 'unreadable') {
                        // A collection row this build cannot read (#1769): `collectionPage`
                        // names it, and the plan asks for the account's copy only while the
                        // row is confirmed. The account's version replaces it when the
                        // account confirmed the row and nothing is queued — the row then
                        // holds nothing the account lacks; otherwise nothing is written. A
                        // tombstone writes nothing either (`'unchanged'`): nothing here can
                        // tell what the row holds, and a collection has no candidate store.
                        if (document === null) {
                            return tx.finish('unchanged');
                        }
                        if (
                            held ||
                            typeof (row as { remoteRevision?: unknown }).remoteRevision !== 'string'
                        ) {
                            return tx.finish('superseded');
                        }
                        tx.table('collections').put({
                            ownerId: scope.ownerId,
                            documentId,
                            document,
                            remoteRevision: revision,
                        } satisfies SavedCollection);
                        return tx.finish('advanced');
                    }
                    const collection = record;
                    if (document === null) {
                        return tx.finish(
                            commitCollectionDeleted(
                                tx,
                                scope,
                                documentId,
                                collection,
                                held,
                                expected,
                            ),
                        );
                    }
                    if (collection && collection.remoteRevision === revision) {
                        return tx.finish('unchanged');
                    }
                    if (
                        (collection ? collection.remoteRevision : undefined) !== expected ||
                        held ||
                        collection?.remoteRevision === null
                    ) {
                        // The record moved under the plan (a Save acknowledged, or a local
                        // removal), or local work holds it. Either way this body is not this
                        // device's to write; see the method comment.
                        return tx.finish('superseded');
                    }
                    tx.table('collections').put({
                        ownerId: scope.ownerId,
                        documentId,
                        document,
                        remoteRevision: revision,
                    } satisfies SavedCollection);
                    tx.finish('advanced');
                };
                queueOf(
                    tx,
                    scope,
                    documentId,
                    collectionSnapshot,
                    (queue) => decided(queue.length),
                    (ops) => decided(ops.length),
                );
            },
        );
    });
}
