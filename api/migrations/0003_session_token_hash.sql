-- #1189: session token model (orchestrator decision 1). A session is looked up by hashing the
-- presented token, never by storing or comparing the raw value — the `sessions.id` primary key
-- (already in 0001) stays a separate random identifier used for owner-scoped revocation, so
-- revoking another session never needs its token.
--
-- Same ALTER-then-separate-UNIQUE-INDEX pattern as 0002_challenge_ceremony_hash.sql, for the
-- same reason: SQLite's ALTER TABLE ADD COLUMN rejects an inline UNIQUE constraint outright.
-- NOT NULL with no DEFAULT is fine here too — ADD COLUMN only allows that against a table with
-- no existing rows, which is exactly the state `sessions` is in every time this migration
-- actually runs (a fresh database, applied in filename order after 0001/0002).
ALTER TABLE sessions ADD COLUMN token_hash TEXT NOT NULL;

CREATE UNIQUE INDEX idx_sessions_token_hash ON sessions (token_hash);
