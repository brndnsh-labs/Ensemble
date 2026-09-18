import { afterEach, describe, expect, it } from 'vitest';
import { commitDelete, type DeleteCommand } from '../../src/db/document-delete.js';
import {
    RECEIPT_COST_BYTES,
    readDocument,
    readOwnerUsage,
    readReceipt,
    readTombstone,
    writeDocument,
} from '../../src/db/documents.js';
import {
    commitSave,
    MAX_BYTES_PER_OWNER,
    MAX_DOCUMENTS_PER_OWNER,
    type SaveCommand,
} from '../../src/db/save.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * #1260's decision table on a real disposable database. The HTTP suite proves the route and its
 * guards; this suite proves the transaction in isolation, and is where the storage accounting and
 * the interaction with `commitSave`'s non-resurrection rule are pinned.
 */
describe('commitDelete (#1260)', () => {
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

    function save(overrides: Partial<SaveCommand> = {}): SaveCommand {
        return {
            ownerId: 'owner-a',
            documentId: 'doc-1',
            operationId: 'op-save',
            digest: 'sha256:save',
            expectedRevision: null,
            body: '{"title":"one"}',
            now: 1000,
            ...overrides,
        };
    }

    function command(overrides: Partial<DeleteCommand> = {}): DeleteCommand {
        return {
            ownerId: 'owner-a',
            documentId: 'doc-1',
            operationId: 'op-del',
            digest: 'sha256:del',
            expectedRevision: 'rev-1',
            now: 2000,
            ...overrides,
        };
    }

    /** One committed document at `rev-1`, through the real Save path. */
    function seedSaved(db: ReturnType<typeof setUp>) {
        expect(commitSave(db, save(), deps)).toMatchObject({
            kind: 'committed',
            revision: 'rev-1',
        });
    }

    it('deletes the row, leaves the tombstone at the dead revision, and records the receipt', () => {
        const db = setUp();
        seedSaved(db);

        expect(commitDelete(db, command())).toEqual({
            kind: 'deleted',
            revision: 'rev-1',
            replayed: false,
            performed: true,
        });
        expect(readDocument(db, 'owner-a', 'doc-1')).toBeUndefined();
        expect(readTombstone(db, 'owner-a', 'doc-1')).toEqual({
            ownerId: 'owner-a',
            documentId: 'doc-1',
            // The revision it DIED at, not a freshly minted one — `deleteDocument`'s contract.
            revision: 'rev-1',
            deletedAt: 2000,
        });
        expect(readReceipt(db, 'owner-a', 'op-del')).toMatchObject({
            documentId: 'doc-1',
            requestDigest: 'sha256:del',
            resultRevision: 'rev-1',
            createdAt: 2000,
        });
    });

    it('replaying the same operation id and bytes returns the original result, performing nothing', () => {
        const db = setUp();
        seedSaved(db);
        const first = commitDelete(db, command());

        // A later retry with a different clock: the receipt answers, nothing is re-read.
        expect(commitDelete(db, command({ now: 9000 }))).toEqual({
            kind: 'deleted',
            revision: 'rev-1',
            replayed: true,
            performed: false,
        });
        expect(first).toMatchObject({ revision: 'rev-1' });
        // The tombstone is untouched — its `deletedAt` still the original delete's clock.
        expect(readTombstone(db, 'owner-a', 'doc-1')?.deletedAt).toBe(2000);
        expect((db.prepare('SELECT COUNT(*) AS n FROM tombstones').get() as { n: number }).n).toBe(
            1,
        );
    });

    it('the same operation id with different bytes (or another document) is rejected, never applied', () => {
        const db = setUp();
        seedSaved(db);
        commitSave(db, save({ documentId: 'doc-2', operationId: 'op-save-2', digest: 'x' }), deps);
        commitDelete(db, command());

        expect(commitDelete(db, command({ digest: 'sha256:tampered' }))).toEqual({
            kind: 'operation_mismatch',
        });
        expect(
            commitDelete(db, command({ documentId: 'doc-2', expectedRevision: 'rev-2' })),
        ).toEqual({ kind: 'operation_mismatch' });
        // doc-2 is untouched: the mismatch refused before reading any document state.
        expect(readDocument(db, 'owner-a', 'doc-2')).toMatchObject({ revision: 'rev-2' });
        expect(readTombstone(db, 'owner-a', 'doc-2')).toBeUndefined();
    });

    it('reusing a SAVE operation id for a delete is a mismatch, not a replay', () => {
        const db = setUp();
        seedSaved(db);
        // One operation id names one operation. There is no discriminator column: the digest
        // covers the whole request body, and a four-key delete envelope can never serialize to a
        // six-key Save envelope's bytes, so "same id, different operation" IS "different bytes".
        expect(commitDelete(db, command({ operationId: 'op-save' }))).toEqual({
            kind: 'operation_mismatch',
        });
        expect(readDocument(db, 'owner-a', 'doc-1')).toMatchObject({ revision: 'rev-1' });
    });

    it('a stale expected revision conflicts with the current version and deletes nothing', () => {
        const db = setUp();
        seedSaved(db);
        commitSave(
            db,
            save({
                operationId: 'op-save-2',
                digest: 'sha256:save2',
                expectedRevision: 'rev-1',
                body: '{"title":"two"}',
                now: 1500,
            }),
            deps,
        ); // rev-2

        const stale = commitDelete(db, command({ expectedRevision: 'rev-1' }));
        expect(stale).toEqual({
            kind: 'conflict',
            revision: 'rev-2',
            remote: { revision: 'rev-2', body: '{"title":"two"}' },
        });
        expect(readDocument(db, 'owner-a', 'doc-1')).toMatchObject({ revision: 'rev-2' });
        expect(readTombstone(db, 'owner-a', 'doc-1')).toBeUndefined();
        // No receipt, exactly as `commitSave` does for a conflict: nothing changed on the server,
        // so the frozen request re-evaluates identically and can still see the current version.
        expect(readReceipt(db, 'owner-a', 'op-del')).toBeUndefined();
        expect(commitDelete(db, command({ expectedRevision: 'rev-1', now: 3000 }))).toEqual(stale);
    });

    it('an id the owner never had is not_found, and writes nothing at all', () => {
        const db = setUp();
        expect(commitDelete(db, command({ documentId: 'ghost' }))).toEqual({ kind: 'not_found' });
        expect(readTombstone(db, 'owner-a', 'ghost')).toBeUndefined();
        // No receipt: nothing happened, so a retry must stay free and must not be answered from a
        // receipt claiming a deletion that never occurred.
        expect(readReceipt(db, 'owner-a', 'op-del')).toBeUndefined();
        expect(readOwnerUsage(db, 'owner-a')).toMatchObject({ receipts: 0, tombstones: 0 });
    });

    it('a delete of an already-deleted id answers idempotently from the tombstone', () => {
        const db = setUp();
        seedSaved(db);
        commitDelete(db, command());

        // A DIFFERENT operation id — a second device, or the same one after losing its receipt.
        // The goal is the state of the world and the world is already in it, so this is not a
        // conflict; and `expectedRevision` is not consulted, because a tombstone is terminal and
        // there is no newer version to offer for Keep-both.
        expect(
            commitDelete(db, command({ operationId: 'op-del-2', digest: 'd2', now: 4000 })),
        ).toEqual({ kind: 'deleted', revision: 'rev-1', replayed: false, performed: false });
        expect(
            commitDelete(
                db,
                command({
                    operationId: 'op-del-3',
                    digest: 'd3',
                    expectedRevision: 'rev-nonsense',
                    now: 5000,
                }),
            ),
        ).toEqual({ kind: 'deleted', revision: 'rev-1', replayed: false, performed: false });

        // The tombstone did not move, and each of those answers left its own receipt so that a
        // retry of THAT request is a single indexed read.
        expect(readTombstone(db, 'owner-a', 'doc-1')).toMatchObject({ deletedAt: 2000 });
        expect(readReceipt(db, 'owner-a', 'op-del-2')?.resultRevision).toBe('rev-1');
        expect(readReceipt(db, 'owner-a', 'op-del-3')?.resultRevision).toBe('rev-1');
        expect(readOwnerUsage(db, 'owner-a').tombstones).toBe(1);
    });

    it("owners are isolated: another owner's id is not_found and is left alone", () => {
        const db = setUp();
        commitSave(db, save({ ownerId: 'owner-b' }), deps); // owner-b holds doc-1 at rev-1

        expect(commitDelete(db, command({ ownerId: 'owner-a' }))).toEqual({ kind: 'not_found' });
        expect(readDocument(db, 'owner-b', 'doc-1')).toMatchObject({ revision: 'rev-1' });
        expect(readTombstone(db, 'owner-b', 'doc-1')).toBeUndefined();
        // Not a tautology: the owner who HOLDS it can delete it.
        expect(commitDelete(db, command({ ownerId: 'owner-b' }))).toMatchObject({
            kind: 'deleted',
            performed: true,
        });
    });

    it('a failure after the delete rolls the delete and the tombstone back too', () => {
        const db = setUp();
        seedSaved(db);
        // Make the receipt insert (the LAST statement) fail, so the delete and tombstone before it
        // must be undone by the transaction rather than left as a receipt-less deletion.
        db.exec(
            "CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'boom'); END",
        );
        expect(() => commitDelete(db, command())).toThrow(/boom/);
        expect(readDocument(db, 'owner-a', 'doc-1')).toMatchObject({ revision: 'rev-1' });
        expect(readTombstone(db, 'owner-a', 'doc-1')).toBeUndefined();
        db.exec('DROP TRIGGER fail_receipt');
        // And the connection is usable again: no leaked open transaction.
        expect(commitDelete(db, command())).toMatchObject({ kind: 'deleted', performed: true });
    });

    it('a tombstoned id is never resurrected, by create or by stale update, replays included', () => {
        const db = setUp();
        seedSaved(db);
        commitDelete(db, command());

        // The rule #1202 shipped, now reachable through a real delete instead of a hand-inserted
        // tombstone: creating requires absence AND no tombstone; updating requires the exact
        // current revision, and there is no current revision any more.
        const create = commitSave(
            db,
            save({ operationId: 'op-new', digest: 'sha256:new', now: 3000 }),
            deps,
        );
        expect(create).toEqual({ kind: 'conflict', revision: 'rev-1', remote: null });
        const update = commitSave(
            db,
            save({
                operationId: 'op-stale',
                digest: 'sha256:stale',
                expectedRevision: 'rev-1',
                now: 3100,
            }),
            deps,
        );
        expect(update).toEqual({ kind: 'conflict', revision: 'rev-1', remote: null });
        // Replayed — the frozen request sent again after an uncertain response. A conflict writes
        // no receipt, so these re-evaluate rather than replay, and must reach the same answer.
        expect(
            commitSave(db, save({ operationId: 'op-new', digest: 'sha256:new', now: 4000 }), deps),
        ).toEqual(create);
        expect(
            commitSave(
                db,
                save({
                    operationId: 'op-stale',
                    digest: 'sha256:stale',
                    expectedRevision: 'rev-1',
                    now: 4100,
                }),
                deps,
            ),
        ).toEqual(update);
        expect(readDocument(db, 'owner-a', 'doc-1')).toBeUndefined();
        expect(counter).toBe(1); // no revision was ever minted for the refused saves
    });

    describe('storage accounting (#1260, extending #1250)', () => {
        it('gives back the body bytes and keeps charging the receipts and the tombstone', () => {
            const db = setUp();
            seedSaved(db);
            const bodyBytes = Buffer.byteLength('{"title":"one"}', 'utf8');
            expect(readOwnerUsage(db, 'owner-a')).toEqual({
                documents: 1,
                documentBytes: bodyBytes,
                receipts: 1,
                receiptBytes: RECEIPT_COST_BYTES,
                tombstones: 0,
                tombstoneBytes: 0,
                bytes: bodyBytes + RECEIPT_COST_BYTES,
            });

            commitDelete(db, command());
            // The document half is gone. What remains is permanent: the Save's receipt, the
            // delete's own receipt, and the tombstone — none of which anything frees, which is why
            // delete is the remedy for the DOCUMENT half of the budget and not for the rest
            // (the accepted residual in rollout decision 11 / #1256).
            expect(readOwnerUsage(db, 'owner-a')).toEqual({
                documents: 0,
                documentBytes: 0,
                receipts: 2,
                receiptBytes: 2 * RECEIPT_COST_BYTES,
                tombstones: 1,
                tombstoneBytes: RECEIPT_COST_BYTES,
                // Two receipts and one tombstone, all charged at the receipt's rate.
                bytes: 3 * RECEIPT_COST_BYTES,
            });
            // Re-deleting the same id adds a receipt but never a second tombstone: the insert is
            // an upsert keyed on (owner, document), so the tombstone charge cannot be multiplied.
            commitDelete(db, command({ operationId: 'op-del-2', digest: 'd2' }));
            expect(readOwnerUsage(db, 'owner-a')).toMatchObject({ receipts: 3, tombstones: 1 });
        });

        it("one owner's tombstones do not count against another's footprint", () => {
            const db = setUp();
            commitSave(db, save({ ownerId: 'owner-b' }), deps);
            commitDelete(db, command({ ownerId: 'owner-b' }));
            expect(readOwnerUsage(db, 'owner-b')).toMatchObject({ tombstones: 1 });
            expect(readOwnerUsage(db, 'owner-a')).toMatchObject({
                tombstones: 0,
                tombstoneBytes: 0,
                bytes: 0,
            });
        });

        it('deletes at the shipped document cap, where a Save is refused — and frees the slot', () => {
            const db = setUp();
            // The reachable cap: 2,000 rows is slow to seed, the byte cap means pushing 256 MiB
            // through SQLite. One transaction, not 2,000 separate commits (see `seedDocuments` in
            // save.test.ts for the measured reason).
            const insert = db.prepare(
                'INSERT INTO documents (owner_id, document_id, revision, body, updated_at)' +
                    ' VALUES (?, ?, ?, ?, 1)',
            );
            db.exec('BEGIN');
            for (let i = 0; i < MAX_DOCUMENTS_PER_OWNER; i += 1) {
                insert.run('owner-a', `seed-${i}`, `seed-rev-${i}`, '{}');
            }
            db.exec('COMMIT');

            // At the cap, a create is refused — that is what "at quota" means here.
            expect(commitSave(db, save({ documentId: 'fresh' }), deps)).toMatchObject({
                kind: 'quota_exceeded',
                limit: 'documents',
            });
            // The delete is NOT refused: it is the remedy, and `commitDelete` has no quota gate at
            // all. Note it makes the owner's byte footprint BIGGER here (a 2-byte body traded for
            // a receipt and a tombstone), which is exactly the arithmetic a quota gate would have
            // refused.
            expect(
                commitDelete(db, command({ documentId: 'seed-0', expectedRevision: 'seed-rev-0' })),
            ).toMatchObject({ kind: 'deleted', performed: true });
            expect(readOwnerUsage(db, 'owner-a').documents).toBe(MAX_DOCUMENTS_PER_OWNER - 1);
            // And the freed slot is usable again, on a fresh id — never the tombstoned one.
            expect(
                commitSave(db, save({ documentId: 'fresh', operationId: 'op-fresh' }), deps),
            ).toMatchObject({ kind: 'committed' });
        }, 30_000);

        it('deletes at the shipped BYTE cap, where a Save is refused — and frees the bytes', () => {
            const db = setUp();
            // At full scale, like save.test.ts's one full-scale quota case and for the same
            // reason: the caps are injectable for `commitSave` (#1247) but `commitDelete` takes no
            // caps at all — it never consults them — so a lowered number would prove nothing here.
            // The only honest way to show a delete is allowed AT the shipped byte cap is to put
            // the owner at the shipped byte cap.
            writeDocument(db, 'owner-a', {
                documentId: 'huge',
                revision: 'huge-rev',
                body: 'x'.repeat(MAX_BYTES_PER_OWNER),
                updatedAt: 1,
            });
            expect(readOwnerUsage(db, 'owner-a').bytes).toBe(MAX_BYTES_PER_OWNER);

            expect(commitSave(db, save({ documentId: 'fresh' }), deps)).toMatchObject({
                kind: 'quota_exceeded',
                limit: 'bytes',
            });
            expect(
                commitDelete(db, command({ documentId: 'huge', expectedRevision: 'huge-rev' })),
            ).toMatchObject({ kind: 'deleted', performed: true });
            // The body is given back; the receipt and tombstone it leaves are what remain, each
            // charged at the receipt's rate.
            expect(readOwnerUsage(db, 'owner-a').bytes).toBe(2 * RECEIPT_COST_BYTES);
            expect(
                commitSave(db, save({ documentId: 'fresh', operationId: 'op-fresh' }), deps),
            ).toMatchObject({ kind: 'committed' });
        }, 30_000);
    });
});
