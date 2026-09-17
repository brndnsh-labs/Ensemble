import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertAccountDeletionCoverage } from '../../src/db/account-deletion-registry.js';
import {
    deleteDocument,
    listDocuments,
    listManifest,
    MAX_LIST_LIMIT,
    readDocument,
    readReceipt,
    readTombstone,
    writeDocument,
    writeReceipt,
} from '../../src/db/documents.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * #1201 acceptance: the owner-scoped document store. The load-bearing tests are the
 * cross-owner ones — owner A must see nothing of owner B's rows through every function — and
 * the export-surface check, which reads the module source so a future bare `getDocumentById`
 * fails this suite rather than a code review.
 */
describe('owner-scoped documents, receipts and tombstones (#1201)', () => {
    let testDb: TestDatabase | undefined;
    afterEach(() => {
        testDb?.cleanup();
        testDb = undefined;
    });

    function seed() {
        testDb = createTestDatabase();
        testDb.db.exec(
            "INSERT INTO accounts (id, created_at) VALUES ('owner-a', 1), ('owner-b', 1)",
        );
        writeDocument(testDb.db, 'owner-a', {
            documentId: 'doc-1',
            revision: 'r1',
            body: '{"title":"A one"}',
            updatedAt: 100,
        });
        writeDocument(testDb.db, 'owner-b', {
            documentId: 'doc-1',
            revision: 'r9',
            body: '{"title":"B one, same id"}',
            updatedAt: 200,
        });
        return testDb.db;
    }

    it('a cross-owner read returns nothing, even for a document id the other owner has', () => {
        const db = seed();
        expect(readDocument(db, 'owner-a', 'doc-1')?.body).toBe('{"title":"A one"}');
        expect(readDocument(db, 'owner-b', 'doc-1')?.body).toBe('{"title":"B one, same id"}');
        expect(readDocument(db, 'owner-c', 'doc-1')).toBeUndefined();
        expect(listDocuments(db, 'owner-a', { limit: 10, offset: 0 })).toEqual([
            { documentId: 'doc-1', revision: 'r1', updatedAt: 100 },
        ]);
        expect(listDocuments(db, 'owner-c', { limit: 10, offset: 0 })).toEqual([]);
    });

    it('writes and deletes never cross owners; a delete leaves a tombstone only for that owner', () => {
        const db = seed();
        writeDocument(db, 'owner-a', {
            documentId: 'doc-1',
            revision: 'r2',
            body: '{"title":"A two"}',
            updatedAt: 300,
        });
        expect(readDocument(db, 'owner-b', 'doc-1')?.revision).toBe('r9');

        expect(deleteDocument(db, 'owner-b', 'doc-1', 400)).toBe(true);
        expect(readDocument(db, 'owner-b', 'doc-1')).toBeUndefined();
        expect(readTombstone(db, 'owner-b', 'doc-1')).toEqual({
            ownerId: 'owner-b',
            documentId: 'doc-1',
            revision: 'r9',
            deletedAt: 400,
        });
        expect(readDocument(db, 'owner-a', 'doc-1')?.revision).toBe('r2');
        expect(readTombstone(db, 'owner-a', 'doc-1')).toBeUndefined();
        // Deleting what the owner never had mints no tombstone.
        expect(deleteDocument(db, 'owner-a', 'doc-missing', 500)).toBe(false);
        expect(readTombstone(db, 'owner-a', 'doc-missing')).toBeUndefined();
    });

    it('receipts are owner-scoped and immutable', () => {
        const db = seed();
        writeReceipt(db, 'owner-a', {
            operationId: 'op-1',
            documentId: 'doc-1',
            requestDigest: 'sha256:aaa',
            resultRevision: 'r1',
            createdAt: 100,
        });
        expect(readReceipt(db, 'owner-a', 'op-1')?.resultRevision).toBe('r1');
        expect(readReceipt(db, 'owner-b', 'op-1')).toBeUndefined();
        // Same operation id under another owner is a different receipt, not a collision.
        writeReceipt(db, 'owner-b', {
            operationId: 'op-1',
            documentId: 'doc-1',
            requestDigest: 'sha256:bbb',
            resultRevision: 'r9',
            createdAt: 200,
        });
        expect(readReceipt(db, 'owner-a', 'op-1')?.requestDigest).toBe('sha256:aaa');
        // A second write for the same (owner, operation) is a caller bug and must throw.
        expect(() =>
            writeReceipt(db, 'owner-a', {
                operationId: 'op-1',
                documentId: 'doc-1',
                requestDigest: 'sha256:ccc',
                resultRevision: 'r2',
                createdAt: 300,
            }),
        ).toThrow(/UNIQUE|constraint/i);
        expect(readReceipt(db, 'owner-a', 'op-1')?.requestDigest).toBe('sha256:aaa');
    });

    it('listing is newest-first and bounded whatever the caller asks for', () => {
        const db = seed();
        for (let i = 0; i < 5; i += 1) {
            writeDocument(db, 'owner-a', {
                documentId: `doc-${i + 10}`,
                revision: 'r1',
                body: '{}',
                updatedAt: 1000 + i,
            });
        }
        const page = listDocuments(db, 'owner-a', { limit: 2, offset: 1 });
        expect(page.map((d) => d.documentId)).toEqual(['doc-13', 'doc-12']);
        expect(listDocuments(db, 'owner-a', { limit: -5, offset: -5 })).toEqual([]);
        expect(listDocuments(db, 'owner-a', { limit: 10_000, offset: 0 })).toHaveLength(6);
        expect(MAX_LIST_LIMIT).toBe(500);
        // A limit above the cap is clamped, not rejected: the cap is the contract.
        expect(
            listDocuments(db, 'owner-a', { limit: Number.POSITIVE_INFINITY, offset: 0 }),
        ).toHaveLength(6);
    });

    it('the manifest interleaves tombstones by id, is owner-scoped, and is resumable (#1259)', () => {
        const db = seed();
        for (const id of ['doc-2', 'doc-4', 'doc-6']) {
            writeDocument(db, 'owner-a', {
                documentId: id,
                // Descending updatedAt, so a manifest that leaked `listDocuments`' ordering
                // would come back reversed rather than merely in a different-but-valid order.
                revision: `r-${id}`,
                body: '{"body":"åå"}',
                updatedAt: 9000 - Number(id.slice(-1)),
            });
        }
        expect(deleteDocument(db, 'owner-a', 'doc-4', 700)).toBe(true);

        const all = listManifest(db, 'owner-a', { limit: 10 });
        expect(all).toEqual({
            entries: [
                // 'doc-1' is the seeded row; 'doc-4' is a tombstone sitting in its id position.
                { documentId: 'doc-1', revision: 'r1', deleted: false, bytes: 17 },
                { documentId: 'doc-2', revision: 'r-doc-2', deleted: false, bytes: 15 },
                { documentId: 'doc-4', revision: 'r-doc-4', deleted: true, bytes: 0 },
                { documentId: 'doc-6', revision: 'r-doc-6', deleted: false, bytes: 15 },
            ],
            nextAfter: null,
        });
        // `bytes` counts UTF-8 bytes, not characters: 13 characters, two of them 2-byte 'å'.
        expect(all.entries[1]?.bytes).toBe(Buffer.byteLength('{"body":"åå"}', 'utf8'));

        // Resuming from a cursor is exclusive, and crosses the tombstone without stalling on it.
        const page = listManifest(db, 'owner-a', { after: 'doc-2', limit: 1 });
        expect(page).toEqual({
            entries: [{ documentId: 'doc-4', revision: 'r-doc-4', deleted: true, bytes: 0 }],
            nextAfter: 'doc-4',
        });
        expect(listManifest(db, 'owner-a', { after: 'doc-6', limit: 10 })).toEqual({
            entries: [],
            nextAfter: null,
        });
        // `nextAfter` is null exactly at the end, never after one wasted empty page.
        expect(listManifest(db, 'owner-a', { after: 'doc-4', limit: 1 }).nextAfter).toBeNull();

        // Owner scoping: owner-b holds its own 'doc-1' and owner-c holds nothing.
        expect(listManifest(db, 'owner-b', { limit: 10 }).entries).toEqual([
            { documentId: 'doc-1', revision: 'r9', deleted: false, bytes: 26 },
        ]);
        expect(listManifest(db, 'owner-c', { limit: 10 }).entries).toEqual([]);
        // Same ceiling contract as `listDocuments`: the cap clamps, it does not reject.
        expect(listManifest(db, 'owner-a', { limit: 10_000 }).entries).toHaveLength(4);
        // But the FLOOR is 1, not 0 (#1259 review, F5). An empty page with `nextAfter: null` is
        // indistinguishable from the end of the library, so a caller whose computed page size
        // came out zero must not be told its account holds nothing — it gets one row and a
        // cursor, and can page from there.
        expect(listManifest(db, 'owner-a', { limit: 0 })).toEqual({
            entries: [{ documentId: 'doc-1', revision: 'r1', deleted: false, bytes: 17 }],
            nextAfter: 'doc-1',
        });
        expect(listManifest(db, 'owner-a', { limit: -5 })).toEqual(
            listManifest(db, 'owner-a', { limit: 1 }),
        );
    });

    it('every exported query takes the owner as its mandatory first argument after db', () => {
        const source = readFileSync(
            path.resolve(import.meta.dirname, '../../src/db/documents.ts'),
            'utf8',
        );
        const signatures = [
            ...source.matchAll(/export function (\w+)\(\s*db: DatabaseSync,\s*(\w+): (\w+)/g),
        ];
        const exported = [...source.matchAll(/export function (\w+)\(/g)].map((m) => m[1]);
        expect(exported.length).toBeGreaterThanOrEqual(7);
        expect(signatures.map((m) => m[1]).sort()).toEqual([...exported].sort());
        for (const [, name, param, type] of signatures) {
            expect(`${name}: ${param}: ${type}`).toBe(`${name}: ownerId: string`);
        }
    });

    it('the three tables are classified for account deletion and the drift guard still bites', () => {
        const db = seed();
        expect(() => assertAccountDeletionCoverage(db)).not.toThrow();
        db.exec('CREATE TABLE stray (owner_id TEXT)');
        expect(() => assertAccountDeletionCoverage(db)).toThrow('exactly once');
    });
});
