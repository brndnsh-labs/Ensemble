CREATE TABLE broken_table (
    id TEXT PRIMARY KEY,
    -- Deliberately invalid SQL (unterminated/unknown syntax) so runMigrations
    -- throws mid-migration and the test can assert it rolls back atomically
    -- and leaves this file unmarked and re-runnable.
    THIS IS NOT VALID SQL (((
);
