import { afterEach, describe, expect, it } from 'vitest';
import { deleteDocument, readDocument, readReceipt } from '../../src/db/documents.js';
import { commitSave, mintRevision, type SaveCommand } from '../../src/db/save.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * #1202 protocol step 4 on a real disposable database. The HTTP suite proves the route; this
 * suite proves the transaction's decision table in isolation, with deterministic revisions.
 */
describe('commitSave (#1202)', () => {
    let testDb: TestDatabase | undefined;
    afterEach(() => {
        testDb?.cleanup();
        testDb = undefined;
    });

    let counter = 0;
    const mint = () => `rev-${++counter}`;
    const deps = { mintRevision: mint };

    function setUp() {
        counter = 0;
        testDb = createTestDatabase();
        testDb.db.exec(
            "INSERT INTO accounts (id, created_at) VALUES ('owner-a', 1), ('owner-b', 1)",
        );
        return testDb.db;
    }

    function command(overrides: Partial<SaveCommand> = {}): SaveCommand {
        return {
            ownerId: 'owner-a',
            documentId: 'doc-1',
            operationId: 'op-1',
            digest: 'sha256:aaa',
            expectedRevision: null,
            body: '{"title":"one"}',
            now: 1000,
            ...overrides,
        };
    }

    it('a fresh create commits, writes the row and records the receipt atomically', () => {
        const db = setUp();
        expect(commitSave(db, command(), deps)).toEqual({
            kind: 'committed',
            revision: 'rev-1',
            replayed: false,
        });
        expect(readDocument(db, 'owner-a', 'doc-1')).toEqual({
            ownerId: 'owner-a',
            documentId: 'doc-1',
            revision: 'rev-1',
            body: '{"title":"one"}',
            updatedAt: 1000,
        });
        expect(readReceipt(db, 'owner-a', 'op-1')).toMatchObject({
            documentId: 'doc-1',
            requestDigest: 'sha256:aaa',
            resultRevision: 'rev-1',
            createdAt: 1000,
        });
    });

    it('replaying the same operation id and bytes returns the original result without a second write', () => {
        const db = setUp();
        commitSave(db, command(), deps);
        // A later, otherwise-valid replay: the document has moved on, the body differs from
        // what is stored now — none of that matters, the receipt answers.
        commitSave(
            db,
            command({
                operationId: 'op-2',
                expectedRevision: 'rev-1',
                body: '{"title":"two"}',
                digest: 'sha256:bbb',
                now: 2000,
            }),
            deps,
        );
        expect(commitSave(db, command({ now: 3000 }), deps)).toEqual({
            kind: 'committed',
            revision: 'rev-1',
            replayed: true,
        });
        expect(readDocument(db, 'owner-a', 'doc-1')).toMatchObject({
            revision: 'rev-2',
            body: '{"title":"two"}',
            updatedAt: 2000,
        });
        expect(counter).toBe(2);
    });

    it('the same operation id with different bytes (or another document) is rejected, never applied', () => {
        const db = setUp();
        commitSave(db, command(), deps);
        expect(
            commitSave(db, command({ digest: 'sha256:zzz', body: '{"title":"tampered"}' }), deps),
        ).toEqual({ kind: 'operation_mismatch' });
        expect(commitSave(db, command({ documentId: 'doc-9' }), deps)).toEqual({
            kind: 'operation_mismatch',
        });
        expect(readDocument(db, 'owner-a', 'doc-1')?.body).toBe('{"title":"one"}');
        expect(readDocument(db, 'owner-a', 'doc-9')).toBeUndefined();
    });

    it('an update commits only against the exact current revision; a stale one conflicts with the current version preserved', () => {
        const db = setUp();
        commitSave(db, command(), deps); // rev-1
        commitSave(
            db,
            command({
                operationId: 'op-2',
                expectedRevision: 'rev-1',
                body: '{"title":"two"}',
                digest: 'sha256:bbb',
                now: 2000,
            }),
            deps,
        ); // rev-2
        const stale = commitSave(
            db,
            command({
                operationId: 'op-3',
                expectedRevision: 'rev-1',
                body: '{"title":"three"}',
                digest: 'sha256:ccc',
                now: 3000,
            }),
            deps,
        );
        expect(stale).toEqual({
            kind: 'conflict',
            revision: 'rev-2',
            remote: { revision: 'rev-2', body: '{"title":"two"}' },
        });
        // Nothing moved: no write, no receipt, no revision minted.
        expect(readDocument(db, 'owner-a', 'doc-1')).toMatchObject({
            revision: 'rev-2',
            body: '{"title":"two"}',
        });
        expect(readReceipt(db, 'owner-a', 'op-3')).toBeUndefined();
        expect(counter).toBe(2);
        // The frozen request, retried later, gets the same answer (no receipt needed).
        expect(
            commitSave(
                db,
                command({
                    operationId: 'op-3',
                    expectedRevision: 'rev-1',
                    body: '{"title":"three"}',
                    digest: 'sha256:ccc',
                    now: 4000,
                }),
                deps,
            ),
        ).toEqual(stale);
    });

    it('creating over an existing document conflicts with that document', () => {
        const db = setUp();
        commitSave(db, command(), deps);
        expect(
            commitSave(
                db,
                command({ operationId: 'op-2', digest: 'sha256:bbb', body: '{"title":"dup"}' }),
                deps,
            ),
        ).toEqual({
            kind: 'conflict',
            revision: 'rev-1',
            remote: { revision: 'rev-1', body: '{"title":"one"}' },
        });
    });

    it('a tombstoned id is never resurrected: create and update both conflict with remote null', () => {
        const db = setUp();
        commitSave(db, command(), deps);
        expect(deleteDocument(db, 'owner-a', 'doc-1', 1500)).toBe(true);
        expect(
            commitSave(db, command({ operationId: 'op-2', digest: 'sha256:bbb' }), deps),
        ).toEqual({
            kind: 'conflict',
            revision: 'rev-1',
            remote: null,
        });
        expect(
            commitSave(
                db,
                command({ operationId: 'op-3', digest: 'sha256:ccc', expectedRevision: 'rev-1' }),
                deps,
            ),
        ).toEqual({
            kind: 'conflict',
            revision: 'rev-1',
            remote: null,
        });
        expect(readDocument(db, 'owner-a', 'doc-1')).toBeUndefined();
    });

    it("updating a document the owner never had conflicts with remote null and the caller's own revision", () => {
        const db = setUp();
        expect(commitSave(db, command({ expectedRevision: 'rev-ghost' }), deps)).toEqual({
            kind: 'conflict',
            revision: 'rev-ghost',
            remote: null,
        });
    });

    it('owners are isolated: the same document and operation ids under another owner are unrelated', () => {
        const db = setUp();
        commitSave(db, command(), deps);
        // Same ids, other owner: a fresh create, not a replay and not a conflict.
        expect(
            commitSave(
                db,
                command({ ownerId: 'owner-b', digest: 'sha256:bbb', body: '{"title":"b"}' }),
                deps,
            ),
        ).toEqual({
            kind: 'committed',
            revision: 'rev-2',
            replayed: false,
        });
        expect(readDocument(db, 'owner-a', 'doc-1')?.body).toBe('{"title":"one"}');
        expect(readDocument(db, 'owner-b', 'doc-1')?.body).toBe('{"title":"b"}');
    });

    it('a failure after the document write rolls the write back too', () => {
        const db = setUp();
        // Make the receipt insert (the LAST statement) fail, so the document write before it
        // must be undone by the transaction, not left behind as a receipt-less commit.
        db.exec(
            "CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'boom'); END",
        );
        expect(() => commitSave(db, command(), deps)).toThrow(/boom/);
        expect(readDocument(db, 'owner-a', 'doc-1')).toBeUndefined();
        expect(readReceipt(db, 'owner-a', 'op-1')).toBeUndefined();
        db.exec('DROP TRIGGER fail_receipt');
        // And the connection is usable again: no leaked open transaction.
        expect(commitSave(db, command(), deps)).toMatchObject({
            kind: 'committed',
            replayed: false,
        });
    });

    it("minted revisions satisfy the client's remoteRevision grammar", () => {
        for (let i = 0; i < 20; i += 1) {
            expect(mintRevision()).toMatch(/^[A-Za-z0-9._:-]{1,200}$/);
        }
    });
});
