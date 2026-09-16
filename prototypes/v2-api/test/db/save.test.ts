import { afterEach, describe, expect, it } from 'vitest';
import {
    deleteDocument,
    readDocument,
    readOwnerUsage,
    readReceipt,
} from '../../src/db/documents.js';
import {
    commitSave,
    MAX_BYTES_PER_OWNER,
    MAX_DOCUMENTS_PER_OWNER,
    mintRevision,
    type SaveCommand,
    type SaveDependencies,
} from '../../src/db/save.js';
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

    /**
     * #1234. Every case here is the SEQUENTIAL decision at a boundary; the same quota raced by
     * two processes is proven separately in save-concurrency.test.ts (#1247), and a quota read
     * hoisted out of the transaction passes this whole block — that mutation is only visible
     * under concurrency, which is why both suites exist.
     *
     * Most cases lower the caps through `SaveDependencies` rather than seeding up to the
     * shipped ones: what is under test is the arithmetic at the boundary, and reaching the real
     * byte cap means pushing 256 MiB through the database per case (measured: ~4.2s across this
     * block before #1247 made the caps injectable). The FIRST test below is the exception and
     * must stay at full scale — it is the only thing proving the defaults are still the shipped
     * constants, which is what production actually runs.
     */
    describe('per-owner storage quota (#1234)', () => {
        /** Small enough to reach in a test, large enough that the arithmetic is not degenerate. */
        const BYTE_CAP = 1_024;
        const DOCUMENT_CAP = 3;
        const capped = (caps: Partial<SaveDependencies>) => ({ ...deps, ...caps });

        function seedDocuments(db: ReturnType<typeof setUp>, owner: string, count: number) {
            const insert = db.prepare(
                'INSERT INTO documents (owner_id, document_id, revision, body, updated_at)' +
                    ' VALUES (?, ?, ?, ?, 1)',
            );
            for (let i = 0; i < count; i += 1) {
                insert.run(owner, `seed-${i}`, `seed-rev-${i}`, '{}');
            }
        }

        function seedBody(db: ReturnType<typeof setUp>, documentId: string, body: string) {
            db.prepare(
                'INSERT INTO documents (owner_id, document_id, revision, body, updated_at)' +
                    ' VALUES (?, ?, ?, ?, 1)',
            ).run('owner-a', documentId, `${documentId}-rev`, body);
        }

        it('enforces the SHIPPED caps when nothing is injected', () => {
            const db = setUp();
            // Injecting a cap is a test affordance (#1247); forgetting to inject one must not
            // quietly relax the gate. Both defaults, at full scale, in the one place that pays
            // the cost of proving it.
            seedDocuments(db, 'owner-a', MAX_DOCUMENTS_PER_OWNER);
            expect(commitSave(db, command(), deps)).toEqual({
                kind: 'quota_exceeded',
                limit: 'documents',
                usage: MAX_DOCUMENTS_PER_OWNER,
                cap: MAX_DOCUMENTS_PER_OWNER,
            });
            expect(readDocument(db, 'owner-a', 'doc-1')).toBeUndefined();
            expect(readReceipt(db, 'owner-a', 'op-1')).toBeUndefined();

            const spacious = setUp();
            seedBody(spacious, 'fill', 'x'.repeat(MAX_BYTES_PER_OWNER - 16));
            expect(commitSave(spacious, command({ body: 'y'.repeat(16) }), deps)).toMatchObject({
                kind: 'committed',
            });
            expect(readOwnerUsage(spacious, 'owner-a').bytes).toBe(MAX_BYTES_PER_OWNER);
            expect(
                commitSave(
                    spacious,
                    command({ documentId: 'doc-2', operationId: 'op-2', body: 'z' }),
                    deps,
                ),
            ).toMatchObject({ kind: 'quota_exceeded', limit: 'bytes', cap: MAX_BYTES_PER_OWNER });
        });

        it('refuses a CREATE at the document cap and writes nothing', () => {
            const db = setUp();
            seedDocuments(db, 'owner-a', DOCUMENT_CAP);
            expect(
                commitSave(db, command(), capped({ maxDocumentsPerOwner: DOCUMENT_CAP })),
            ).toEqual({
                kind: 'quota_exceeded',
                limit: 'documents',
                usage: DOCUMENT_CAP,
                cap: DOCUMENT_CAP,
            });
            expect(readDocument(db, 'owner-a', 'doc-1')).toBeUndefined();
            expect(readReceipt(db, 'owner-a', 'op-1')).toBeUndefined();
        });

        it('allows an UPDATE at the document cap — the count does not change', () => {
            const db = setUp();
            const quota = capped({ maxDocumentsPerOwner: DOCUMENT_CAP });
            seedDocuments(db, 'owner-a', DOCUMENT_CAP - 1);
            expect(commitSave(db, command(), quota)).toMatchObject({ kind: 'committed' });
            expect(readOwnerUsage(db, 'owner-a').documents).toBe(DOCUMENT_CAP);
            expect(
                commitSave(
                    db,
                    command({ operationId: 'op-2', expectedRevision: 'rev-1', body: '{"t":"2"}' }),
                    quota,
                ),
            ).toMatchObject({ kind: 'committed', replayed: false });
        });

        it("one owner's documents do not count against another's cap", () => {
            const db = setUp();
            seedDocuments(db, 'owner-b', DOCUMENT_CAP);
            expect(
                commitSave(
                    db,
                    command({ ownerId: 'owner-a' }),
                    capped({ maxDocumentsPerOwner: DOCUMENT_CAP }),
                ),
            ).toMatchObject({ kind: 'committed' });
        });

        it('refuses a write that crosses the byte cap and allows a smaller one', () => {
            const db = setUp();
            const quota = capped({ maxBytesPerOwner: BYTE_CAP });
            const near = BYTE_CAP - 128;
            seedBody(db, 'big', 'x'.repeat(near));
            expect(readOwnerUsage(db, 'owner-a').bytes).toBe(near);

            expect(commitSave(db, command({ body: 'y'.repeat(256) }), quota)).toEqual({
                kind: 'quota_exceeded',
                limit: 'bytes',
                usage: near,
                cap: BYTE_CAP,
            });
            expect(readDocument(db, 'owner-a', 'doc-1')).toBeUndefined();

            expect(
                commitSave(db, command({ operationId: 'op-3', body: 'y'.repeat(64) }), quota),
            ).toMatchObject({ kind: 'committed' });
        });

        it('allows a write landing exactly ON the byte cap, and refuses one byte more', () => {
            const db = setUp();
            const quota = capped({ maxBytesPerOwner: BYTE_CAP });
            // Brackets the comparison itself: `>` vs `>=` is the off-by-one that a guard
            // tested only well inside the boundary would never catch.
            seedBody(db, 'fill', 'x'.repeat(BYTE_CAP - 16));
            expect(commitSave(db, command({ body: 'y'.repeat(16) }), quota)).toMatchObject({
                kind: 'committed',
            });
            expect(readOwnerUsage(db, 'owner-a').bytes).toBe(BYTE_CAP);

            expect(
                commitSave(
                    db,
                    command({ documentId: 'doc-2', operationId: 'op-2', body: 'z' }),
                    quota,
                ),
            ).toMatchObject({ kind: 'quota_exceeded', limit: 'bytes' });
        });

        it('allows a small shrink that leaves the owner still over the cap', () => {
            const db = setUp();
            const over = BYTE_CAP + 512;
            seedBody(db, 'doc-1', 'x'.repeat(over));
            // The point of the escape hatch is that progress is allowed while STILL over the
            // cap. Shrinking all the way under in one step would pass even without it.
            expect(
                commitSave(
                    db,
                    command({ expectedRevision: 'doc-1-rev', body: 'x'.repeat(over - 100) }),
                    capped({ maxBytesPerOwner: BYTE_CAP }),
                ),
            ).toMatchObject({ kind: 'committed' });
            expect(readOwnerUsage(db, 'owner-a').bytes).toBe(over - 100);
        });

        it('allows an equal-size replacement while over the cap', () => {
            const db = setUp();
            const over = BYTE_CAP + 512;
            seedBody(db, 'doc-1', 'x'.repeat(over));
            expect(
                commitSave(
                    db,
                    command({ expectedRevision: 'doc-1-rev', body: 'y'.repeat(over) }),
                    capped({ maxBytesPerOwner: BYTE_CAP }),
                ),
            ).toMatchObject({ kind: 'committed' });
        });

        it('counts UTF-8 bytes, not characters, on both sides of the arithmetic', () => {
            const db = setUp();
            // Four bytes each; `length()` on TEXT would report half as many code units.
            const body = '𝄞'.repeat(16);
            expect(commitSave(db, command({ body }), deps)).toMatchObject({ kind: 'committed' });
            expect(readOwnerUsage(db, 'owner-a').bytes).toBe(Buffer.byteLength(body, 'utf8'));

            // And the cap compares against those bytes: 64 of them does not fit under 32,
            // which a character count (16) would wrongly wave through.
            expect(
                commitSave(
                    db,
                    command({ documentId: 'doc-2', operationId: 'op-2', body }),
                    capped({ maxBytesPerOwner: 32 }),
                ),
            ).toMatchObject({ kind: 'quota_exceeded', limit: 'bytes' });
        });

        it('never refuses a write that shrinks the footprint, even from over the cap', () => {
            const db = setUp();
            // Over the cap already — as it would be if the cap were lowered under an account.
            seedBody(db, 'doc-1', 'x'.repeat(BYTE_CAP + 512));
            expect(
                commitSave(
                    db,
                    command({ expectedRevision: 'doc-1-rev', body: '{"t":"small"}' }),
                    capped({ maxBytesPerOwner: BYTE_CAP }),
                ),
            ).toMatchObject({ kind: 'committed' });
            expect(readOwnerUsage(db, 'owner-a').bytes).toBe(13);
        });

        it('replays a committed receipt even once the owner is over the cap', () => {
            const db = setUp();
            const quota = capped({ maxDocumentsPerOwner: DOCUMENT_CAP });
            expect(commitSave(db, command(), quota)).toMatchObject({
                kind: 'committed',
                revision: 'rev-1',
                replayed: false,
            });
            seedDocuments(db, 'owner-a', DOCUMENT_CAP);
            // The write already happened; a retry of the same operation must not be refused.
            expect(commitSave(db, command(), quota)).toEqual({
                kind: 'committed',
                revision: 'rev-1',
                replayed: true,
            });
        });

        it('answers a stale revision with conflict, not quota, so the owner can resolve it', () => {
            const db = setUp();
            const quota = capped({ maxDocumentsPerOwner: DOCUMENT_CAP });
            expect(commitSave(db, command(), quota)).toMatchObject({ kind: 'committed' });
            seedDocuments(db, 'owner-a', DOCUMENT_CAP);
            const outcome = commitSave(
                db,
                command({ operationId: 'op-9', expectedRevision: 'rev-wrong' }),
                quota,
            );
            expect(outcome).toMatchObject({ kind: 'conflict', revision: 'rev-1' });
        });
    });
});
