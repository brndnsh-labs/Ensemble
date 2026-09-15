import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
    readDocument,
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
}

export type SaveOutcome =
    /** Written now (`replayed: false`) or the original result of this same request again. */
    | { kind: 'committed'; revision: string; replayed: boolean }
    /**
     * Nothing written. `revision` is the server revision this decision was made against:
     * the current document's (or the tombstone's last revision, or, when the owner never had
     * the document at all, the caller's own `expectedRevision` — the only revision in play).
     * `remote` is the current server version to resolve against, `null` when there is none.
     */
    | { kind: 'conflict'; revision: string; remote: { revision: string; body: string } | null }
    /** This operation id already committed DIFFERENT bytes (or a different document). */
    | { kind: 'operation_mismatch' };

/** A minted revision satisfies the client's `remoteRevision` grammar (`[A-Za-z0-9._:-]{1,200}`). */
export function mintRevision(): string {
    return randomUUID();
}

export function commitSave(
    db: DatabaseSync,
    command: SaveCommand,
    { mintRevision: mint = mintRevision }: SaveDependencies = {},
): SaveOutcome {
    const { ownerId, documentId, operationId, digest, expectedRevision, body, now } = command;
    return withTransaction(db, () => {
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

        // 3. Write the document and 4. record the receipt, in the same transaction.
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
    });
}
