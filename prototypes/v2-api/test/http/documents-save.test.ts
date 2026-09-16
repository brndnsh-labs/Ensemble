import { afterEach, describe, expect, it } from 'vitest';
import { digest, snapshot } from '../../../v2/lib/sync/protocol.js';
import { MAX_SAVE_REQUEST_BYTES } from '../../../v2/lib/sync/request.js';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { issueSession } from '../../src/auth/session.js';
import { readDocument, readReceipt } from '../../src/db/documents.js';
import { MAX_DOCUMENTS_PER_OWNER } from '../../src/db/save.js';
import { createApp } from '../../src/http/app.js';
import { DOCUMENT_POLICIES } from '../../src/http/documents.js';
import { makeChartDocument } from '../fixtures/chart-document.js';
import { createCookieJar } from '../helpers/cookie-jar.js';
import { createSoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * #1202 acceptance over the real route: `app.request()` against a disposable real database,
 * a real passkey registration for the session, and request bodies frozen EXACTLY the way the
 * client's `prepare()` freezes them (same `snapshot()` + `JSON.stringify` envelope), so the
 * canonical-bytes check in the shared decoder is exercised, not bypassed.
 */
const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'ensembletest.brndn.zip',
    rpName: 'Ensemble Test',
    origin: 'https://ensembletest.brndn.zip',
});
const URL_BASE = 'https://ensembletest.brndn.zip';
const SAVE = '/api/documents/save';

interface Ctx {
    testDb: TestDatabase;
    app: ReturnType<typeof createApp>;
    jar: ReturnType<typeof createCookieJar>;
    accountId: string;
}

let counter = 0;

async function setUp(): Promise<Ctx> {
    const testDb = createTestDatabase();
    counter = 0;
    const app = createApp({
        db: testDb.db,
        config: CONFIG,
        saveDependencies: { mintRevision: () => `rev-${++counter}` },
    });
    const jar = createCookieJar();
    const ctx: Ctx = { testDb, app, jar, accountId: '' };
    ctx.accountId = await register(ctx);
    return ctx;
}

async function register(ctx: Ctx): Promise<string> {
    const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
    const optionsRes = await post(ctx, '/api/auth/register/options', JSON.stringify({}));
    expect(optionsRes.status).toBe(200);
    const { options } = (await optionsRes.json()) as { options: { challenge: string } };
    const verifyRes = await post(
        ctx,
        '/api/auth/register/verify',
        JSON.stringify(authenticator.register({ challenge: options.challenge })),
    );
    expect(verifyRes.status).toBe(200);
    return ((await verifyRes.json()) as { accountId: string }).accountId;
}

/** Raw body with an honest Content-Length — see full-flow.test.ts for why that matters. */
async function post(
    ctx: Ctx,
    path: string,
    body: string,
    extraHeaders: Record<string, string> = {},
): Promise<Response> {
    const res = await ctx.app.request(`${URL_BASE}${path}`, {
        method: 'POST',
        headers: {
            origin: CONFIG.origin,
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(body, 'utf8')),
            ...(ctx.jar.header() !== undefined ? { cookie: ctx.jar.header() as string } : {}),
            ...extraHeaders,
        },
        body,
    });
    ctx.jar.ingest(res);
    return res;
}

interface Envelope {
    ownerId: string;
    documentId: string;
    operationId: string;
    expectedRevision: string | null;
    document?: unknown;
}

/** What `AccountSongbook.prepare` freezes: one canonical serialization per operation. */
function freeze(envelope: Envelope): string {
    return JSON.stringify({
        protocolVersion: 1,
        ownerId: envelope.ownerId,
        documentId: envelope.documentId,
        operationId: envelope.operationId,
        expectedRevision: envelope.expectedRevision,
        document: snapshot(envelope.document ?? makeChartDocument(envelope.documentId)),
    });
}

async function save(
    ctx: Ctx,
    body: string,
): Promise<{ status: number; json: unknown; res: Response }> {
    const res = await post(ctx, SAVE, body);
    const text = await res.text();
    return { status: res.status, json: text.length > 0 ? JSON.parse(text) : undefined, res };
}

function sessionCookie(token: string): Response {
    return new Response(null, {
        headers: { 'set-cookie': `__Host-ensemble_session=${token}; Path=/; Secure; HttpOnly` },
    });
}

describe('POST /api/documents/save (#1202)', () => {
    let ctx: Ctx | undefined;
    afterEach(() => {
        ctx?.testDb.cleanup();
        ctx = undefined;
    });

    it('a fresh create commits and answers the SaveReply the client validates', async () => {
        ctx = await setUp();
        const body = freeze({
            ownerId: ctx.accountId,
            documentId: 'doc-1',
            operationId: 'op-1',
            expectedRevision: null,
        });
        const { status, json, res } = await save(ctx, body);
        expect(status).toBe(200);
        expect(json).toEqual({
            ownerId: ctx.accountId,
            documentId: 'doc-1',
            operationId: 'op-1',
            digest: await digest(body),
            revision: 'rev-1',
            kind: 'committed',
        });
        expect(res.headers.get('cache-control')).toBe('private, no-store');
        const row = readDocument(ctx.testDb.db, ctx.accountId, 'doc-1');
        expect(row).toMatchObject({ revision: 'rev-1' });
        expect(JSON.parse(row?.body ?? '{}')).toEqual(snapshot(makeChartDocument('doc-1')));
    });

    it('replaying the same operation id and bytes returns the original result without a second write', async () => {
        ctx = await setUp();
        const body = freeze({
            ownerId: ctx.accountId,
            documentId: 'doc-1',
            operationId: 'op-1',
            expectedRevision: null,
        });
        const first = await save(ctx, body);
        const again = await save(ctx, body);
        expect(again.status).toBe(200);
        expect(again.json).toEqual(first.json);
        expect(counter).toBe(1);
        expect(readReceipt(ctx.testDb.db, ctx.accountId, 'op-1')?.resultRevision).toBe('rev-1');
    });

    it('the same operation id with different bytes is rejected outright', async () => {
        ctx = await setUp();
        await save(
            ctx,
            freeze({
                ownerId: ctx.accountId,
                documentId: 'doc-1',
                operationId: 'op-1',
                expectedRevision: null,
            }),
        );
        const changed = { ...makeChartDocument('doc-1'), title: 'Renamed' };
        const { status, json } = await save(
            ctx,
            freeze({
                ownerId: ctx.accountId,
                documentId: 'doc-1',
                operationId: 'op-1',
                expectedRevision: null,
                document: changed,
            }),
        );
        expect(status).toBe(409);
        expect(json).toEqual({ error: 'operation_mismatch' });
        expect(
            JSON.parse(readDocument(ctx.testDb.db, ctx.accountId, 'doc-1')?.body ?? '{}'),
        ).toMatchObject({ title: 'Odd-Meter Study' });
    });

    it('a stale-revision update returns a conflict carrying the current server version, and writes nothing', async () => {
        ctx = await setUp();
        await save(
            ctx,
            freeze({
                ownerId: ctx.accountId,
                documentId: 'doc-1',
                operationId: 'op-1',
                expectedRevision: null,
            }),
        ); // rev-1
        const second = { ...makeChartDocument('doc-1'), title: 'Second' };
        expect(
            (
                await save(
                    ctx,
                    freeze({
                        ownerId: ctx.accountId,
                        documentId: 'doc-1',
                        operationId: 'op-2',
                        expectedRevision: 'rev-1',
                        document: second,
                    }),
                )
            ).status,
        ).toBe(200); // rev-2
        const stale = { ...makeChartDocument('doc-1'), title: 'Stale' };
        const body = freeze({
            ownerId: ctx.accountId,
            documentId: 'doc-1',
            operationId: 'op-3',
            expectedRevision: 'rev-1',
            document: stale,
        });
        const { status, json, res } = await save(ctx, body);
        expect(status).toBe(409);
        expect(json).toEqual({
            ownerId: ctx.accountId,
            documentId: 'doc-1',
            operationId: 'op-3',
            digest: await digest(body),
            revision: 'rev-2',
            kind: 'conflict',
            remote: { revision: 'rev-2', document: snapshot(second) },
        });
        expect(res.headers.get('cache-control')).toBe('private, no-store');
        expect(
            JSON.parse(readDocument(ctx.testDb.db, ctx.accountId, 'doc-1')?.body ?? '{}'),
        ).toMatchObject({ title: 'Second' });
        expect(readReceipt(ctx.testDb.db, ctx.accountId, 'op-3')).toBeUndefined();
        expect(counter).toBe(2);
    });

    it('creating over a tombstoned id is rejected as a conflict with no remote version', async () => {
        ctx = await setUp();
        await save(
            ctx,
            freeze({
                ownerId: ctx.accountId,
                documentId: 'doc-1',
                operationId: 'op-1',
                expectedRevision: null,
            }),
        );
        ctx.testDb.db.exec(`DELETE FROM documents WHERE document_id = 'doc-1'`);
        ctx.testDb.db
            .prepare(
                'INSERT INTO tombstones (owner_id, document_id, revision, deleted_at) VALUES (?, ?, ?, ?)',
            )
            .run(ctx.accountId, 'doc-1', 'rev-1', 5);
        const { status, json } = await save(
            ctx,
            freeze({
                ownerId: ctx.accountId,
                documentId: 'doc-1',
                operationId: 'op-2',
                expectedRevision: null,
            }),
        );
        expect(status).toBe(409);
        expect(json).toMatchObject({ kind: 'conflict', revision: 'rev-1', remote: null });
        expect(readDocument(ctx.testDb.db, ctx.accountId, 'doc-1')).toBeUndefined();
    });

    it("never trusts the body's owner: a mismatched ownerId is refused and nothing is written under either owner", async () => {
        ctx = await setUp();
        const body = freeze({
            ownerId: 'somebody-else',
            documentId: 'doc-1',
            operationId: 'op-1',
            expectedRevision: null,
        });
        const { status, json } = await save(ctx, body);
        expect(status).toBe(400);
        expect(json).toEqual({ error: 'malformed_request' });
        expect(readDocument(ctx.testDb.db, ctx.accountId, 'doc-1')).toBeUndefined();
        expect(readDocument(ctx.testDb.db, 'somebody-else', 'doc-1')).toBeUndefined();
        expect(readReceipt(ctx.testDb.db, ctx.accountId, 'op-1')).toBeUndefined();
    });

    it('requires a standard session and the usual transport guards', async () => {
        ctx = await setUp();
        const body = freeze({
            ownerId: ctx.accountId,
            documentId: 'doc-1',
            operationId: 'op-1',
            expectedRevision: null,
        });
        const anonymous: Ctx = { ...ctx, jar: createCookieJar() };
        const unauth = await save(anonymous, body);
        expect(unauth.status).toBe(401);
        expect(unauth.json).toEqual({ error: 'unauthenticated' });
        expect(unauth.res.headers.get('cache-control')).toBe('private, no-store');
        const crossOrigin = await post(ctx, SAVE, body, { origin: 'https://evil.example' });
        expect(crossOrigin.status).toBe(403);
        const wrongType = await post(ctx, SAVE, body, { 'content-type': 'text/plain' });
        expect(wrongType.status).toBe(415);
    });

    it('non-canonical bytes are refused even when the content is valid', async () => {
        ctx = await setUp();
        const body = freeze({
            ownerId: ctx.accountId,
            documentId: 'doc-1',
            operationId: 'op-1',
            expectedRevision: null,
        });
        const reserialized = JSON.stringify(JSON.parse(body), null, 2);
        const { status, json } = await save(ctx, reserialized);
        expect(status).toBe(400);
        expect(json).toEqual({ error: 'malformed_request' });
        expect(readDocument(ctx.testDb.db, ctx.accountId, 'doc-1')).toBeUndefined();
    });

    it('accepts bodies above the 64 KB auth-route limit up to the Save ceiling, and refuses larger ones as 413', async () => {
        ctx = await setUp();
        // 70 KB of not-JSON: past the auth limit, under the Save ceiling — reaches the decoder (400), not the limiter (413).
        const big = await save(ctx, 'x'.repeat(70 * 1024));
        expect(big.status).toBe(400);
        const auth = await post(ctx, '/api/auth/logout', 'x'.repeat(70 * 1024));
        expect(auth.status).toBe(413);
        const huge = await save(ctx, 'x'.repeat(MAX_SAVE_REQUEST_BYTES + 1));
        expect(huge.status).toBe(413);
        expect(huge.json).toEqual({ error: 'payload_too_large' });
    });

    it('enforces its own per-identity budget after the session check', async () => {
        ctx = await setUp();
        const body = freeze({
            ownerId: ctx.accountId,
            documentId: 'doc-1',
            operationId: 'op-1',
            expectedRevision: null,
        });
        const { max } = DOCUMENT_POLICIES[SAVE.replace(/^/, 'POST ')];
        for (let i = 0; i < max; i += 1) {
            expect((await save(ctx, body)).status).toBe(200); // first commits, the rest replay
        }
        const blocked = await save(ctx, body);
        expect(blocked.status).toBe(429);
        expect(blocked.json).toEqual({ error: 'rate_limited' });
        expect(Number(blocked.res.headers.get('Retry-After'))).toBeGreaterThan(0);
        // An anonymous caller never reaches this budget: 401 first, every time.
        const anonymous: Ctx = { ...ctx, jar: createCookieJar() };
        expect((await save(anonymous, body)).status).toBe(401);
    });

    it('refuses a query string (deny-by-default, like every auth route) and a recovery-purpose session', async () => {
        ctx = await setUp();
        const body = freeze({
            ownerId: ctx.accountId,
            documentId: 'doc-1',
            operationId: 'op-1',
            expectedRevision: null,
        });
        const withQuery = await post(ctx, `${SAVE}?ownerId=attacker`, body);
        expect(withQuery.status).toBe(400);
        expect(await withQuery.json()).toEqual({ error: 'malformed_request' });
        expect(readDocument(ctx.testDb.db, ctx.accountId, 'doc-1')).toBeUndefined();

        // A recovery-only session can do nothing but enroll a passkey — not save a chart.
        const recovery = issueSession(
            ctx.testDb.db,
            ctx.accountId,
            Date.now(),
            60_000,
            null,
            'recovery',
        );
        const recoveryJar = createCookieJar();
        recoveryJar.ingest(sessionCookie(recovery.token));
        expect((await save({ ...ctx, jar: recoveryJar }, body)).status).toBe(401);
        expect(readDocument(ctx.testDb.db, ctx.accountId, 'doc-1')).toBeUndefined();
        // Not a tautology: a STANDARD session minted the same way, carried the same way, saves.
        const standard = issueSession(ctx.testDb.db, ctx.accountId, Date.now(), 60_000, null);
        const standardJar = createCookieJar();
        standardJar.ingest(sessionCookie(standard.token));
        expect((await save({ ...ctx, jar: standardJar }, body)).status).toBe(200);

        // Unknown document paths are body-bounded too, not only /save.
        const unknown = await post(
            ctx,
            '/api/documents/nope',
            'x'.repeat(MAX_SAVE_REQUEST_BYTES + 1),
        );
        expect(unknown.status).toBe(413);
    });

    it('an owner at the document cap gets 409 quota_exceeded, distinguishable from a conflict (#1234)', async () => {
        ctx = await setUp();
        const insert = ctx.testDb.db.prepare(
            'INSERT INTO documents (owner_id, document_id, revision, body, updated_at)' +
                ' VALUES (?, ?, ?, ?, 1)',
        );
        for (let i = 0; i < MAX_DOCUMENTS_PER_OWNER; i += 1) {
            insert.run(ctx.accountId, `seed-${i}`, `seed-rev-${i}`, '{}');
        }
        const { status, json } = await save(
            ctx,
            freeze({
                ownerId: ctx.accountId,
                documentId: 'doc-1',
                operationId: 'op-1',
                expectedRevision: null,
                document: makeChartDocument('doc-1'),
            }),
        );
        expect(status).toBe(409);
        // A distinct code, not the conflict envelope: the client must be able to tell "your
        // library is full" from "someone else saved first", because the fixes differ.
        expect(json).toEqual({ error: 'quota_exceeded' });
        expect(readDocument(ctx.testDb.db, ctx.accountId, 'doc-1')).toBeUndefined();
        expect(readReceipt(ctx.testDb.db, ctx.accountId, 'op-1')).toBeUndefined();
    });
});
