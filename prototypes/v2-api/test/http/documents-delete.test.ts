import { afterEach, describe, expect, it } from 'vitest';
import { digest, snapshot } from '../../../v2/lib/sync/protocol.js';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { issueSession } from '../../src/auth/session.js';
import {
    RECEIPT_COST_BYTES,
    readDocument,
    readOwnerUsage,
    readReceipt,
    readTombstone,
} from '../../src/db/documents.js';
import { MAX_DOCUMENTS_PER_OWNER } from '../../src/db/save.js';
import { createApp } from '../../src/http/app.js';
import { MAX_DELETE_REQUEST_BYTES } from '../../src/http/document-delete-request.js';
import { DOCUMENT_POLICIES } from '../../src/http/documents.js';
import { makeChartDocument } from '../fixtures/chart-document.js';
import { createCookieJar } from '../helpers/cookie-jar.js';
import { createSoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * #1260 acceptance over the real route: `app.request()` against a disposable REAL `node:sqlite`
 * database (`createTestDatabase` runs the shipped migrations on a temp file), two real passkey
 * accounts for the two sessions, and every document under test created by a real
 * `POST /api/documents/save` — so what a delete removes is what the Save protocol actually stored.
 *
 * The load-bearing cases are the non-resurrection pair (a Save create AND a stale Save update to a
 * tombstoned id, replays included), the indistinguishability of a foreign id from an absent one,
 * and the storage accounting — the three things a delete route can get wrong in a way no
 * type-checker or single-request test would notice.
 */
const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'ensembletest.brndn.zip',
    rpName: 'Ensemble Test',
    origin: 'https://ensembletest.brndn.zip',
});
const URL_BASE = 'https://ensembletest.brndn.zip';
const MANIFEST = '/api/documents';
const SAVE = '/api/documents/save';
const DELETE = '/api/documents/delete';

interface Account {
    jar: ReturnType<typeof createCookieJar>;
    accountId: string;
}
interface Ctx {
    testDb: TestDatabase;
    app: ReturnType<typeof createApp>;
    owner: Account;
    stranger: Account;
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
    const owner = await register(app);
    const stranger = await register(app);
    return { testDb, app, owner, stranger };
}

/** A real registration ceremony, so the session cookie under test is a real session. */
async function register(app: ReturnType<typeof createApp>): Promise<Account> {
    const jar = createCookieJar();
    const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
    const optionsRes = await post(app, jar, '/api/auth/register/options', JSON.stringify({}));
    expect(optionsRes.status).toBe(200);
    const { options } = (await optionsRes.json()) as { options: { challenge: string } };
    const verifyRes = await post(
        app,
        jar,
        '/api/auth/register/verify',
        JSON.stringify(authenticator.register({ challenge: options.challenge })),
    );
    expect(verifyRes.status).toBe(200);
    return { jar, accountId: ((await verifyRes.json()) as { accountId: string }).accountId };
}

/** Raw body with an honest Content-Length — see full-flow.test.ts for why that matters. */
async function post(
    app: ReturnType<typeof createApp>,
    jar: ReturnType<typeof createCookieJar>,
    path: string,
    body: string,
    extraHeaders: Record<string, string> = {},
): Promise<Response> {
    const res = await app.request(`${URL_BASE}${path}`, {
        method: 'POST',
        headers: {
            origin: CONFIG.origin,
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(body, 'utf8')),
            ...(jar.header() !== undefined ? { cookie: jar.header() as string } : {}),
            ...extraHeaders,
        },
        body,
    });
    jar.ingest(res);
    return res;
}

async function get(
    ctx: Ctx,
    path: string,
    jar: ReturnType<typeof createCookieJar> = ctx.owner.jar,
): Promise<{ status: number; json: unknown; text: string }> {
    const res = await ctx.app.request(`${URL_BASE}${path}`, {
        method: 'GET',
        headers: jar.header() === undefined ? {} : { cookie: jar.header() as string },
    });
    const text = await res.text();
    return { status: res.status, json: text.length > 0 ? JSON.parse(text) : undefined, text };
}

/** What `AccountSongbook.prepare` freezes for a Save: one canonical serialization per operation. */
function freezeSave(
    account: Account,
    documentId: string,
    operationId: string,
    revision: string | null,
    document?: unknown,
): string {
    return JSON.stringify({
        protocolVersion: 1,
        ownerId: account.accountId,
        documentId,
        operationId,
        expectedRevision: revision,
        document: snapshot(document ?? makeChartDocument(documentId)),
    });
}

/** The delete envelope: the same four field names, in the one order the decoder accepts. */
function freezeDelete(envelope: {
    ownerId: string;
    documentId: string;
    operationId: string;
    expectedRevision: string;
}): string {
    return JSON.stringify({
        ownerId: envelope.ownerId,
        documentId: envelope.documentId,
        operationId: envelope.operationId,
        expectedRevision: envelope.expectedRevision,
    });
}

async function save(
    ctx: Ctx,
    account: Account,
    documentId: string,
    operationId: string,
    revision: string | null = null,
    document?: unknown,
): Promise<{ status: number; json: unknown; revision: string }> {
    const res = await post(
        ctx.app,
        account.jar,
        SAVE,
        freezeSave(account, documentId, operationId, revision, document),
    );
    const json = (await res.json()) as { revision: string };
    return { status: res.status, json, revision: json.revision };
}

async function remove(
    ctx: Ctx,
    account: Account,
    body: string,
    extraHeaders: Record<string, string> = {},
): Promise<{ status: number; json: unknown; text: string; res: Response }> {
    const res = await post(ctx.app, account.jar, DELETE, body, extraHeaders);
    const text = await res.text();
    return { status: res.status, json: text.length > 0 ? JSON.parse(text) : undefined, text, res };
}

interface ManifestReply {
    documents: { documentId: string; revision: string; deleted: boolean; bytes: number }[];
    nextAfterDocumentId: string | null;
}

function sessionCookie(token: string): Response {
    return new Response(null, {
        headers: { 'set-cookie': `__Host-ensemble_session=${token}; Path=/; Secure; HttpOnly` },
    });
}

describe('POST /api/documents/delete (#1260)', () => {
    let ctx: Ctx | undefined;
    afterEach(() => {
        ctx?.testDb.cleanup();
        ctx = undefined;
    });

    it('deletes the document, tombstones the id, and reports it as deleted everywhere', async () => {
        ctx = await setUp();
        const committed = await save(ctx, ctx.owner, 'doc-1', 'op-save');
        await save(ctx, ctx.owner, 'doc-2', 'op-save-2');

        const body = freezeDelete({
            ownerId: ctx.owner.accountId,
            documentId: 'doc-1',
            operationId: 'op-del',
            expectedRevision: committed.revision,
        });
        const { status, json, res } = await remove(ctx, ctx.owner, body);
        expect(status).toBe(200);
        expect(json).toEqual({
            ownerId: ctx.owner.accountId,
            documentId: 'doc-1',
            operationId: 'op-del',
            digest: await digest(body),
            // The revision the id died at, so a client can record the tombstone it now holds.
            revision: committed.revision,
            kind: 'deleted',
        });
        expect(res.headers.get('cache-control')).toBe('private, no-store');

        expect(readDocument(ctx.testDb.db, ctx.owner.accountId, 'doc-1')).toBeUndefined();
        expect(readTombstone(ctx.testDb.db, ctx.owner.accountId, 'doc-1')).toMatchObject({
            revision: committed.revision,
        });
        // The manifest is where a client learns an id was deleted, and the download must refuse it
        // exactly as it refuses an id that never existed.
        const page = (await get(ctx, MANIFEST)).json as ManifestReply;
        expect(page.documents).toEqual([
            { documentId: 'doc-1', revision: committed.revision, deleted: true, bytes: 0 },
            {
                documentId: 'doc-2',
                revision: expect.any(String),
                deleted: false,
                bytes: expect.any(Number),
            },
        ]);
        const deleted = await get(ctx, `${MANIFEST}/doc-1`);
        const absent = await get(ctx, `${MANIFEST}/never-saved`);
        expect(deleted.status).toBe(404);
        expect(deleted.text).toBe(absent.text);
        // The untouched document is still downloadable: the delete was scoped to one id.
        expect((await get(ctx, `${MANIFEST}/doc-2`)).status).toBe(200);
    });

    it('replays the same operation id byte-for-byte, and refuses the id with different bytes', async () => {
        ctx = await setUp();
        const one = await save(ctx, ctx.owner, 'doc-1', 'op-save');
        const two = await save(ctx, ctx.owner, 'doc-2', 'op-save-2');
        const body = freezeDelete({
            ownerId: ctx.owner.accountId,
            documentId: 'doc-1',
            operationId: 'op-del',
            expectedRevision: one.revision,
        });

        const first = await remove(ctx, ctx.owner, body);
        const again = await remove(ctx, ctx.owner, body);
        expect(again.status).toBe(first.status);
        // Byte-for-byte, not merely equivalent: a lost response is retried with the frozen request
        // and must be answered with the frozen reply.
        expect(again.text).toBe(first.text);

        // The same operation id pointed at another document is the same integrity failure as
        // different bytes for the same one: one operation id, one operation, never overwritten.
        const impostor = await remove(
            ctx,
            ctx.owner,
            freezeDelete({
                ownerId: ctx.owner.accountId,
                documentId: 'doc-2',
                operationId: 'op-del',
                expectedRevision: two.revision,
            }),
        );
        expect(impostor.status).toBe(409);
        expect(impostor.json).toEqual({ error: 'operation_mismatch' });
        expect(readDocument(ctx.testDb.db, ctx.owner.accountId, 'doc-2')).toMatchObject({
            revision: two.revision,
        });
        expect(readTombstone(ctx.testDb.db, ctx.owner.accountId, 'doc-2')).toBeUndefined();

        // A delete under an operation id a SAVE already committed is a mismatch too.
        const reused = await remove(
            ctx,
            ctx.owner,
            freezeDelete({
                ownerId: ctx.owner.accountId,
                documentId: 'doc-2',
                operationId: 'op-save-2',
                expectedRevision: two.revision,
            }),
        );
        expect(reused.status).toBe(409);
        expect(reused.json).toEqual({ error: 'operation_mismatch' });
    });

    it('a stale expected revision answers the conflict envelope and deletes nothing', async () => {
        ctx = await setUp();
        const first = await save(ctx, ctx.owner, 'doc-1', 'op-save');
        const edited = { ...makeChartDocument('doc-1'), title: 'Edited elsewhere' };
        const second = await save(ctx, ctx.owner, 'doc-1', 'op-save-2', first.revision, edited);
        const before = (await get(ctx, MANIFEST)).text;

        const body = freezeDelete({
            ownerId: ctx.owner.accountId,
            documentId: 'doc-1',
            operationId: 'op-del',
            expectedRevision: first.revision,
        });
        const { status, json } = await remove(ctx, ctx.owner, body);
        expect(status).toBe(409);
        // The same envelope the Save route answers a conflict with, so the client has one shape to
        // handle: the receipt fields, the current revision, and the remote version to Keep-both.
        expect(json).toEqual({
            ownerId: ctx.owner.accountId,
            documentId: 'doc-1',
            operationId: 'op-del',
            digest: await digest(body),
            revision: second.revision,
            kind: 'conflict',
            remote: { revision: second.revision, document: snapshot(edited) },
        });
        expect(readDocument(ctx.testDb.db, ctx.owner.accountId, 'doc-1')).toMatchObject({
            revision: second.revision,
        });
        expect(readTombstone(ctx.testDb.db, ctx.owner.accountId, 'doc-1')).toBeUndefined();
        // Nothing moved at all: no receipt, and the manifest is byte-identical to before.
        expect(readReceipt(ctx.testDb.db, ctx.owner.accountId, 'op-del')).toBeUndefined();
        expect((await get(ctx, MANIFEST)).text).toBe(before);

        // Retried after an uncertain response, the frozen request re-evaluates to the same answer.
        expect((await remove(ctx, ctx.owner, body)).status).toBe(409);
        // And the delete at the CURRENT revision succeeds — the conflict was about the revision,
        // not about the operation.
        expect(
            (
                await remove(
                    ctx,
                    ctx.owner,
                    freezeDelete({
                        ownerId: ctx.owner.accountId,
                        documentId: 'doc-1',
                        operationId: 'op-del-2',
                        expectedRevision: second.revision,
                    }),
                )
            ).status,
        ).toBe(200);
    });

    it('a stale Save cannot resurrect a deleted id, by create or by update, replays included', async () => {
        ctx = await setUp();
        const committed = await save(ctx, ctx.owner, 'doc-1', 'op-save');
        expect(
            (
                await remove(
                    ctx,
                    ctx.owner,
                    freezeDelete({
                        ownerId: ctx.owner.accountId,
                        documentId: 'doc-1',
                        operationId: 'op-del',
                        expectedRevision: committed.revision,
                    }),
                )
            ).status,
        ).toBe(200);

        // The contract's non-resurrection rule, over HTTP and after a real delete: an offline
        // device that queued a create, and one that queued an update against the revision the
        // document died at, are BOTH refused — with `remote: null`, because there is no version to
        // resolve against, only a tombstone.
        const create = await post(
            ctx.app,
            ctx.owner.jar,
            SAVE,
            freezeSave(ctx.owner, 'doc-1', 'op-create', null),
        );
        const createText = await create.text();
        expect(create.status).toBe(409);
        expect(JSON.parse(createText)).toMatchObject({
            kind: 'conflict',
            revision: committed.revision,
            remote: null,
        });
        const update = await post(
            ctx.app,
            ctx.owner.jar,
            SAVE,
            freezeSave(ctx.owner, 'doc-1', 'op-update', committed.revision),
        );
        const updateText = await update.text();
        expect(update.status).toBe(409);
        expect(JSON.parse(updateText)).toMatchObject({
            kind: 'conflict',
            revision: committed.revision,
            remote: null,
        });

        // Replayed — the same frozen requests sent again. A Save conflict writes no receipt, so
        // these re-evaluate rather than replay, and must reach the identical answer.
        const createAgain = await post(
            ctx.app,
            ctx.owner.jar,
            SAVE,
            freezeSave(ctx.owner, 'doc-1', 'op-create', null),
        );
        expect(createAgain.status).toBe(409);
        expect(await createAgain.text()).toBe(createText);
        const updateAgain = await post(
            ctx.app,
            ctx.owner.jar,
            SAVE,
            freezeSave(ctx.owner, 'doc-1', 'op-update', committed.revision),
        );
        expect(updateAgain.status).toBe(409);
        expect(await updateAgain.text()).toBe(updateText);

        expect(readDocument(ctx.testDb.db, ctx.owner.accountId, 'doc-1')).toBeUndefined();
        // Not a tautology: a FRESH id still saves for this owner.
        expect((await save(ctx, ctx.owner, 'doc-2', 'op-save-2')).status).toBe(200);
    });

    it("a foreign owner's id, an absent id, and a bad owner claim are all refused without disclosure", async () => {
        ctx = await setUp();
        const strangers = await save(ctx, ctx.stranger, 'private-chart', 'op-stranger');

        // A foreign id must be byte-identical to one that never existed — status, body and the
        // cache header. The owner predicate is in the SQL, so this is structural, but it is the
        // property that decides whether one account can probe another's library.
        const foreign = await remove(
            ctx,
            ctx.owner,
            freezeDelete({
                ownerId: ctx.owner.accountId,
                documentId: 'private-chart',
                operationId: 'op-probe',
                expectedRevision: strangers.revision,
            }),
        );
        const missing = await remove(
            ctx,
            ctx.owner,
            freezeDelete({
                ownerId: ctx.owner.accountId,
                documentId: 'never-saved',
                operationId: 'op-probe-2',
                expectedRevision: strangers.revision,
            }),
        );
        expect(foreign.status).toBe(404);
        expect(foreign.status).toBe(missing.status);
        expect(foreign.text).toBe(missing.text);
        expect(foreign.json).toEqual({ error: 'not_found' });
        expect(foreign.res.headers.get('cache-control')).toBe(
            missing.res.headers.get('cache-control'),
        );
        // Nothing was written under either account — not even a receipt, so the probe cost the
        // caller its rate budget and nothing else.
        expect(readDocument(ctx.testDb.db, ctx.stranger.accountId, 'private-chart')).toMatchObject({
            revision: strangers.revision,
        });
        expect(readTombstone(ctx.testDb.db, ctx.owner.accountId, 'private-chart')).toBeUndefined();
        expect(readReceipt(ctx.testDb.db, ctx.owner.accountId, 'op-probe')).toBeUndefined();

        // An envelope claiming another owner is refused as malformed, exactly like Save: the
        // body's owner is a routing hint that must AGREE with the session, never authority.
        const mismatched = await remove(
            ctx,
            ctx.owner,
            freezeDelete({
                ownerId: ctx.stranger.accountId,
                documentId: 'private-chart',
                operationId: 'op-spoof',
                expectedRevision: strangers.revision,
            }),
        );
        expect(mismatched.status).toBe(400);
        expect(mismatched.json).toEqual({ error: 'malformed_request' });
        expect(
            readTombstone(ctx.testDb.db, ctx.stranger.accountId, 'private-chart'),
        ).toBeUndefined();

        // Not a tautology: the account that OWNS it can delete it.
        expect(
            (
                await remove(
                    ctx,
                    ctx.stranger,
                    freezeDelete({
                        ownerId: ctx.stranger.accountId,
                        documentId: 'private-chart',
                        operationId: 'op-own',
                        expectedRevision: strangers.revision,
                    }),
                )
            ).status,
        ).toBe(200);
    });

    it('answers a second delete of an already-deleted id idempotently, without a second tombstone', async () => {
        ctx = await setUp();
        const committed = await save(ctx, ctx.owner, 'doc-1', 'op-save');
        const first = await remove(
            ctx,
            ctx.owner,
            freezeDelete({
                ownerId: ctx.owner.accountId,
                documentId: 'doc-1',
                operationId: 'op-del',
                expectedRevision: committed.revision,
            }),
        );
        expect(first.status).toBe(200);

        // A second device's queued delete, under its own operation id — and even one quoting a
        // revision that never existed. A tombstone is terminal: the caller's goal is already the
        // state of the world, so this is not a conflict and not a 404.
        for (const [operationId, revision] of [
            ['op-del-2', committed.revision],
            ['op-del-3', 'rev-nonsense'],
        ]) {
            const repeat = await remove(
                ctx,
                ctx.owner,
                freezeDelete({
                    ownerId: ctx.owner.accountId,
                    documentId: 'doc-1',
                    operationId: operationId as string,
                    expectedRevision: revision as string,
                }),
            );
            expect({ operationId, status: repeat.status }).toEqual({ operationId, status: 200 });
            expect(repeat.json).toMatchObject({ kind: 'deleted', revision: committed.revision });
        }
        expect(
            (ctx.testDb.db.prepare('SELECT COUNT(*) AS n FROM tombstones').get() as { n: number })
                .n,
        ).toBe(1);
        expect(readTombstone(ctx.testDb.db, ctx.owner.accountId, 'doc-1')).toMatchObject({
            revision: committed.revision,
        });
    });

    it('accounts for the delete: the body comes back, the receipts and tombstone stay charged', async () => {
        ctx = await setUp();
        const committed = await save(ctx, ctx.owner, 'doc-1', 'op-save');
        const storedBytes = Buffer.byteLength(
            JSON.stringify(snapshot(makeChartDocument('doc-1'))),
            'utf8',
        );
        expect(readOwnerUsage(ctx.testDb.db, ctx.owner.accountId)).toMatchObject({
            documents: 1,
            documentBytes: storedBytes,
            receipts: 1,
            tombstones: 0,
            bytes: storedBytes + RECEIPT_COST_BYTES,
        });

        await remove(
            ctx,
            ctx.owner,
            freezeDelete({
                ownerId: ctx.owner.accountId,
                documentId: 'doc-1',
                operationId: 'op-del',
                expectedRevision: committed.revision,
            }),
        );
        expect(readOwnerUsage(ctx.testDb.db, ctx.owner.accountId)).toMatchObject({
            documents: 0,
            documentBytes: 0,
            // The Save's receipt, the delete's own receipt, and one tombstone: all permanent.
            receipts: 2,
            tombstones: 1,
            bytes: 3 * RECEIPT_COST_BYTES,
        });
    });

    it('deletes while the owner is at the storage cap — the cap can never refuse the remedy', async () => {
        ctx = await setUp();
        const committed = await save(ctx, ctx.owner, 'doc-1', 'op-save');
        // Fill the owner to the shipped document cap. One transaction, not 2,000 separate commits
        // (see `seedDocuments` in test/db/save.test.ts for the measured reason).
        const insert = ctx.testDb.db.prepare(
            'INSERT INTO documents (owner_id, document_id, revision, body, updated_at)' +
                ' VALUES (?, ?, ?, ?, 1)',
        );
        ctx.testDb.db.exec('BEGIN');
        for (let i = 0; i < MAX_DOCUMENTS_PER_OWNER - 1; i += 1) {
            insert.run(ctx.owner.accountId, `seed-${i}`, `seed-rev-${i}`, '{}');
        }
        ctx.testDb.db.exec('COMMIT');

        // At the cap a Save create is refused: this owner is out of room, which is the state a
        // delete has to work in.
        const blocked = await post(
            ctx.app,
            ctx.owner.jar,
            SAVE,
            freezeSave(ctx.owner, 'doc-new', 'op-new', null),
        );
        expect(blocked.status).toBe(409);
        expect(await blocked.json()).toEqual({ error: 'quota_exceeded' });

        // The delete is not refused, even though here it makes the owner's BYTE footprint bigger
        // (a small body traded for a receipt and a tombstone). A quota gate on this route would
        // lock an account out of the only operation that gives storage back.
        const freed = await remove(
            ctx,
            ctx.owner,
            freezeDelete({
                ownerId: ctx.owner.accountId,
                documentId: 'doc-1',
                operationId: 'op-del',
                expectedRevision: committed.revision,
            }),
        );
        expect(freed.status).toBe(200);
        expect(readOwnerUsage(ctx.testDb.db, ctx.owner.accountId).documents).toBe(
            MAX_DOCUMENTS_PER_OWNER - 1,
        );
        // And the freed slot is immediately usable — on a fresh id, never the tombstoned one.
        expect((await save(ctx, ctx.owner, 'doc-new', 'op-new-2')).status).toBe(200);
    }, 30_000);

    it('requires a full session and the usual transport guards', async () => {
        ctx = await setUp();
        const committed = await save(ctx, ctx.owner, 'doc-1', 'op-save');
        const body = freezeDelete({
            ownerId: ctx.owner.accountId,
            documentId: 'doc-1',
            operationId: 'op-del',
            expectedRevision: committed.revision,
        });

        const anonymous: Account = { jar: createCookieJar(), accountId: ctx.owner.accountId };
        const unauth = await remove(ctx, anonymous, body);
        expect(unauth.status).toBe(401);
        expect(unauth.json).toEqual({ error: 'unauthenticated' });
        expect(unauth.res.headers.get('cache-control')).toBe('private, no-store');

        const crossOrigin = await remove(ctx, ctx.owner, body, { origin: 'https://evil.example' });
        expect(crossOrigin.status).toBe(403);
        const wrongType = await remove(ctx, ctx.owner, body, { 'content-type': 'text/plain' });
        expect(wrongType.status).toBe(415);
        const withQuery = await post(ctx.app, ctx.owner.jar, `${DELETE}?ownerId=attacker`, body);
        expect(withQuery.status).toBe(400);
        expect(await withQuery.json()).toEqual({ error: 'malformed_request' });

        // A recovery-only session can do nothing but enroll a passkey — least of all delete a song.
        const recovery = issueSession(
            ctx.testDb.db,
            ctx.owner.accountId,
            Date.now(),
            60_000,
            null,
            'recovery',
        );
        const recoveryJar = createCookieJar();
        recoveryJar.ingest(sessionCookie(recovery.token));
        const refused = await remove(
            ctx,
            { jar: recoveryJar, accountId: ctx.owner.accountId },
            body,
        );
        expect(refused.status).toBe(401);
        expect(refused.json).toEqual({ error: 'unauthenticated' });

        // Nothing above touched the document.
        expect(readDocument(ctx.testDb.db, ctx.owner.accountId, 'doc-1')).toMatchObject({
            revision: committed.revision,
        });
        // Not a tautology: a STANDARD session minted the same way, carried the same way, deletes.
        const standard = issueSession(ctx.testDb.db, ctx.owner.accountId, Date.now(), 60_000, null);
        const standardJar = createCookieJar();
        standardJar.ingest(sessionCookie(standard.token));
        expect(
            (await remove(ctx, { jar: standardJar, accountId: ctx.owner.accountId }, body)).status,
        ).toBe(200);
    });

    it('refuses anything outside the canonical envelope', async () => {
        ctx = await setUp();
        const committed = await save(ctx, ctx.owner, 'doc-1', 'op-save');
        const base = {
            ownerId: ctx.owner.accountId,
            documentId: 'doc-1',
            operationId: 'op-del',
            expectedRevision: committed.revision,
        };
        const bodies: Record<string, string> = {
            // Reordered keys: a valid JSON object with the same content, and not the one canonical
            // serialization — accepting it would mean two byte sequences per operation id.
            reordered: JSON.stringify({
                documentId: base.documentId,
                ownerId: base.ownerId,
                operationId: base.operationId,
                expectedRevision: base.expectedRevision,
            }),
            whitespace: JSON.stringify(base, null, 2),
            unknownKey: JSON.stringify({ ...base, cascade: true }),
            missingKey: JSON.stringify({
                ownerId: base.ownerId,
                documentId: base.documentId,
                operationId: base.operationId,
            }),
            // `null` is Save's "create this document"; there is no such thing for a delete.
            nullRevision: JSON.stringify({ ...base, expectedRevision: null }),
            badRevision: JSON.stringify({ ...base, expectedRevision: 'rev 1' }),
            badDocumentId: JSON.stringify({ ...base, documentId: 'doc 1' }),
            longOperationId: JSON.stringify({ ...base, operationId: 'x'.repeat(129) }),
            array: JSON.stringify([base]),
            notJson: 'nonsense',
            // The Save envelope's own keys, minus its chart: a different operation's shape is not
            // a superset to be tolerated. (A real Save envelope, chart included, never reaches the
            // decoder at all — it is bigger than this route's 1 KiB limit, asserted below.)
            saveEnvelopeKeys: JSON.stringify({ protocolVersion: 1, ...base, document: {} }),
        };
        for (const [name, body] of Object.entries(bodies)) {
            const refused = await remove(ctx, ctx.owner, body);
            expect({ name, status: refused.status, json: refused.json }).toEqual({
                name,
                status: 400,
                json: { error: 'malformed_request' },
            });
        }
        // A whole Save envelope — the shape a confused client is likeliest to send here — is
        // refused by the body limit before the decoder ever sees it, because a chart does not fit
        // in 1 KiB. Recorded as 413 rather than folded into the loop above: which guard refuses it
        // is the point.
        const asSave = await remove(
            ctx,
            ctx.owner,
            freezeSave(ctx.owner, 'doc-1', 'op-del', committed.revision),
        );
        expect(asSave.status).toBe(413);

        expect(readDocument(ctx.testDb.db, ctx.owner.accountId, 'doc-1')).toMatchObject({
            revision: committed.revision,
        });
        // Not a tautology: the canonical form of the very same request is accepted.
        expect((await remove(ctx, ctx.owner, freezeDelete(base))).status).toBe(200);
    });

    it('bounds the body far below the Save ceiling, and enforces its own per-identity budget', async () => {
        ctx = await setUp();
        const committed = await save(ctx, ctx.owner, 'doc-1', 'op-save');
        const body = freezeDelete({
            ownerId: ctx.owner.accountId,
            documentId: 'doc-1',
            operationId: 'op-del',
            expectedRevision: committed.revision,
        });
        // The legal maximum for this envelope is 653 bytes (three 128-character identifiers and a
        // 200-character revision, none of which need escaping), so the 1 KiB ceiling is not in a
        // real client's way. Over it is 413 from the route's own limiter, NOT the ~1 MiB Save
        // ceiling this prefix would otherwise inherit — proven over a real socket too, in
        // body-limit.socket.test.ts, because `bodyLimit`'s Content-Length branch trusts a declared
        // length and only an HTTP parser enforces framing.
        expect(body.length).toBeLessThan(MAX_DELETE_REQUEST_BYTES);
        const oversized = await remove(ctx, ctx.owner, 'x'.repeat(MAX_DELETE_REQUEST_BYTES + 1));
        expect(oversized.status).toBe(413);
        expect(oversized.json).toEqual({ error: 'payload_too_large' });
        // The same body IS under the Save route's ceiling, so the small limit is this route's own
        // rather than something the prefix already did.
        const atSave = await post(
            ctx.app,
            ctx.owner.jar,
            SAVE,
            'x'.repeat(MAX_DELETE_REQUEST_BYTES + 1),
        );
        expect(atSave.status).toBe(400);

        const { max } = DOCUMENT_POLICIES[`POST ${DELETE}`]!;
        for (let i = 0; i < max; i += 1) {
            // The first deletes; the rest replay off its receipt. Either way each spends a unit.
            expect((await remove(ctx, ctx.owner, body)).status).toBe(200);
        }
        const blocked = await remove(ctx, ctx.owner, body);
        expect(blocked.status).toBe(429);
        expect(blocked.json).toEqual({ error: 'rate_limited' });
        expect(Number(blocked.res.headers.get('Retry-After'))).toBeGreaterThan(0);
        // The manifest's budget is its own — exhausting the delete budget did not spend it.
        expect((await get(ctx, MANIFEST)).status).toBe(200);
        // An anonymous caller never reaches this budget: 401 first, every time.
        const anonymous: Account = { jar: createCookieJar(), accountId: ctx.owner.accountId };
        expect((await remove(ctx, anonymous, body)).status).toBe(401);
    });
});
