import type { DownloadOutcome, LibraryTransport, ManifestOutcome } from '../sync/download';
import type { AccountApi, ApiError } from './api';
import type { AccountSession } from './session';

/**
 * The real `LibraryTransport` (`lib/sync/download.ts`) over the #1259 read routes, built on the
 * one `/api/*` wrapper (`api.ts`) exactly as `transport.ts` builds the Save transport. There is
 * no `fetch` here, no second error taxonomy and no retry policy: this file only translates an
 * `ApiResult` into the outcome vocabulary the download pass already reasons about.
 *
 * It is the mirror image of `createSaveTransport`'s posture, for the mirror-image reason. A Save
 * carries work that must not be lost, so every failure THROWS and keeps the operation queued. A
 * download carries nothing of the user's, so a failure is a fact to report rather than an
 * exception: the pass records it, stays incomplete, and the caller decides whether to run again.
 * Only the two outcomes that must stop the pass outright — an expired session and a back-off —
 * get their own kinds, because continuing past either would spend the shared 300/min transport
 * budget on requests the server has already said it will refuse.
 *
 * **`retryAfterSeconds` is always null**, and that is a deliberate consequence of going through
 * `api.ts`: it returns a parsed body and a status, never headers, so the server's `Retry-After`
 * is not reachable from here. The download pass already treats null as "use
 * `BACKOFF_FALLBACK_MS`", which is one minute — the document routes' own window
 * (`DOCUMENT_POLICIES` in the API) is also one minute, so the fallback is never shorter than the
 * real answer would have been. Surfacing the exact header would mean widening `ApiResult` for
 * one caller; do that when something needs a tighter wait, not to remove this comment.
 */

/** Everything `stop` did not claim: a fact to report, never a reason to stop asking. */
function failed(error: ApiError): { kind: 'failed'; reason: 'network' | 'server'; detail: string } {
    if (error.kind === 'network') {
        return { kind: 'failed', reason: 'network', detail: 'The server could not be reached.' };
    }
    return {
        kind: 'failed',
        reason: 'server',
        detail:
            error.kind === 'code'
                ? `The server refused the request: ${error.code}.`
                : `The server answered ${error.status} with an unrecognized body.`,
    };
}

export function createLibraryTransport(api: AccountApi, session: AccountSession): LibraryTransport {
    /** Shared by both routes: the two outcomes that end a pass, or null to keep classifying. */
    const stop = (
        error: ApiError,
    ): { kind: 'expired' } | { kind: 'backoff'; retryAfterSeconds: null } | null => {
        if (error.kind !== 'code') {
            return null;
        }
        if (error.code === 'unauthenticated') {
            // The session outlived the server's opinion of it, exactly as on the Save path.
            // Nothing local is touched: a download that cannot run changes no records.
            session.markExpired();
            return { kind: 'expired' };
        }
        return error.code === 'rate_limited' ? { kind: 'backoff', retryAfterSeconds: null } : null;
    };

    return {
        async manifest(after: string | null, limit: number): Promise<ManifestOutcome> {
            const query = new URLSearchParams();
            if (after !== null) {
                query.set('after', after);
            }
            query.set('limit', String(limit));
            const result = await api.get<unknown>(`/api/documents?${query}`);
            if (result.ok) {
                // Every shape assertion about the page belongs to `readManifestPage`, which
                // rejects the whole pass on a bad row. Handing the value straight through keeps
                // one validator rather than two disagreeing ones.
                return { kind: 'page', page: result.value };
            }
            return stop(result.error) ?? failed(result.error);
        },

        async download(documentId: string): Promise<DownloadOutcome> {
            const result = await api.get<unknown>(
                `/api/documents/${encodeURIComponent(documentId)}`,
            );
            if (result.ok) {
                return { kind: 'body', body: result.value };
            }
            const halt = stop(result.error);
            if (halt) {
                return halt;
            }
            // Absent, tombstoned and another owner's id are ONE reply by design (#1259), so this
            // is never read as evidence of a deletion — only the manifest's explicit tombstone
            // row is, and the download pass removes nothing on the strength of a 404.
            if (result.error.kind === 'code' && result.error.code === 'not_found') {
                return { kind: 'missing' };
            }
            return failed(result.error);
        },
    };
}
