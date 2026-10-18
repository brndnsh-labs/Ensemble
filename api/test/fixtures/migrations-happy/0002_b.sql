CREATE TABLE gadgets (
    id TEXT PRIMARY KEY,
    widget_id TEXT NOT NULL REFERENCES widgets (id),
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_gadgets_widget_id ON gadgets (widget_id);
