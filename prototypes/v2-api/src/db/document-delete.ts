import type { DatabaseSync } from 'node:sqlite';
import {
    deleteDocument,
    readDocument,
    readReceipt,
    readTombstone,
    writeReceipt,
} from './documents.js';
import { withTransaction } from './transaction.js';

/**
 * Explicit cloud deletion (#1260, stage 3 — `docs/design/ensemble-v2-sync.md` "Sharing, deletion,
 * operations and privacy": "Cloud document deletion is an explicit online operation with a
 * tombstone and recovery/export preflight, not a side effect of removing a local download").
 *
 * The decision order is `commitSave`'s, deliberately and line for line: receipt first, then the
 * server's current state, then the expected revision, then the write — all in ONE
 * `BEGIN IMMEDIATE` transaction on the caller's already-authenticated `ownerId`. A delete is a
 * write against the same three tables the Save protocol owns, so it has to be idempotent the same
 * way, refuse a stale base the same way, and be indistinguishable to a caller who is not entitled
 * to know an id exists. Anything that reads differently between the two files is a bug in one of
 * them, not a local style choice.
 *
 * Two of Save's moving parts are deliberately absent. Nothing is MINTED — a tombstone carries the
 * revision the document died at (`deleteDocument`'s contract), so `SaveDependencies`' injectable
 * minter has no analogue here. And there is no bulk form: one id per operation, because one
 * operation id is one receipt and a partially-applied bulk delete could not replay honestly.
 * Account deletion is #1271's own story with its own fresh-auth gate.
 */

export interface DeleteCommand {
    /** The AUTHENTICATED owner (session account id). Never from the request body. */
    ownerId: string;
    documentId: string;
    operationId: string;
    /** SHA-256 of the exact bytes received — the receipt's identity for replay detection. */
    digest: string;
    /**
     * Must equal the current server revision. Unlike Save there is no `null` form: `null` there
     * means "this operation CREATES the document", and there is no such thing as deleting an id
     * you have never seen a revision of. An absent id is answered by step 2 below, not by a
     * create-shaped request.
     */
    expectedRevision: string;
    now: number;
}

export type DeleteOutcome =
    /**
     * The id is deleted and carries `revision` as its final revision.
     *
     * `replayed` means this exact operation id had already committed (the receipt answered).
     * `performed` means THIS call is the one that removed the row. Both are false together on the
     * third path: a DIFFERENT operation id arriving after the id was already deleted, which is
     * answered idempotently from the tombstone. Neither reaches the wire — a caller learns only
     * that the id is deleted at that revision, which is all it can act on, and the pair exists so
     * a concurrency test can assert "exactly one racer performed the delete".
     */
    | { kind: 'deleted'; revision: string; replayed: boolean; performed: boolean }
    /**
     * Nothing deleted: the id is live at a revision this request did not expect. `remote` is the
     * current server version to resolve against, in the same shape `commitSave` returns so the
     * route can answer one conflict envelope for both operations. It is never `null` here, which
     * `commitSave`'s is: there, a conflict can be "the id is gone or tombstoned"; here that case
     * is `not_found`/`deleted` at step 2, so a conflict always has a live document behind it.
     */
    | { kind: 'conflict'; revision: string; remote: { revision: string; body: string } }
    /** This operation id already committed DIFFERENT bytes (or a different document). */
    | { kind: 'operation_mismatch' }
    /**
     * The owner has no such id and never deleted one — nothing happened, so no receipt is
     * written and a retry is free. Indistinguishable from another owner's id by construction:
     * the owner predicate is in the SQL, so there is no second branch to get wrong.
     */
    | { kind: 'not_found' };

export function commitDelete(db: DatabaseSync, command: DeleteCommand): DeleteOutcome {
    const { ownerId, documentId, operationId, digest, expectedRevision, now } = command;
    // IMMEDIATE: this transaction reads (receipt, document, tombstone) before it writes.
    return withTransaction(
        db,
        () => {
            // 1. Operation receipt: replay or reject before anything else is even read.
            //
            // Receipts are one namespace per owner across BOTH operations, which is the correct
            // shape rather than an accident: an operation id names one operation, so reusing a
            // Save's id for a delete must be refused. It is refused by the digest comparison
            // below without a discriminator column, because the digest covers the whole request
            // body — and a delete envelope (four keys, no document) can never serialize to the
            // same bytes as a Save envelope (six keys, document included). So "same id, different
            // operation" is always "same id, different bytes".
            const receipt = readReceipt(db, ownerId, operationId);
            if (receipt !== undefined) {
                if (receipt.requestDigest !== digest || receipt.documentId !== documentId) {
                    return { kind: 'operation_mismatch' };
                }
                return {
                    kind: 'deleted',
                    revision: receipt.resultRevision,
                    replayed: true,
                    performed: false,
                };
            }

            // 2. The server's current state for this id.
            const current = readDocument(db, ownerId, documentId);
            if (current === undefined) {
                const tombstone = readTombstone(db, ownerId, documentId);
                if (tombstone === undefined) {
                    return { kind: 'not_found' };
                }
                // Already deleted, under a different operation id: the caller's goal is the state
                // of the world, and the world is already in it. Answered idempotently rather than
                // as a conflict, and WITHOUT consulting `expectedRevision` — a tombstone is
                // terminal, so there is no newer version to offer for Keep-both and nothing the
                // caller could do with a refusal except ask again. The revision answered is the
                // tombstone's (the truth about the id), never the one the request guessed.
                //
                // A receipt IS written here, unlike the `not_found` path above: this answer is a
                // statement about a durable server fact, so it must keep answering identically if
                // this very request is retried after a lost response, and a receipt is what makes
                // that a single indexed read instead of a re-derivation. It costs
                // `RECEIPT_COST_BYTES` against the owner's budget (see step 4 on why that cannot
                // refuse the delete) and is bounded by this route's own rate budget.
                writeReceipt(db, ownerId, {
                    operationId,
                    documentId,
                    requestDigest: digest,
                    resultRevision: tombstone.revision,
                    createdAt: now,
                });
                return {
                    kind: 'deleted',
                    revision: tombstone.revision,
                    replayed: false,
                    performed: false,
                };
            }

            // 3. Expected revision, exact match only — the current revision is never substituted
            // into the request. A delete is destructive and unrecoverable over this API, so "you
            // are looking at an older version than the one you are about to destroy" is precisely
            // the case that must stop and offer the current version instead.
            if (current.revision !== expectedRevision) {
                return {
                    kind: 'conflict',
                    revision: current.revision,
                    remote: { revision: current.revision, body: current.body },
                };
            }

            // 4. Delete the row, leave the tombstone, record the receipt — one transaction.
            //
            // **No quota gate, on purpose.** A delete leaves two permanent rows (the tombstone and
            // this receipt) and both ARE charged against the owner's footprint by
            // `readOwnerUsage`, so the accounting stays honest. What is exempted is the REFUSAL:
            // `commitSave`'s "an owner over the cap may not grow" clause would refuse a delete
            // whose freed body is smaller than the 1,536 bytes it leaves behind — which is exactly
            // the owner who most needs to delete something. Deletion is the only operation that
            // gives document bytes back, so making it refusable by the cap would lock an account
            // at the cap out of its own remedy, and the remedy is the whole point of the endpoint.
            //
            // Exempting the refusal is not free, and the residual is the same one the stage-3
            // review already accepted for receipts (`docs/design/ensemble-v2-rollout.md` decision
            // 11, #1256): a caller with one tombstone can keep re-deleting that id under fresh
            // operation ids, each leaving a charged receipt that the cap will not refuse. That is
            // bounded by this route's per-identity rate budget (`DOCUMENT_POLICIES`), not by the
            // quota, and it wants the same admin-side prune the receipt residual wants.
            deleteDocument(db, ownerId, documentId, now);
            writeReceipt(db, ownerId, {
                operationId,
                documentId,
                requestDigest: digest,
                // The tombstone's revision, i.e. the one the document died at: a replay of this
                // operation must answer exactly what this call answered.
                resultRevision: current.revision,
                createdAt: now,
            });
            return {
                kind: 'deleted',
                revision: current.revision,
                replayed: false,
                performed: true,
            };
        },
        { immediate: true },
    );
}
