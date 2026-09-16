import type { DatabaseSync } from 'node:sqlite';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
    decodeSaveRequest,
    MAX_SAVE_REQUEST_BYTES,
    SaveRequestError,
} from '../../../v2/lib/sync/request.js';
import { createRateLimiter } from '../auth/rate-limit.js';
import type { SessionClaims } from '../auth/session.js';
import { commitSave, type SaveDependencies } from '../db/save.js';
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
 *   401 `{ error: 'unauthenticated' }`
 *
 * The parent app's `/api/*` chain already applied security headers (`private, no-store`), the
 * transport rate limit, same-origin, JSON-only and the 64 KB body limit EXCEPT for this
 * prefix — the Save ceiling is the document limit plus the envelope allowance
 * (`MAX_SAVE_REQUEST_BYTES`), applied here instead. A conflict is a normal protocol reply,
 * not an auth decision, so nothing here sets `authErrorCode` except through `sendError`.
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
 * Per-identity Save budget, separate from the 300/min transport budget and applied AFTER the
 * session check (an anonymous caller only ever spends the transport budget). Keyed by route
 * like `AUTH_POLICIES` so the deny-by-default drift test can prove every registered route has
 * a policy — a new document route without an entry here fails that test.
 */
export const DOCUMENT_POLICIES: Readonly<Record<string, { max: number; windowMs: number }>> =
    Object.freeze({
        'POST /api/documents/save': { max: 120, windowMs: 60_000 },
    });

export function documentRoutes({
    db,
    now,
    identify,
    requireSession,
    save,
}: DocumentRoutesOptions): Hono {
    const routes = new Hono();
    const limiter = createRateLimiter(DOCUMENT_POLICIES['POST /api/documents/save']);

    // On every path under the prefix, not only `/save`, so an unknown document path is bounded
    // exactly like an unknown auth path is (the parent's 64 KB limit is gated OFF this prefix).
    routes.use(
        '*',
        bodyLimit({
            maxSize: MAX_SAVE_REQUEST_BYTES,
            onError: (c) => sendError(c, 413, 'payload_too_large'),
        }),
    );

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
        const budget = limiter(identify(c), now());
        if (!budget.allowed) {
            c.header('Retry-After', String(Math.ceil(budget.retryAfterMs / 1000)));
            return sendError(c, 429, 'rate_limited');
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

    return routes;
}
