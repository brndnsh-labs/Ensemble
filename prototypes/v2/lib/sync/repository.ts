import { AccountDatabase, type Transaction } from './database';
import {
    type AccountScope,
    candidateKey,
    candidatePrefix,
    type Draft,
    deleteBody,
    deleteReply,
    deletionKey,
    digest,
    identifier,
    LocalRevisionError,
    localRevision,
    MAX_PENDING_SAVES,
    type PendingDeletion,
    type PreparedDelete,
    type PreparedSave,
    type RemoteCandidate,
    type RemoteOutcome,
    remoteRevision,
    reply,
    type SavedSong,
    type SaveOperation,
    type SaveReceipt,
    snapshot,
} from './protocol';
import {
    copyScope,
    remoteOutcome,
    savedCandidate,
    savedDeletion,
    savedDraft,
    savedOperation,
    savedSong,
} from './records';

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;
/** The server's per-owner document cap: more candidates than that is a broken store. */
export const MAX_REMOTE_CANDIDATES = 2_000;

export interface ListOptions {
    /** Exclusive cursor: the last document ID of the previous page. */
    afterDocumentId?: string;
    limit?: number;
}

export interface SongPage {
    songs: SavedSong[];
    /** Null at end of list. Never a promise that the next page sees the same library. */
    nextAfterDocumentId: string | null;
}

/** What `reconcile` did. One term per preservation rule, so a caller never has to infer it. */
export type ReconcileOutcome =
    | 'advanced'
    | 'candidate'
    | 'unchanged'
    | 'removed'
    | 'retained-deleted'
    | 'unsupported';

export interface ReconcileOptions {
    /**
     * True when this document is the chart on the stand right now. The caller owns that fact —
     * storage must never reach into UI state to guess which song is playing — and must answer it
     * as this call is made, not from a list captured when its plan was drawn.
     */
    active?: boolean;
    /**
     * The `remoteRevision` the caller's plan was computed against: `undefined` for "there was no
     * saved record", `null` for "a record the cloud had never confirmed", a string for a
     * confirmed one. This is a compare-and-swap base, and it is the ONLY thing that can catch the
     * one dangerous interleaving the re-reads below cannot — a Save queued AND acknowledged while
     * the remote body was in flight, which leaves a record that is clean, unheld, and NEWER than
     * the observation about to be written over it. When it does not match, the record moved under
     * the plan and the observation is preserved as a candidate instead of applied.
     *
     * Omitting it therefore ASSERTS that no saved record existed. That default fails closed — it
     * can only turn an adoption into a preserved candidate, never the reverse — so a caller that
     * holds a record must pass its revision or it will simply be told the record moved.
     */
    expectedRemoteRevision?: string | null;
}

/**
 * The whole commit rule for "the cloud no longer has this document", shared by the two callers that
 * can learn it (#1270): a library download reading an explicit tombstone row, and this device's own
 * acknowledged delete. It is one rule because it answers one question — may this device drop its
 * copy? — and a second spelling of it would be the exact place the two paths silently disagreed.
 *
 * Writes through `tx` and returns the outcome; the CALLER owns `tx.finish`, because the download
 * path reaches this from inside a larger decision and the delete path does not.
 */
function commitDeleted(
    // Only the store handles: typed as the one method it uses so a `Transaction<T>` of any result
    // type can be passed without a cast, and so this can never reach for `finish` by accident.
    tx: Pick<Transaction<never>, 'table'>,
    scope: AccountScope,
    documentId: string,
    candidate: () => RemoteCandidate,
    song: SavedSong | null,
    held: boolean,
    expected: string | null | undefined,
): ReconcileOutcome {
    const key = candidateKey(scope.ownerId, documentId);
    if (held || song?.remoteRevision === null) {
        // Local work exists only here: a draft, a queued Save, or the chart on the stand. It stays,
        // and the candidate is the flag that explains why the cloud copy is gone.
        tx.table('meta').put(candidate());
        return 'retained-deleted';
    }
    if (song && song.remoteRevision !== expected) {
        // The record moved under the plan that asked for this removal. Removing it would delete a
        // revision nobody ever diffed — so it stays, flagged like any other divergence.
        tx.table('meta').put(candidate());
        return 'retained-deleted';
    }
    if (!song) {
        // Nothing was ever mirrored here, so there is nothing to remove and nothing to explain.
        // Any candidate left from an earlier pass is stale.
        tx.table('meta').delete(key);
        return 'unchanged';
    }
    // A clean mirror of a document the cloud no longer has. Receipts stay: they are the idempotency
    // record of Saves already acknowledged, and this document has no queued Save left that could
    // resurrect the cloud ID.
    //
    // The frozen delete goes too, and it is the download path that needs this: a tombstone arriving
    // while this device held a prepared delete of its own would otherwise leave a permanent
    // `delete:` row. `prepareDelete` is the only other thing that clears one, and it cannot run for
    // a song that is no longer in the library. The delete path has already forgotten its own row in
    // this same transaction, so there it is a no-op.
    tx.table('songs').delete([scope.ownerId, documentId]);
    tx.table('meta').delete(key);
    tx.table('meta').delete(deletionKey(scope.ownerId, documentId));
    return 'removed';
}

function operations<T>(
    tx: Transaction<T>,
    scope: AccountScope,
    id: string,
    consume: (ops: SaveOperation[]) => void,
) {
    tx.read(
        tx
            .table('operations')
            .index('song')
            .getAll([scope.ownerId, id], MAX_PENDING_SAVES + 1),
        (ops: SaveOperation[]) => {
            if (ops.length > MAX_PENDING_SAVES) {
                throw new Error('Account queue exceeds the supported limit.');
            }
            consume(
                ops
                    .map((op) => savedOperation(op, scope, id))
                    .sort((a, b) => a.localRevision - b.localRevision),
            );
        },
    );
}

/** Isolated foundation, not connected to guest UI or an authenticated transport yet. */
export class AccountSongbook {
    private readonly database: AccountDatabase;

    constructor(name?: string) {
        this.database = new AccountDatabase(name);
    }

    close(): Promise<void> {
        return this.database.close();
    }

    /** Explicit host account transition. Does not authenticate, migrate, or delete anything. */
    async switchAccount(ownerId: string | null): Promise<AccountScope | null> {
        if (ownerId !== null) {
            identifier(ownerId);
        }
        return this.database.run('readwrite', null, (tx) => {
            tx.read(tx.table('meta').get('active'), (previous) => {
                const previousGeneration: unknown =
                    previous === undefined ? 0 : previous.generation;
                localRevision(previousGeneration);
                if (previousGeneration === null) {
                    throw new Error('Invalid account generation.');
                }
                const generation = previousGeneration + 1;
                localRevision(generation);
                tx.table('meta').put({ key: 'active', ownerId, generation });
                tx.finish(ownerId === null ? null : { ownerId, generation });
            });
        });
    }

    async currentScope(): Promise<AccountScope | null> {
        return this.database.run('readonly', null, (tx) => {
            tx.read(tx.table('meta').get('active'), (active) => {
                if (!active?.ownerId) {
                    return tx.finish(null);
                }
                identifier(active.ownerId);
                localRevision(active.generation);
                if (active.generation === null) {
                    throw new Error('Invalid account generation.');
                }
                tx.finish({ ownerId: active.ownerId, generation: active.generation });
            });
        });
    }

    async read(scope: AccountScope, documentId: string): Promise<SavedSong | null> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readonly', scope, (tx) => {
            tx.read(
                tx.table('songs').get([scope.ownerId, documentId]),
                (song: SavedSong | undefined) => {
                    tx.finish(song ? savedSong(song, scope, documentId) : null);
                },
            );
        });
    }

    async pending(scope: AccountScope, documentId: string): Promise<SaveOperation[]> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readonly', scope, (tx) =>
            operations(tx, scope, documentId, tx.finish),
        );
    }

    /**
     * One bounded page of this owner's saved songs, ordered by document ID.
     *
     * The cursor is a local pagination token and never an authorization: the owner fence in
     * `AccountDatabase.run` still decides what this call may see, and the key range below is
     * bounded to the captured owner so another account's records cannot enter the window at
     * all — not even to be filtered out afterwards.
     *
     * A page is transactional. Separate pages are not a historical snapshot: a library that
     * changes between calls is reflected by the later call, which is why the cursor is a
     * document ID rather than an offset.
     */
    async list(scope: AccountScope, options: ListOptions = {}): Promise<SongPage> {
        scope = copyScope(scope);
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('Invalid list options.');
        }
        // Captured synchronously: a caller mutating its options object while IDB awaits
        // cannot retarget the page that is already in flight.
        const { afterDocumentId, limit = DEFAULT_LIST_LIMIT } = options;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
            throw new Error(`List limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`);
        }
        if (afterDocumentId !== undefined) {
            identifier(afterDocumentId);
        }
        return this.database.run('readonly', scope, (tx) => {
            // An array sorts after every string in IndexedDB key order, so [ownerId, []] is a
            // tight upper bound: it stops at this owner's last document and cannot reach the
            // next owner's records. The lower bound is exclusive only when resuming, which is
            // what makes the cursor exclusive without tracking offsets.
            const range = IDBKeyRange.bound(
                afterDocumentId === undefined ? [scope.ownerId] : [scope.ownerId, afterDocumentId],
                [scope.ownerId, []],
                afterDocumentId !== undefined,
                true,
            );
            // limit + 1 detects a further page without a second query and without reading
            // the whole library. getAll yields ascending key order, so the page is stable.
            tx.read(tx.table('songs').getAll(range, limit + 1), (rows: SavedSong[]) => {
                // The whole fetched window is validated, not only the records handed back: a
                // malformed or future-version record must fail the page explicitly rather
                // than be silently skipped or reduced to a partial success.
                const validated = rows.map((row) => {
                    identifier(row?.documentId);
                    return savedSong(row, scope, row.documentId);
                });
                const songs = validated.slice(0, limit);
                tx.finish({
                    songs,
                    nextAfterDocumentId:
                        validated.length > limit ? songs[songs.length - 1].documentId : null,
                });
            });
        });
    }

    async save(
        scope: AccountScope,
        candidate: unknown,
        expected: number | null,
    ): Promise<SavedSong> {
        scope = copyScope(scope);
        const document = snapshot(candidate);
        localRevision(expected);
        const operationId = crypto.randomUUID();
        return this.database.run('readwrite', scope, (tx) => {
            tx.read(
                tx.table('songs').get([scope.ownerId, document.id]),
                (previous: SavedSong | undefined) => {
                    if (previous) {
                        previous = savedSong(previous, scope, document.id);
                    }
                    if (expected === null ? previous : previous?.document.revision !== expected) {
                        throw new LocalRevisionError();
                    }
                    operations(tx, scope, document.id, (queue) => {
                        if (queue.length >= MAX_PENDING_SAVES) {
                            throw new Error(
                                'Too many pending Saves for this song. Sync or export before saving again.',
                            );
                        }
                        const now = new Date().toISOString();
                        const saved = snapshot({
                            ...document,
                            revision: expected === null ? 0 : expected + 1,
                            createdAt: previous?.document.createdAt ?? now,
                            updatedAt: now,
                        });
                        const song: SavedSong = {
                            ownerId: scope.ownerId,
                            documentId: saved.id,
                            document: saved,
                            remoteRevision: previous?.remoteRevision ?? null,
                        };
                        const predecessor = queue.at(-1);
                        const operation: SaveOperation = {
                            ownerId: scope.ownerId,
                            documentId: saved.id,
                            operationId,
                            localRevision: saved.revision,
                            snapshot: saved,
                            base: predecessor
                                ? { operationId: predecessor.operationId }
                                : { revision: song.remoteRevision },
                            wireBody: null,
                            status: 'queued',
                        };
                        tx.table('songs').put(song);
                        tx.table('operations').add(operation);
                        tx.finish(song);
                    });
                },
            );
        });
    }

    async recover(
        scope: AccountScope,
        writerId: string,
        candidate: unknown,
        baseRevision: number | null,
    ): Promise<void> {
        scope = copyScope(scope);
        identifier(writerId);
        localRevision(baseRevision);
        const document = snapshot(candidate);
        return this.database.run('readwrite', scope, (tx) => {
            const draft: Draft = {
                ownerId: scope.ownerId,
                documentId: document.id,
                writerId,
                document,
                baseRevision,
                capturedAt: new Date().toISOString(),
            };
            tx.table('drafts').put(draft);
            tx.finish(undefined);
        });
    }

    async drafts(scope: AccountScope, documentId: string): Promise<Draft[]> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readonly', scope, (tx) => {
            tx.read(
                tx.table('drafts').index('song').getAll([scope.ownerId, documentId]),
                (drafts: Draft[]) => {
                    tx.finish(drafts.map((draft) => savedDraft(draft, scope, documentId)));
                },
            );
        });
    }

    async prepare(
        scope: AccountScope,
        documentId: string,
    ): Promise<PreparedSave | 'idle' | 'conflict'> {
        scope = copyScope(scope);
        identifier(documentId);
        const operation = await this.database.run<SaveOperation | 'idle' | 'conflict'>(
            'readwrite',
            scope,
            (tx) => {
                operations(tx, scope, documentId, (queue) => {
                    const head = queue[0];
                    if (!head) {
                        return tx.finish('idle');
                    }
                    if (head.status === 'conflict') {
                        return tx.finish('conflict');
                    }
                    if (head.wireBody !== null) {
                        return tx.finish(head);
                    }
                    const freeze = (revision: string | null) => {
                        if (revision !== null) {
                            remoteRevision(revision);
                        }
                        head.wireBody = JSON.stringify({
                            protocolVersion: 1,
                            ownerId: scope.ownerId,
                            documentId,
                            operationId: head.operationId,
                            expectedRevision: revision,
                            document: snapshot(head.snapshot),
                        });
                        tx.table('operations').put(head);
                        tx.finish(head);
                    };
                    if ('revision' in head.base) {
                        return freeze(head.base.revision);
                    }
                    tx.read(
                        tx.table('receipts').get([scope.ownerId, head.base.operationId]),
                        (receipt: SaveReceipt | undefined) => {
                            if (!receipt || receipt.documentId !== documentId) {
                                throw new Error('The preceding Save has no confirmed receipt.');
                            }
                            freeze(receipt.revision);
                        },
                    );
                });
            },
        );
        if (typeof operation === 'string') {
            return operation;
        }
        const body = operation.wireBody!;
        const hash = await digest(body);
        // Crypto runs outside IDB. Recheck the fence before publishing a prepared request.
        await this.database.run('readonly', scope, (tx) => tx.finish(undefined));
        return {
            ownerId: scope.ownerId,
            documentId,
            operationId: operation.operationId,
            body,
            digest: hash,
        };
    }

    async acknowledge(
        scope: AccountScope,
        request: PreparedSave,
        candidate: unknown,
    ): Promise<'committed' | 'conflict'> {
        scope = copyScope(scope);
        request = { ...request };
        if (request.ownerId !== scope.ownerId || (await digest(request.body)) !== request.digest) {
            throw new Error('Invalid prepared Save.');
        }
        const response = reply(candidate, request);
        return this.database.run('readwrite', scope, (tx) => {
            tx.read(
                tx.table('operations').get([scope.ownerId, request.operationId]),
                (operation: SaveOperation | undefined) => {
                    if (!operation) {
                        tx.read(
                            tx.table('receipts').get([scope.ownerId, request.operationId]),
                            (receipt: SaveReceipt | undefined) => {
                                if (
                                    response.kind !== 'committed' ||
                                    !receipt ||
                                    receipt.digest !== request.digest ||
                                    receipt.revision !== response.revision ||
                                    receipt.documentId !== request.documentId
                                ) {
                                    throw new Error('No matching committed Save receipt.');
                                }
                                tx.finish('committed');
                            },
                        );
                        return;
                    }
                    operation = savedOperation(operation, scope, request.documentId);
                    if (
                        operation.wireBody !== request.body ||
                        operation.documentId !== request.documentId
                    ) {
                        throw new Error('Save acknowledgement does not match stored bytes.');
                    }
                    if (operation.status === 'conflict') {
                        if (response.kind !== 'conflict') {
                            throw new Error('This Save needs conflict resolution.');
                        }
                        return tx.finish('conflict');
                    }
                    if (response.kind === 'conflict') {
                        operation.status = 'conflict';
                        operation.remote = response.remote;
                        tx.table('operations').put(operation);
                        return tx.finish('conflict');
                    }
                    tx.read(
                        tx.table('songs').get([scope.ownerId, request.documentId]),
                        (song: SavedSong | undefined) => {
                            if (!song) {
                                throw new Error(
                                    'Saved song missing; acknowledgement was not applied.',
                                );
                            }
                            song = savedSong(song, scope, request.documentId);
                            // Do not replace song.document: it may already hold a newer local Save.
                            tx.table('songs').put({ ...song, remoteRevision: response.revision });
                            tx.table('receipts').add({
                                ownerId: scope.ownerId,
                                documentId: request.documentId,
                                operationId: request.operationId,
                                digest: request.digest,
                                revision: response.revision,
                            } satisfies SaveReceipt);
                            tx.table('operations').delete([scope.ownerId, request.operationId]);
                            tx.finish('committed');
                        },
                    );
                },
            );
        });
    }

    /**
     * Freeze an explicit cloud deletion for this document and hand back the bytes to send (#1270).
     *
     * The operation id is minted ONCE and stored before anything leaves this device, so a lost
     * response — the tab closed, the network died after the server committed — retries the identical
     * request and the server answers it from its receipt instead of deleting a second time. An
     * existing frozen record is therefore reused VERBATIM, including its `expectedRevision`: a retry
     * is a retry of that request, not a fresh request wearing its id, which the server would refuse
     * as `operation_mismatch`.
     *
     * `'missing'` — no saved record here at all. `'unconfirmed'` — a record the cloud has never
     * acknowledged (`remoteRevision === null`), so there is nothing in the account to delete and no
     * revision to name; the local copy is the only copy and removing it is not this operation.
     * Either way any frozen record is dropped: it can only be left over from a delete that already
     * landed and was reconciled by a download pass.
     */
    async prepareDelete(
        scope: AccountScope,
        documentId: string,
    ): Promise<PreparedDelete | 'missing' | 'unconfirmed'> {
        scope = copyScope(scope);
        identifier(documentId);
        const frozen = await this.database.run<PendingDeletion | 'missing' | 'unconfirmed'>(
            'readwrite',
            scope,
            (tx) => {
                const key = deletionKey(scope.ownerId, documentId);
                tx.read(
                    tx.table('songs').get([scope.ownerId, documentId]),
                    (stored: SavedSong | undefined) => {
                        const song = stored ? savedSong(stored, scope, documentId) : null;
                        if (!song || song.remoteRevision === null) {
                            tx.table('meta').delete(key);
                            return tx.finish(song ? 'unconfirmed' : 'missing');
                        }
                        const expectedRevision = song.remoteRevision;
                        tx.read(
                            tx.table('meta').get(key),
                            (existing: PendingDeletion | undefined) => {
                                if (existing !== undefined) {
                                    return tx.finish(savedDeletion(existing, scope, documentId));
                                }
                                const record: PendingDeletion = {
                                    key,
                                    ownerId: scope.ownerId,
                                    documentId,
                                    operationId: crypto.randomUUID(),
                                    expectedRevision,
                                };
                                tx.table('meta').put(record);
                                tx.finish(record);
                            },
                        );
                    },
                );
            },
        );
        if (typeof frozen === 'string') {
            return frozen;
        }
        const body = deleteBody(frozen);
        const hash = await digest(body);
        // Crypto runs outside IDB. Recheck the fence before publishing a prepared request, exactly
        // as `prepare()` does for a Save.
        await this.database.run('readonly', scope, (tx) => tx.finish(undefined));
        return {
            ownerId: scope.ownerId,
            documentId,
            operationId: frozen.operationId,
            expectedRevision: frozen.expectedRevision,
            body,
            digest: hash,
        };
    }

    /**
     * Forget a frozen delete, so a later attempt mints a fresh operation id.
     *
     * Only ever correct after the server answered definitively ABOUT THESE BYTES and wrote no
     * receipt for them — a stale `expectedRevision`, an id it has never held, or an operation id
     * already spent on something else. After an UNCERTAIN outcome (a dead network, a 401, a 429)
     * the same bytes are still the right request and the frozen id must survive, or a retry would
     * risk deleting twice under two ids.
     */
    async discardDelete(scope: AccountScope, documentId: string): Promise<void> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readwrite', scope, (tx) => {
            tx.table('meta').delete(deletionKey(scope.ownerId, documentId));
            tx.finish(undefined);
        });
    }

    /**
     * Apply the server's answer to a frozen delete, in one transaction (#1270).
     *
     * A `deleted` reply — a fresh delete, a replay of this operation id, and a delete of an id
     * already deleted are ONE reply by design — runs the same `commitDeleted` rule a downloaded
     * tombstone does, re-read here rather than taken from the caller: a Save can have been queued,
     * or the chart opened, while the request was in flight, and local work that exists only on this
     * device is never removed by a cloud operation. `request.expectedRevision` is the
     * compare-and-swap base, so a record that advanced meanwhile is retained rather than dropped.
     *
     * A `conflict` reply means nothing was deleted and the server wrote no receipt, so the frozen
     * id is dropped: the id is live at another revision, and a later attempt has to name THAT
     * revision — which is different bytes, and reusing the id for them is exactly what the server's
     * `operation_mismatch` refuses.
     */
    async acknowledgeDelete(
        scope: AccountScope,
        request: PreparedDelete,
        candidate: unknown,
        options: { active?: boolean } = {},
    ): Promise<ReconcileOutcome | 'conflict'> {
        scope = copyScope(scope);
        request = { ...request };
        if (request.ownerId !== scope.ownerId || (await digest(request.body)) !== request.digest) {
            throw new Error('Invalid prepared delete.');
        }
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('Invalid delete options.');
        }
        const active = options.active === true;
        const response = deleteReply(candidate, request);
        const documentId = request.documentId;
        return this.database.run('readwrite', scope, (tx) => {
            tx.table('meta').delete(deletionKey(scope.ownerId, documentId));
            if (response.kind === 'conflict') {
                return tx.finish('conflict');
            }
            const observed = remoteOutcome({
                kind: 'deleted',
                documentId,
                revision: response.revision,
            });
            const candidateRecord = (): RemoteCandidate =>
                Object.assign(
                    { key: candidateKey(scope.ownerId, documentId), ownerId: scope.ownerId },
                    observed,
                );
            tx.read(
                tx.table('songs').get([scope.ownerId, documentId]),
                (stored: SavedSong | undefined) => {
                    const song = stored ? savedSong(stored, scope, documentId) : null;
                    tx.read(
                        tx.table('drafts').index('song').count([scope.ownerId, documentId]),
                        (drafts: number) => {
                            operations(tx, scope, documentId, (queue) => {
                                const held = active || drafts > 0 || queue.length > 0;
                                tx.finish(
                                    commitDeleted(
                                        tx,
                                        scope,
                                        documentId,
                                        candidateRecord,
                                        song,
                                        held,
                                        request.expectedRevision,
                                    ),
                                );
                            });
                        },
                    );
                },
            );
        });
    }

    /** The remote observation this device kept but did not adopt. Null when there is none. */
    async remoteCandidate(
        scope: AccountScope,
        documentId: string,
    ): Promise<RemoteCandidate | null> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readonly', scope, (tx) => {
            tx.read(
                tx.table('meta').get(candidateKey(scope.ownerId, documentId)),
                (value: RemoteCandidate | undefined) => {
                    tx.finish(value ? savedCandidate(value, scope, documentId) : null);
                },
            );
        });
    }

    /**
     * Every remote observation this owner kept but did not adopt, in document-ID order.
     *
     * The `meta` store holds one generic keyed namespace, so the bound below is what keeps this
     * owner-scoped: `remote:<owner>:` as an inclusive lower bound and the same prefix plus
     * `'￿'` as an exclusive upper one. That is a true prefix range rather than a
     * fetch-then-filter, because `':'` terminates the owner segment and the identifier grammar
     * excludes it — every character an owner ID may contain sorts either side of `':'`
     * consistently, so no neighbouring owner's key can fall inside this window at all. The
     * `'active'` pointer sorts below the prefix and is never in range either. Each row is still
     * re-proved against the scope by `savedCandidate`, so a range bug cannot leak a record.
     */
    async remoteCandidates(scope: AccountScope): Promise<RemoteCandidate[]> {
        scope = copyScope(scope);
        return this.database.run('readonly', scope, (tx) => {
            const prefix = candidatePrefix(scope.ownerId);
            const range = IDBKeyRange.bound(prefix, `${prefix}￿`, false, true);
            tx.read(
                tx.table('meta').getAll(range, MAX_REMOTE_CANDIDATES + 1),
                (rows: RemoteCandidate[]) => {
                    if (rows.length > MAX_REMOTE_CANDIDATES) {
                        throw new Error('Account remote candidates exceed the supported limit.');
                    }
                    // The whole window is validated, never only what is handed back: a corrupt
                    // candidate must fail this read explicitly rather than be silently skipped
                    // and then re-downloaded as if it had never been preserved.
                    tx.finish(
                        rows.map((row) => {
                            identifier(row?.documentId);
                            return savedCandidate(row, scope, row.documentId);
                        }),
                    );
                },
            );
        });
    }

    /**
     * Apply ONE remote observation to this owner's library: the whole commit rule of a library
     * download, in one transaction, under the same owner/generation fence as every other write.
     *
     * The decision is made INSIDE the transaction, never taken from the caller's plan. A plan is
     * computed from a snapshot read minutes and several network round-trips earlier; by the time
     * a body arrives the musician may have started editing, queued a Save, or opened the chart.
     * Re-reading the record, the draft count and the queue here is what makes a download safe to
     * interleave with live use — and what makes an interrupted run safe to simply run again,
     * since a document already at this revision costs nothing and changes nothing. The chart on
     * the stand is the one fact storage cannot re-read, so the caller supplies it per call.
     *
     * `held` is the single preservation predicate: a draft, a queued Save, or the chart on the
     * stand each mean adopting the remote body would destroy something that exists only on this
     * device. A held document keeps everything it has and gets a separate candidate instead.
     * `remoteRevision === null` counts as divergent for the same reason: the local record has
     * never been confirmed by the cloud, so it cannot be treated as a clean mirror of it.
     *
     * `held` alone is not enough, because a Save can be queued AND drained inside the same
     * window: `acknowledge` writes the new `remoteRevision` and deletes the operation in ONE
     * transaction, so the record is never observably "clean but mid-flight" — it is simply clean
     * and newer, and nothing readable here would distinguish it from the record the plan saw.
     * `expectedRemoteRevision` is what does: a write only proceeds against the exact revision the
     * caller diffed against.
     */
    async reconcile(
        scope: AccountScope,
        outcome: RemoteOutcome,
        options: ReconcileOptions = {},
    ): Promise<ReconcileOutcome> {
        scope = copyScope(scope);
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('Invalid reconcile options.');
        }
        // Captured synchronously, before IDB awaits: a caller mutating its observation or its
        // options object mid-flight cannot retarget the commit that is already decided.
        const active = options.active === true;
        const expected = options.expectedRemoteRevision;
        if (expected !== undefined && expected !== null) {
            remoteRevision(expected);
        }
        const observed = remoteOutcome(outcome);
        const documentId = observed.documentId;
        return this.database.run('readwrite', scope, (tx) => {
            const key = candidateKey(scope.ownerId, documentId);
            const candidate = (): RemoteCandidate =>
                Object.assign({ key, ownerId: scope.ownerId }, observed);
            tx.read(
                tx.table('songs').get([scope.ownerId, documentId]),
                (stored: SavedSong | undefined) => {
                    const song = stored ? savedSong(stored, scope, documentId) : null;
                    tx.read(
                        tx.table('drafts').index('song').count([scope.ownerId, documentId]),
                        (drafts: number) => {
                            operations(tx, scope, documentId, (queue) => {
                                const held = active || drafts > 0 || queue.length > 0;
                                if (observed.kind === 'unsupported') {
                                    // Never touches the saved record, held or not: a body this
                                    // build cannot validate must not become the local song, and
                                    // discarding it would lose the only copy of it here.
                                    tx.table('meta').put(candidate());
                                    return tx.finish('unsupported');
                                }
                                if (observed.kind === 'deleted') {
                                    return tx.finish(
                                        commitDeleted(
                                            tx,
                                            scope,
                                            documentId,
                                            candidate,
                                            song,
                                            held,
                                            expected,
                                        ),
                                    );
                                }
                                if (song && song.remoteRevision === observed.revision) {
                                    // Already the confirmed local state — including on a rerun
                                    // of an interrupted pass. A candidate from an earlier pass
                                    // no longer describes a divergence.
                                    tx.table('meta').delete(key);
                                    return tx.finish('unchanged');
                                }
                                if (held || song?.remoteRevision === null) {
                                    tx.table('meta').put(candidate());
                                    return tx.finish('candidate');
                                }
                                if (song?.remoteRevision !== expected) {
                                    // Clean, unheld — and NOT the record the caller diffed. It
                                    // moved between the plan and this transaction, so this body
                                    // is an observation about a state that no longer exists here
                                    // and may not be written over the one that does.
                                    tx.table('meta').put(candidate());
                                    return tx.finish('candidate');
                                }
                                // Clean: the saved body and its remote revision advance together
                                // in this one transaction, so no reader can ever see a document
                                // labelled with a revision it is not.
                                tx.table('songs').put({
                                    ownerId: scope.ownerId,
                                    documentId,
                                    document: observed.document,
                                    remoteRevision: observed.revision,
                                } satisfies SavedSong);
                                tx.table('meta').delete(key);
                                tx.finish('advanced');
                            });
                        },
                    );
                },
            );
        });
    }
}
