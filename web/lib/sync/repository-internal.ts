import type { Transaction } from './database';
import {
    type AccountScope,
    MAX_PENDING_SAVES,
    remoteRevision,
    type SavedCollection,
    type SaveOperation,
    type SyncDocument,
    snapshot,
} from './protocol';
import { savedCollection, savedOperation } from './records';
import type { UnreadableRow } from './repository';

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;
/** The server's per-owner document cap: more candidates than that is a broken store. */
export const MAX_REMOTE_CANDIDATES = 2_000;

export function unreadableRow(row: {
    documentId: string;
    remoteRevision?: unknown;
}): UnreadableRow {
    try {
        remoteRevision(row.remoteRevision);
        return { documentId: row.documentId, remoteRevision: row.remoteRevision };
    } catch {
        return { documentId: row.documentId, remoteRevision: null };
    }
}

/**
 * One document's queued Saves, re-proved and in local-revision order. `decode` is the kind the
 * caller is prepared to hold (`savedOperation`): the chart paths use `operations` below, which
 * refuses anything but a chart exactly as before #1474; the paths that move any document — the
 * outbox's `prepare`/`acknowledge`/`refuse`, `queued` — pass `syncDocument`.
 */
export function queueOf<T, D extends SyncDocument>(
    tx: Transaction<T>,
    scope: AccountScope,
    id: string,
    decode: (candidate: unknown) => D,
    consume: (ops: SaveOperation<D>[]) => void,
    unreadable?: (ops: SaveOperation<SyncDocument>[]) => void,
) {
    tx.read(
        tx
            .table('operations')
            .index('song')
            .getAll([scope.ownerId, id], MAX_PENDING_SAVES + 1),
        (ops: SaveOperation<SyncDocument>[]) => {
            if (ops.length > MAX_PENDING_SAVES) {
                throw new Error('Account queue exceeds the supported limit.');
            }
            let queue: SaveOperation<D>[];
            try {
                queue = ops
                    .map((op) => savedOperation(op, scope, id, decode))
                    .sort((a, b) => a.localRevision - b.localRevision);
            } catch (error) {
                // A caller that can act on a queue it cannot read says so (#1769); every other
                // caller still refuses it, as before.
                if (!unreadable) {
                    throw error;
                }
                return unreadable(ops);
            }
            consume(queue);
        },
    );
}

/**
 * One stored record that may not read (#1769): the decoded record, or `'unreadable'` for a row this
 * build cannot use — one its decoder refuses, a text chart (schema 1, retired in #1740) included.
 */
export function readableRecord<R>(decode: () => R): R | 'unreadable' {
    try {
        return decode();
    } catch {
        return 'unreadable';
    }
}

export function operations<T>(
    tx: Transaction<T>,
    scope: AccountScope,
    id: string,
    consume: (ops: SaveOperation[]) => void,
) {
    queueOf(tx, scope, id, snapshot, consume);
}

/**
 * One stored collection row, re-proved, or null. Shared by the collection reads in
 * `collections.ts` and by `savedRecord` in `repository.ts`.
 */
export function storedCollection(
    row: SavedCollection | undefined,
    scope: AccountScope,
    documentId: string,
): SavedCollection | null {
    return row ? savedCollection(row, scope, documentId) : null;
}
