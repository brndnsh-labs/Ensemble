import {
    BACKOFF_MAX_MS,
    BACKOFF_MIN_MS,
    type LibraryDownloadResult,
    type LibraryFacts,
} from '../sync/download';
import { OUTBOX_PAGE_LIMIT } from '../sync/drain';
import { MAX_REMOTE_CANDIDATES } from '../sync/repository';
import type { SaveTransport } from '../sync/send';
import type { Progress } from '../sync/status';
import type { ApiError, ApiErrorCode } from './api';
import type { CloudObservation, RemoteUpdate, SyncFailure, SyncSnapshot } from './sync-loop-types';
import { DELETE_MESSAGES, OWNER_MESSAGES, SYNC_MESSAGES } from './sync-messages';
import { SaveTransportError } from './transport';

export const NO_UPDATES: readonly RemoteUpdate[] = [];

/**
 * Whether a whole-playlist import into the account can be decided now (#1478 review R1, C1).
 *
 * The import counts room and looks for duplicates against what THIS device holds. A device still
 * downloading the account holds a fraction of it: importing a playlist another device already
 * imported would find no duplicates, pass a cap it is nowhere near on this device, and send creates
 * the server takes until it answers `quota_exceeded` — half a duplicate playlist in the account, and
 * every later pass stopped at the refused create. So the import waits for a SETTLED library:
 *
 * - `latest` is what the latest pass that read a complete manifest learned (`LibraryFacts`). Room
 *   never needed the bodies — the manifest counts every live document — so what blocks is only
 *   charts not yet fetched for a TRANSIENT reason (`unsettled`: not reached before the pass
 *   stopped, a network or server failure, a rate limit). Those are "still downloading", with the
 *   count.
 * - Charts settled without a copy here (`unverifiable`: held beside a draft or the open chart, a
 *   body needing an app update, missing, malformed) no download of this plan can change. They are
 *   counted for room and named to the musician as not checked for duplicates — never a reason to
 *   refuse forever.
 * - `latest` null (the latest pass read no manifest — offline, a failed page, nothing run yet)
 *   falls back to `lastSettled`, the latest settled facts in this page load; the server stays the
 *   authority for anything another device added since. With neither, it is refused.
 */
export function libraryCheck(
    latest: LibraryFacts | null,
    lastSettled: LibraryFacts | null,
): { kind: 'verified'; facts: LibraryFacts } | { kind: 'unverified'; message: string } {
    if (latest !== null) {
        if (latest.unsettled === 0) {
            return { kind: 'verified', facts: latest };
        }
        const count = (value: number) => value.toLocaleString('en-US');
        return {
            kind: 'unverified',
            message: `This device is still downloading your account library (${count(latest.charts - latest.unsettled)} of ${count(latest.charts)} songs), so it can’t yet check for songs you already have or count the room left. Nothing has been imported.`,
        };
    }
    if (lastSettled !== null) {
        return { kind: 'verified', facts: lastSettled };
    }
    return {
        kind: 'unverified',
        message:
            'This device hasn’t checked your account library yet, so it can’t look for songs you already have or count the room left. Try again once it is online and synced. Nothing has been imported.',
    };
}

/**
 * How long the one resume timer waits (#1478 review C5, C6): the time left in the back-off, or null
 * when there is none — or when it is not a finite number, which would otherwise make a timer fire
 * at once. Clamped to [`BACKOFF_MIN_MS`, `BACKOFF_MAX_MS`], so a wait can never become a tight loop
 * and a far-off floor is walked to in at most a minute at a time.
 */
export function resumeDelay(backoffUntil: number, now: number): number | null {
    const wait = backoffUntil - now;
    if (!Number.isFinite(wait) || wait <= 0) {
        return null;
    }
    return Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, wait));
}

/** An account import refused because the library is not verified yet (`libraryCheck`). */
export class LibraryUnverifiedError extends Error {}

/**
 * Is a chart that belongs to `owner` out of bounds for the account `attached` to this device
 * (#1311)? The ONE predicate both layers ask — the shell against what it believes is attached, the
 * loop against the scope it actually holds — so the two halves of the fence can never disagree
 * about what a mismatch is.
 *
 * A null on either side is deliberately NOT a mismatch. A null `owner` is a caller making no claim
 * at all (a brand-new document, an adopted guest song, a chart the stand opened before the loop
 * published an owner), which belongs to whichever account is live; a null `attached` is a device
 * holding no account, which is a different refusal with a different sentence — "signed out" — and
 * conflating the two would tell a musician their own chart belongs to somebody else.
 */
export function belongsToAnotherAccount(owner: string | null, attached: string | null): boolean {
    return owner !== null && attached !== null && owner !== attached;
}

/**
 * A write refused because the chart it carries belongs to another account (#1311).
 *
 * A typed error rather than a bare `Error` for the reason `AccountChangedError` and
 * `SaveTransportError` are: the refusal has to be distinguishable from a storage failure or a
 * lapsed session WITHOUT matching on the sentence, since the sentence is copy and copy moves.
 * `storeSave` and `retainInTab` in `app/ensemble.tsx` both branch on `instanceof` — a mismatch is
 * not a failed Save (`saveFailed` stays false for it) and not a storage error (the draft warning
 * drops its "Draft is only in this tab:" wrapper for it).
 *
 * The two owners ride along for diagnosis. Nothing renders them and nothing should: an account id
 * is a server identifier, and putting one in front of a musician explains nothing.
 */
export class AccountMismatchError extends Error {
    /** The account the caller says the chart belongs to, or null when it claimed none. */
    readonly chartOwner: string | null;
    /** The account this device actually holds, or null while it holds none. */
    readonly attachedOwner: string | null;

    constructor(chartOwner: string | null, attachedOwner: string | null) {
        super(OWNER_MESSAGES.mismatch);
        this.name = 'AccountMismatchError';
        this.chartOwner = chartOwner;
        this.attachedOwner = attachedOwner;
    }
}

export const UNOBSERVED: Progress = { required: null, verified: null };

/** One page per 25 documents (`OUTBOX_PAGE_LIMIT`) over the server's 2,000-document cap. */
export const OUTBOX_PAGE_CEILING = Math.ceil(MAX_REMOTE_CANDIDATES / OUTBOX_PAGE_LIMIT);

/**
 * The Save refusals that are a verdict on ONE document rather than on the server, the network or
 * the account as a whole — so `drain()` steps over that song and keeps sending the rest instead of
 * parking the whole outbox behind it. See `drain`'s doc comment for why that distinction has to be
 * made here: `sendNext` reports all three as the same `'retry'`.
 *
 * `quota_exceeded` is deliberately NOT in this set. A full library refuses the NEXT create for the
 * same reason, so continuing would spend requests that are all bound to fail; ending the pass is
 * the honest answer there.
 *
 * Neither is `not_found`, and for exactly that reason (#1298 patch review). The Save route never
 * answers 404 about a document: `commitSave` resolves an unknown or tombstoned id as a `conflict`
 * with `remote: null`, and the deletion route owns its own codes. The one thing on this origin that
 * emits 404 for `POST /api/documents/save` is the server's catch-all `app.notFound` — the route is
 * not mounted, an older image is serving, or a proxy rewrote the path. That is an account-wide
 * outage, not a verdict on one chart, so the next song would 404 for the same reason; stepping over
 * it would spend a request per song and — since a step-over is now DURABLE — permanently refuse an
 * entire library over a deployment mistake. It ends the pass, like `quota_exceeded`.
 */
export const STEP_OVER_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
    'payload_too_large',
    'operation_mismatch',
]);

export function failureFromApi(error: ApiError): SyncFailure {
    if (error.kind === 'network') {
        return { reason: 'offline', message: SYNC_MESSAGES.offline };
    }
    if (error.kind === 'unknown') {
        return { reason: 'server', message: SYNC_MESSAGES.server };
    }
    switch (error.code) {
        case 'unauthenticated':
            // `createSaveTransport` has already called `session.markExpired()`, so the header is
            // showing "Sign in again" by now; this is the queue's half of the same fact.
            return { reason: 'expired', message: SYNC_MESSAGES.expired };
        case 'quota_exceeded':
            return { reason: 'quota', message: SYNC_MESSAGES.quota };
        case 'payload_too_large':
            return { reason: 'too-large', message: SYNC_MESSAGES.tooLarge };
        case 'operation_mismatch':
            // A verdict about these exact bytes, not a wait: the account has spent this operation
            // id on something else. The default below would promise a retry that can only be
            // refused again — see `SYNC_MESSAGES.refused`.
            //
            // `not_found` is deliberately NOT folded in here any more (#1298 patch review). It is
            // never a per-document answer on this route — see `STEP_OVER_CODES` — so it falls to
            // the `server` default below, which is the truthful reading of an unmounted route: the
            // library could not be reached, and the retry it promises is the thing that works once
            // the deployment is fixed. "Save it as a copy" would send the musician to make copies
            // that 404 for the same reason.
            return { reason: 'refused', message: SYNC_MESSAGES.refused };
        case 'rate_limited':
            return { reason: 'rate-limited', message: SYNC_MESSAGES.rateLimited };
        default:
            return { reason: 'server', message: SYNC_MESSAGES.server };
    }
}

/** A download failure is a fact the pass reported, not an exception; same vocabulary either way. */
export function failureFromDownload(result: LibraryDownloadResult): SyncFailure | null {
    const first = result.failures[0];
    if (!first) {
        return null;
    }
    switch (first.reason) {
        case 'expired':
            return { reason: 'expired', message: SYNC_MESSAGES.expired };
        case 'rate-limited':
            return { reason: 'rate-limited', message: SYNC_MESSAGES.rateLimited };
        case 'network':
            return { reason: 'offline', message: SYNC_MESSAGES.offline };
        default:
            return { reason: 'server', message: SYNC_MESSAGES.server };
    }
}

/** The last rejection this pass's transport saw, and the exact Save it was about. */
export interface Refusal {
    error: ApiError;
    documentId: string;
    /**
     * The operation the refused request actually carried, so `AccountSongbook.refuse` marks THAT
     * row rather than whatever happens to be the head by the time it runs. Another tab sharing
     * this account's outbox can commit the head and the musician can queue a fresh Save behind it
     * while this rejection is still unwinding; marking by position would permanently refuse a Save
     * that was never sent.
     */
    operationId: string;
}

/**
 * Records a `SaveTransportError`'s reason — and WHICH document it was about — on its way past,
 * then rethrows it UNCHANGED, so `sendNext` sees the same rejection it always did and keeps the
 * operation queued. The document id is what lets `drain()` tell "this server has stopped talking
 * to us" apart from "this one chart is too big", which are the same `'retry'` to the outbox and
 * must not be the same decision here.
 */
export function capturing(
    inner: SaveTransport,
    onRefusal: (refusal: Refusal) => void,
): SaveTransport {
    return async (request) => {
        try {
            return await inner(request);
        } catch (error) {
            if (error instanceof SaveTransportError) {
                onRefusal({
                    error: error.reason,
                    documentId: request.documentId,
                    operationId: request.operationId,
                });
            }
            throw error;
        }
    };
}

function sameObservation(a: CloudObservation | null, b: CloudObservation | null): boolean {
    if (a === null || b === null) {
        return a === b;
    }
    return (
        a.remoteRevision === b.remoteRevision &&
        a.pendingCount === b.pendingCount &&
        a.conflict === b.conflict &&
        a.refused === b.refused
    );
}

/**
 * Compared by VALUE, not identity: `observe` rebuilds this list from storage on every pass, so an
 * identity check would publish — and re-render the songbook — after every single one of them.
 */
function sameUpdates(a: readonly RemoteUpdate[], b: readonly RemoteUpdate[]): boolean {
    return (
        a.length === b.length &&
        a.every(
            (update, index) =>
                update.documentId === b[index].documentId &&
                update.revision === b[index].revision &&
                update.kind === b[index].kind,
        )
    );
}

export function sameSnapshot(a: SyncSnapshot, b: SyncSnapshot): boolean {
    return (
        a.owner === b.owner &&
        sameUpdates(a.candidates, b.candidates) &&
        a.running === b.running &&
        a.sending === b.sending &&
        a.failure?.reason === b.failure?.reason &&
        a.failure?.message === b.failure?.message &&
        a.documents.required === b.documents.required &&
        a.documents.verified === b.documents.verified &&
        a.libraryVersion === b.libraryVersion &&
        a.collectionsVersion === b.collectionsVersion &&
        a.collectionSaves === b.collectionSaves &&
        a.songsWaiting === b.songsWaiting &&
        sameObservation(a.observation, b.observation)
    );
}

/**
 * Reasons the FROZEN OPERATION ID must be forgotten, because the server answered definitively about
 * these exact bytes and wrote no receipt for them: a stale expected revision (`conflict`, handled in
 * `acknowledgeDelete`), an id it has never held (`not_found`), an operation id already spent on
 * something else (`operation_mismatch`), or a request it would not parse (`malformed_request`).
 *
 * Everything else — a dead network, an unrecognized body, a 401, a 429, a 5xx — is UNCERTAIN or
 * transient, and the same bytes remain the right request. The id survives so a retry is a replay
 * the server answers from its receipt rather than a second delete under a second id.
 */
export const FORGET_FROZEN_ID: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
    'not_found',
    'operation_mismatch',
    'malformed_request',
]);

/**
 * One refusal, one sentence. The split that matters is not which code arrived but whether the
 * ACCOUNT answered about this request: a 401, a 429, a 404 and a `malformed_request` are verdicts
 * the server reached before touching the library, so they can honestly say nothing was deleted.
 * A dead network, an unrecognized body and a 5xx are not verdicts at all — the server may have
 * committed and only the reply was lost — so they get `uncertain` and the replay it promises.
 */
export function deleteFailure(error: ApiError): { retry: boolean; message: string } {
    if (error.kind === 'network' || error.kind === 'unknown') {
        return { retry: true, message: DELETE_MESSAGES.uncertain };
    }
    switch (error.code) {
        case 'unauthenticated':
            return { retry: false, message: DELETE_MESSAGES.expired };
        case 'rate_limited':
            return { retry: true, message: DELETE_MESSAGES.rateLimited };
        case 'not_found':
            return { retry: false, message: DELETE_MESSAGES.absent };
        case 'malformed_request':
        case 'operation_mismatch':
            return { retry: false, message: DELETE_MESSAGES.refused };
        default:
            return { retry: true, message: DELETE_MESSAGES.uncertain };
    }
}
