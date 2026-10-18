-- Two syntactically VALID statements where the second fails at RUNTIME
-- (table already exists), not at parse time. sqlite3_exec runs in
-- autocommit mode by default, so without an explicit transaction wrapping
-- the whole file, the first CREATE TABLE would already be committed by the
-- time the second one throws. This fixture exists specifically to catch
-- that gap: it proves runMigrations rolls back a statement that already
-- succeeded earlier in the SAME file, not just "the last statement never ran".
CREATE TABLE partial_check (id TEXT PRIMARY KEY);
CREATE TABLE partial_check (id TEXT PRIMARY KEY);
