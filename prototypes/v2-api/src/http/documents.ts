import type { DatabaseSync } from 'node:sqlite';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { identifier } from '../../../v2/lib/sync/protocol.js';
import {
    decodeSaveRequest,
    MAX_SAVE_REQUEST_BYTES,
    SaveRequestError,
} from '../../../v2/lib/sync/request.js';
import { createRateLimiter } from '../auth/rate-limit.js';
import type { SessionClaims } from '../auth/session.js';
import { commitDelete } from '../db/document-delete.js';
import { listManifest, MAX_LIST_LIMIT, readDocument } from '../db/documents.js';
import { commitSave, type SaveDependencies } from '../db/save.js';
import {
    DeleteRequestError,
    decodeDeleteRequest,
    MAX_DELETE_REQUEST_BYTES,
} from './document-delete-request.js';
import { sendError } from './errors.js';

/**
 * `POST /api/documents/save` — the Explicit Save endpoint (#1202, stage 3 story 2).
 *
 * The route does four things and nothing else: establish the owner from the SESSION, decode
 * the raw body with the canonical decoder the client's `prepare()` is the mirror of
 * (`prototypes/v2/lib/sync/request.ts` — one decoder, one codec, shared with the client via
 * the bundle, rollout decision 7), commit through `commitSave` in one transaction, and answer
 * in the `SaveReply` shape `prototypes/v2/lib/sync/protocol.ts`'s `reply()` validates:
 *
 *   200 `{ ownerId, documentId, operationId, digest, revision, kind: 'committed' }`
 *   409 `{ …, kind: 'conflict', remote: { revision, document } | null }`
 *   409 `{ error: 'operation_mismatch' }` — same operation id, different bytes
 *   400 `{ error: 'malformed_request' }` — anything the decoder refuses, INCLUDING an envelope
 *       whose `ownerId` is not the session's account (the body's owner is a routing hint, never
 *       authority; the decoder rejects a disagreement rather than "correcting" it)
 *   401 `{ error: 'unauthenticated' }` — including a Save that raced #1271's account deletion:
 *       `commitSave` re-checks the owner still exists inside its transaction, so a session
 *       whose account was deleted between `requireSession` and the commit answers `401`, not a
 *       foreign-key `500`
 *
 * The parent app's `/api/*` chain already applied security headers (`private, no-store`), the
 * transport rate limit, same-origin, JSON-only and the 64 KB body limit EXCEPT for this
 * prefix — the Save ceiling is the document limit plus the envelope allowance
 * (`MAX_SAVE_REQUEST_BYTES`), applied here instead. A conflict is a normal protocol reply,
 * not an auth decision, so nothing here sets `authErrorCode` except through `sendError`.
 *
 * ---
 *
 * `GET /api/documents` and `GET /api/documents/:id` — the owner-bound library read routes
 * (#1259, stage 3). Together they are the whole of S1 in `docs/design/ensemble-v2-rollout.md`
 * decision 9: the client pages a manifest and diffs it against its local records, then
 * downloads the ids whose revision moved. There is deliberately no change feed, watermark or
 * cursor expiry to build — see `listManifest` in `db/documents.ts` for why an id-ordered keyset
 * page is all the stability a diff needs.
 *
 *   200 `{ documents: [{ documentId, revision, deleted, bytes }], nextAfterDocumentId }`
 *   200 `{ documentId, revision, document }` — one document, its stored bytes verbatim
 *   400 `{ error: 'malformed_request' }` — an unknown/repeated query key, a `limit` that is not
 *       an integer in 1..`MAX_LIST_LIMIT`, or an `after`/`:id` outside the identifier grammar
 *   404 `{ error: 'not_found' }` — the id is absent, tombstoned, or another owner's. These are
 *       ONE response, not three: `readDocument`'s owner predicate is in the SQL and a deleted
 *       document has no row, so indistinguishability here is structural rather than a branch
 *       somebody could later get wrong. A caller who is not entitled to know that an id exists
 *       cannot learn it from the status, the body, or the headers.
 *   401 `{ error: 'unauthenticated' }` — including a recovery-purpose session, via `requireSession`
 *   500 `{ error: 'internal_error' }` — the stored body is not one well-formed JSON object, which
 *       the write path already guarantees; the download re-checks it rather than splicing an
 *       unvalidated string into its reply. See the handler for why.
 *
 * ---
 *
 * `POST /api/documents/delete` — explicit cloud deletion with a tombstone (#1260, stage 3). The
 * sync contract's deletion rule is that removing a cloud document is an explicit online operation
 * leaving a tombstone, never a side effect of dropping a local copy, and that a stale Save cannot
 * resurrect the deleted id. The decision table is `commitDelete` in `db/document-delete.ts` and
 * the reply shapes are on the handler; the two properties worth stating up here are that it runs
 * the SAME receipt/revision/transaction path as Save (so a duplicate sender is safe) and that it
 * is exempt from the storage quota's refusal (so an account at its cap can still use the one
 * operation that frees space).
 *
 * ---
 *
 * **Why a safe method is not a cross-site read.** `sameOriginGuard` and `jsonOnlyGuard` exempt
 * `GET`/`HEAD`/`OPTIONS` (`http-safe-methods.ts`), so neither runs here. That is not a hole: the
 * session cookie is `__Host-`-prefixed and `SameSite=Strict` (`cookies.ts`), so a cross-site
 * navigation or `fetch` carries no credentials at all and these routes answer it `401`. A
 * same-origin-only `fetch` that DOES carry the cookie is the app itself. Nothing is cached or
 * readable by a third party either — `securityHeaders` puts `Cache-Control: private, no-store`
 * on every response, and there is no CORS middleware anywhere in this service, so a foreign
 * page's reader never gets the body even if a browser sent the request. Do not "fix" this by
 * extending the unsafe-method guards to `GET`: it takes nothing away from an attacker, and it
 * would refuse the app's own manifest fetch on any page load that sends no `Origin`.
 */

export interface DocumentRoutesOptions {
    db: DatabaseSync;
    now: () => number;
    identify: (c: Context) => string;
    requireSession: (
        c: Context,
    ) => { ok: true; claims: SessionClaims } | { ok: false; response: Response };
    save?: SaveDependencies;
}

/**
 * Per-identity document budgets, separate from the 300/min transport budget and applied AFTER
 * the session check (an anonymous caller only ever spends the transport budget). Keyed by route
 * like `AUTH_POLICIES` so the deny-by-default drift test can prove every registered route has
 * a policy — a new document route without an entry here fails that test, and the companion test
 * added by #1253 proves each key answers `401` to a cookie-less caller.
 *
 * **These are ceilings, not a budget that sums to the transport limit.** `transportRateLimitGuard`'s
 * 300/min is a SHARED ceiling over every `/api/*` request from one identity — `/api/auth/*`
 * included — and a per-route budget is only ever a promise the caller can keep if the transport
 * budget still has room left when it does. It is not an invariant this table maintains: the four
 * documented budgets sum to 30 + 180 + 120 + 30 = 360/min, already past the shared 300/min ceiling
 * before a single `/api/auth/*` request is counted — Save's own 120 is what breaks it, not
 * delete's addition. The #1259 authorization review demonstrated the consequence directly: a
 * client that spent both read budgets in one window got `429` on its next `GET /api/auth/session`
 * AND on Save, both of which it is entitled to. **Treat any `429` from this service as a signal to
 * back off across the WHOLE origin, not just the route that returned it** — a client paced to stay
 * under one route's number can still be over the shared one. And because
 * `transportRateLimitGuard`/`identify()` key by source address, every device sharing one NAT or
 * carrier gateway shares these budgets too, which is one more reason a route-local 429 says
 * nothing about how much of the shared ceiling is actually left.
 *
 * Sized against the per-owner document cap (2,000): a manifest page carries up to
 * `MAX_LIST_LIMIT` rows, so 30/min re-reads a full four-page library seven times a minute, and
 * a cold start of 2,000 documents at 180/min is a paced ~11 minutes of downloads. The pacing is
 * deliberate — a full library is a one-time cost on a new device, and the alternative is
 * starving the account routes it takes to stay signed in while it happens.
 *
 * Delete (#1260) is set at 30/min, the smallest of the four, because deleting is a rare human
 * act — a song removed, occasionally a handful in one sitting — and because it is the one route
 * whose receipt the storage quota will not refuse (step 4 of `commitDelete`), which leaves this
 * budget as the only thing bounding that residual. It is not sized against remaining headroom
 * under the shared ceiling, because there is none by the arithmetic above; it is sized against
 * what the operation itself needs.
 */
export const DOCUMENT_POLICIES: Readonly<Record<string, { max: number; windowMs: number }>> =
    Object.freeze({
        'GET /api/documents': { max: 30, windowMs: 60_000 },
        'GET /api/documents/:id': { max: 180, windowMs: 60_000 },
        'POST /api/documents/save': { max: 120, windowMs: 60_000 },
        'POST /api/documents/delete': { max: 30, windowMs: 60_000 },
    });

/** Manifest page size when the caller names none. */
export const DEFAULT_MANIFEST_LIMIT = 100;

/**
 * The only query keys the MANIFEST route accepts; anything else is `malformed_request`. The
 * download and Save routes accept no query string at all.
 */
const MANIFEST_QUERY_KEYS: readonly string[] = ['after', 'limit'];

/**
 * The identifier grammar the WRITE path enforces (`identifier` in the shared sync protocol,
 * via `decodeSaveRequest`), reused rather than re-expressed as a second regex here: a read
 * route that accepted ids the write route cannot produce would be validating a different
 * language from the one the database holds. `identifier` is an assertion that throws, so this
 * wraps it into the predicate the guards below want.
 */
function isIdentifier(value: string): boolean {
    try {
        identifier(value);
        return true;
    } catch {
        return false;
    }
}

type ManifestQuery = { ok: true; after: string | null; limit: number } | { ok: false };

/**
 * Deny-by-default query parsing for the manifest route, in the same spirit as `auth-policy.ts`'s
 * exact-key-set check and the Save route's outright refusal of any query string: an unknown key,
 * a repeated key, or a value outside its grammar is `400`, never a silently ignored or clamped
 * input. `limit` is REJECTED rather than clamped even though `listManifest` clamps it too — the
 * clamp is defense in depth for a future caller, but a client that asked for 10,000 rows has a
 * bug, and answering 500 rows to that request teaches it the wrong page size. Repeated keys
 * matter because `?limit=1&limit=500` otherwise resolves to whichever one `get` happens to
 * return.
 */
function manifestQuery(c: Context): ManifestQuery {
    const params = new URL(c.req.url).searchParams;
    for (const key of params.keys()) {
        if (!MANIFEST_QUERY_KEYS.includes(key) || params.getAll(key).length > 1) {
            return { ok: false };
        }
    }
    const after = params.get('after');
    if (after !== null && !isIdentifier(after)) {
        return { ok: false };
    }
    const rawLimit = params.get('limit');
    if (rawLimit === null) {
        return { ok: true, after, limit: DEFAULT_MANIFEST_LIMIT };
    }
    // An exact decimal integer with no sign, leading zero, fraction or whitespace: `Number` alone
    // would accept ' 5', '5.0', '0x10' and '1e2' and quietly page at a size nobody asked for.
    if (!/^[1-9][0-9]*$/.test(rawLimit)) {
        return { ok: false };
    }
    const limit = Number(rawLimit);
    return limit > MAX_LIST_LIMIT ? { ok: false } : { ok: true, after, limit };
}

export function documentRoutes({
    db,
    now,
    identify,
    requireSession,
    save,
}: DocumentRoutesOptions): Hono {
    const routes = new Hono();
    const limiters = new Map(
        Object.entries(DOCUMENT_POLICIES).map(
            ([route, policy]) => [route, createRateLimiter(policy)] as const,
        ),
    );
    /**
     * Spend one unit of a route's own budget, returning the `429` to hand back or `undefined` to
     * continue. Every caller invokes this AFTER `requireSession` — the budget belongs to an
     * authenticated identity, and an anonymous caller must never be able to exhaust one.
     */
    function overBudget(c: Context, route: string): Response | undefined {
        const budget = limiters.get(route)!(identify(c), now());
        if (budget.allowed) {
            return undefined;
        }
        c.header('Retry-After', String(Math.ceil(budget.retryAfterMs / 1000)));
        return sendError(c, 429, 'rate_limited');
    }

    // On every path under the prefix, not only `/save`, so an unknown document path is bounded
    // exactly like an unknown auth path is (the parent's 64 KB limit is gated OFF this prefix).
    routes.use(
        '*',
        bodyLimit({
            maxSize: MAX_SAVE_REQUEST_BYTES,
            onError: (c) => sendError(c, 413, 'payload_too_large'),
        }),
    );

    /**
     * The S1 manifest page. Guard order is the Save route's, unchanged: session, then the
     * syntactic refusal of a request nobody legitimate sends, then this route's own budget, then
     * the database. The owner comes from the session and goes straight into `listManifest`'s
     * `WHERE` — nothing here reads an owner, a cursor's owner, or a "whose library" hint from
     * the caller, so there is no fetch-then-filter step to get wrong.
     */
    routes.get('/', (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        const query = manifestQuery(c);
        if (!query.ok) {
            return sendError(c, 400, 'malformed_request');
        }
        const rejected = overBudget(c, 'GET /api/documents');
        if (rejected !== undefined) {
            return rejected;
        }
        const page = listManifest(db, session.claims.accountId, query);
        // `nextAfterDocumentId` is the name the client's own `SongPage` already uses for this
        // cursor (`prototypes/v2/lib/sync/repository.ts`), so the wire and the local store speak
        // one vocabulary; `documentId` matches the Save reply for the same reason.
        return c.json({ documents: page.entries, nextAfterDocumentId: page.nextAfter });
    });

    /**
     * Download one document. Absent, tombstoned and another owner's id are one `404` with one
     * body — see this file's header comment for why that is structural here rather than a branch.
     * A tombstone is deliberately NOT reported as a deleted marker on this route: the manifest is
     * where a client learns an id was deleted, it never needs to download one to find out, and
     * an explicit marker would be a second shape to keep indistinguishable from the other two.
     */
    routes.get('/:id', (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        const documentId = c.req.param('id');
        // Same deny-by-default as Save: this route's whole input is the path segment, so a query
        // string is an unexpected input. The id is checked against the write path's own grammar,
        // which discloses nothing about the account — it is the same public grammar the client
        // mints ids with — and keeps a value the database can never hold out of the query.
        if (new URL(c.req.url).search.length !== 0 || !isIdentifier(documentId)) {
            return sendError(c, 400, 'malformed_request');
        }
        const rejected = overBudget(c, 'GET /api/documents/:id');
        if (rejected !== undefined) {
            return rejected;
        }
        const row = readDocument(db, session.claims.accountId, documentId);
        if (row === undefined) {
            return sendError(c, 404, 'not_found');
        }
        // The stored TEXT is spliced in VERBATIM rather than parsed and re-serialized. What
        // `commitSave` wrote is exactly the document bytes the client froze and this service
        // digested (`decodeSaveRequest` refuses a body that is not that canonical serialization),
        // and a `JSON.parse` -> `JSON.stringify` round trip is not guaranteed to reproduce them
        // byte for byte — an object with integer-like keys comes back reordered. Handing back the
        // stored bytes keeps the download identical to what the receipt's digest covers.
        // `JSON.stringify` on the two string fields is what keeps the hand-assembled envelope
        // well-formed JSON. The Save route's conflict reply parses instead, because there the
        // document is nested inside a reply object built from computed values; that is not an
        // inconsistency to "unify" in this direction.
        //
        // **Splicing is only safe while `body` is ONE well-formed JSON object, and this is the
        // backstop for that** (#1259 review, F3). The guarantee itself comes from the write path:
        // `commitSave` only ever stores `JSON.stringify(decoded.document)`, and `decodeSaveRequest`
        // has already accepted that document through the portable codec. But nothing asserted it
        // HERE, and a body of `{"a":1},"injected":true` — reachable through `writeDocument`, which
        // the Save transaction is not the only conceivable caller of — splices into an envelope
        // with a smuggled top-level key that the client would then read as protocol. So: parse
        // purely as a validity check and throw the result away, keeping the verbatim text as the
        // thing actually sent. A bare parse is not enough either, because `1`, `"x"` and `[]` are
        // all valid JSON values that would land in the `document` slot and shape-shift the reply;
        // a plain object is the only acceptable top-level form. A row that fails this is a broken
        // server, not a bad request, so it answers `500` through the normal taxonomy and the body
        // is never echoed — a malformed row may be the one carrying something worth not logging.
        let stored: unknown;
        try {
            stored = JSON.parse(row.body);
        } catch {
            return sendError(c, 500, 'internal_error');
        }
        if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
            return sendError(c, 500, 'internal_error');
        }
        const envelope = `{"documentId":${JSON.stringify(row.documentId)},"revision":${JSON.stringify(row.revision)},"document":${row.body}}`;
        return c.body(envelope, 200, { 'content-type': 'application/json' });
    });

    routes.post('/save', async (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        // Deny-by-default, same as every auth route (auth-policy.ts): the endpoint takes its
        // whole input from the body, so any query string is an unexpected input, refused.
        if (new URL(c.req.url).search.length !== 0) {
            return sendError(c, 400, 'malformed_request');
        }
        const rejected = overBudget(c, 'POST /api/documents/save');
        if (rejected !== undefined) {
            return rejected;
        }

        // The RAW bytes, never a re-parsed and re-serialized substitute: the decoder pins the
        // canonical serialization and digests exactly what arrived.
        const body = await c.req.text();
        let decoded: Awaited<ReturnType<typeof decodeSaveRequest>>;
        try {
            decoded = await decodeSaveRequest(body, session.claims.accountId);
        } catch (error) {
            if (error instanceof SaveRequestError) {
                return sendError(c, 400, 'malformed_request');
            }
            // A missing `crypto.subtle` or similar is a broken server, not a bad request.
            throw error;
        }

        const outcome = commitSave(
            db,
            {
                ownerId: session.claims.accountId,
                documentId: decoded.documentId,
                operationId: decoded.operationId,
                digest: decoded.digest,
                expectedRevision: decoded.expectedRevision,
                body: JSON.stringify(decoded.document),
                now: now(),
            },
            save,
        );

        const receipt = {
            ownerId: session.claims.accountId,
            documentId: decoded.documentId,
            operationId: decoded.operationId,
            digest: decoded.digest,
        };
        if (outcome.kind === 'owner_gone') {
            // The session's account was deleted (#1271) after `requireSession` read the cookie
            // but before this write committed. `401`, the same answer every other route gives a
            // deleted account's cookie — not `500`: nothing about this request or the server is
            // broken, the account this session names is simply gone.
            return sendError(c, 401, 'unauthenticated');
        }
        if (outcome.kind === 'operation_mismatch') {
            return sendError(c, 409, 'operation_mismatch');
        }
        // 409 rather than 413 or 507, following `operation_mismatch` exactly: the server refuses
        // this write against the account's current state and retrying the same bytes cannot
        // help. 413 already means "this one request is too big", which is a different thing the
        // client fixes differently, and a 5xx would invite the transport's retry logic for what
        // is a terminal, user-actionable state ("your library is full").
        if (outcome.kind === 'quota_exceeded') {
            // Deliberately the bare code: `outcome.limit`/`usage`/`cap` stop here rather than
            // going on the wire, because the taxonomy in errors.ts is `{ error: <code> }` and
            // nothing yet consumes the distinction. #1245 decides whether stage 5's UX needs it.
            return sendError(c, 409, 'quota_exceeded');
        }
        if (outcome.kind === 'conflict') {
            return c.json(
                {
                    ...receipt,
                    revision: outcome.revision,
                    kind: 'conflict',
                    remote:
                        outcome.remote === null
                            ? null
                            : {
                                  revision: outcome.remote.revision,
                                  document: JSON.parse(outcome.remote.body) as unknown,
                              },
                },
                409,
            );
        }
        return c.json({ ...receipt, revision: outcome.revision, kind: 'committed' });
    });

    /**
     * The delete route's own body ceiling (#1260). Registered as middleware — `routes.use`, not a
     * second handler argument to `routes.post` — for two reasons: `use` registers with method
     * `ALL`, which the deny-by-default route-drift test in `test/http/auth-hardening.test.ts`
     * filters out, whereas `post('/delete', limiter, handler)` would register the path TWICE and
     * break that comparison; and it bounds every WRITE-method request reaching `/delete`, not only
     * the `POST` this file handles today — a future `PUT`/`PATCH` handler added at this path would
     * inherit the same ceiling for free.
     *
     * **This does NOT cover `GET /api/documents/delete`, and cannot by moving where it is
     * registered.** That request matches `GET /:id` above (registered earlier, `id` bound to
     * `'delete'`), so if this middleware ran first it would still hand off to that handler, which
     * reads only the path and query — never `c.req.text()`/`.json()`/`.raw.body`. It does not
     * matter either way, because a `GET` request cannot carry an observable body into this app at
     * all: `@hono/node-server` never attaches a `body` stream to the Fetch `Request` it builds for
     * `GET`/`HEAD` (mirroring the Fetch spec, which forbids a body on those methods), so
     * `bodyLimit`'s own `if (!c.req.raw.body) return next()` short-circuits before it ever looks at
     * `Content-Length` — verified directly against the installed `hono` middleware source and by a
     * probe (`c.req.raw.body === null` for every `GET`, in-memory `app.request()` included). No
     * registration order changes that, so don't "fix" this by moving the middleware above `GET
     * /:id` — it would look like a fix and buy nothing.
     *
     * This nests inside the sub-app's `MAX_SAVE_REQUEST_BYTES` catch-all above. The outer limit
     * cannot be the only one here: the whole `/api/documents/` prefix is exempt from the parent
     * app's 64 KB limit (`app.ts`) so that a Save can carry a chart, and a delete request is 653
     * bytes at its legal maximum — inheriting a ~1 MiB ceiling would let an oversized body be
     * buffered through this process for no reason. Proven over a real socket in
     * `test/http/body-limit.socket.test.ts`, not only over `app.request()`, because
     * `bodyLimit`'s Content-Length branch trusts a declared length and only a real HTTP parser
     * enforces framing — see that file's header.
     */
    routes.use(
        '/delete',
        bodyLimit({
            maxSize: MAX_DELETE_REQUEST_BYTES,
            onError: (c) => sendError(c, 413, 'payload_too_large'),
        }),
    );

    /**
     * `POST /api/documents/delete` — explicit cloud deletion with a tombstone (#1260).
     *
     * Guard order is the Save route's, unchanged: session, then the syntactic refusal of a request
     * nobody legitimate sends, then this route's own budget, then the database. The decision table
     * itself is `commitDelete` in `db/document-delete.ts`, one `BEGIN IMMEDIATE` transaction; this
     * handler only maps its outcome onto the wire.
     *
     *   200 `{ ownerId, documentId, operationId, digest, revision, kind: 'deleted' }` — the id is
     *       deleted and `revision` is the revision it died at. The SAME reply for a fresh delete,
     *       a replay of that operation id, and a later delete of an id already deleted: a caller
     *       learns the state of the world, never which of the three it caused.
     *   409 `{ …, kind: 'conflict', remote: { revision, document } }` — the id is live at another
     *       revision; nothing was deleted. The same envelope `commitSave` answers a conflict with,
     *       so a client has one conflict shape to handle for both operations.
     *   409 `{ error: 'operation_mismatch' }` — this operation id already committed other bytes.
     *   404 `{ error: 'not_found' }` — the owner has no such id and no tombstone for it. Identical
     *       to another owner's id, exactly as on the download route, and nothing is written, so a
     *       retry costs the caller nothing but its rate budget.
     *   400 `{ error: 'malformed_request' }` — anything the decoder refuses, INCLUDING an envelope
     *       whose `ownerId` is not the session's account and a query string of any kind.
     *   401 `{ error: 'unauthenticated' }` — including a recovery-purpose session.
     *   413 `{ error: 'payload_too_large' }` — above `MAX_DELETE_REQUEST_BYTES`.
     *
     * There is deliberately no `quota_exceeded` on this route: a delete is never refused for
     * storage, because it is the remedy for storage. See step 4 of `commitDelete`.
     */
    routes.post('/delete', async (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        // Deny-by-default, same as Save: the endpoint takes its whole input from the body, so any
        // query string is an unexpected input, refused.
        if (new URL(c.req.url).search.length !== 0) {
            return sendError(c, 400, 'malformed_request');
        }
        const rejected = overBudget(c, 'POST /api/documents/delete');
        if (rejected !== undefined) {
            return rejected;
        }

        // The RAW bytes, never a re-parsed and re-serialized substitute: the decoder pins the
        // canonical serialization and digests exactly what arrived.
        const body = await c.req.text();
        let decoded: Awaited<ReturnType<typeof decodeDeleteRequest>>;
        try {
            decoded = await decodeDeleteRequest(body, session.claims.accountId);
        } catch (error) {
            if (error instanceof DeleteRequestError) {
                return sendError(c, 400, 'malformed_request');
            }
            // A missing `crypto.subtle` or similar is a broken server, not a bad request.
            throw error;
        }

        const outcome = commitDelete(db, {
            ownerId: session.claims.accountId,
            documentId: decoded.documentId,
            operationId: decoded.operationId,
            digest: decoded.digest,
            expectedRevision: decoded.expectedRevision,
            now: now(),
        });

        const receipt = {
            ownerId: session.claims.accountId,
            documentId: decoded.documentId,
            operationId: decoded.operationId,
            digest: decoded.digest,
        };
        if (outcome.kind === 'operation_mismatch') {
            return sendError(c, 409, 'operation_mismatch');
        }
        if (outcome.kind === 'not_found') {
            return sendError(c, 404, 'not_found');
        }
        if (outcome.kind === 'conflict') {
            return c.json(
                {
                    ...receipt,
                    revision: outcome.revision,
                    kind: 'conflict',
                    // Parsed rather than spliced, exactly as the Save route's conflict reply does
                    // it: the document is nested inside a reply built from computed values, not
                    // handed back as the whole body (which is why the DOWNLOAD route splices).
                    remote: {
                        revision: outcome.remote.revision,
                        document: JSON.parse(outcome.remote.body) as unknown,
                    },
                },
                409,
            );
        }
        // `replayed`/`performed` stop here: which call did the deleting is not something a caller
        // can act on, and two callers racing must not be able to tell each other apart.
        return c.json({ ...receipt, revision: outcome.revision, kind: 'deleted' });
    });

    return routes;
}
