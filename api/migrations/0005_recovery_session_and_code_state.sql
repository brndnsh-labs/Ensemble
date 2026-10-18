-- #1191: recovery-code lifecycle state and the restricted recovery-only session.

-- sessions.purpose: 'standard' (every session minted by register/login/reauth/passkey-add — i.e.
-- everything today) or 'recovery' (minted only by a successful recovery-code claim). A
-- 'recovery' session is refused by every existing session-reading route (requireSession, updated
-- below) and accepted ONLY by the two new recovery-enroll-passkey routes (requireRecoverySession).
-- This is the enforcement mechanism for "a recovery code authorizes enrolling a passkey and
-- nothing else" — not a side effect of which routes happen to check isFreshlyAuthenticated.
ALTER TABLE sessions ADD COLUMN purpose TEXT NOT NULL DEFAULT 'standard';

-- sessions.recovery_code_id: which recovery_codes row THIS session is authorized to consume.
-- Set only when purpose='recovery'; NULL for every standard session. Explicit rather than
-- inferred (e.g. "the one claimed-but-unconsumed row for this account") so the final commit in
-- verifyRecoveryEnrollPasskey can target the exact row unambiguously — no implicit lookup, no
-- assumption that only one claimed row can exist per account at a time.
ALTER TABLE sessions ADD COLUMN recovery_code_id TEXT REFERENCES recovery_codes (id) ON DELETE SET NULL;

-- recovery_codes.confirmed_at: set only when the account holder has proven possession of the
-- code by presenting it back to /api/auth/recovery/confirm. An unconfirmed code is NOT usable
-- recovery material (hasEnrolledRecoveryMaterial, below, requires this) and is NOT claimable
-- (claimRecoveryCode requires this) — matching the issue's "must not be reported as recovery
-- being set up" until confirmed.
ALTER TABLE recovery_codes ADD COLUMN confirmed_at INTEGER;

-- recovery_codes.claimed_at: set by claimRecoveryCode when a recovery-only session is minted for
-- this code, cleared logically (not physically — see below) once the claim window
-- (RECOVERY_SESSION_TTL_MS) elapses without the enrollment completing. This is the exclusivity
-- lock that makes "two simultaneous recovery attempts produce exactly one restricted session" —
-- see claimRecoveryCode's doc comment for the single-statement UPDATE...RETURNING that enforces
-- it without a TOCTOU window, the same reasoning challenges.ts's claimChallenge already documents
-- for node:sqlite's synchronous, single-threaded execution model.
ALTER TABLE recovery_codes ADD COLUMN claimed_at INTEGER;

-- Claim and consumption both look a code up by its hash alone (the caller has no account
-- context) — this index makes that lookup indexed instead of a full table scan, and UNIQUE
-- matches the existing idx_challenges_ceremony_hash / idx_sessions_token_hash precedent for a
-- hash column (a collision here is cryptographically negligible, not a real constraint the app
-- needs to handle, but the index shape is free and consistent).
CREATE UNIQUE INDEX idx_recovery_codes_code_hash ON recovery_codes (code_hash);
