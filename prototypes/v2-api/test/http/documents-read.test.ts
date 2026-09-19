import { afterEach, describe, expect, it } from 'vitest';
import { snapshot } from '../../../v2/lib/sync/protocol.js';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { issueSession } from '../../src/auth/session.js';
import { deleteDocument, MAX_LIST_LIMIT, writeDocument } from '../../src/db/documents.js';
import { createApp } from '../../src/http/app.js';
import { DEFAULT_MANIFEST_LIMIT, DOCUMENT_POLICIES } from '../../src/http/documents.js';
import { makeChartDocument } from '../fixtures/chart-document.js';
import { createCookieJar } from '../helpers/cookie-jar.js';
import { createSoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * #1259 acceptance over the real routes: `app.request()` against a disposable REAL `node:sqlite`
 * database (`createTestDatabase` runs the shipped migrations on a temp file), two real passkey
 * accounts for the two sessions, and real Saves through `POST /api/documents/save` for every
 * document under test — nothing is hand-inserted, so what the manifest reports is what the Save
 * protocol actually stored.
 *
 * The two load-bearing tests are the cross-owner one (a foreign id must be byte-identical to an
 * absent one, status AND body) and the page-boundary one (a Save landing between two page fetches
 * may not make the manifest skip or duplicate a document).
 */
const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'ensembletest.brndn.zip',
    rpName: 'Ensemble Test',
    origin: 'https://ensembletest.brndn.zip',
});
const URL_BASE = 'https://ensembletest.brndn.zip';
const MANIFEST = '/api/documents';
const SAVE = '/api/documents/save';

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

async function post(
    app: ReturnType<typeof createApp>,
    jar: ReturnType<typeof createCookieJar>,
    path: string,
    body: string,
): Promise<Response> {
    const res = await app.request(`${URL_BASE}${path}`, {
        method: 'POST',
        headers: {
            origin: CONFIG.origin,
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(body, 'utf8')),
            ...(jar.header() !== undefined ? { cookie: jar.header() as string } : {}),
        },
        body,
    });
    jar.ingest(res);
    return res;
}

/** A read exactly as a browser sends it: safe method, no `Origin`, no body, cookies attached. */
async function get(
    ctx: Ctx,
    path: string,
    jar: ReturnType<typeof createCookieJar> = ctx.owner.jar,
): Promise<{ status: number; json: unknown; text: string; res: Response }> {
    const res = await ctx.app.request(`${URL_BASE}${path}`, {
        method: 'GET',
        headers: jar.header() === undefined ? {} : { cookie: jar.header() as string },
    });
    const text = await res.text();
    return { status: res.status, json: text.length > 0 ? JSON.parse(text) : undefined, text, res };
}

/** What `AccountSongbook.prepare` freezes: one canonical serialization per operation. */
function freeze(
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

async function save(
    ctx: Ctx,
    account: Account,
    documentId: string,
    operationId: string,
    revision: string | null = null,
    document?: unknown,
): Promise<{ status: number; revision: string; body: string }> {
    const body = freeze(account, documentId, operationId, revision, document);
    const res = await post(ctx.app, account.jar, SAVE, body);
    const json = (await res.json()) as { revision: string };
    expect(res.status).toBe(200);
    return { status: res.status, revision: json.revision, body };
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

describe('GET /api/documents and GET /api/documents/:id (#1259)', () => {
    let ctx: Ctx | undefined;
    afterEach(() => {
        ctx?.testDb.cleanup();
        ctx = undefined;
    });

    it('lists the owner library by id with revisions and body bytes, and nothing of another owner', async () => {
        ctx = await setUp();
        const one = await save(ctx, ctx.owner, 'doc-b', 'op-1');
        const two = await save(ctx, ctx.owner, 'doc-a', 'op-2');
        // The stranger's library shares an id with the owner's; neither may see the other's row.
        await save(ctx, ctx.stranger, 'doc-a', 'op-3');

        const { status, json, res } = await get(ctx, MANIFEST);
        expect(status).toBe(200);
        const page = json as ManifestReply;
        // Ascending by id, NOT by save order: 'doc-a' was saved second and is listed first.
        expect(page.documents.map((row) => row.documentId)).toEqual(['doc-a', 'doc-b']);
        expect(page.documents.map((row) => row.revision)).toEqual([two.revision, one.revision]);
        expect(page.documents.every((row) => row.deleted === false)).toBe(true);
        // `bytes` is the stored body's UTF-8 length — the same unit the owner's quota counts.
        const storedBytes = Buffer.byteLength(
            JSON.stringify(snapshot(makeChartDocument('doc-a'))),
            'utf8',
        );
        expect(page.documents[0]?.bytes).toBe(storedBytes);
        expect(page.nextAfterDocumentId).toBeNull();
        expect(res.headers.get('cache-control')).toBe('private, no-store');

        const strangerPage = (await get(ctx, MANIFEST, ctx.stranger.jar)).json as ManifestReply;
        expect(strangerPage.documents.map((row) => row.documentId)).toEqual(['doc-a']);
        expect(strangerPage.documents[0]?.revision).not.toBe(two.revision);
    });

    it('reports a deleted id as a tombstone row in id order, so a client can drop its mirror', async () => {
        ctx = await setUp();
        await save(ctx, ctx.owner, 'doc-1', 'op-1');
        const middle = await save(ctx, ctx.owner, 'doc-2', 'op-2');
        await save(ctx, ctx.owner, 'doc-3', 'op-3');
        // Straight through the db primitive rather than `POST /api/documents/delete` (#1260, which
        // has its own suite): what is under test here is the manifest's tombstone leg, and the
        // primitive is the shortest way to a tombstone. Nothing else about this test changes when
        // the route is the producer.
        expect(deleteDocument(ctx.testDb.db, ctx.owner.accountId, 'doc-2', 5)).toBe(true);

        const page = (await get(ctx, MANIFEST)).json as ManifestReply;
        expect(page.documents).toEqual([
            {
                documentId: 'doc-1',
                revision: expect.any(String),
                deleted: false,
                bytes: expect.any(Number),
            },
            // Still at its own id position, carrying the revision it died at, costing no bytes.
            { documentId: 'doc-2', revision: middle.revision, deleted: true, bytes: 0 },
            {
                documentId: 'doc-3',
                revision: expect.any(String),
                deleted: false,
                bytes: expect.any(Number),
            },
        ]);
        // A tombstoned id is not downloadable, and looks exactly like an id that never existed.
        const tombstoned = await get(ctx, `${MANIFEST}/doc-2`);
        const absent = await get(ctx, `${MANIFEST}/doc-404`);
        expect(tombstoned.status).toBe(404);
        expect(tombstoned.text).toBe(absent.text);
        expect(tombstoned.json).toEqual({ error: 'not_found' });
    });

    it('pages by id, and a Save landing between pages neither skips nor duplicates a document', async () => {
        ctx = await setUp();
        for (const id of ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']) {
            await save(ctx, ctx.owner, id, `op-${id}`);
        }
        const first = (await get(ctx, `${MANIFEST}?limit=2`)).json as ManifestReply;
        expect(first.documents.map((row) => row.documentId)).toEqual(['doc-1', 'doc-2']);
        expect(first.nextAfterDocumentId).toBe('doc-2');

        // Two concurrent writes land between the pages, the two that break an `updated_at`-ordered
        // OFFSET page: an UPDATE of a document already returned (its updatedAt jumps to newest)
        // and a CREATE of a brand-new id. Neither may move a row across the cursor.
        const updated = await save(
            ctx,
            ctx.owner,
            'doc-1',
            'op-update',
            first.documents[0]?.revision ?? null,
            { ...makeChartDocument('doc-1'), title: 'Edited mid-page' },
        );
        await save(ctx, ctx.owner, 'doc-6', 'op-new');

        const seen = [...first.documents.map((row) => row.documentId)];
        let cursor: string | null = first.nextAfterDocumentId;
        while (cursor !== null) {
            const next: ManifestReply = (await get(ctx, `${MANIFEST}?after=${cursor}&limit=2`))
                .json as ManifestReply;
            seen.push(...next.documents.map((row) => row.documentId));
            cursor = next.nextAfterDocumentId;
        }
        expect(seen).toEqual(['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5', 'doc-6']);
        expect(new Set(seen).size).toBe(seen.length);
        // The update is visible where it belongs — at doc-1's revision, not at its position.
        const reread = (await get(ctx, `${MANIFEST}?limit=1`)).json as ManifestReply;
        expect(reread.documents[0]).toMatchObject({
            documentId: 'doc-1',
            revision: updated.revision,
        });
    });

    it("a foreign owner's document is byte-identical to one that never existed", async () => {
        ctx = await setUp();
        await save(ctx, ctx.stranger, 'private-chart', 'op-1');

        const foreign = await get(ctx, `${MANIFEST}/private-chart`);
        const absent = await get(ctx, `${MANIFEST}/never-saved`);
        expect(foreign.status).toBe(absent.status);
        expect(foreign.status).toBe(404);
        expect(foreign.text).toBe(absent.text);
        expect(foreign.json).toEqual({ error: 'not_found' });
        expect(foreign.res.headers.get('cache-control')).toBe(
            absent.res.headers.get('cache-control'),
        );
        // And it is absent from the manifest too, not merely refused by the download.
        const page = (await get(ctx, MANIFEST)).json as ManifestReply;
        expect(page.documents).toEqual([]);
        // Not a tautology: the same id IS visible to the account that owns it.
        expect((await get(ctx, `${MANIFEST}/private-chart`, ctx.stranger.jar)).status).toBe(200);
    });

    it("a foreign owner's TOMBSTONE never reaches another account's manifest", async () => {
        ctx = await setUp();
        // The tombstone leg is a second owner predicate in the manifest query, and until #1259's
        // review (F4) only the db-layer test covered it — an HTTP-level proof matters because
        // this is the row that tells a client to DELETE its local copy. Leaking one across owners
        // would make another account's delete destroy this account's song.
        await save(ctx, ctx.stranger, 'shared-id', 'op-stranger');
        expect(deleteDocument(ctx.testDb.db, ctx.stranger.accountId, 'shared-id', 9)).toBe(true);
        // The owner holds a LIVE document at the very same id, so a leak would also be visible
        // as a duplicate row rather than only as an extra one.
        const own = await save(ctx, ctx.owner, 'shared-id', 'op-owner');

        const page = (await get(ctx, MANIFEST)).json as ManifestReply;
        expect(page.documents).toEqual([
            {
                documentId: 'shared-id',
                revision: own.revision,
                deleted: false,
                bytes: expect.any(Number),
            },
        ]);
        expect(page.documents.filter((row) => row.deleted)).toEqual([]);
        // Not a tautology: the tombstone IS in the stranger's own manifest, exactly once.
        const strangerPage = (await get(ctx, MANIFEST, ctx.stranger.jar)).json as ManifestReply;
        expect(strangerPage.documents).toEqual([
            { documentId: 'shared-id', revision: expect.any(String), deleted: true, bytes: 0 },
        ]);
    });

    it('refuses to splice a stored body that is not one well-formed JSON object', async () => {
        ctx = await setUp();
        // The write path guarantees `documents.body` is `JSON.stringify(<validated document>)`;
        // the download re-checks it rather than trusting it, because it splices the text into its
        // reply verbatim (#1259 review, F3). `writeDocument` is the primitive that can put
        // anything there, so it is what a test has to use to reach the backstop.
        const bodies = {
            // Two JSON values where the envelope expects one: without the check this splices to
            // `{"documentId":…,"document":{"a":1},"injected":true}` — a smuggled top-level key
            // the client would read as protocol.
            smuggled: '{"a":1},"injected":true',
            garbage: 'not json at all',
            // Valid JSON, but not an object: it would shape-shift the `document` member.
            array: '[]',
        };
        for (const [id, body] of Object.entries(bodies)) {
            writeDocument(ctx.testDb.db, ctx.owner.accountId, {
                documentId: `bad-${id}`,
                revision: `rev-bad-${id}`,
                body,
                updatedAt: 1,
            });
            const res = await get(ctx, `${MANIFEST}/bad-${id}`);
            expect({ id, status: res.status, json: res.json }).toEqual({
                id,
                status: 500,
                json: { error: 'internal_error' },
            });
            // The refusal never echoes the stored body back.
            expect(res.text).not.toContain('injected');
            expect(res.text).not.toContain('not json');
        }
        // Not a tautology: a row the real Save wrote still downloads.
        await save(ctx, ctx.owner, 'doc-good', 'op-good');
        expect((await get(ctx, `${MANIFEST}/doc-good`)).status).toBe(200);
        // And a bad row does not break the manifest — it is listed, just not downloadable.
        const page = (await get(ctx, MANIFEST)).json as ManifestReply;
        expect(page.documents.map((row) => row.documentId)).toEqual([
            'bad-array',
            'bad-garbage',
            'bad-smuggled',
            'doc-good',
        ]);
    });

    it('downloads the stored bytes verbatim with the revision the Save minted', async () => {
        ctx = await setUp();
        const document = { ...makeChartDocument('doc-1'), title: 'Verbatim' };
        const committed = await save(ctx, ctx.owner, 'doc-1', 'op-1', null, document);

        const { status, text, res } = await get(ctx, `${MANIFEST}/doc-1`);
        expect(status).toBe(200);
        expect(res.headers.get('content-type')).toBe('application/json');
        expect(res.headers.get('cache-control')).toBe('private, no-store');
        // The document member is the exact substring the Save request carried — the same bytes
        // the receipt's digest was taken over, not a re-serialization of a parsed tree.
        const stored = JSON.stringify(snapshot(document));
        expect(text).toBe(
            `{"documentId":"doc-1","revision":${JSON.stringify(committed.revision)},"document":${stored}}`,
        );
        // And it is still what the client's own validator accepts.
        const parsed = JSON.parse(text) as { document: unknown };
        expect(snapshot(parsed.document)).toEqual(snapshot(document));
    });

    it('refuses a recovery-only session on both read routes, where a standard one succeeds', async () => {
        ctx = await setUp();
        await save(ctx, ctx.owner, 'doc-1', 'op-1');

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
        for (const path of [MANIFEST, `${MANIFEST}/doc-1`]) {
            const refused = await get(ctx, path, recoveryJar);
            expect(refused.status).toBe(401);
            expect(refused.json).toEqual({ error: 'unauthenticated' });
            expect(refused.res.headers.get('cache-control')).toBe('private, no-store');
        }
        // Not a tautology: a STANDARD session minted the same way, carried the same way, reads.
        const standard = issueSession(ctx.testDb.db, ctx.owner.accountId, Date.now(), 60_000, null);
        const standardJar = createCookieJar();
        standardJar.ingest(sessionCookie(standard.token));
        for (const path of [MANIFEST, `${MANIFEST}/doc-1`]) {
            expect((await get(ctx, path, standardJar)).status).toBe(200);
        }
    });

    it('validates the query and the id strictly, rejecting anything outside the contract', async () => {
        ctx = await setUp();
        await save(ctx, ctx.owner, 'doc-1', 'op-1');

        for (const path of [
            `${MANIFEST}?ownerId=attacker`, // an unknown key is never silently ignored
            `${MANIFEST}?limit=1&limit=500`, // a repeated key is ambiguous, not "last wins"
            `${MANIFEST}?after=`, // an empty cursor is not "from the start"
            `${MANIFEST}?after=doc%201`, // outside the identifier grammar
            `${MANIFEST}?limit=0`,
            `${MANIFEST}?limit=-1`,
            `${MANIFEST}?limit=1.5`,
            `${MANIFEST}?limit=+1`,
            `${MANIFEST}?limit=01`,
            `${MANIFEST}?limit=1e2`,
            `${MANIFEST}?limit=${MAX_LIST_LIMIT + 1}`, // rejected, not clamped
            `${MANIFEST}/doc%201`, // an id the write path could never have minted
            `${MANIFEST}/doc-1?ownerId=attacker`, // the download takes no query at all
        ]) {
            const refused = await get(ctx, path);
            expect({ path, status: refused.status, json: refused.json }).toEqual({
                path,
                status: 400,
                json: { error: 'malformed_request' },
            });
        }
        // The boundary values either side of those refusals are accepted.
        expect((await get(ctx, `${MANIFEST}?limit=1`)).status).toBe(200);
        expect((await get(ctx, `${MANIFEST}?limit=${MAX_LIST_LIMIT}`)).status).toBe(200);
        expect((await get(ctx, `${MANIFEST}?after=doc-1`)).status).toBe(200);
        expect((await get(ctx, `${MANIFEST}/doc-1`)).status).toBe(200);
    });

    it('defaults the page size, and spends a per-route budget only after the session check', async () => {
        ctx = await setUp();
        // One page holds the whole default window, so the default is what bounds a page here.
        for (let i = 0; i < 3; i += 1) {
            await save(ctx, ctx.owner, `doc-${i}`, `op-${i}`);
        }
        const page = (await get(ctx, MANIFEST)).json as ManifestReply;
        expect(page.documents).toHaveLength(3);
        expect(DEFAULT_MANIFEST_LIMIT).toBeLessThanOrEqual(MAX_LIST_LIMIT);

        const { max } = DOCUMENT_POLICIES[`GET ${MANIFEST}`]!;
        for (let i = 1; i < max; i += 1) {
            expect((await get(ctx, MANIFEST)).status).toBe(200);
        }
        const blocked = await get(ctx, MANIFEST);
        expect(blocked.status).toBe(429);
        expect(blocked.json).toEqual({ error: 'rate_limited' });
        expect(Number(blocked.res.headers.get('Retry-After'))).toBeGreaterThan(0);
        // The download's budget is its own — exhausting the manifest's did not spend it.
        expect((await get(ctx, `${MANIFEST}/doc-0`)).status).toBe(200);
        // An anonymous caller never reaches either budget: 401 first, every time.
        const anonymous = createCookieJar();
        expect((await get(ctx, MANIFEST, anonymous)).status).toBe(401);
    });
});
