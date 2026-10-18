-- Stage-2 skeleton schema (#1187). No ceremony, session or recovery LOGIC
-- lands in this story — these tables are the substrate #1188-#1191 build on.
--
-- Conventions carried from ../songsiknow (see docs/design/ensemble-v2-sync.md
-- reuse table) and prototypes/v2/CLAUDE.md's "Schema" section:
--   * App-minted TEXT primary keys, never AUTOINCREMENT — avoids rowid reuse
--     interacting badly with cascades and tombstones.
--   * Epoch-millisecond INTEGER timestamps, never SQLite TEXT datetimes.
--   * An explicit index on every foreign-key column used in a WHERE — SQLite
--     does not auto-index them.

CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
);

-- One row per registered WebAuthn credential. The credential ID itself is
-- the primary key (not a separately minted id) per the reuse assessment.
CREATE TABLE credentials (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id),
    public_key BLOB NOT NULL,
    -- Signature counter for clone detection; ceremonies write this, not this story.
    sign_count INTEGER NOT NULL DEFAULT 0,
    -- JSON-encoded array of AuthenticatorTransport hints, e.g. '["internal"]'. Nullable:
    -- not every authenticator reports transports.
    transports TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
);

CREATE INDEX idx_credentials_account_id ON credentials (account_id);

-- A registration or login ceremony's server-issued challenge.
-- account_id is nullable and deliberately carries NO foreign key: a
-- registration challenge legitimately predates any account row existing.
CREATE TABLE challenges (
    id TEXT PRIMARY KEY,
    account_id TEXT,
    challenge TEXT NOT NULL,
    -- 'registration' | 'login' — not SQL-enforced; ceremony code (#1188) owns validation.
    type TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

-- Not a foreign key (see above), but still filtered on in ceremony lookups,
-- so it still needs an explicit index.
CREATE INDEX idx_challenges_account_id ON challenges (account_id);

-- Hashed, revocable sessions (#1189 designs the session model; this table is
-- only the storage shape).
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
);

CREATE INDEX idx_sessions_account_id ON sessions (account_id);

-- Single-use recovery codes (#1191 designs enrollment/claim/consumption;
-- this table is only the storage shape). Never stores the plaintext code.
CREATE TABLE recovery_codes (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id),
    code_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    consumed_at INTEGER
);

CREATE INDEX idx_recovery_codes_account_id ON recovery_codes (account_id);
