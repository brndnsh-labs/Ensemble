import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig } from '../../src/auth/config.js';
import { FRESH_AUTH_WINDOW_MS } from '../../src/auth/fresh-auth.js';
import {
    ACCOUNT_DELETION_WIPED,
    assertAccountDeletionCoverage,
} from '../../src/db/account-deletion-registry.js';
import { createApp } from '../../src/http/app.js';
import { createCookieJar } from '../helpers/cookie-jar.js';
import { createSoftAuthenticator, type SoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * `POST /api/auth/account/delete` (#1271), against a real migrated `node:sqlite` database and the
 * real WebAuthn verify path — the way out the accounts contract requires before accounts ship.
 *
 * The clock is injected so the freshness window (`FRESH_AUTH_WINDOW_MS`) can be crossed without
 * sleeping: everything below is one session, either inside that window or deliberately past it.
 */

const config = createWebAuthnConfig({
    rpId: 'localhost',
    rpName: 'Ensemble Test',
    origin: 'http://localhost',
});
const URL_BASE = 'http://localhost';

let testDb: TestDatabase;
let cleanup: (() => void) | undefined;
let currentTime = 1_700_000_000_000;
afterEach(() => {
    cleanup?.();
    cleanup = undefined;
});

function setup() {
    testDb = createTestDatabase();
    cleanup = testDb.cleanup;
    currentTime = 1_700_000_000_000;
    return createApp({ db: testDb.db, config, now: () => currentTime });
}

type App = ReturnType<typeof createApp>;

async function send(app: App, route: string, body?: unknown, cookie?: string): Promise<Response> {
    const [method, path] = route.split(' ');
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    return app.request(`${URL_BASE}${path}`, {
        method,
        headers: {
            origin: config.origin,
            'content-type': 'application/json',
            ...(serialized === undefined
                ? {}
                : { 'content-length': String(Buffer.byteLength(serialized, 'utf8')) }),
            ...(cookie === undefined ? {} : { cookie }),
        },
        body: serialized,
    });
}

/** Registers a brand-new passkey on `jar`, returning the account it created. */
async function register(
    app: App,
    jar: ReturnType<typeof createCookieJar>,
    authenticator: SoftAuthenticator = createSoftAuthenticator({
        rpId: config.rpId,
        origin: config.origin,
    }),
): Promise<{ accountId: string; authenticator: SoftAuthenticator }> {
    const optionsRes = await send(app, 'POST /api/auth/register/options', undefined, jar.header());
    jar.ingest(optionsRes);
    const { options } = (await optionsRes.json()) as { options: { challenge: string } };
    const verifyRes = await send(
        app,
        'POST /api/auth/register/verify',
        authenticator.register({ challenge: options.challenge }),
        jar.header(),
    );
    jar.ingest(verifyRes);
    expect(verifyRes.status).toBe(200);
    const { accountId } = (await verifyRes.json()) as { accountId: string };
    return { accountId, authenticator };
}

/** Rows this account owns, per the registry's own column — the measurement the wipe must zero. */
function ownedRows(accountId: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const { table, column } of ACCOUNT_DELETION_WIPED) {
        const row = testDb.db
            .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
            .get(accountId) as unknown as { n: number };
        counts[table] = row.n;
    }
    return counts;
}

/**
 * Seeds the account-scoped rows the ceremonies themselves don't leave behind, so the wipe is
 * measured against a genuinely populated account: a saved document, its Save receipt, a tombstone
 * from a deleted one, a recovery code, and an unclaimed reauth challenge — a successful ceremony
 * consumes its own challenge row (`claimChallenge` is a `DELETE ... RETURNING`), so an ABANDONED
 * ceremony is both the only way to have one to wipe and the realistic case. `accounts`,
 * `credentials`, `sessions` and `auth_security_events` are already populated by registration.
 */
function seedAccountData(accountId: string, suffix: string): void {
    const at = currentTime;
    testDb.db
        .prepare(
            `INSERT INTO challenges (id, account_id, challenge, type, created_at, expires_at, ceremony_hash)
             VALUES (?, ?, ?, 'reauth', ?, ?, ?)`,
        )
        // Expiry on the REAL clock, not the injected one: `sweepExpiredChallenges` runs at the top
        // of every options call and `challenges.ts` reads `Date.now()` itself (see
        // `full-flow.test.ts`'s expired-ceremony test), so a row dated by `currentTime` alone is
        // swept away by the next ceremony before this test can measure it.
        .run(
            `ch-${suffix}`,
            accountId,
            `challenge-${suffix}`,
            at,
            Date.now() + 3_600_000,
            `hash-${suffix}`,
        );
    testDb.db
        .prepare(
            'INSERT INTO documents (owner_id, document_id, revision, body, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(accountId, `doc-${suffix}`, `rev-${suffix}`, '{"title":"Set list"}', at);
    testDb.db
        .prepare(
            `INSERT INTO receipts
                (owner_id, operation_id, document_id, request_digest, result_revision, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(accountId, `op-${suffix}`, `doc-${suffix}`, 'digest', `rev-${suffix}`, at);
    testDb.db
        .prepare(
            'INSERT INTO tombstones (owner_id, document_id, revision, deleted_at) VALUES (?, ?, ?, ?)',
        )
        .run(accountId, `gone-${suffix}`, `rev-gone-${suffix}`, at);
    testDb.db
        .prepare(
            'INSERT INTO recovery_codes (id, account_id, code_hash, created_at, confirmed_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(`code-${suffix}`, accountId, `hash-${suffix}`, at, at);
}

describe('POST /api/auth/account/delete (#1271)', () => {
    it('refuses an unauthenticated caller, and a valid-but-stale session, without touching a row', async () => {
        const app = setup();
        const jar = createCookieJar();
        const { accountId } = await register(app, jar);
        seedAccountData(accountId, 'a');
        const before = ownedRows(accountId);

        const anonymous = await send(app, 'POST /api/auth/account/delete');
        expect(anonymous.status).toBe(401);
        expect(await anonymous.json()).toEqual({ error: 'unauthenticated' });

        // Past the freshness window: the session is still perfectly valid (`GET session` is 200),
        // which is exactly the borrowed-tab case the gate exists for.
        currentTime += FRESH_AUTH_WINDOW_MS + 1;
        expect((await send(app, 'GET /api/auth/session', undefined, jar.header())).status).toBe(
            200,
        );
        const stale = await send(app, 'POST /api/auth/account/delete', undefined, jar.header());
        expect(stale.status).toBe(403);
        expect(await stale.json()).toEqual({ error: 'fresh_auth_required' });
        // Refused means refused: every row is still there, and so is the session.
        expect(ownedRows(accountId)).toEqual(before);
        expect((await send(app, 'GET /api/auth/session', undefined, jar.header())).status).toBe(
            200,
        );
    });

    it('wipes every row this owner has, leaves another account untouched, and registers the deletion', async () => {
        const app = setup();
        const jar = createCookieJar();
        const { accountId } = await register(app, jar);
        seedAccountData(accountId, 'a');

        // A second account on its own jar — the wipe must be owner-scoped, not "delete the table".
        const otherJar = createCookieJar();
        const { accountId: otherId } = await register(app, otherJar);
        seedAccountData(otherId, 'b');
        const otherBefore = ownedRows(otherId);
        expect(Object.values(otherBefore).every((n) => n > 0)).toBe(true);

        // Each jar registered without presenting the other's cookie, so the fixation defense never
        // fired and both accounts hold their own live, fresh session — two separate browsers.
        const before = ownedRows(accountId);
        expect(Object.values(before).every((n) => n > 0)).toBe(true);

        const deleted = await send(app, 'POST /api/auth/account/delete', undefined, jar.header());
        expect(deleted.status).toBe(204);
        // The cookie is cleared, because the session row it names no longer exists.
        expect(
            deleted.headers.getSetCookie().find((c) => c.startsWith('ensemble_session=')),
        ).toMatch(/Max-Age=0/);

        // Nothing of this owner remains in any table the registry classifies as wiped — except the
        // one row deletion deliberately writes back: its own metadata-only registration.
        const after = ownedRows(accountId);
        for (const { table } of ACCOUNT_DELETION_WIPED) {
            expect({ table, rows: after[table] }).toEqual({
                table,
                rows: table === 'auth_security_events' ? 1 : 0,
            });
        }
        const registration = testDb.db
            .prepare('SELECT * FROM auth_security_events WHERE account_id = ?')
            .all(accountId) as unknown as {
            event: string;
            credential_id: string | null;
            message: string | null;
            cause: string | null;
        }[];
        expect(registration).toHaveLength(1);
        expect(registration[0]).toMatchObject({
            event: 'account_deleted',
            credential_id: null,
            message: null,
            cause: null,
        });

        // The other account is exactly as it was, down to the row counts.
        expect(ownedRows(otherId)).toEqual(otherBefore);
        expect(
            (await send(app, 'GET /api/auth/session', undefined, otherJar.header())).status,
        ).toBe(200);

        // The schema is still fully classified after a real deletion ran over it.
        expect(() => assertAccountDeletionCoverage(testDb.db)).not.toThrow();
    });

    it('answers every route as signed-out for the old cookie, including a queued Save', async () => {
        const app = setup();
        const jar = createCookieJar();
        const { accountId } = await register(app, jar);
        seedAccountData(accountId, 'a');
        // A SECOND context holding a live session for the same account: a device that was signed
        // in elsewhere and has not heard about the deletion yet.
        const secondSession = jar.header() as string;

        expect(
            (await send(app, 'POST /api/auth/account/delete', undefined, jar.header())).status,
        ).toBe(204);

        for (const route of [
            'GET /api/auth/session',
            'GET /api/auth/passkeys',
            'GET /api/documents',
        ]) {
            const res = await send(app, route, undefined, secondSession);
            expect({ route, status: res.status }).toEqual({ route, status: 401 });
            expect(await res.json()).toEqual({ error: 'unauthenticated' });
        }
        for (const route of [
            'POST /api/auth/sessions/revoke-others',
            'POST /api/auth/account/delete',
        ]) {
            const res = await send(app, route, undefined, secondSession);
            expect({ route, status: res.status }).toEqual({ route, status: 401 });
        }

        // The disconnected device's queued Save is REFUSED, not quietly re-creating a document
        // row for an owner that no longer exists.
        const save = await send(
            app,
            'POST /api/documents/save',
            {
                documentId: 'doc-a',
                operationId: 'op-late',
                expectedRevision: null,
                document: { title: 'Set list', chart: {} },
            },
            secondSession,
        );
        expect(save.status).toBe(401);
        expect(testDb.db.prepare('SELECT COUNT(*) AS n FROM documents').get()).toMatchObject({
            n: 0,
        });
    });

    it('lets the same passkey register a brand-new account afterwards', async () => {
        const app = setup();
        const jar = createCookieJar();
        const { accountId, authenticator } = await register(app, jar);
        expect(
            (await send(app, 'POST /api/auth/account/delete', undefined, jar.header())).status,
        ).toBe(204);

        // Signing in with the deleted account's passkey is refused — the credential is gone with
        // everything else, and the collapsed taxonomy says nothing about which reason it was.
        const loginOptions = await send(app, 'POST /api/auth/login/options');
        const loginJar = createCookieJar();
        loginJar.ingest(loginOptions);
        const { options } = (await loginOptions.json()) as { options: { challenge: string } };
        const refused = await send(
            app,
            'POST /api/auth/login/verify',
            authenticator.authenticate({ challenge: options.challenge, userHandle: accountId }),
            loginJar.header(),
        );
        expect(refused.status).toBe(401);

        // But it is free to be registered again: deletion must not blacklist the credential id,
        // or a musician who deleted an account could never use that passkey to make another.
        const freshJar = createCookieJar();
        const { accountId: reborn } = await register(app, freshJar, authenticator);
        expect(reborn).not.toBe(accountId);
        expect(
            (await send(app, 'GET /api/auth/session', undefined, freshJar.header())).status,
        ).toBe(200);
    });
});
