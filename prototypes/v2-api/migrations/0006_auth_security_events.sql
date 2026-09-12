-- #1192 audit gap: metadata only, no request/response/exception serialization column.
-- No FK: records survive credential revocation; account deletion explicitly wipes its events.
CREATE TABLE auth_security_events (
    id INTEGER PRIMARY KEY,
    created_at INTEGER NOT NULL,
    event TEXT NOT NULL,
    account_id TEXT,
    credential_id TEXT,
    error_name TEXT,
    error_code TEXT,
    message TEXT,
    cause TEXT
);
CREATE INDEX idx_auth_security_events_account_id ON auth_security_events (account_id);
CREATE INDEX idx_auth_security_events_created_at ON auth_security_events (created_at);
