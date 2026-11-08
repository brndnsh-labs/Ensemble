import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

describe('schema', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('creates an explicit index on every foreign-key-shaped column used in a WHERE', () => {
        testDb = createTestDatabase();
        const indexes = testDb.db
            .prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'")
            .all() as unknown as { name: string; tbl_name: string }[];
        const indexNames = indexes.map((i) => i.name);

        expect(indexNames).toContain('idx_credentials_account_id');
        expect(indexNames).toContain('idx_challenges_account_id');
        expect(indexNames).toContain('idx_sessions_account_id');
        expect(indexNames).toContain('idx_recovery_codes_account_id');
        expect(indexNames).toContain('idx_challenges_ceremony_hash');
        expect(indexNames).toContain('idx_sessions_credential_id'); // #1190 migration 0004
        expect(indexNames).toContain('idx_documents_owner_id'); // #1201 migration 0007
        expect(indexNames).toContain('idx_receipts_owner_id');
        expect(indexNames).toContain('idx_tombstones_owner_id');
    });
});
