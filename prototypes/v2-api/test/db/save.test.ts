import { afterEach, describe, expect, it } from 'vitest';
import {
    deleteDocument,
    RECEIPT_COST_BYTES,
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
    type SaveOutcome,
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
        // Also the server half of #1268's guest adoption: a second device adopting the same guest
        // song sends the SAME deterministic document id under a FRESH operation id, and this is
        // the answer that makes that safe — `conflict`, which the client's outbox handles, rather
        // than the `operation_mismatch` a deterministic operation id would have earned.
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

    it('a Save racing #1271 account deletion answers owner_gone, not a foreign-key crash', () => {
        const db = setUp();
        // Simulates the interleaving directly: the account row is gone (as #1271's transaction
        // leaves it) by the time this Save's transaction runs, without needing two real
        // transactions racing each other.
        db.exec("DELETE FROM accounts WHERE id = 'owner-a'");
        expect(commitSave(db, command(), deps)).toEqual({ kind: 'owner_gone' });
        // Nothing was written, and the connection is usable again: no leaked open transaction.
        expect(readDocument(db, 'owner-a', 'doc-1')).toBeUndefined();
        expect(readReceipt(db, 'owner-a', 'op-1')).toBeUndefined();
        db.exec("INSERT INTO accounts (id, created_at) VALUES ('owner-a', 1)");
        expect(commitSave(db, command(), deps)).toMatchObject({ kind: 'committed' });
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
        /**
         * Small enough to reach in a test, large enough that the arithmetic is not degenerate —
         * comfortably more than one `RECEIPT_COST_BYTES`, so "this write's receipt" is a term in
         * the arithmetic rather than the whole of it.
         */
        const BYTE_CAP = 8_192;
        const DOCUMENT_CAP = 3;
        const capped = (caps: Partial<SaveDependencies>) => ({ ...deps, ...caps });

        function seedDocuments(db: ReturnType<typeof setUp>, owner: string, count: number) {
            const insert = db.prepare(
                'INSERT INTO documents (owner_id, document_id, revision, body, updated_at)' +
                    ' VALUES (?, ?, ?, ?, 1)',
            );
            // One transaction, not `count` autocommits: at the shipped 2,000-document cap each
            // autocommit is its own WAL sync, which measured 6.9s on a good CI runner and 16.5s
            // on a slow one — past the 10s test timeout, for seeding that proves nothing itself.
            db.exec('BEGIN');
            for (let i = 0; i < count; i += 1) {
                insert.run(owner, `seed-${i}`, `seed-rev-${i}`, '{}');
            }
            db.exec('COMMIT');
        }

        function seedBody(
            db: ReturnType<typeof setUp>,
            owner: string,
            documentId: string,
            body: string,
        ) {
            db.prepare(
                'INSERT INTO documents (owner_id, document_id, revision, body, updated_at)' +
                    ' VALUES (?, ?, ?, ?, 1)',
            ).run(owner, documentId, `${documentId}-rev`, body);
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

            // owner-b rather than a second database: usage is per owner, and a second `setUp()`
            // would leak the first temp file, since afterEach only cleans up the last one.
            // Leave room for the body AND the receipt it will leave behind, so this write lands
            // exactly ON the shipped cap.
            seedBody(
                db,
                'owner-b',
                'fill',
                'x'.repeat(MAX_BYTES_PER_OWNER - RECEIPT_COST_BYTES - 16),
            );
            const ownerB = { ownerId: 'owner-b', documentId: 'doc-b', operationId: 'op-b' };
            expect(
                commitSave(db, command({ ...ownerB, body: 'y'.repeat(16) }), deps),
            ).toMatchObject({ kind: 'committed' });
            expect(readOwnerUsage(db, 'owner-b').bytes).toBe(MAX_BYTES_PER_OWNER);
            expect(
                commitSave(
                    db,
                    command({ ...ownerB, documentId: 'doc-b2', operationId: 'op-b2', body: 'z' }),
                    deps,
                ),
            ).toMatchObject({ kind: 'quota_exceeded', limit: 'bytes', cap: MAX_BYTES_PER_OWNER });
        });

        it('bounds re-saving ONE document with fresh operation ids (#1250)', () => {
            const db = setUp();
            // The regression this cap exists for. Before #1250 this loop never terminated: the
            // document count stayed 1, the body bytes stayed constant, and every iteration left
            // another permanent receipt, so 20,000 saves reported "1 document / 31 bytes" while
            // occupying 4.19 MiB on disk. The owner is not storing more songs and not storing
            // bigger songs — they are storing more RECEIPTS, and those are what the quota was
            // blind to.
            const quota = capped({ maxBytesPerOwner: BYTE_CAP });
            const body = '{"title":"one"}';
            let revision: string | null = null;
            let committed = 0;
            let refusal: SaveOutcome | undefined;
            for (let i = 0; i < 100; i += 1) {
                const outcome = commitSave(
                    db,
                    command({ operationId: `op-${i}`, expectedRevision: revision, body }),
                    quota,
                );
                if (outcome.kind === 'quota_exceeded') {
                    refusal = outcome;
                    break;
                }
                expect(outcome).toMatchObject({ kind: 'committed' });
                revision = (outcome as Extract<SaveOutcome, { kind: 'committed' }>).revision;
                committed += 1;
            }

            expect(refusal, 'the re-save loop must terminate, not run to 100').toMatchObject({
                limit: 'bytes',
                cap: BYTE_CAP,
            });
            // 8,192 / 768 = 10 receipts of headroom, minus the body.
            expect(committed).toBe(10);
            const usage = readOwnerUsage(db, 'owner-a');
            expect(usage.documents).toBe(1);
            expect(usage.receipts).toBe(committed);
            expect(usage.bytes).toBeLessThanOrEqual(BYTE_CAP);
            // The point in one line: the document half barely moved, the receipt half is what
            // filled the budget.
            expect(usage.documentBytes).toBe(15);
            expect(usage.receiptBytes).toBe(committed * RECEIPT_COST_BYTES);
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
            const near = BYTE_CAP - 1_024;
            seedBody(db, 'owner-a', 'big', 'x'.repeat(near));
            expect(readOwnerUsage(db, 'owner-a').bytes).toBe(near);

            // 512 + 768 = 1,280 of headroom needed against 1,024 available.
            expect(commitSave(db, command({ body: 'y'.repeat(512) }), quota)).toEqual({
                kind: 'quota_exceeded',
                limit: 'bytes',
                usage: near,
                cap: BYTE_CAP,
            });
            expect(readDocument(db, 'owner-a', 'doc-1')).toBeUndefined();

            // 128 + 768 = 896 fits.
            expect(
                commitSave(db, command({ operationId: 'op-3', body: 'y'.repeat(128) }), quota),
            ).toMatchObject({ kind: 'committed' });
        });

        it('allows a write landing exactly ON the byte cap, and refuses one byte more', () => {
            const db = setUp();
            const quota = capped({ maxBytesPerOwner: BYTE_CAP });
            // Brackets the comparison itself: `>` vs `>=` is the off-by-one that a guard
            // tested only well inside the boundary would never catch.
            seedBody(db, 'owner-a', 'fill', 'x'.repeat(BYTE_CAP - RECEIPT_COST_BYTES - 16));
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

        it('allows a shrink that gives back more than its receipt costs, still over the cap', () => {
            const db = setUp();
            const over = BYTE_CAP + 4_096;
            seedBody(db, 'owner-a', 'doc-1', 'x'.repeat(over));
            // The point of the escape hatch is that progress is allowed while STILL over the
            // cap. Shrinking all the way under in one step would pass even without it.
            expect(
                commitSave(
                    db,
                    command({ expectedRevision: 'doc-1-rev', body: 'x'.repeat(over - 2_048) }),
                    capped({ maxBytesPerOwner: BYTE_CAP }),
                ),
            ).toMatchObject({ kind: 'committed' });
            // Gave back 2,048 bytes of body, paid 768 for the receipt: net 1,280 smaller.
            expect(readOwnerUsage(db, 'owner-a').bytes).toBe(over - 2_048 + RECEIPT_COST_BYTES);
        });

        it('refuses a shrink too small to pay for its own receipt while over the cap', () => {
            const db = setUp();
            const over = BYTE_CAP + 4_096;
            seedBody(db, 'owner-a', 'doc-1', 'x'.repeat(over));
            // Brackets the growth clause from the other side: giving back 100 bytes of body
            // while adding a 768-byte receipt makes the owner BIGGER, and an owner already over
            // the cap may not grow. Without the receipt in `addedBytes` this would commit.
            expect(
                commitSave(
                    db,
                    command({ expectedRevision: 'doc-1-rev', body: 'x'.repeat(over - 100) }),
                    capped({ maxBytesPerOwner: BYTE_CAP }),
                ),
            ).toMatchObject({ kind: 'quota_exceeded', limit: 'bytes' });
            expect(readOwnerUsage(db, 'owner-a').documentBytes).toBe(over);
        });

        it('refuses an equal-size replacement while over the cap — the receipt still grows it', () => {
            const db = setUp();
            const over = BYTE_CAP + 512;
            seedBody(db, 'owner-a', 'doc-1', 'x'.repeat(over));
            // This test asserted the OPPOSITE until #1250, and that was the hole: measured
            // against document bytes alone, an equal-size re-save has `addedBytes ===
            // replacedBytes`, so the growth clause waved it through unconditionally — no matter
            // how far over the cap the owner was, and no matter how many receipts had already
            // accumulated. Re-saving the same bytes under a fresh operation id was therefore an
            // unbounded write loop. With the receipt counted, the owner IS growing, so an owner
            // over the cap is refused; shrinking by more than 768 bytes remains their way back.
            expect(
                commitSave(
                    db,
                    command({ expectedRevision: 'doc-1-rev', body: 'y'.repeat(over) }),
                    capped({ maxBytesPerOwner: BYTE_CAP }),
                ),
            ).toMatchObject({ kind: 'quota_exceeded', limit: 'bytes' });
        });

        it('counts UTF-8 bytes, not characters, on all three sides of the arithmetic', () => {
            const db = setUp();
            // 64 bytes: 16 characters, 16 code points, 32 UTF-16 code units. Every wrong way to
            // count is a DIFFERENT number, and each cap below is chosen so that only the right
            // one lands on the asserted side of it. A cap merely well past the boundary would
            // be cleared by all three counts and prove nothing.
            const body = '𝄞'.repeat(16);
            expect(Buffer.byteLength(body, 'utf8')).toBe(64);

            // 1. The SQL side: `length()` on TEXT would report 32 code units, not 64 bytes.
            expect(commitSave(db, command({ body }), deps)).toMatchObject({ kind: 'committed' });
            expect(readOwnerUsage(db, 'owner-a').documentBytes).toBe(64);

            // 2. `addedBytes`. Usage is 64, so the projection is 128 against a cap of 100 —
            // refused. Counting code points (80) or UTF-16 units (96) would wave it through.
            expect(
                commitSave(
                    db,
                    command({ documentId: 'doc-2', operationId: 'op-2', body }),
                    capped({ maxBytesPerOwner: 100 + RECEIPT_COST_BYTES }),
                ),
            ).toMatchObject({ kind: 'quota_exceeded', limit: 'bytes' });

            // 3. `replacedBytes`, the one side an assertion on usage cannot reach. Replacing
            // those 64 bytes with 64 more leaves the footprint unchanged, so it commits under a
            // cap of 80. Under-counting what is REPLACED projects 96 (UTF-16) or 112 (code
            // points) and refuses an edit that does not grow the owner's storage at all.
            expect(
                commitSave(
                    db,
                    command({ operationId: 'op-3', expectedRevision: 'rev-1', body }),
                    capped({ maxBytesPerOwner: 80 + 2 * RECEIPT_COST_BYTES }),
                ),
            ).toMatchObject({ kind: 'committed' });
        });

        it('never refuses a write that shrinks the footprint, even from over the cap', () => {
            const db = setUp();
            // Over the cap already — as it would be if the cap were lowered under an account.
            seedBody(db, 'owner-a', 'doc-1', 'x'.repeat(BYTE_CAP + 4_096));
            expect(
                commitSave(
                    db,
                    command({ expectedRevision: 'doc-1-rev', body: '{"t":"small"}' }),
                    capped({ maxBytesPerOwner: BYTE_CAP }),
                ),
            ).toMatchObject({ kind: 'committed' });
            expect(readOwnerUsage(db, 'owner-a').documentBytes).toBe(13);
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
