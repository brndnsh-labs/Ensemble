import type { DatabaseSync } from 'node:sqlite';

/**
 * Owner-scoped query layer for documents, receipts and tombstones (#1201, stage 3 story 1).
 *
 * The IDOR defense the threat model records for SQLite: ownership is baked into every query,
 * so a route handler cannot forget it because there is no bare read-by-id to reach for. Every
 * exported function takes the AUTHENTICATED `ownerId` as its mandatory first parameter and
 * folds it into the `WHERE` (or the inserted row). Client-provided owner ids are routing hints,
 * never authorization — the HTTP layer (#1202) passes the session's account id here, nothing
 * else. Rows come back as plain objects via the `Row` types below, never raw `sqlite` rows.
 *
 * No transaction management here: multi-statement writes (the Save commit in #1202) wrap
 * these primitives in `withTransaction`. Each function is one statement.
 */

export interface DocumentRow {
    ownerId: string;
    documentId: string;
    revision: string;
    body: string;
    updatedAt: number;
}

export interface ReceiptRow {
    ownerId: string;
    operationId: string;
    documentId: string;
    requestDigest: string;
    resultRevision: string;
    createdAt: number;
}

export interface TombstoneRow {
    ownerId: string;
    documentId: string;
    revision: string;
    deletedAt: number;
}

/** Bounded listing per the sync contract: id, revision and updatedAt only — never bodies. */
export interface DocumentSummary {
    documentId: string;
    revision: string;
    updatedAt: number;
}

interface RawDocument {
    owner_id: string;
    document_id: string;
    revision: string;
    body: string;
    updated_at: number;
}
interface RawReceipt {
    owner_id: string;
    operation_id: string;
    document_id: string;
    request_digest: string;
    result_revision: string;
    created_at: number;
}
interface RawTombstone {
    owner_id: string;
    document_id: string;
    revision: string;
    deleted_at: number;
}

export const MAX_LIST_LIMIT = 500;

export function readDocument(
    db: DatabaseSync,
    ownerId: string,
    documentId: string,
): DocumentRow | undefined {
    const row = db
        .prepare('SELECT * FROM documents WHERE owner_id = ? AND document_id = ?')
        .get(ownerId, documentId) as RawDocument | undefined;
    return row === undefined
        ? undefined
        : {
              ownerId: row.owner_id,
              documentId: row.document_id,
              revision: row.revision,
              body: row.body,
              updatedAt: row.updated_at,
          };
}

/**
 * Newest-first page of an owner's documents, bounded. `limit` is clamped to `MAX_LIST_LIMIT`
 * and `offset` to a non-negative integer, so a caller-supplied page can never turn into an
 * unbounded scan or a negative offset (which SQLite treats as no offset).
 */
export function listDocuments(
    db: DatabaseSync,
    ownerId: string,
    page: { limit: number; offset: number },
): DocumentSummary[] {
    const limit = Math.min(Math.max(Math.trunc(page.limit), 0), MAX_LIST_LIMIT);
    const offset = Math.max(Math.trunc(page.offset), 0);
    const rows = db
        .prepare(
            `SELECT document_id, revision, updated_at FROM documents
             WHERE owner_id = ? ORDER BY updated_at DESC, document_id ASC LIMIT ? OFFSET ?`,
        )
        .all(ownerId, limit, offset) as Pick<
        RawDocument,
        'document_id' | 'revision' | 'updated_at'
    >[];
    return rows.map((row) => ({
        documentId: row.document_id,
        revision: row.revision,
        updatedAt: row.updated_at,
    }));
}

/**
 * The owner's current storage footprint: how many documents they hold and how many bytes those
 * bodies occupy. One statement, covered by `idx_documents_owner_id`, so the Save transaction can
 * afford to ask on every write (#1234).
 *
 * `length()` on TEXT counts CHARACTERS, which would let a body of astral-plane characters occupy
 * up to four times the bytes it appears to. Casting to BLOB first counts the UTF-8 bytes SQLite
 * actually stores, which is the same unit `Buffer.byteLength` gives the caller for the incoming
 * body — the two sides of the quota arithmetic must measure the same thing.
 */
export function readOwnerUsage(
    db: DatabaseSync,
    ownerId: string,
): { documents: number; bytes: number } {
    const row = db
        .prepare(
            `SELECT COUNT(*) AS documents, COALESCE(SUM(length(CAST(body AS BLOB))), 0) AS bytes
             FROM documents WHERE owner_id = ?`,
        )
        .get(ownerId) as { documents: number; bytes: number };
    return { documents: row.documents, bytes: row.bytes };
}

/**
 * Insert or replace the owner's document at a new revision. The CALLER decides whether the
 * write is allowed (absence + no tombstone for a create, exact base revision for an update)
 * inside the same transaction as this write — that is #1202's six-step commit. This function
 * only ever touches the `(ownerId, documentId)` row.
 */
export function writeDocument(
    db: DatabaseSync,
    ownerId: string,
    document: Omit<DocumentRow, 'ownerId'>,
): void {
    db.prepare(
        `INSERT INTO documents (owner_id, document_id, revision, body, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (owner_id, document_id) DO UPDATE SET
             revision = excluded.revision, body = excluded.body, updated_at = excluded.updated_at`,
    ).run(ownerId, document.documentId, document.revision, document.body, document.updatedAt);
}

/**
 * Delete the owner's document and leave its tombstone in one statement pair. Returns false when
 * there was nothing to delete (so the caller can 404 rather than mint a tombstone for an id the
 * owner never had). The caller wraps this in a transaction with its revision check.
 */
export function deleteDocument(
    db: DatabaseSync,
    ownerId: string,
    documentId: string,
    deletedAt: number,
): boolean {
    const current = readDocument(db, ownerId, documentId);
    if (current === undefined) {
        return false;
    }
    db.prepare('DELETE FROM documents WHERE owner_id = ? AND document_id = ?').run(
        ownerId,
        documentId,
    );
    db.prepare(
        `INSERT INTO tombstones (owner_id, document_id, revision, deleted_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (owner_id, document_id) DO UPDATE SET
             revision = excluded.revision, deleted_at = excluded.deleted_at`,
    ).run(ownerId, documentId, current.revision, deletedAt);
    return true;
}

export function readTombstone(
    db: DatabaseSync,
    ownerId: string,
    documentId: string,
): TombstoneRow | undefined {
    const row = db
        .prepare('SELECT * FROM tombstones WHERE owner_id = ? AND document_id = ?')
        .get(ownerId, documentId) as RawTombstone | undefined;
    return row === undefined
        ? undefined
        : {
              ownerId: row.owner_id,
              documentId: row.document_id,
              revision: row.revision,
              deletedAt: row.deleted_at,
          };
}

export function readReceipt(
    db: DatabaseSync,
    ownerId: string,
    operationId: string,
): ReceiptRow | undefined {
    const row = db
        .prepare('SELECT * FROM receipts WHERE owner_id = ? AND operation_id = ?')
        .get(ownerId, operationId) as RawReceipt | undefined;
    return row === undefined
        ? undefined
        : {
              ownerId: row.owner_id,
              operationId: row.operation_id,
              documentId: row.document_id,
              requestDigest: row.request_digest,
              resultRevision: row.result_revision,
              createdAt: row.created_at,
          };
}

/**
 * Record a receipt. Plain INSERT on purpose: a receipt is immutable for the account lifetime,
 * so a second insert for the same `(ownerId, operationId)` is a bug in the caller's
 * idempotency check and must surface as a constraint error, never a silent overwrite.
 */
export function writeReceipt(
    db: DatabaseSync,
    ownerId: string,
    receipt: Omit<ReceiptRow, 'ownerId'>,
): void {
    db.prepare(
        `INSERT INTO receipts (owner_id, operation_id, document_id, request_digest, result_revision, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
        ownerId,
        receipt.operationId,
        receipt.documentId,
        receipt.requestDigest,
        receipt.resultRevision,
        receipt.createdAt,
    );
}
