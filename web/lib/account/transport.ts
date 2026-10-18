import type { PreparedDelete, PreparedSave } from '../sync/protocol';
import type { SaveTransport } from '../sync/send';
import type { AccountApi, ApiError } from './api';
import type { AccountSession } from './session';

/**
 * `SaveTransport` (`lib/sync/send.ts`) has exactly two outcomes, and this file changes neither:
 * a REJECTED promise keeps the frozen operation queued and `sendNext` reports `'retry'`; a
 * RESOLVED value is handed straight to `songbook.acknowledge`, which validates it as a
 * `SaveReply` (`kind: 'committed' | 'conflict'`, `lib/sync/protocol.ts`'s `reply()`) and throws
 * on anything else.
 *
 * A bare `{ error: <code> }` body — quota, unauthenticated, malformed, rate-limited, whatever —
 * is therefore never RESOLVED from here: resolving it would reach `reply()` and fail with a
 * generic "Invalid Save response", discarding which code actually happened and, worse, doing so
 * as an uncaught rejection that `runOutboxPass` treats as a genuine storage/validation failure
 * (it ends the whole pass, not just this one document — see `drain.ts`'s doc comment). Throwing
 * `SaveTransportError` instead keeps the outbox's "queued, never lost" guarantee for every
 * failure code alike, while still preserving the real reason for a caller that inspects the
 * rejection (`instanceof SaveTransportError`) rather than only `sendNext`'s collapsed `'retry'`
 * outcome. Nothing in this repo does that yet — the outbox will retry a quota-exceeded or
 * signed-out document forever until something outside this file stops calling it — but that
 * "stop asking" decision belongs to the seam that shows a signed-out or over-quota state
 * (#1262/#1266), not to a change in what this transport resolves or throws.
 */
export class SaveTransportError extends Error {
    readonly reason: ApiError;

    constructor(reason: ApiError) {
        super(
            reason.kind === 'network'
                ? 'Save request failed: network unreachable.'
                : reason.kind === 'code'
                  ? `Save request failed: ${reason.code}.`
                  : 'Save request failed: unrecognized server response.',
        );
        this.name = 'SaveTransportError';
        this.reason = reason;
    }
}

/**
 * The real `SaveTransport`. Sends `request.body` — the frozen bytes `songbook.prepare()`
 * already serialized — VERBATIM as the POST body, including on a retry of the same operation:
 * this function never re-derives or re-stringifies the document.
 */
export function createSaveTransport(api: AccountApi, session: AccountSession): SaveTransport {
    return async (request: PreparedSave): Promise<unknown> => {
        const result = await api.post<unknown>('/api/documents/save', request.body);
        if (result.ok) {
            // A committed reply, or a conflict reply carrying the remote version: both are
            // `reply()`'s job to validate, not this file's.
            return result.value;
        }
        if (result.error.kind === 'code' && result.error.code === 'unauthenticated') {
            // The session outlived the server's opinion of it. Nothing is dropped: throwing
            // below still keeps this operation queued for whenever the user signs back in.
            session.markExpired();
        }
        throw new SaveTransportError(result.error);
    };
}

/** The delete route's half of `SaveTransportError`: the reason, kept for the caller to classify. */
export class DeleteTransportError extends Error {
    readonly reason: ApiError;

    constructor(reason: ApiError) {
        super(
            reason.kind === 'network'
                ? 'Delete request failed: network unreachable.'
                : reason.kind === 'code'
                  ? `Delete request failed: ${reason.code}.`
                  : 'Delete request failed: unrecognized server response.',
        );
        this.name = 'DeleteTransportError';
        this.reason = reason;
    }
}

export type DeleteTransport = (request: PreparedDelete) => Promise<unknown>;

/**
 * `POST /api/documents/delete` (#1260's route, #1270's caller), built exactly like the Save
 * transport above and for the same reasons.
 *
 * The RESOLVE/THROW split is the load-bearing part, and it is the server's taxonomy that draws it:
 * a `200 deleted` and a `409 conflict` are protocol replies with no `error` key, so `api.ts` reports
 * them as successes and they go straight to `deleteReply()` to be validated. Everything else is a
 * bare `{ error: <code> }` — including the `404 not_found` and `409 operation_mismatch` this route
 * adds — and is thrown, so which code it was survives for the caller to act on. That matters more
 * here than on the Save path: the caller has to decide from the reason whether the FROZEN OPERATION
 * ID may be dropped, and an outcome collapsed to "it failed" cannot answer that question.
 *
 * Nothing here retries. One delete is one deliberate human act, so the retry decision belongs to the
 * person, not to a transport that would be re-POSTing a destructive operation on its own.
 */
export function createDeleteTransport(api: AccountApi, session: AccountSession): DeleteTransport {
    return async (request: PreparedDelete): Promise<unknown> => {
        const result = await api.post<unknown>('/api/documents/delete', request.body);
        if (result.ok) {
            return result.value;
        }
        if (result.error.kind === 'code' && result.error.code === 'unauthenticated') {
            session.markExpired();
        }
        throw new DeleteTransportError(result.error);
    };
}
