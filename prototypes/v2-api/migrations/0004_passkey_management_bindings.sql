-- #1190: passkey management (fresh-auth-gated add/revoke) and step-up re-authentication need
-- two new bindings on top of #1187-#1189's schema.
--
-- sessions.credential_id: which credential's ceremony created this session. Nullable — #1191's
-- recovery session has none — and that nullability is exactly what makes isFreshlyAuthenticated
-- (src/auth/fresh-auth.ts) fail safe for it: a session with no credential can never satisfy
-- "credential_id IS NOT NULL", so a recovery session is never "fresh" by this predicate alone.
-- ON DELETE SET NULL, not CASCADE: revokePasskey (src/auth/passkeys.ts) explicitly revokes
-- every session this credential created (sets revoked_at) in the SAME transaction, before it
-- deletes the credential row — the FK action is a safety net for the reference itself, not the
-- mechanism that ends those sessions. Verified on the installed node:sqlite (Node 26) with
-- foreign_keys=ON: `ALTER TABLE ... ADD COLUMN ... REFERENCES ... ON DELETE SET NULL` is
-- accepted, and the SET NULL action fires for real on a subsequent DELETE of the referenced row.
--
-- Same ALTER-then-separate-index pattern as 0002/0003 for consistency with this project's
-- migration style — SQLite's ALTER TABLE ADD COLUMN cannot add an inline index either way, only
-- an inline (non-UNIQUE) constraint, which is why this one line is enough for a plain, nullable,
-- foreign-keyed column (unlike 0002/0003's NOT NULL + separate UNIQUE INDEX split).
ALTER TABLE sessions ADD COLUMN credential_id TEXT REFERENCES credentials (id) ON DELETE SET NULL;

CREATE INDEX idx_sessions_credential_id ON sessions (credential_id);

-- challenges.session_id: which session a reauth or add_passkey ceremony is bound to
-- (orchestrator decisions 3-4). Nullable — a registration or login challenge (no session exists
-- yet, or none is required) never sets it. Deliberately no foreign key, matching
-- challenges.account_id's existing precedent (see 0001_init.sql): a challenge legitimately
-- outlives being "for" a session that could be revoked out from under it before the challenge
-- itself expires or is claimed, and the claim path re-validates the session at commit time via
-- isFreshlyAuthenticated, not via referential integrity. Not indexed: nothing queries challenges
-- by session_id — claimChallenge looks rows up by ceremony_hash only.
ALTER TABLE challenges ADD COLUMN session_id TEXT;
