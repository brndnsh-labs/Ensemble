import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
    RECEIPT_COST_BYTES,
    readDocument,
    readOwnerUsage,
    readReceipt,
    readTombstone,
    writeDocument,
    writeReceipt,
} from './documents.js';
import { withTransaction } from './transaction.js';

/**
 * The server half of the Explicit Save protocol, step 4 (#1202, stage 3 story 2 —
 * docs/design/ensemble-v2-sync.md "Explicit Save protocol"): "The server atomically checks
 * owner, operation receipt and expected revision, writes the document, and records the
 * receipt. A repeated ID with identical bytes returns the original result; different bytes
 * under the same ID are rejected. No timestamp last-write-wins. Creating requires absence and
 * no tombstone; updating requires the exact server revision."
 *
 * Everything here runs inside ONE transaction on the caller's already-authenticated `ownerId`
 * (the session's account id — never anything the request said). The query layer folds that
 * owner into every statement, so nothing in this file can reach another owner's rows.
 *
 * Receipts are recorded for COMMITTED saves only. A conflict changes nothing on the server,
 * and re-evaluating the same frozen request later is stable (a server revision is minted
 * fresh per commit and never reappears, so a stale `expectedRevision` can never come to match
 * again); re-evaluating also lets the retry see the CURRENT remote version, which is what
 * conflict resolution (stage 5) wants. The "different bytes under one id" rejection therefore
 * protects every operation id that ever changed server state, which is the integrity property
 * the protocol is after.
 *
 * A committed replay answers the ORIGINAL revision even if the document has since advanced.
 * That is the protocol's promise ("returns the original result"); a client that acknowledges
 * out of order would move its base backwards, which protocol steps 2 and 5 forbid a correct
 * client from doing — stage 4/5 must keep acknowledging in queue order, not "whichever reply
 * arrived last".
 */

export interface SaveCommand {
    /** The AUTHENTICATED owner (session account id). Never from the request body. */
    ownerId: string;
    documentId: string;
    operationId: string;
    /** SHA-256 of the exact bytes received — the receipt's identity for replay detection. */
    digest: string;
    /** `null` creates; a string must equal the current server revision to update. */
    expectedRevision: string | null;
    /** The validated document, serialized: what `documents.body` stores. */
    body: string;
    now: number;
}

export interface SaveDependencies {
    /** Opaque server revision minter. Injectable so tests can assert exact values. */
    mintRevision?: () => string;
    /**
     * The per-owner caps to enforce, defaulting to `MAX_DOCUMENTS_PER_OWNER` /
     * `MAX_BYTES_PER_OWNER` below. Production passes neither: `src/http/documents.ts` forwards
     * only what its caller gave it, so the shipped service always enforces the real numbers.
     *
     * They are injectable for one reason (#1247): the caps are deliberately far above anything
     * a test should write. The document cap can be reached by seeding 2,000 tiny rows, but the
     * byte cap cannot be reached at all without putting 256 MiB through the database — which
     * makes the quota's CONCURRENCY claim ("a concurrent writer cannot slip past a cap this
     * read just saw", step 3 below) untestable, since racing it means two processes at the cap
     * at once. Lowering the cap for a racer is the only way to prove that claim.
     */
    maxDocumentsPerOwner?: number;
    maxBytesPerOwner?: number;
}

/**
 * Per-owner storage caps (#1234). The request ceiling (`MAX_SAVE_REQUEST_BYTES`) and the rate
 * limit (`DOCUMENT_POLICIES`) bound one request and one identity's request RATE; neither bounds
 * what one account accumulates, and at the limits a single identity could write ~126 MB a minute
 * into fresh document ids. Blast radius is nil while registration is closed (#1226) and real the
 * day it opens, which is why this is the same gate.
 *
 * The numbers describe a songbook, not a backup target: a chart document is a few KB, so 2,000
 * documents is a library nobody reaches by playing music, and 256 MiB is roughly two orders of
 * magnitude of headroom above that. Raise them deliberately, with the storage on the box in mind;
 * do not raise them because one owner hit the wall.
 *
 * `MAX_BYTES_PER_OWNER` bounds the owner's TOTAL stored bytes — document bodies plus their
 * retained receipts (#1250). It did not always: #1234 shipped measuring `documents` alone, which
 * left re-saving ONE document with fresh operation ids growing the database without limit while
 * the quota reported a single small document (measured: 20,000 saves = 20,000 receipts = 4.19 MiB
 * on disk against a reported 31 bytes). `RECEIPT_COST_BYTES` in documents.ts is what closes that,
 * and the growth clause below is where it has to be counted for the close to hold.
 */
export const MAX_DOCUMENTS_PER_OWNER = 2_000;
export const MAX_BYTES_PER_OWNER = 256 * 1024 * 1024;

export type SaveOutcome =
    /** Written now (`replayed: false`) or the original result of this same request again. */
    | { kind: 'committed'; revision: string; replayed: boolean }
    /**
     * The session's owner no longer has an account row — the request raced #1271's account
     * deletion. Checked FIRST, inside the transaction, precisely so this and the wipe cannot
     * interleave: without it, a Save against a mid-flight or just-committed deletion hits the
     * `documents.owner_id` foreign key and this transaction rolls back with an unhandled
     * exception, which `src/http/app.ts`'s `onError` turns into `500 internal_error` — a session
     * whose account is gone is a `401`, not a server fault. `src/http/documents.ts` maps this to
     * `401 unauthenticated`, matching every other route's answer for a deleted account's cookie.
     */
    | { kind: 'owner_gone' }
    /**
     * Nothing written. `revision` is the server revision this decision was made against:
     * the current document's (or the tombstone's last revision, or, when the owner never had
     * the document at all, the caller's own `expectedRevision` — the only revision in play).
     * `remote` is the current server version to resolve against, `null` when there is none.
     */
    | { kind: 'conflict'; revision: string; remote: { revision: string; body: string } | null }
    /** This operation id already committed DIFFERENT bytes (or a different document). */
    | { kind: 'operation_mismatch' }
    /**
     * Nothing written: this owner is at a storage cap. `limit` names which one and `usage`/`cap`
     * are the owner's own numbers — never another account's, and nothing about the server at
     * large. NOTE: none of the three reach the wire today. `src/http/documents.ts` answers the
     * bare `{ error: 'quota_exceeded' }` the error taxonomy calls for, so the "too many songs"
     * vs "too much stored" distinction a client would want is carried here and stopped at the
     * boundary on purpose — see #1245 for the stage-5 decision on widening that reply.
     */
    | { kind: 'quota_exceeded'; limit: 'documents' | 'bytes'; usage: number; cap: number };

/** A minted revision satisfies the client's `remoteRevision` grammar (`[A-Za-z0-9._:-]{1,200}`). */
export function mintRevision(): string {
    return randomUUID();
}

export function commitSave(
    db: DatabaseSync,
    command: SaveCommand,
    {
        mintRevision: mint = mintRevision,
        maxDocumentsPerOwner = MAX_DOCUMENTS_PER_OWNER,
        maxBytesPerOwner = MAX_BYTES_PER_OWNER,
    }: SaveDependencies = {},
): SaveOutcome {
    const { ownerId, documentId, operationId, digest, expectedRevision, body, now } = command;
    // IMMEDIATE: this transaction reads (receipt, document, tombstone) before it writes.
    return withTransaction(
        db,
        () => {
            // 0. The owner must still exist. Checked before the receipt read, not after: a
            // deleted account's replayed receipt is exactly as unreachable as a fresh write, and
            // reading it first would answer `committed` for an owner this request can no longer
            // prove is authenticated. `readSession` already refuses the cookie for a deleted
            // account on the NEXT request; this is what keeps the request already in flight from
            // hitting the FK constraint below instead.
            if (db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(ownerId) === undefined) {
                return { kind: 'owner_gone' };
            }
            // 1. Operation receipt: replay or reject before anything else is even read.
            const receipt = readReceipt(db, ownerId, operationId);
            if (receipt !== undefined) {
                if (receipt.requestDigest !== digest || receipt.documentId !== documentId) {
                    return { kind: 'operation_mismatch' };
                }
                return { kind: 'committed', revision: receipt.resultRevision, replayed: true };
            }

            // 2. Expected revision against the server's current state.
            const current = readDocument(db, ownerId, documentId);
            if (expectedRevision === null) {
                // Creating requires absence AND no tombstone: a deleted id is never resurrected.
                const tombstone = readTombstone(db, ownerId, documentId);
                if (tombstone !== undefined) {
                    return { kind: 'conflict', revision: tombstone.revision, remote: null };
                }
                if (current !== undefined) {
                    return {
                        kind: 'conflict',
                        revision: current.revision,
                        remote: { revision: current.revision, body: current.body },
                    };
                }
            } else {
                if (current === undefined) {
                    const tombstone = readTombstone(db, ownerId, documentId);
                    return {
                        kind: 'conflict',
                        revision: tombstone?.revision ?? expectedRevision,
                        remote: null,
                    };
                }
                // Exact match only. The current revision is never substituted into the request.
                if (current.revision !== expectedRevision) {
                    return {
                        kind: 'conflict',
                        revision: current.revision,
                        remote: { revision: current.revision, body: current.body },
                    };
                }
            }

            // 3. Storage quota, checked AFTER the conflict decision and inside the same
            // transaction, so a concurrent writer cannot slip past a cap this read just saw.
            //
            // Conflict first on purpose: an owner at the cap whose revision is also stale needs
            // to hear about the stale revision, because resolving it may well be an UPDATE,
            // which the cap does not forbid. Answering "full" there would send them to delete
            // songs over what is really a sync conflict.
            const usage = readOwnerUsage(db, ownerId);
            // This write's own cost: the body, PLUS the receipt it will leave behind. Counting
            // the receipt here is what makes the growth rule below honest — see #1250.
            const addedBytes = Buffer.byteLength(body, 'utf8') + RECEIPT_COST_BYTES;
            if (current === undefined && usage.documents >= maxDocumentsPerOwner) {
                return {
                    kind: 'quota_exceeded',
                    limit: 'documents',
                    usage: usage.documents,
                    cap: maxDocumentsPerOwner,
                };
            }
            const replacedBytes =
                current === undefined ? 0 : Buffer.byteLength(current.body, 'utf8');
            const projectedBytes = usage.bytes - replacedBytes + addedBytes;
            // Never refuse a write that does not INCREASE the footprint. Without this, an owner
            // already over the cap — because it was lowered, or because their data predates it —
            // would be frozen out of editing entirely, including the edits that shrink their way
            // back under. Note the rule is only "does not grow": one such write need not bring
            // the owner under the cap, it just may not push them further over.
            //
            // `addedBytes` INCLUDES this write's receipt (#1250), and that is load-bearing, not
            // bookkeeping. Measured against document bytes alone, an equal-size re-save has
            // `addedBytes === replacedBytes`, so this clause waved it through unconditionally —
            // and an equal-size re-save with a fresh operation id is exactly the shape that grew
            // the receipt table without limit. With the receipt counted, re-saving the same bytes
            // does grow the footprint, so an owner at the cap is refused; a genuine shrink still
            // passes, as long as it gives back more than the new receipt takes.
            if (projectedBytes > maxBytesPerOwner && addedBytes > replacedBytes) {
                return {
                    kind: 'quota_exceeded',
                    limit: 'bytes',
                    usage: usage.bytes,
                    cap: maxBytesPerOwner,
                };
            }

            // 4. Write the document and 5. record the receipt, in the same transaction.
            const revision = mint();
            writeDocument(db, ownerId, { documentId, revision, body, updatedAt: now });
            writeReceipt(db, ownerId, {
                operationId,
                documentId,
                requestDigest: digest,
                resultRevision: revision,
                createdAt: now,
            });
            return { kind: 'committed', revision, replayed: false };
        },
        { immediate: true },
    );
}
