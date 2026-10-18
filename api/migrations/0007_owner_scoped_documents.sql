-- Stage 3, story 1 (#1201): the owner-bound document store the revision API
-- (#1202) commits into. Record shapes follow docs/design/ensemble-v2-sync.md
-- "Ownership and storage": every row is keyed by the AUTHENTICATED owner and
-- the query layer (src/db/documents.ts) folds owner_id into every WHERE —
-- there is deliberately no bare read-by-id anywhere.
--
-- Conventions as 0001_init.sql: app-minted TEXT ids (documentId/operationId
-- are minted by the client and namespaced by owner, never global), epoch-ms
-- INTEGER timestamps, an explicit index on every FK column used in a WHERE.

-- One row per (owner, document): the current committed revision and body.
-- `revision` is the opaque server revision the client echoes back as its
-- expected base on the next Save (protocol step 4: "updating requires the
-- exact server revision"). `body` is the readable ChartDocument JSON
-- (DECISION 2026-09-10: cleartext, never an opaque blob).
CREATE TABLE documents (
    owner_id TEXT NOT NULL REFERENCES accounts (id),
    document_id TEXT NOT NULL,
    revision TEXT NOT NULL,
    body TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (owner_id, document_id)
);
CREATE INDEX idx_documents_owner_id ON documents (owner_id);
CREATE INDEX idx_documents_owner_updated ON documents (owner_id, updated_at);

-- One row per (owner, Save operation): what was asked and what it produced.
-- The digest is over the frozen wire request; a retry with the same operation
-- id and digest replays `result_revision`, a different digest is rejected
-- (protocol step 4). Retained for the account lifetime — never expired, so an
-- old offline retry can never become a new write.
CREATE TABLE receipts (
    owner_id TEXT NOT NULL REFERENCES accounts (id),
    operation_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    result_revision TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (owner_id, operation_id)
);
CREATE INDEX idx_receipts_owner_id ON receipts (owner_id);
CREATE INDEX idx_receipts_owner_document ON receipts (owner_id, document_id);

-- A deleted document leaves its identity behind so an old device cannot
-- recreate the same id (protocol step 4: "creating requires absence and no
-- tombstone"). `revision` is the last committed revision at deletion.
CREATE TABLE tombstones (
    owner_id TEXT NOT NULL REFERENCES accounts (id),
    document_id TEXT NOT NULL,
    revision TEXT NOT NULL,
    deleted_at INTEGER NOT NULL,
    PRIMARY KEY (owner_id, document_id)
);
CREATE INDEX idx_tombstones_owner_id ON tombstones (owner_id);
