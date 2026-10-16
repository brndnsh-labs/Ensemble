import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { recordSecurityEvent } from '../../src/auth/security-events.js';
import { issueSession } from '../../src/auth/session.js';
import { MAX_ADMIN_ACCOUNT_ROWS } from '../../src/db/admin-overview.js';
import { ADMIN_POLICIES } from '../../src/http/admin.js';
import { createApp } from '../../src/http/app.js';
import { createCookieJar } from '../helpers/cookie-jar.js';
import { createSoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * #1717: the operator overview over the real route and a real migrated database. Accounts that
 * sign in are made by real registration ceremonies, so the session the gate reads is a real one;
 * the rest of the population is seeded rows, which is all a count needs.
 */
const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'ensembletest.brndn.zip',
    rpName: 'Ensemble Test',
    origin: 'https://ensembletest.brndn.zip',
});
const URL_BASE = 'https://ensembletest.brndn.zip';
const OVERVIEW = '/api/admin/overview';
const DAY = 24 * 60 * 60 * 1000;

let testDb: TestDatabase | undefined;
afterEach(() => {
    testDb?.cleanup();
    testDb = undefined;
});

type Jar = ReturnType<typeof createCookieJar>;

async function register(app: ReturnType<typeof createApp>): Promise<{ jar: Jar; id: string }> {
    const jar = createCookieJar();
    const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
    const options = await post(app, jar, '/api/auth/register/options', '{}');
    const { options: opts } = (await options.json()) as { options: { challenge: string } };
    const verify = await post(
        app,
        jar,
        '/api/auth/register/verify',
        JSON.stringify(authenticator.register({ challenge: opts.challenge })),
    );
    expect(verify.status).toBe(200);
    return { jar, id: ((await verify.json()) as { accountId: string }).accountId };
}

async function post(app: ReturnType<typeof createApp>, jar: Jar, path: string, body: string) {
    const res = await app.request(`${URL_BASE}${path}`, {
        method: 'POST',
        headers: {
            origin: CONFIG.origin,
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(body)),
            ...(jar.header() !== undefined ? { cookie: jar.header() as string } : {}),
        },
        body,
    });
    jar.ingest(res);
    return res;
}

function get(app: ReturnType<typeof createApp>, path: string, cookie?: string) {
    return app.request(`${URL_BASE}${path}`, { headers: cookie ? { cookie } : {} });
}

/** Two apps over one database: the first to mint accounts, the second gated on one of them. */
async function setUp(now = () => Date.now()) {
    testDb = createTestDatabase();
    const minting = createApp({ db: testDb.db, config: CONFIG, now });
    const admin = await register(minting);
    const stranger = await register(minting);
    const make = (adminAccountIds?: string[]) =>
        createApp({ db: testDb!.db, config: CONFIG, now, adminAccountIds });
    return { db: testDb.db, admin, stranger, make };
}

async function snapshot(res: Response) {
    return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        cacheControl: res.headers.get('cache-control'),
        body: await res.text(),
    };
}

describe('GET /api/admin/overview', () => {
    it('refuses everyone off the list with the exact 404 an unknown route gets', async () => {
        const { db, admin, stranger, make } = await setUp();
        const app = make([admin.id]);
        const unknown = await snapshot(await get(app, '/api/admin/nothing-here'));
        expect(unknown.status).toBe(404);

        // Signed out, an account not on the list, and the listed account on an empty list.
        expect(await snapshot(await get(app, OVERVIEW))).toEqual(unknown);
        expect(await snapshot(await get(app, OVERVIEW, stranger.jar.header()))).toEqual(unknown);
        expect(await snapshot(await get(make([]), OVERVIEW, admin.jar.header()))).toEqual(unknown);
        expect(await snapshot(await get(make(), OVERVIEW, admin.jar.header()))).toEqual(unknown);

        // A recovery-only session for a listed account is not a standard session.
        const recovery = issueSession(db, admin.id, Date.now(), 60_000, null, 'recovery');
        const sessionCookie = admin.jar
            .header()!
            .split('; ')
            .find((pair) => pair.includes('ensemble_session='))!;
        const recoveryCookie = `${sessionCookie.split('=')[0]}=${recovery.token}`;
        expect(await snapshot(await get(app, OVERVIEW, recoveryCookie))).toEqual(unknown);
    });

    it('counts the service for a listed account, and never returns a full id', async () => {
        const now = Date.now();
        const { db, admin, stranger, make } = await setUp(() => now);
        // Seeded population: one joined 10 days ago, one 40 days ago, with charts.
        const insert = db.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)');
        insert.run('tenDaysAgoAccountId', now - 10 * DAY);
        insert.run('fortyDaysAgoAccountId', now - 40 * DAY);
        const doc = db.prepare(
            'INSERT INTO documents (owner_id, document_id, revision, body, updated_at) VALUES (?, ?, ?, ?, ?)',
        );
        doc.run('tenDaysAgoAccountId', 'd1', 'r1', 'x'.repeat(100), now);
        doc.run('tenDaysAgoAccountId', 'd2', 'r1', 'y'.repeat(50), now);
        doc.run(stranger.id, 'd3', 'r1', 'z'.repeat(10), now);
        recordSecurityEvent(db, { event: 'auth_failure', code: 'authentication_failed' }, now);
        // A recovery session is not a sign-in: it must count in neither place.
        issueSession(db, 'tenDaysAgoAccountId', now, 60_000, null, 'recovery');
        recordSecurityEvent(
            db,
            { event: 'auth_failure', code: 'authentication_failed' },
            now - 2 * DAY,
        );

        // The list matches whole ids: a prefix of the stranger's on it admits nobody.
        const app = make([stranger.id.slice(0, 3), admin.id]);
        const unknown = await snapshot(await get(app, '/api/admin/nothing-here'));
        expect(await snapshot(await get(app, OVERVIEW, stranger.jar.header()))).toEqual(unknown);

        const res = await get(app, OVERVIEW, admin.jar.header());
        expect(res.status).toBe(200);
        const text = await res.text();
        const body = JSON.parse(text);
        expect(body.accounts).toEqual({
            total: 4,
            cap: 25,
            remaining: 21,
            newLast7Days: 2,
            newLast30Days: 3,
            signedInLast7Days: 2,
        });
        expect(body.documents).toEqual({ total: 3, bytes: 160 });
        expect(body.authFailuresLast24Hours).toBe(1);
        expect(body.listTruncated).toBe(false);
        // Newest first; the two ceremonies share this test's frozen clock, so they tie on time.
        type Row = { shortId: string };
        const byShortId = (id: string) => body.list.find((row: Row) => row.shortId === id);
        expect(body.list.slice(2).map((row: Row) => row.shortId)).toEqual(['tenDaysA', 'fortyDay']);
        expect(byShortId(admin.id.slice(0, 8))).toMatchObject({
            you: true,
            passkeys: 1,
            documents: 0,
            lastSignInAt: now,
        });
        expect(byShortId(stranger.id.slice(0, 8))).toMatchObject({
            you: false,
            passkeys: 1,
            documents: 1,
            bytes: 10,
        });
        expect(body.list[2]).toMatchObject({ lastSignInAt: null, documents: 2, bytes: 150 });

        // Nothing addressable leaves: no full account id, no credential id, no chart body.
        const credentials = db.prepare('SELECT id FROM credentials').all() as Array<{ id: string }>;
        for (const secret of [
            admin.id,
            stranger.id,
            'tenDaysAgoAccountId',
            ...credentials.map((c) => c.id),
            'x'.repeat(100),
        ]) {
            expect(text).not.toContain(secret);
        }
    });

    it('counts charts by schema version and those with legacy fields, once each', async () => {
        const { db, admin, stranger, make } = await setUp();
        const doc = db.prepare(
            'INSERT INTO documents (owner_id, document_id, revision, body, updated_at) VALUES (?, ?, ?, ?, 1)',
        );
        type Band = Record<string, Record<string, unknown>>;
        const chart = (
            schemaVersion: unknown,
            patch: (band: Band, chart: Band) => void = () => {},
        ) => {
            const band: Band = {
                chords: { enabled: true },
                bass: { enabled: true },
                soloist: { enabled: true, mode: 'bebop' },
                groove: { swing: 0, genre: 'Rock' },
            };
            const content: Band = { arrangement: {}, performance: { bpm: 100 } };
            patch(band, content);
            return JSON.stringify({ schemaVersion, chart: { ...content, band } });
        };
        let n = 0;
        const put = (body: string, owner = admin.id) => doc.run(owner, `d${n++}`, 'r', body);
        put(chart(2));
        put(chart(2), stranger.id);
        put(chart(1));
        put(chart(1, (band) => delete band.groove.genre)); // missing genre: legacy
        put(chart(1, (band) => (band.groove.genreFeel = 'Rock')));
        put(chart('x')); // no usable version
        put('not json at all'); // not a chart
        put(JSON.stringify({ kind: 'collection', schemaVersion: 1, name: 'Set' })); // collection
        // One chart per legacy field family (each also bumps only the legacy count).
        const families: Array<(band: Band, content: Band) => void> = [
            (_b, c) => (c.arrangement.lastChordPreset = 'Pop'),
            (_b, c) => (c.performance.complexity = 0.5),
            (b) => (b.harmony = { style: 'x' }),
            (b) => (b.chords.style = 'x'),
            (b) => (b.chords.instrument = 'x'),
            (b) => (b.chords.octave = 4),
            (b) => (b.chords.density = 'rich'),
            (b) => (b.bass.style = 'x'),
            (b) => (b.bass.octave = 2),
            (b) => (b.soloist.style = 'x'),
            (b) => (b.soloist.preset = 'trumpet'),
            (b) => (b.soloist.octave = 5),
            (b) => (b.soloist.phrasingIntensity = 0.5),
            (b) => (b.soloist.tradeMode = 'loop'),
            (b) => (b.groove.measures = 2),
            (b) => (b.groove.lastDrumPreset = 'x'),
            (b) => (b.groove.lastSmartGenre = 'Rock'),
            (b) => (b.groove.pattern = []),
        ];
        for (const patch of families) {
            put(chart(2, patch));
        }
        // A deleted chart leaves a tombstone, not a document row: it counts nowhere.
        db.prepare(
            "INSERT INTO tombstones (owner_id, document_id, revision, deleted_at) VALUES (?, 'gone', 'r', 1)",
        ).run(admin.id);

        const body = await (await get(make([admin.id]), OVERVIEW, admin.jar.header())).json();
        expect(body.charts).toEqual({
            // 2 clean v2, 3 v1, 1 with no usable version, and one v2 per legacy family
            total: 2 + 3 + 1 + families.length,
            bySchemaVersion: { '1': 3, '2': 2 + families.length, unknown: 1 },
            withLegacyFields: 2 + families.length,
        });
        expect(body.documents.total).toBe(2 + 3 + 1 + 2 + families.length);
    });

    it('says when the list stops short of every account', async () => {
        const { db, admin, make } = await setUp();
        const insert = db.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)');
        for (let i = 0; i < MAX_ADMIN_ACCOUNT_ROWS; i += 1) {
            insert.run(`seeded${i}`, 1_000 + i);
        }
        const body = await (await get(make([admin.id]), OVERVIEW, admin.jar.header())).json();
        expect(body.list).toHaveLength(MAX_ADMIN_ACCOUNT_ROWS);
        expect(body.listTruncated).toBe(true);
        expect(body.accounts.remaining).toBe(0);
    });

    it('refuses a query string only once the caller is known, and has its own budget', async () => {
        const { admin, stranger, make } = await setUp();
        const app = make([admin.id]);
        const unknown = await snapshot(await get(app, '/api/admin/nothing-here'));
        expect(await snapshot(await get(app, `${OVERVIEW}?x=1`, stranger.jar.header()))).toEqual(
            unknown,
        );
        expect((await get(app, `${OVERVIEW}?x=1`, admin.jar.header())).status).toBe(400);

        const { max } = ADMIN_POLICIES['GET /api/admin/overview'];
        for (let i = 0; i < max; i += 1) {
            expect((await get(app, OVERVIEW, admin.jar.header())).status).toBe(200);
        }
        const over = await get(app, OVERVIEW, admin.jar.header());
        expect(over.status).toBe(429);
        // A refused caller never spends it, and is still told nothing.
        expect(await snapshot(await get(app, OVERVIEW, stranger.jar.header()))).toEqual(unknown);
    });

    it('has no write verb', async () => {
        const { admin, make } = await setUp();
        const res = await post(make([admin.id]), admin.jar, OVERVIEW, '{}');
        expect(res.status).toBe(404);
    });
});
