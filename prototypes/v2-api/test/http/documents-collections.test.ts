import { afterEach, describe, expect, it } from 'vitest';
import type { CollectionDocument } from '../../../v2/lib/collections.js';
import { syncDocument } from '../../../v2/lib/sync/protocol.js';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { listManifest, readDocument, readTombstone } from '../../src/db/documents.js';
import { MAX_DOCUMENTS_PER_OWNER } from '../../src/db/save.js';
import { createApp } from '../../src/http/app.js';
import { makeChartDocument } from '../fixtures/chart-document.js';
import { createCookieJar } from '../helpers/cookie-jar.js';
import { createSoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * #1474 acceptance over the real routes: a collection is the second synced document kind, through
 * the SAME `documents` table and the same Save, read, manifest and delete routes a chart uses. Every
 * request is frozen the way the client's `prepare()` freezes it (`syncDocument` + the canonical
 * envelope), so the shared decoder's canonical-bytes check is exercised for a collection exactly as
 * for a chart. A chart with no `kind` — every chart ever stored — must keep saving unchanged.
 */
const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'ensembletest.brndn.zip',
    rpName: 'Ensemble Test',
    origin: 'https://ensembletest.brndn.zip',
});
const URL_BASE = 'https://ensembletest.brndn.zip';
const SAVE = '/api/documents/save';
const DELETE = '/api/documents/delete';

interface Ctx {
    testDb: TestDatabase;
    app: ReturnType<typeof createApp>;
    jar: ReturnType<typeof createCookieJar>;
    accountId: string;
}

let counter = 0;

async function setUp(save: { maxDocumentsPerOwner?: number } = {}): Promise<Ctx> {
    const testDb = createTestDatabase();
    counter = 0;
    const app = createApp({
        db: testDb.db,
        config: CONFIG,
        saveDependencies: { mintRevision: () => `rev-${++counter}`, ...save },
    });
    const jar = createCookieJar();
    const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
    const ctx: Ctx = { testDb, app, jar, accountId: '' };
    const optionsRes = await post(ctx, '/api/auth/register/options', JSON.stringify({}));
    const { options } = (await optionsRes.json()) as { options: { challenge: string } };
    const verifyRes = await post(
        ctx,
        '/api/auth/register/verify',
        JSON.stringify(authenticator.register({ challenge: options.challenge })),
    );
    expect(verifyRes.status).toBe(200);
    ctx.accountId = ((await verifyRes.json()) as { accountId: string }).accountId;
    return ctx;
}

async function post(ctx: Ctx, path: string, body: string): Promise<Response> {
    const res = await ctx.app.request(`${URL_BASE}${path}`, {
        method: 'POST',
        headers: {
            origin: CONFIG.origin,
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(body, 'utf8')),
            ...(ctx.jar.header() !== undefined ? { cookie: ctx.jar.header() as string } : {}),
        },
        body,
    });
    ctx.jar.ingest(res);
    return res;
}

async function get(ctx: Ctx, path: string): Promise<{ status: number; json: unknown }> {
    const res = await ctx.app.request(`${URL_BASE}${path}`, {
        method: 'GET',
        headers: { cookie: ctx.jar.header() as string },
    });
    const text = await res.text();
    return { status: res.status, json: text.length > 0 ? JSON.parse(text) : undefined };
}

function collection(id: string, songIds: string[] = [], name = 'Gig'): CollectionDocument {
    return {
        kind: 'collection',
        schemaVersion: 1,
        id,
        name,
        revision: 0,
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-01T12:00:00.000Z',
        songIds,
    };
}

/** What `AccountSongbook.prepare` freezes, for either kind. */
async function save(
    ctx: Ctx,
    documentId: string,
    operationId: string,
    expectedRevision: string | null,
    document: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
    const body = JSON.stringify({
        protocolVersion: 1,
        ownerId: ctx.accountId,
        documentId,
        operationId,
        expectedRevision,
        document: syncDocument(document),
    });
    const res = await post(ctx, SAVE, body);
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('collections through the document routes (#1474)', () => {
    let ctx: Ctx | undefined;
    afterEach(() => {
        ctx?.testDb.cleanup();
        ctx = undefined;
    });

    it('saves a collection, reads it back verbatim, and updates it at its exact revision', async () => {
        ctx = await setUp();
        const created = await save(ctx, 'set-1', 'op-1', null, collection('set-1', ['song-1']));
        expect(created.status).toBe(200);
        expect(created.json).toMatchObject({ kind: 'committed', revision: 'rev-1' });
        expect(JSON.parse(readDocument(ctx.testDb.db, ctx.accountId, 'set-1')!.body)).toEqual(
            collection('set-1', ['song-1']),
        );

        const read = await get(ctx, '/api/documents/set-1');
        expect(read.status).toBe(200);
        expect(read.json).toEqual({
            documentId: 'set-1',
            revision: 'rev-1',
            document: collection('set-1', ['song-1']),
        });

        const updated = await save(
            ctx,
            'set-1',
            'op-2',
            'rev-1',
            collection('set-1', ['song-2', 'song-1']),
        );
        expect(updated.status).toBe(200);
        expect(updated.json).toMatchObject({ kind: 'committed', revision: 'rev-2' });
        // A stale update conflicts and hands back the CURRENT collection to resolve against.
        const stale = await save(ctx, 'set-1', 'op-3', 'rev-1', collection('set-1', []));
        expect(stale.status).toBe(409);
        expect(stale.json).toMatchObject({
            kind: 'conflict',
            revision: 'rev-2',
            remote: { revision: 'rev-2', document: collection('set-1', ['song-2', 'song-1']) },
        });
    });

    it('a chart with no `kind` still saves, and its manifest row carries no `kind`', async () => {
        ctx = await setUp();
        expect(
            (await save(ctx, 'chart-1', 'op-1', null, makeChartDocument('chart-1'))).status,
        ).toBe(200);
        expect((await save(ctx, 'set-1', 'op-2', null, collection('set-1'))).status).toBe(200);
        const manifest = await get(ctx, '/api/documents');
        expect(manifest.status).toBe(200);
        const rows = (manifest.json as { documents: Array<Record<string, unknown>> }).documents;
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({
            documentId: 'chart-1',
            revision: 'rev-1',
            deleted: false,
            bytes: expect.any(Number),
        });
        expect(Object.hasOwn(rows[0], 'kind')).toBe(false);
        expect(rows[1]).toMatchObject({ documentId: 'set-1', kind: 'collection', deleted: false });
    });

    it('never lets one kind overwrite the other at the same id', async () => {
        ctx = await setUp();
        await save(ctx, 'shared', 'op-1', null, makeChartDocument('shared'));
        const overwrite = await save(ctx, 'shared', 'op-2', 'rev-1', collection('shared'));
        // A conflict with no remote: there is no collection at this id to resolve against.
        expect(overwrite.status).toBe(409);
        expect(overwrite.json).toMatchObject({ kind: 'conflict', revision: 'rev-1', remote: null });
        const stored = JSON.parse(readDocument(ctx.testDb.db, ctx.accountId, 'shared')!.body);
        expect(stored.title).toBe(makeChartDocument('shared').title);

        await save(ctx, 'set-1', 'op-3', null, collection('set-1'));
        const back = await save(ctx, 'set-1', 'op-4', 'rev-2', makeChartDocument('set-1'));
        expect(back.status).toBe(409);
        expect(back.json).toMatchObject({ kind: 'conflict', remote: null });
        expect(JSON.parse(readDocument(ctx.testDb.db, ctx.accountId, 'set-1')!.body).kind).toBe(
            'collection',
        );
    });

    it.each([
        ['a collection created at a chart’s id', 'chart', 'collection', null],
        ['a chart created at a collection’s id', 'collection', 'chart', null],
        ['a stale collection update at a chart’s id', 'chart', 'collection', 'rev-stale'],
        ['a stale chart update at a collection’s id', 'collection', 'chart', 'rev-stale'],
    ] as const)(
        'never hands back the other kind as a remote: %s (review R1)',
        async (_label, stored, sent, expected) => {
            ctx = await setUp();
            const make = (kind: 'chart' | 'collection') =>
                kind === 'chart' ? makeChartDocument('shared') : collection('shared');
            await save(ctx, 'shared', 'op-1', null, make(stored));
            const reply = await save(ctx, 'shared', 'op-2', expected, make(sent));
            // The same answer in every branch: the id is not this kind's, so there is no version of
            // THIS document to resolve against — never a body of the other kind.
            expect(reply.status).toBe(409);
            expect(reply.json).toMatchObject({ kind: 'conflict', revision: 'rev-1', remote: null });
            const body = JSON.parse(readDocument(ctx.testDb.db, ctx.accountId, 'shared')!.body);
            expect(body.kind === 'collection' ? 'collection' : 'chart').toBe(stored);
        },
    );

    it('refuses a malformed collection exactly as it refuses a malformed chart', async () => {
        ctx = await setUp();
        const duplicate = { ...collection('set-1'), songIds: ['a', 'a'] };
        const body = JSON.stringify({
            protocolVersion: 1,
            ownerId: ctx.accountId,
            documentId: 'set-1',
            operationId: 'op-1',
            expectedRevision: null,
            document: duplicate,
        });
        const res = await post(ctx, SAVE, body);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'malformed_request' });
        expect(readDocument(ctx.testDb.db, ctx.accountId, 'set-1')).toBeUndefined();
    });

    it('deletes a collection through the same route, leaving a tombstone that blocks a re-create', async () => {
        ctx = await setUp();
        await save(ctx, 'set-1', 'op-1', null, collection('set-1'));
        const body = JSON.stringify({
            ownerId: ctx.accountId,
            documentId: 'set-1',
            operationId: 'op-del',
            expectedRevision: 'rev-1',
        });
        const res = await post(ctx, DELETE, body);
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ kind: 'deleted', revision: 'rev-1' });
        expect(readDocument(ctx.testDb.db, ctx.accountId, 'set-1')).toBeUndefined();
        expect(readTombstone(ctx.testDb.db, ctx.accountId, 'set-1')?.revision).toBe('rev-1');
        // The manifest names the deletion, with no kind: a tombstone has no body to read one from.
        expect(listManifest(ctx.testDb.db, ctx.accountId, { limit: 10 }).entries).toEqual([
            { documentId: 'set-1', revision: 'rev-1', deleted: true, bytes: 0 },
        ]);
        const recreate = await save(ctx, 'set-1', 'op-2', null, collection('set-1'));
        expect(recreate.status).toBe(409);
        expect(recreate.json).toMatchObject({ kind: 'conflict', remote: null });
    });

    it('counts a collection toward the per-owner document cap', async () => {
        ctx = await setUp();
        const insert = ctx.testDb.db.prepare(
            'INSERT INTO documents (owner_id, document_id, revision, body, updated_at)' +
                ' VALUES (?, ?, ?, ?, 1)',
        );
        // One short of the real cap, in one transaction.
        ctx.testDb.db.exec('BEGIN');
        for (let i = 0; i < MAX_DOCUMENTS_PER_OWNER - 1; i += 1) {
            insert.run(ctx.accountId, `seed-${i}`, `seed-rev-${i}`, '{}');
        }
        ctx.testDb.db.exec('COMMIT');
        // The collection is the 2,000th document…
        expect((await save(ctx, 'set-1', 'op-1', null, collection('set-1'))).status).toBe(200);
        // …so neither a chart nor another collection fits after it.
        const chart = await save(ctx, 'chart-1', 'op-2', null, makeChartDocument('chart-1'));
        expect(chart.status).toBe(409);
        expect(chart.json).toEqual({ error: 'quota_exceeded' });
        const another = await save(ctx, 'set-2', 'op-3', null, collection('set-2'));
        expect(another.json).toEqual({ error: 'quota_exceeded' });
        // An UPDATE of the collection already counted is not refused for the cap.
        expect((await save(ctx, 'set-1', 'op-4', 'rev-1', collection('set-1', ['x']))).status).toBe(
            200,
        );
    });

    it('refuses a collection when charts already fill the cap', async () => {
        ctx = await setUp({ maxDocumentsPerOwner: 2 });
        await save(ctx, 'chart-1', 'op-1', null, makeChartDocument('chart-1'));
        await save(ctx, 'chart-2', 'op-2', null, makeChartDocument('chart-2'));
        const refused = await save(ctx, 'set-1', 'op-3', null, collection('set-1'));
        expect(refused.status).toBe(409);
        expect(refused.json).toEqual({ error: 'quota_exceeded' });
    });
});
