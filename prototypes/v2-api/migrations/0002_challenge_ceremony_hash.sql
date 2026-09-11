-- #1188: ceremony binding without a session (orchestrator decision 3/4). Registration and
-- login "start" calls mint a random ceremony token, returned only to the caller; the challenge
-- row stores just its SHA-256 hex digest. Verification claims (atomically consumes) the row by
-- this hash via one `DELETE ... RETURNING *` — see src/auth/challenges.ts's claimChallenge.
--
-- Added as a plain column plus a separate UNIQUE index, not `... TEXT NOT NULL UNIQUE` inline,
-- because SQLite's ALTER TABLE ADD COLUMN rejects a UNIQUE column constraint outright
-- (verified: "Cannot add a UNIQUE column"). The two statements together give the same
-- guarantee. NOT NULL with no DEFAULT is fine here because ALTER TABLE ADD COLUMN only allows
-- that against a table with no existing rows, which is exactly the state `challenges` is in
-- every time this migration actually runs (a fresh database, applied in filename order).
ALTER TABLE challenges ADD COLUMN ceremony_hash TEXT NOT NULL;

CREATE UNIQUE INDEX idx_challenges_ceremony_hash ON challenges (ceremony_hash);
