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

/**
 * One row of the S1 manifest (#1259; `docs/design/ensemble-v2-rollout.md` decision 9): the
 * client pages this and diffs it against its local records. Identity, the current revision, and
 * — for a deleted id — the tombstone that tells the client to drop its clean mirror. `bytes` is
 * what the body costs against the owner's budget, so the client can show a library's size
 * without downloading it.
 *
 * Never the body itself: a 2,000-document library (`MAX_DOCUMENTS_PER_OWNER`) has to be pageable
 * over a phone connection, and a manifest is what makes the download decision, not the payload.
 */
export interface ManifestEntry {
    documentId: string;
    revision: string;
    deleted: boolean;
    bytes: number;
}

export interface ManifestPage {
    entries: ManifestEntry[];
    /** Cursor for the next page — the last id on this one — or null at the end of the library. */
    nextAfter: string | null;
}

/**
 * A type alias, not an `interface`, on purpose: only a mapped/aliased object type gets TypeScript's
 * implicit index signature, which is what makes it castable from `all()`'s
 * `Record<string, SQLOutputValue>` without laundering the row through `unknown` first. The
 * `interface`s above are read through `get()`, which is not the same overload.
 */
type RawManifestRow = {
    document_id: string;
    revision: string;
    /** SQLite has no boolean: the `UNION` legs select the literals 0 and 1. */
    deleted: number;
    bytes: number;
};

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
 * One page of the owner's S1 manifest: live documents and tombstones interleaved in a single
 * `document_id`-ascending sequence, resumable from `after` (#1259).
 *
 * **Why not `listDocuments`.** That one is `updated_at DESC` with an `OFFSET`, which is fine for
 * a "recently edited" view and unusable as a manifest cursor: every Save rewrites `updated_at`,
 * so a document can cross the offset boundary between two page fetches and be either skipped or
 * returned twice. Ordering by the immutable `document_id` and carrying the last id as the cursor
 * makes a page boundary stable under concurrent writes — a Save can change a row's `revision`,
 * but nothing can move it past the cursor. A create below the cursor is missed by the pass in
 * progress and picked up by the next one, which is exactly what a manifest DIFF tolerates and
 * why decision 9 needs no watermark or cursor-expiry machinery. `listDocuments` stays as it is;
 * do not "unify" the two — they have opposite ordering requirements.
 *
 * `after` is compared with the same binary collation the `ORDER BY` uses (no `COLLATE` anywhere
 * in the schema), which is what makes the cursor and the ordering agree. An empty/absent cursor
 * starts at the beginning: every `document_id` is non-empty by the identifier grammar the write
 * path enforces, so `document_id > ''` is every row.
 *
 * The `NOT EXISTS` makes "at most one row per id" a property of the QUERY rather than an
 * assumption about the writers: `commitSave` refuses a create over a tombstone and
 * `deleteDocument` removes the document row before inserting one, so the tables are disjoint
 * today — but a duplicated id would hand the client two conflicting manifest rows, and a keyset
 * page is the wrong place to discover that a future writer broke the invariant. A live document
 * wins, because the live row is the one a client can download.
 *
 * Parameters are positional in this order: `ownerId`, `after`, `ownerId`, `after`, `limit + 1`.
 * The extra row is a lookahead, never returned — it is only how `nextAfter` can be `null`
 * exactly at the end of the library instead of after one wasted empty page.
 *
 * `limit` is clamped to `1..MAX_LIST_LIMIT`. The floor is 1, not 0, deliberately (#1259 review,
 * F5): a zero or negative limit used to return `{ entries: [], nextAfter: null }`, which in this
 * shape does not read as "you asked for nothing" — it reads as END OF LIBRARY, and a caller that
 * computed its page size and got zero would conclude the account is empty and diff a whole
 * library away against it. `listDocuments`' floor of 0 is a different contract: it returns a
 * bare array with no end-of-list flag to misread. The HTTP layer rejects a zero `limit` outright
 * before reaching here; this is the in-process backstop.
 */
export function listManifest(
    db: DatabaseSync,
    ownerId: string,
    page: { after?: string | null; limit: number },
): ManifestPage {
    const limit = Math.min(Math.max(Math.trunc(page.limit), 1), MAX_LIST_LIMIT);
    const after = page.after ?? '';
    const rows = db
        .prepare(
            `SELECT document_id, revision, 0 AS deleted, length(CAST(body AS BLOB)) AS bytes
               FROM documents
              WHERE owner_id = ? AND document_id > ?
             UNION ALL
             SELECT t.document_id, t.revision, 1 AS deleted, 0 AS bytes
               FROM tombstones t
              WHERE t.owner_id = ? AND t.document_id > ?
                AND NOT EXISTS (SELECT 1 FROM documents d
                                 WHERE d.owner_id = t.owner_id AND d.document_id = t.document_id)
              ORDER BY document_id ASC
              LIMIT ?`,
        )
        .all(ownerId, after, ownerId, after, limit + 1) as RawManifestRow[];
    const entries = rows.slice(0, limit).map((row) => ({
        documentId: row.document_id,
        revision: row.revision,
        deleted: row.deleted === 1,
        bytes: row.bytes,
    }));
    // The lookahead row existing means `entries` holds `limit` rows, and the floor of 1 means
    // that is at least one — so the last entry is always there when this branch is taken.
    return {
        entries,
        nextAfter: rows.length > limit ? entries[entries.length - 1]!.documentId : null,
    };
}

/**
 * What one committed receipt costs an owner's storage budget (#1250).
 *
 * A receipt is retained for the account lifetime and never expired — that retention is exactly
 * what makes a replayed operation id detectable, so it is not negotiable. But it means every
 * committed save leaves a permanent row, and #1234's original caps measured `documents` only,
 * so re-saving ONE document with fresh operation ids grew the database without limit while the
 * quota reported a single small document. This constant is what closes that.
 *
 * It is a FLAT charge rather than a per-row measurement, and deliberately so: the alternative
 * needs the same size formula written twice, once in SQL over the table and once in TypeScript
 * for the pending write, and those two copies are exactly the kind of thing that drifts apart
 * silently. One number cannot drift.
 *
 * The number is the measured worst case, rounded up. On-disk growth per receipt row, including
 * its primary key and both indexes (`PRAGMA wal_checkpoint(TRUNCATE)` before each sizing,
 * 20,000 rows per sample):
 *
 *   short ids (8 chars)       123 B of text -> 193 B on disk
 *   uuid-ish ids (36 chars)   179 B of text -> 314 B on disk
 *   max-length ids (128, the `documentId`/`operationId` grammar's ceiling)
 *                             363 B of text -> 737 B on disk
 *
 * So 768 covers the worst case an owner can actually construct. It over-charges a short-id
 * receipt roughly fourfold, which is the safe direction and costs a real songbook nothing: even
 * 20,000 saves is 15 MiB of a 256 MiB budget. Charging too LITTLE would be the bug, because
 * then the cap would not actually bound what lands on the disk.
 *
 * **A TOMBSTONE is charged at this same rate (#1260)**, and deliberately by this same constant
 * rather than a second one of its own. A tombstone is retained for the account lifetime — that
 * permanence is exactly what keeps a deleted id from being resurrected — so it is another
 * permanent row the quota would otherwise be blind to, which is what the stage-3 authorization
 * review asked for at exactly this point (`docs/design/ensemble-v2-document-authorization-review.md`,
 * residual risk 4: "when stage 4/5 ships a delete route, charge tombstones the way receipts are
 * charged so the cap keeps meaning what it says"). A tombstone row is strictly smaller than a
 * receipt row (four columns to six, one secondary index to two), so this measured worst case
 * over-charges it — the safe direction — and the same "one number cannot drift" rule that put
 * the receipt size here forbids measuring a near-identical second one on a different day.
 *
 * It closes no unbounded hole either way: the tombstone insert is an upsert keyed on
 * `(owner_id, document_id)`, so re-deleting one id adds no rows, and reaching a fresh id means
 * creating it first, which costs a charged receipt. It makes the cap mean what it says on disk.
 */
export const RECEIPT_COST_BYTES = 768;

/**
 * The owner's current storage footprint: documents held, and the bytes their bodies plus their
 * retained receipts and tombstones occupy. One statement per table, each covered by an owner
 * index, so the Save transaction can afford to ask on every write (#1234, extended by #1250 and
 * #1260).
 *
 * `bytes` is the TOTAL — it is what `MAX_BYTES_PER_OWNER` bounds, and the breakdown is returned
 * alongside so a caller (and a test) can see which part is which. Before #1250 this returned the
 * document part alone and called it the footprint, which is how the receipt table came to be
 * unbounded.
 *
 * `length()` on TEXT counts CHARACTERS, which would let a body of astral-plane characters occupy
 * up to four times the bytes it appears to. Casting to BLOB first counts the UTF-8 bytes SQLite
 * actually stores, which is the same unit `Buffer.byteLength` gives the caller for the incoming
 * body — the two sides of the quota arithmetic must measure the same thing.
 */
export function readOwnerUsage(
    db: DatabaseSync,
    ownerId: string,
): {
    documents: number;
    documentBytes: number;
    receipts: number;
    receiptBytes: number;
    tombstones: number;
    tombstoneBytes: number;
    bytes: number;
} {
    const documentRow = db
        .prepare(
            `SELECT COUNT(*) AS documents, COALESCE(SUM(length(CAST(body AS BLOB))), 0) AS bytes
             FROM documents WHERE owner_id = ?`,
        )
        .get(ownerId) as { documents: number; bytes: number };
    const receiptRow = db
        .prepare('SELECT COUNT(*) AS receipts FROM receipts WHERE owner_id = ?')
        .get(ownerId) as { receipts: number };
    const tombstoneRow = db
        .prepare('SELECT COUNT(*) AS tombstones FROM tombstones WHERE owner_id = ?')
        .get(ownerId) as { tombstones: number };
    const receiptBytes = receiptRow.receipts * RECEIPT_COST_BYTES;
    // Tombstones are charged at the receipt's rate, by the receipt's constant — see it for why.
    const tombstoneBytes = tombstoneRow.tombstones * RECEIPT_COST_BYTES;
    return {
        documents: documentRow.documents,
        documentBytes: documentRow.bytes,
        receipts: receiptRow.receipts,
        receiptBytes,
        tombstones: tombstoneRow.tombstones,
        tombstoneBytes,
        bytes: documentRow.bytes + receiptBytes + tombstoneBytes,
    };
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
 * owner never had). The caller wraps this in a transaction with its revision check — that caller
 * is `commitDelete` in `db/document-delete.ts` (#1260).
 *
 * The tombstone carries the revision the document DIED at (`current.revision`), not a freshly
 * minted one: it is the last revision that ever existed for that id, which is what
 * `commitSave`'s non-resurrection check answers a stale client with. That is a revision the
 * client would RECOGNISE only when it was current at the moment of deletion — it is not a
 * guarantee in general. A client holding rev-1 after a second device saved rev-2 and then
 * deleted the id gets back `conflict rev-2, remote: null`: rev-2 is a revision the first client
 * never saw. #1270's client must not build recognition logic on this value; the only thing it
 * can safely do with it is record it as the id's terminal revision.
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
