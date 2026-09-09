import { AccountDatabase, type Transaction } from './database';
import {
    type AccountScope,
    type Draft,
    digest,
    identifier,
    LocalRevisionError,
    localRevision,
    MAX_PENDING_SAVES,
    type PreparedSave,
    remoteRevision,
    reply,
    type SavedSong,
    type SaveOperation,
    type SaveReceipt,
    snapshot,
} from './protocol';
import { copyScope, savedDraft, savedOperation, savedSong } from './records';

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
}
