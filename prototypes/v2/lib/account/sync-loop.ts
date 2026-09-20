import {
    BACKOFF_FALLBACK_MS,
    type LibraryDownloadResult,
    runLibraryDownload,
} from '../sync/download';
import { OUTBOX_PAGE_LIMIT, runOutboxPass } from '../sync/drain';
import {
    AccountChangedError,
    type AccountScope,
    type ChartDocument,
    type Draft,
    MAX_PENDING_SAVES,
    type SavedSong,
    type SaveRefusalReason,
} from '../sync/protocol';
import {
    AccountSongbook,
    type KeepBothResolution,
    MAX_LIST_LIMIT,
    MAX_REMOTE_CANDIDATES,
} from '../sync/repository';
import type { SaveTransport } from '../sync/send';
import type { Progress } from '../sync/status';
import { writerId } from '../writer';
import type { AccountApi, ApiError, ApiErrorCode } from './api';
import { accountApi, accountSession } from './client';
import { createLibraryTransport } from './library-transport';
import type { AccountSession } from './session';
import {
    createDeleteTransport,
    createSaveTransport,
    DeleteTransportError,
    SaveTransportError,
} from './transport';

/**
 * The account songbook's sync loop (#1266): the one place that decides WHEN the shipped
 * `runOutboxPass` and `runLibraryDownload` run, and the one place that turns their outcomes into
 * facts a musician can read.
 *
 * **Event-driven, never scheduled.** A pass runs on exactly five things, all of them moments the
 * musician or the device created: an explicit Save, signing in, the `online` event, a
 * `visibilitychange` back to visible, and a cloud delete the account refused as a conflict (#1270)
 * — that last one because the refusal is otherwise a dead end, not because time passed. There is
 * no timer, no poll and no background sync registration — the rollout's decision 9 keeps this
 * deliberately small, and a loop that runs while nobody is looking is both a battery cost and a
 * class of bug (a pass firing against a half-torn-down session) that nothing in this product
 * needs. The browser events are registered by the React wrapper (`app/account/library.tsx`); this
 * module only knows `run()`.
 *
 * **It closes #1261's known gap.** `sendNext` (`lib/sync/send.ts`) collapses every transport
 * rejection to `'retry'` — correct for the outbox, whose whole job is to keep the operation
 * queued no matter why the send failed, but it means the REASON never reaches a caller. Rather
 * than widen that contract (its narrowness is what makes "queued, never lost" easy to prove),
 * this file wraps the transport: `capturing()` records the `SaveTransportError.reason` on its way
 * past and rethrows it unchanged, so `sendNext` still sees exactly the rejection it expects while
 * the loop learns whether the pass stopped for a 401, a quota refusal, a back-off or a dead
 * network. The wrapper is the seam `transport.ts`'s own comment anticipated.
 *
 * **Three facts stay three facts.** Nothing here collapses local safety, cloud confirmation and
 * offline readiness into one badge; it publishes the cloud observation and the document progress
 * separately and `status.ts` projects them. A Save that is safely on this device and refused by
 * the cloud is exactly the case the separation exists for.
 */

/**
 * Why the last pass could not finish sending. Never a raw server code or exception text.
 *
 * `too-large` is deliberately its own reason rather than a second spelling of `quota`: a full
 * library is fixed by deleting a song in the cloud and a chart the server will not accept is not
 * fixed by anything the musician can do to their account, so the two must not be one word.
 *
 * `refused` is the third of that family (#1268 patch review P1): the account read the request,
 * answered definitively about THESE bytes, and will answer the same way forever — an operation id
 * already spent on something else (`operation_mismatch`), or an id it has no row and no tombstone
 * for (`not_found`). Every other reason here is a wait; this one is not, and saying "we'll try
 * again" about it is the one sentence this surface must not produce.
 *
 * `too-large` and `refused` are also the only reasons that are facts about ONE document —
 * `drain()` steps over that song and keeps sending the rest, which no other reason permits.
 */
export type SyncFailureReason =
    | 'expired'
    | 'offline'
    | 'rate-limited'
    | 'quota'
    | 'too-large'
    | 'refused'
    | 'server';

export interface SyncFailure {
    reason: SyncFailureReason;
    message: string;
}

/** The cloud side of one document, read from storage — never inferred from a request result. */
export interface CloudObservation {
    remoteRevision: string | null;
    pendingCount: number;
    /** See `StatusFacts['cloud']['observation']` in `sync/status.ts` for what each term means. */
    conflict: 'none' | 'version' | 'gone';
    /**
     * Why the queued Save at the head of this document's outbox was permanently refused (#1298),
     * read durably off the operation's own `status`/`reason` — never re-derived from whichever
     * document a transient pass-level `failure` last happened to name. Null when the head is not
     * refused. Distinct from `conflict`: a conflict is a two-sided version disagreement the
     * musician resolves with Keep-both; a refusal is a verdict about the REQUEST itself (payload
     * size, or an id/operation combination the account will never accept) that a retry cannot fix
     * — the two never apply to the same head at once, since only one status wins it.
     */
    refused: null | 'too-large' | 'refused';
}

export interface SyncSnapshot {
    /** The account this loop is attached to, or null while signed out. */
    owner: string | null;
    /** True while a pass is in flight. */
    running: boolean;
    /** True while that pass is in its outbox half — the only honest basis for "sending". */
    sending: boolean;
    /**
     * Set when the last pass could not send, cleared by a pass that got everything out. It always
     * describes a Save that IS safely on this device: the outbox never discards a queued
     * operation, whatever the server said.
     */
    failure: SyncFailure | null;
    /** Cloud facts for the watched document; null when nothing is watched or nothing observed. */
    observation: CloudObservation | null;
    /** `offline.documents` for `status.ts`. Unobserved until a download pages the manifest. */
    documents: Progress;
    /** Bumped whenever a pass changed this account's stored library, so a list can re-read. */
    libraryVersion: number;
}

/**
 * Every failure sentence leads with the local truth. A musician whose Save was refused by the
 * server has not lost anything, and the first thing they need to know is that — the reason comes
 * second, and the server's own vocabulary (`quota_exceeded`, `rate_limited`) never appears.
 */
export const SYNC_MESSAGES = {
    offline: 'Saved on this device · we’ll upload it when you’re back online.',
    rateLimited: 'Saved on this device · the server asked us to wait. We’ll try again shortly.',
    quota: 'Saved on this device · your account library is full. Delete a song in the cloud to make room.',
    tooLarge: 'Saved on this device · this chart is too large to upload.',
    /**
     * The one sentence here that does NOT promise a retry, because a retry cannot change the
     * answer: the account has already decided about these exact bytes. "Save it as a copy" is the
     * step that actually works — a new document id and a new operation id are a request the
     * account has never seen.
     */
    refused:
        'Saved on this device · your account refused this upload and retrying won’t change that. Save it as a copy to upload it.',
    expired: 'Saved on this device · sign in again to upload it.',
    server: 'Saved on this device · we couldn’t reach your account library. We’ll try again.',
} as const;

/**
 * The same posture as `SYNC_MESSAGES` for the one operation that is not a Save (#1270): lead with
 * what is true of this device, never print the server's vocabulary, and never claim something was
 * removed that was not — nor that nothing was, when this device cannot know.
 *
 * That last half is why there is no "nothing was deleted" sentence for a dead network or a 5xx.
 * The request may have reached the account and committed there; the reply is what went missing.
 * Saying "Nothing was deleted" would be a guess dressed as a fact, and the one guess this surface
 * must never make — so those outcomes get `uncertain`, which is exactly as much as is known.
 *
 * Deliberately a separate table rather than more `SYNC_MESSAGES` entries: every sentence there
 * begins "Saved on this device", because every one of them is about a Save that is safe here and
 * has not reached the cloud. A delete has the opposite shape — the request is the thing that did
 * or did not happen in the cloud — and stretching that prefix over it would be a template, not
 * an honest sentence.
 */
export const DELETE_MESSAGES = {
    rateLimited: 'Your account asked us to wait. Nothing was deleted — try again shortly.',
    expired: 'Sign in again to delete this from your account. Nothing was deleted.',
    /**
     * The outcome this device cannot see: a dead network, a 5xx, a reply it could not read. The
     * retry is safe to offer because the frozen operation id makes the next attempt a REPLAY —
     * the server answers it from its receipt rather than deleting a second time.
     */
    uncertain:
        'We couldn’t confirm this with your account. It may or may not have been deleted — try again and we’ll finish it safely.',
    /** The account read the request and would not act on it, so nothing in it changed. */
    refused: 'Your account refused this request. Nothing was deleted.',
    /** 409 conflict: the id is live at a revision this request did not expect. */
    changed:
        'This song changed in your account since you opened it. Nothing was deleted — close it, let your account sync, then reopen and try again.',
    /** 404: the owner has no such id and no tombstone for it. */
    absent: 'That song isn’t in your account.',
    /** Local: a record the cloud has never confirmed. There is nothing up there to delete. */
    unconfirmed: 'This song hasn’t reached your account yet, so there’s nothing there to delete.',
    /** The delete landed, but local work meant the copy on this device was kept. */
    retained: 'Deleted from your account. Your unsent work stays on this device.',
    deleted: 'Deleted from your account.',
} as const;

/**
 * The sentences signing out can need beyond the preflight's own counts (#1269, #1351).
 *
 * Revoking the session is the irreversible half and it goes first, so by the time the local wipe
 * can fail the sign-out has already happened — there is no honest way to take it back, and
 * re-attaching a revoked account would strand the shell signed in to a session the server has
 * dropped. What is left is to say what did NOT happen, in the same posture as the tables above:
 * lead with the fact, never print a storage error, and name the step that finishes the job.
 */
export const SIGN_OUT_MESSAGES = {
    /**
     * Signed out, records stayed, and the step that retries the clear IS reachable: the failed
     * clear put the owner back into `meta.active`, so this device still HOLDS the account whose
     * songs are still here and the banner offers "Sign out on this device" for exactly that state.
     */
    notCleared:
        'Signed out — but your account’s songs could not be removed from this device. Use “Sign out on this device” to try again.',
    /**
     * The same outcome with the fence restore ALSO refused (#1351 patch N2), so `meta.active` names
     * nobody, no banner renders, and naming a control that is not on screen would be a instruction
     * to press something that does not exist. A reload is the honest next move: it re-reads storage
     * that may well have recovered by then.
     */
    notClearedStranded:
        'Signed out — but your account’s songs could not be removed from this device. Reload this page and try again.',
    /**
     * "Sign out on this device" that did not happen at all (#1351 patch N2). The fence never moved
     * and not a row was touched, so "Signed out —" would be the one word this sentence must not
     * open with: the device is exactly what it was, and trying again is a real option.
     */
    notChanged: 'Couldn’t sign out on this device — nothing was changed. Try again.',
    /**
     * "Sign out on this device" (#1351) run against an account this device no longer holds —
     * another tab signed in as somebody else while the expired banner was still on screen here.
     * Nothing was removed and nothing was moved: the refusal happens before the fence.
     *
     * Deliberately not `OWNER_MESSAGES.mismatch`, which is a sentence about a CHART on the stand
     * and would tell a musician to export a song this step never mentioned.
     */
    elsewhere:
        'This device is signed in to a different account now, so there was nothing here to sign out of. Sign out from the account that’s signed in.',
} as const;

/**
 * The one sentence an account-store write refused for belonging to SOMEONE ELSE produces (#1311).
 *
 * Deliberately one constant rather than an entry in each table above: the refusal is the same fact
 * whether it stopped a Save, a retained draft, a Keep-both or a cloud delete, and a musician who
 * meets it twice through two different actions must not be told two different stories about which
 * account their chart is in. It is also the only sentence here that is NOT about a document's
 * relationship with the cloud — nothing was attempted against the server at all — so stretching
 * `SYNC_MESSAGES`' "Saved on this device" prefix or `DELETE_MESSAGES`' "nothing was deleted" over
 * it would be a template rather than an honest sentence.
 *
 * It names the two things that actually work: export the chart (a file on the musician's own disk
 * needs no account), or sign back in as the account that holds it. It never suggests a retry,
 * because nothing about trying again changes whose account this device is attached to.
 *
 * **What the fence is for, and what it is deliberately not.** It stops a SILENT crossing: a write
 * the musician never asked to make into this account, produced by a keystroke or a Save landing
 * somewhere they had no way to see. Exporting the chart and then importing that file into the
 * signed-in account is the opposite of that — two deliberate human acts, with a file on disk in
 * between — and it is by design not refused. The sentence says "export it" because that IS the
 * supported way to carry music between accounts on one device.
 */
export const OWNER_MESSAGES = {
    mismatch:
        'This chart belongs to a different account on this device — export it, or sign back in as that account.',
} as const;

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

const UNOBSERVED: Progress = { required: null, verified: null };

/** One page per 25 documents (`OUTBOX_PAGE_LIMIT`) over the server's 2,000-document cap. */
const OUTBOX_PAGE_CEILING = Math.ceil(MAX_REMOTE_CANDIDATES / OUTBOX_PAGE_LIMIT);

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
const STEP_OVER_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
    'payload_too_large',
    'operation_mismatch',
]);

function failureFromApi(error: ApiError): SyncFailure {
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
function failureFromDownload(result: LibraryDownloadResult): SyncFailure | null {
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
interface Refusal {
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
function capturing(inner: SaveTransport, onRefusal: (refusal: Refusal) => void): SaveTransport {
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

function sameSnapshot(a: SyncSnapshot, b: SyncSnapshot): boolean {
    return (
        a.owner === b.owner &&
        a.running === b.running &&
        a.sending === b.sending &&
        a.failure?.reason === b.failure?.reason &&
        a.failure?.message === b.failure?.message &&
        a.documents.required === b.documents.required &&
        a.documents.verified === b.documents.verified &&
        a.libraryVersion === b.libraryVersion &&
        sameObservation(a.observation, b.observation)
    );
}

/**
 * What one explicit cloud deletion did (#1270). `message` is always a sentence a musician can read.
 *
 * `retained` is the honest half of a successful delete: the cloud copy is gone, and this device
 * kept its own because a draft, a queued Save or the open chart meant dropping it would destroy
 * work that exists nowhere else.
 */
export type CloudDeleteResult =
    | { kind: 'deleted'; retained: boolean; message: string }
    /** Nothing was deleted. `retry` is true only when trying the same thing again could work. */
    | { kind: 'refused'; retry: boolean; message: string };

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
const FORGET_FROZEN_ID: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
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
function deleteFailure(error: ApiError): { retry: boolean; message: string } {
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

/**
 * What signing out would cost this device (#1269), read from storage rather than inferred.
 *
 * Two counts, never one total: a queued Save is work the musician committed and the cloud has not
 * taken yet, an unsaved draft is an experiment they never committed at all. They are protected the
 * same way — export, or send what can still be sent — but they are not the same sentence, and a
 * combined number would make the preflight unable to say which one is at stake.
 */
export interface SignOutPreflight {
    /** Every document this account holds here — what sign-out removes, and whose recovery slots go. */
    documentIds: string[];
    /**
     * The songs that hold work the account has not got: a queued Save, an unsaved draft, or both.
     * A subset of `documentIds`, and the exact set a preflight export needs to write out — the
     * rest of the library is already safe in the cloud and comes back on the next sign-in.
     */
    atRisk: string[];
    /** Committed versions still in the outbox, across the whole library. */
    unsentSaves: number;
    /**
     * How many of `unsentSaves` a permanent refusal (#1298) has stranded — a subset, never a
     * separate pile, and it counts a refused head's whole queue rather than only the marked row,
     * because `prepare()` never advances past that head.
     *
     * The preflight has to tell these apart because its two protective offers are not equally true
     * of both: "Sync now" is the move that can empty an ordinary queue before it is discarded, and
     * against a refused head it is a button that provably cannot do anything, since `prepare()`
     * answers `'refused'` for it without sending. Export is the only thing that saves those bytes,
     * and the step has to say so rather than offering a retry that will not run.
     */
    refusedSaves: number;
    /**
     * Unsaved experiments this device kept for account songs, read from the account database's
     * `drafts` store — which since #1299 is where an account chart's unsaved text actually is.
     *
     * Still the loop's half only. A draft whose storage write was REFUSED exists nowhere but the
     * open tab's own memory, and the loop cannot see that; the shell adds it, along with any guest
     * slot left over from before #1299, in `withLocalDrafts` (`app/ensemble.tsx`). That composition
     * can over-count by one in the narrow case where a retained row and a failed later write both
     * exist for the same song, and that is the safe direction: it offers an export nobody needed,
     * where under-counting destroys work after saying it would not.
     */
    drafts: number;
}

/**
 * One account chart's retained unsaved experiment (#1299), in the shape the shell already renders a
 * guest recovery in (`recoveryFor` in `lib/repository.ts`) — the offer is the SAME offer, so it
 * reuses the same menu, the same message and the same "save a copy to keep both" advice.
 */
export interface RetainedDraft {
    document: ChartDocument;
    /** The experiment was captured against a different committed revision than the one saved now. */
    conflict: boolean;
}

/**
 * `kept` is a sign-out that did NOT happen: the server never confirmed the revocation, so nothing
 * local was removed and the account is attached again exactly as it was. A device that cleared
 * itself on an unanswered logout would destroy the queue for a session that is still live.
 */
export type SignOutOutcome = 'signed-out' | 'kept';

export interface SyncLoop {
    getSnapshot(): SyncSnapshot;
    /** `useSyncExternalStore`'s contract: returns the unsubscribe function. */
    subscribe(listener: () => void): () => void;
    /** Point the loop at a signed-in owner. Idempotent for an owner already attached. */
    attach(ownerId: string): Promise<void>;
    /**
     * Stop using the account store. Deliberately does NOT switch the stored account or delete
     * anything: removing an account's local data is the sign-out preflight's job (#1269), and a
     * loop that cleared records on every header state change would be a destructive data op
     * nobody asked for. In-flight work is fenced off by the epoch instead.
     */
    detach(): void;
    /** The chart on the stand right now; the download's `isActive` reads it live. */
    setActiveDocument(documentId: string | null): void;
    /** Which document `observation` describes. */
    watch(documentId: string | null): Promise<void>;
    /**
     * Every saved song for this account, paged to the end.
     *
     * `owner` names the account the caller means, for the one case where the loop cannot derive it
     * — an EXPIRED session's "Sign out on this device" (#1351), which exports from a library whose
     * scope is detached. See `heldScope`: named or not, a claim that does not match the account
     * this device holds is refused rather than answered with somebody else's library.
     */
    listLibrary(owner?: string | null): Promise<SavedSong[]>;
    /**
     * Commit locally and queue that exact version. Does NOT send; the caller triggers a pass.
     *
     * `owner` is the account the CALLER believes this chart belongs to, or null when it makes no
     * claim — a brand-new document, or a guest song being adopted (#1311). A claim that does not
     * match the attached scope is refused with `AccountMismatchError` BEFORE the songbook is
     * touched, so a refused Save writes no record, no outbox operation and no draft. The case:
     * the session expires under account A's chart, "Sign in again" is answered with B's passkey,
     * and a plain Save — or `Save a copy`, which passes `expected: null` and would therefore
     * succeed — files A's chart content inside B's account.
     */
    save(
        document: ChartDocument,
        expected: number | null,
        owner: string | null,
    ): Promise<SavedSong>;
    /**
     * Retain this writer's unsaved experiment on an account chart (#1299) — the account half of
     * `lib/repository.ts`'s guest `recover`, and emphatically NOT an upload: it writes one row to
     * this device's own `drafts` store and sends nothing. "Automatic recovery retains a writer's
     * unsaved experiment; it never silently uploads it" (`docs/design/ensemble-v2-sync.md`).
     *
     * Deliberately reachable while the SESSION has expired, which is the one thing that separates
     * it from every other call here: expiry pauses uploads and detaches the loop, but it does not
     * change which account this device holds locally, and a draft written nowhere is a draft lost
     * on the next close. See `heldScope`.
     */
    recover(
        document: ChartDocument,
        baseRevision: number | null,
        /**
         * The account the CHART belongs to, captured when it was opened — or null to write it
         * under whichever account this device holds (#1299 patch review P2).
         *
         * Not the same question as "which owner is attached right now", and that is the whole
         * point: a session can expire under an account chart and the musician can answer "Sign in
         * again" with a DIFFERENT passkey. The loop then holds account B while the stand still
         * holds A's song, and the next keystroke would retain A's chart text inside B's database.
         * Named here, compared in `heldScope`, and refused rather than written — with
         * `AccountMismatchError` since #1311, so the shell can tell this refusal from a storage
         * failure without reading the sentence.
         */
        owner: string | null,
    ): Promise<void>;
    /** The newest retained experiment worth offering for one account chart, or null. */
    retainedDraft(documentId: string): Promise<RetainedDraft | null>;
    /**
     * Every LIVE retained experiment for one account chart, newest first — what the song menu's
     * "Preserved drafts" list offers (#1299 patch review P2). `retainedDraft` is the same read
     * narrowed to the newest row; this is how a SECOND tab's experiment is reachable at all.
     */
    preservedDrafts(
        documentId: string,
    ): Promise<Array<{ document: ChartDocument; capturedAt: string }>>;
    /**
     * The same answer for several documents at once, as the newest local text of each.
     *
     * Read AHEAD of a sign-out or delete-account export rather than during it: those write one file
     * per song inside a single user gesture, and an await between two downloads is how a browser's
     * per-gesture cap starts dropping them.
     *
     * `owner` is `listLibrary`'s, for the same caller: an expired session's export (#1351) needs
     * these bytes most of all, because nothing it finds here will ever reach the account.
     */
    retainedDrafts(
        documentIds: string[],
        owner?: string | null,
    ): Promise<Map<string, ChartDocument>>;
    /**
     * Drop this writer's retained experiment, once a Save has committed what it held.
     *
     * Takes the `owner` for the reason every write here does (#1311 patch): a delete keyed by
     * document id against the WRONG account's `drafts` store is a no-op only while the assumption
     * that it is the wrong account holds. It is a write, so it is fenced like one.
     */
    discardDraft(documentId: string, owner: string | null): Promise<void>;
    /**
     * Drop every writer's, once the chart on the stand is its committed version again — see
     * `AccountSongbook.discardDrafts` for why a revert cannot be a per-writer operation. Fenced
     * on `owner` like `discardDraft`, and for the same reason.
     */
    discardDrafts(documentId: string, owner: string | null): Promise<void>;
    /**
     * Remember which chart this account last had on the stand here (#1299).
     *
     * Fenced on `owner` since #1311: it writes a document id into an account's own `meta`, and an
     * id belonging to somebody else's library there is both a leak of what was open and a Continue
     * card that cannot open anything.
     */
    rememberOpened(documentId: string, owner: string | null): Promise<void>;
    lastOpened(): Promise<string | null>;
    /**
     * Delete one document from the cloud (#1270): an explicit ONLINE operation with a frozen,
     * retry-safe operation id, never a side effect of removing a local copy. Sends immediately
     * rather than joining the outbox — a delete is a deliberate human act that must report its own
     * outcome, not a queued intention the musician walks away from.
     *
     * `owner` is the account the caller believes this chart belongs to (#1311). A mismatch is
     * reported as an ordinary `refused` result rather than thrown, exactly as this method's other
     * pre-send refusals are — and, like them, it answers before `prepareDelete`, so no operation
     * id is frozen for a request that never left and nothing local moves.
     */
    deleteFromCloud(documentId: string, owner: string | null): Promise<CloudDeleteResult>;
    /**
     * Resolve this document's refused Save by keeping both (#1267) — the one way out of a
     * conflicted outbox head, which is otherwise terminal and parks every later Save of that song
     * behind it.
     *
     * Purely local: `AccountSongbook.keepBoth` is one transaction and sends nothing. What follows
     * is the pass it has just made possible — the queue is unblocked and holds a create nobody has
     * sent, and the musician's own act is the trigger, because there is no timer here.
     *
     * `null` when the queue no longer holds a refused Save. The caller is then a moment stale, not
     * wrong, and the fresh observation published below is the answer.
     *
     * `owner` is the account the caller believes this chart belongs to (#1311). A mismatch is
     * refused with `AccountMismatchError` before the transaction opens: keeping both writes a new
     * local line for the chart on the stand, and under the wrong account that line is one person's
     * music filed in another person's library.
     *
     * The resolution carries `ownerId` — the scope this transaction actually SETTLED TO, not the
     * caller's claim (#1311 patch review R1). The shell re-points the chart on the stand at the
     * new identity and must bind it to the account the line really landed in; deriving that from
     * a render snapshot instead is how a stale `null` owner becomes an unfenced binding.
     */
    keepBoth(
        documentId: string,
        owner: string | null,
    ): Promise<(KeepBothResolution & { ownerId: string }) | null>;
    /**
     * The account this DEVICE holds, read from storage (#1351 patch R1) — `meta.active`, or the
     * attached scope when there is one, which is the same row.
     *
     * A STORAGE fact, deliberately, and the only honest basis for offering "Sign out on this
     * device". The in-memory session state cannot answer it: `expired` exists only in the page
     * load where a live session lapsed, so a RELOAD lands on `guest` (`session.ts` only ever moves
     * a `signedIn` session to `expired`) while every one of that account's rows is still on the
     * disk. Deriving the offer from the session would hide it in precisely the sequence the story
     * is about — the device changes hands and is restarted in between.
     *
     * Null is "this device holds no account", which is the ordinary guest device and pays nothing:
     * one `readonly` transaction, after the first session read has answered, never on the path to
     * first paint.
     */
    heldOwner(): Promise<string | null>;
    /**
     * What signing out would cost (#1269), as far as the ACCOUNT DATABASE can see. A read; it
     * changes nothing and sends nothing. The caller completes `drafts`/`atRisk` with the drafts no
     * store holds — see `SignOutPreflight['drafts']`.
     *
     * `owner` is `listLibrary`'s: the expired session's step (#1351) runs the SAME preflight, off
     * the same stores, with no attached scope to read them through.
     */
    signOutPreflight(owner?: string | null): Promise<SignOutPreflight>;
    /**
     * Sign this device out of the account (#1269, #1351), in the one order that cannot lose work.
     *
     * The FENCE MOVES FIRST — before `revoke` is even called — so a Save reply for this account
     * that arrives after the musician asked to leave finds a generation that no longer matches and
     * commits nothing. Everything else follows from what `revoke` answers: `true` means the server
     * confirmed the session is gone and this device may forget the account; anything else means the
     * sign-out did not happen, and the account is re-attached with everything it had.
     *
     * **One clearing path, three ways of settling the server side.** `revoke` is the whole of that
     * difference, and the ordered local half below never forks: an ordinary sign-out awaits the
     * logout round trip, a deleted account (#1271) resolves `true` because the delete route removed
     * the session itself, and an expired one (#1351) resolves `true` because the session is already
     * dead — nothing to revoke, so the step needs no network at all and works offline.
     *
     * `owner` is `listLibrary`'s, and it is what makes that last case possible: an expired session
     * has no attached scope, so the account being left is named rather than derived. Naming one
     * this device does not hold throws `AccountMismatchError` BEFORE the fence moves, so a refused
     * sign-out clears nothing and moves nothing.
     */
    signOut(revoke: () => Promise<boolean>, owner?: string | null): Promise<SignOutOutcome>;
    /** One outbox + download pass, coalesced: a request during a pass re-runs once after it. */
    run(): Promise<void>;
}

export function createSyncLoop(
    api: AccountApi,
    session: AccountSession,
    songbook: AccountSongbook = new AccountSongbook(),
): SyncLoop {
    const listeners = new Set<() => void>();
    const library = createLibraryTransport(api, session);
    const deleteTransport = createDeleteTransport(api, session);
    let state: SyncSnapshot = {
        owner: null,
        running: false,
        sending: false,
        failure: null,
        observation: null,
        documents: UNOBSERVED,
        libraryVersion: 0,
    };
    let scope: AccountScope | null = null;
    let watched: string | null = null;
    let activeDocumentId: string | null = null;
    /** Bumped by every attach/detach: a continuation from a superseded epoch publishes nothing. */
    let epoch = 0;
    /** Bumped by every observation: a read that started earlier never wins over a later one. */
    let observation = 0;
    let attaching: Promise<void> | null = null;
    let inFlight: Promise<void> | null = null;
    let rerun = false;
    /** Epoch-ms floor the server asked for after a 429. No timer waits it out; the next event does. */
    let backoffUntil = 0;

    function publish(next: Partial<SyncSnapshot>): void {
        const candidate = { ...state, ...next };
        if (sameSnapshot(state, candidate)) {
            return;
        }
        state = candidate;
        for (const listener of listeners) {
            listener();
        }
    }

    /**
     * The attached scope, waiting out an attach that is still resolving. `attach` is kicked off
     * from an effect the moment the session reports an owner, so a library read or a Save issued
     * in that window must join it — falling back to "signed out" there would send a signed-in
     * musician's Save to the guest songbook.
     */
    async function settledScope(): Promise<AccountScope> {
        if (attaching) {
            await attaching;
        }
        if (!scope) {
            throw new Error('The account songbook is not available while signed out.');
        }
        return scope;
    }

    /**
     * The fence itself (#1311), in one place: a scope this device holds may only take writes for
     * the account the caller says the chart belongs to.
     *
     * Deliberately a throw rather than a returned verdict for every caller but `deleteFromCloud`,
     * whose own contract is a reported `CloudDeleteResult`. A Save, a retained draft and a
     * Keep-both all have one honest outcome here — the write did not happen — and a result object
     * for it would be a second way to ignore a refusal that must never be ignored.
     */
    function refuseForeign(held: AccountScope, owner: string | null): void {
        if (owner !== null && belongsToAnotherAccount(owner, held.ownerId)) {
            throw new AccountMismatchError(owner, held.ownerId);
        }
    }

    /**
     * The attached scope, refused when the chart the caller is carrying belongs to a DIFFERENT
     * account (#1311). Every account-store write the shell can reach goes through this or
     * `heldScope`, and both ask `refuseForeign`.
     *
     * The refusal comes BEFORE the songbook is touched, which is the whole property: a refused
     * write leaves no record, no outbox operation, no draft and no receipt under the wrong owner.
     */
    async function ownedScope(owner: string | null): Promise<AccountScope> {
        const current = await settledScope();
        refuseForeign(current, owner);
        return current;
    }

    /**
     * The account this DEVICE holds: the attached scope when there is one, or — when nothing is
     * attached — whichever owner `meta.active` still names.
     *
     * The only resolution that reaches past `settledScope`, and the two things that need it are
     * the two things that are still true of an EXPIRED session. An expiry detaches the loop
     * (`app/account/library.tsx`), which is right for everything that sends: uploads wait for
     * reauthentication. It says nothing about local ownership — `meta.active` keeps naming the
     * owner until an explicit sign-out moves it — so:
     *
     * - **A retained draft (#1299)** has to go SOMEWHERE. The shell still has a chart on the stand
     *   whose unsaved text is the account's, and the guest namespace is precisely where it must not
     *   go, so it goes to the account that owns it — which is also the account whose sign-out will
     *   remove it.
     * - **"Sign out on this device" (#1351)** is the way to remove exactly that. The expired
     *   session is already dead, so there is nothing to revoke and no attached scope to read; what
     *   is left on disk belongs to the account this device still holds, and clearing it is the only
     *   thing left to do. The reads that step is built on — the preflight, the library it exports
     *   from, the drafts that make those files the newest bytes — resolve here for the same reason.
     *
     * Genuinely signed out there is no such account and this rejects, which a draft caller turns
     * into the in-tab-only retention it already falls back to when storage refuses.
     *
     * `owner` is the caller's claim about WHICH account this is about (#1299 patch review P2): the
     * chart's for a draft, the expired banner's for a sign-out. The scope resolved above says which
     * account this device holds; those two can disagree exactly once — an expired session answered
     * with another passkey, here or in another tab — and the disagreement means the caller is
     * acting on an account that is no longer here. It is refused rather than applied to whoever is
     * held now, which for a draft would file A's text in B's database and for a sign-out would
     * delete B's whole library.
     *
     * Since #1311 the comparison is `refuseForeign`'s rather than its own inline one, so every
     * half of that transition agrees on what a mismatch is.
     */
    async function heldScope(owner: string | null): Promise<AccountScope> {
        const held = scope || attaching ? await settledScope() : await songbook.currentScope();
        if (!held) {
            throw new Error('The account songbook is not available while signed out.');
        }
        refuseForeign(held, owner);
        return held;
    }

    /**
     * Every retained experiment still worth offering for one document, newest first, under the
     * SAME rule guest recovery follows (`recoveryFor` in `lib/repository.ts`): only a draft
     * captured at or after the committed version it sits on. An older row is not an experiment on
     * this song any more — a Save, another tab's or a `keepBoth` has moved past it — and offering
     * it would invite the musician to restore text they already replaced. `AccountSongbook`'s own
     * `liveDraft` is the same rule, applied where a row decides whether a remote body may land.
     *
     * The saved record is read HERE rather than taken from the caller: a list the shell is holding
     * can be a moment stale, and this comparison decides whether a person is shown their own words.
     */
    async function liveDrafts(
        current: AccountScope,
        documentId: string,
    ): Promise<{ song: SavedSong; rows: Draft[] } | null> {
        const song = await songbook.read(current, documentId);
        if (!song) {
            return null;
        }
        const rows = (await songbook.drafts(current, documentId))
            .filter((draft) => draft.capturedAt >= song.document.updatedAt)
            .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
        return { song, rows };
    }

    async function newestDraft(
        current: AccountScope,
        documentId: string,
    ): Promise<RetainedDraft | null> {
        const live = await liveDrafts(current, documentId);
        const newest = live?.rows[0];
        return newest && live
            ? {
                  document: newest.document,
                  conflict: newest.baseRevision !== live.song.document.revision,
              }
            : null;
    }

    /**
     * Observations overlap constantly — one at the end of a pass, one from the Save that landed
     * while that pass was running — and a read that STARTED earlier finished against older
     * storage. Publishing it last would claim an empty queue, and so "Saved to your account",
     * while a Save is still sitting in the outbox: the precise lie this surface exists to avoid.
     * So a newer observation always wins, and an older one that finishes late publishes nothing.
     */
    async function observe(): Promise<void> {
        const mine = epoch;
        observation += 1;
        const token = observation;
        const current = scope;
        const documentId = watched;
        if (!current || documentId === null) {
            publish({ observation: null });
            return;
        }
        try {
            const song = await songbook.read(current, documentId);
            const queue = await songbook.pending(current, documentId);
            if (mine !== epoch || token !== observation) {
                return;
            }
            // Read from the queue, never from a request result: `status.ts` refuses a conflict
            // with an empty queue, and this is why that can never happen. The queue is sorted by
            // local revision, so the FIRST conflicted operation is the head the outbox is stuck
            // on — the one whose refusal the musician is looking at.
            //
            // `remote === null` is the server saying it has no version to offer: the id is
            // tombstoned (#1270), or it never existed. Either way there is nothing to choose
            // between, which is a different sentence from an ordinary conflict.
            const conflicted = queue.find((operation) => operation.status === 'conflict');
            // Only ever the HEAD: `prepare()` never advances past a refused or conflicted head,
            // so nothing behind one can ever be marked either status. Read durably off storage
            // rather than the last pass's transient `failure`, which can already be describing a
            // DIFFERENT document by the time this one is watched again.
            const refusal = queue.find((operation) => operation.status === 'refused');
            publish({
                observation: {
                    remoteRevision: song?.remoteRevision ?? null,
                    pendingCount: queue.length,
                    conflict: !conflicted
                        ? 'none'
                        : conflicted.remote === null
                          ? 'gone'
                          : 'version',
                    refused: refusal?.reason ?? null,
                },
            });
        } catch {
            // An unreadable record is not evidence about the cloud. Leave the last observation
            // alone rather than publish a fabricated one.
        }
    }

    /**
     * The outbox half. One sweep pages to the end of the library, stopping at the first unsent
     * document — and a sweep sends at most ONE queued Save per song (`sync/drain.ts`).
     *
     * So a song with several queued versions needs several sweeps, and this is the only place
     * that can ask for them: there is no timer here, and the musician's next `online`,
     * `visibilitychange` or Save may be days away. Sweeping again whenever the previous sweep
     * actually committed something is what makes "no timers" safe rather than a queue that
     * silently stalls one version short. A sweep that commits nothing ends the loop, so this
     * cannot spin; `MAX_PENDING_SAVES` is the deepest one song's queue can be, which makes it
     * the most sweeps a full drain can ever need.
     *
     * `refusedDocument` names the rejections that do NOT end the pass, and — since #1298 —
     * PERSISTS them: `sendNext` reports every transport failure as `'retry'`, which is right for
     * the outbox but wrong as a stop rule, and the durable record is what stops next pass from
     * re-discovering (and re-POSTing) the same rejection. A 413 and an `operation_mismatch` are
     * verdicts on ONE document, not on the server or the network, so ending the sweep there would
     * park every song behind it behind a document no retry will ever fix — and with no timer here,
     * "the next trigger" can be days away. So that one song is stepped over — `refusedDocument`
     * marks its head `status: 'refused'` (`AccountSongbook.refuse`, the same transaction shape
     * `acknowledge` uses for `'conflict'`) so `prepare()` answers `'refused'` for it from here on
     * without spending a request, the cursor moves PAST it, its queued Save stays queued, and the
     * reason is still reported at the end of the pass. Every other reason keeps the early return,
     * because a 401, a 429, a dead network or an unmounted route would refuse the next song for
     * the same reason.
     *
     * `counts.refused` is deliberately NOT part of `changed`. That count is every ALREADY-refused
     * head this pass walked past, which is a standing fact, not news — folding it in would bump
     * `libraryVersion` on every pass for as long as one refused head exists, re-rendering the
     * songbook forever. The TRANSITION is what changed something, and only `refuse()`'s own
     * `'refused'` answer reports it (see `pass()`).
     */
    async function drain(
        current: AccountScope,
        transport: SaveTransport,
        refusedDocument: () => Promise<string | null>,
    ): Promise<boolean> {
        let changed = false;
        for (let sweep = 0; sweep < MAX_PENDING_SAVES; sweep += 1) {
            let committed = 0;
            let cursor: string | undefined;
            for (let page = 0; page < OUTBOX_PAGE_CEILING; page += 1) {
                const result = await runOutboxPass(songbook, current, transport, {
                    ...(cursor === undefined ? {} : { afterDocumentId: cursor }),
                });
                committed += result.counts.committed;
                changed ||= result.counts.committed > 0 || result.counts.conflict > 0;
                if (result.kind !== 'more' || result.resumeAfterDocumentId === null) {
                    // A transport failure ends the drain outright: another sweep would only
                    // fail again on the same song, and the reason is already captured.
                    if (result.kind === 'retry' || result.kind === 'aborted') {
                        const refused = result.kind === 'retry' ? await refusedDocument() : null;
                        if (refused === null) {
                            return changed;
                        }
                        // Strictly past the refused song, so the page ceiling still bounds this.
                        cursor = refused;
                        continue;
                    }
                    break;
                }
                cursor = result.resumeAfterDocumentId;
            }
            if (committed === 0) {
                return changed;
            }
        }
        return changed;
    }

    /**
     * One pass: the outbox first, then the download. That order is deliberate — a queued Save is
     * the musician's own work waiting to leave, and it goes out before this device spends the
     * shared request budget asking what else is out there.
     */
    async function pass(): Promise<void> {
        const current = scope;
        if (!current) {
            return;
        }
        const mine = epoch;
        let refusal: Refusal | null = null;
        const transport = capturing(createSaveTransport(api, session), (captured) => {
            refusal = captured;
        });
        // Read through a call: control-flow analysis does not follow an assignment made inside
        // the wrapper above, so a direct read narrows to the `null` it was initialized with.
        const lastRefusal = (): Refusal | null => refusal;
        // A 429 answers for the whole ORIGIN — the 300/min transport budget is shared by
        // `/api/auth/*`, Save and the read routes alike, and it is keyed by network identity
        // rather than by account. So the back-off silences BOTH halves of the pass: re-POSTing
        // the outbox inside the window is exactly what the server asked this device not to do.
        const backedOff = Date.now() < backoffUntil;
        publish({ running: true, sending: !backedOff });
        let changed = false;
        // A pass that does nothing but wait must keep SAYING it is waiting: clearing the sentence
        // here would leave the musician with a queued Save and no explanation for it.
        let failure: SyncFailure | null = backedOff
            ? { reason: 'rate-limited', message: SYNC_MESSAGES.rateLimited }
            : null;
        // The TRANSITION into `'refused'`, and only the transition: a head that was already
        // refused before this pass began is a standing fact the songbook is already rendering.
        let newlyRefused = false;
        try {
            if (!backedOff) {
                try {
                    changed = await drain(current, transport, async () => {
                        const captured = lastRefusal();
                        if (
                            captured?.error.kind !== 'code' ||
                            !STEP_OVER_CODES.has(captured.error.code)
                        ) {
                            return null;
                        }
                        // #1298: persisted BEFORE the cursor steps over it, so the durable record
                        // — not this pass's transient capture — is what stops the next pass from
                        // re-discovering (and re-POSTing) the exact same rejection. Marked by
                        // OPERATION id, so a head another tab committed underneath this rejection
                        // is not refused in its place.
                        const reason: SaveRefusalReason =
                            captured.error.code === 'payload_too_large' ? 'too-large' : 'refused';
                        const marked = await songbook.refuse(
                            current,
                            captured.documentId,
                            captured.operationId,
                            reason,
                        );
                        newlyRefused ||= marked === 'refused';
                        return captured.documentId;
                    });
                } catch (error) {
                    if (error instanceof AccountChangedError) {
                        return;
                    }
                    // A storage or validation failure is local, not a server verdict. It is still
                    // a reason the queue did not move — and the Save is still on this device.
                    failure = { reason: 'server', message: SYNC_MESSAGES.server };
                }
                // Outside the catch: a mark that landed before a later storage failure is still a
                // change the songbook has to re-read, whether or not the rest of the drain held.
                changed ||= newlyRefused;
            }
            // The captured transport reason outranks the generic storage one: it names what the
            // server actually said, which is the whole point of the wrapper.
            const captured = lastRefusal();
            if (captured !== null) {
                failure = failureFromApi(captured.error);
                if (failure.reason === 'rate-limited') {
                    backoffUntil = Math.max(backoffUntil, Date.now() + BACKOFF_FALLBACK_MS);
                }
                if (
                    failure.reason === 'expired' &&
                    (scope === null || scope.ownerId === current.ownerId)
                ) {
                    // Published BEFORE the epoch check below, and deliberately: a 401 is a fact
                    // about the ACCOUNT, not about the scope this pass was attached to. The app's
                    // own order is `markExpired()` -> re-render -> `detach()`, so by the time this
                    // pass unwinds the epoch has usually moved — and dropping the publish there
                    // would silently delete the one sentence that explains why nothing uploaded.
                    // The owner check is the one thing the epoch was protecting that still
                    // matters here: if a DIFFERENT account attached in the meantime, this sentence
                    // is about the old one and must not land on the new one's chip.
                    publish({ failure });
                }
            }
            if (mine !== epoch) {
                return;
            }
            publish({ sending: false });

            // Three reasons to spend no further requests: a 401 would refuse them all, a 429 is
            // a budget shared across every route, and a dead network has already answered. The
            // download learns nothing in any of those cases that the outbox has not just proved.
            const skipDownload =
                backedOff ||
                failure?.reason === 'expired' ||
                failure?.reason === 'rate-limited' ||
                failure?.reason === 'offline';
            if (!skipDownload) {
                try {
                    const result = await runLibraryDownload(songbook, current, library, {
                        // Asked again at every single commit, inside the pass: the chart on the
                        // stand is never swapped under the musician, however long the pass runs.
                        isActive: (documentId) => documentId === activeDocumentId,
                    });
                    if (mine !== epoch) {
                        return;
                    }
                    changed ||=
                        result.advanced.length > 0 ||
                        result.removed.length > 0 ||
                        result.candidates.length > 0 ||
                        result.retainedDeleted.length > 0;
                    if (result.backoffUntil !== undefined) {
                        // Never shortened: the outbox half may already have met a 429 with a
                        // longer `Retry-After` than this one carries.
                        backoffUntil = Math.max(backoffUntil, result.backoffUntil);
                    }
                    publish({ documents: result.documents });
                    failure = failure ?? failureFromDownload(result);
                } catch (error) {
                    if (error instanceof AccountChangedError) {
                        return;
                    }
                    if (mine !== epoch) {
                        return;
                    }
                    failure = failure ?? { reason: 'server', message: SYNC_MESSAGES.server };
                }
            }
            if (mine !== epoch) {
                return;
            }
            publish({
                failure,
                ...(changed ? { libraryVersion: state.libraryVersion + 1 } : {}),
            });
            await observe();
        } finally {
            // Whatever happened — including an early return on a superseded epoch — this pass is
            // no longer running. A stuck `running` flag would leave the chip claiming an upload
            // is in flight forever, which is exactly the kind of lie this surface must not tell.
            if (mine === epoch) {
                publish({ running: false, sending: false });
            }
        }
    }

    const loop: SyncLoop = {
        getSnapshot: () => state,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        async attach(ownerId) {
            if (scope?.ownerId === ownerId) {
                return;
            }
            if (attaching) {
                await attaching;
                if (scope?.ownerId === ownerId) {
                    return;
                }
            }
            epoch += 1;
            const mine = epoch;
            const work = (async () => {
                const existing = await songbook.currentScope();
                const next =
                    existing?.ownerId === ownerId
                        ? existing
                        : await songbook.switchAccount(ownerId);
                if (mine !== epoch || !next) {
                    return;
                }
                scope = next;
                backoffUntil = 0;
                publish({
                    owner: ownerId,
                    failure: null,
                    observation: null,
                    documents: UNOBSERVED,
                });
                await observe();
            })();
            attaching = work.then(
                () => undefined,
                () => undefined,
            );
            try {
                await work;
            } finally {
                attaching = null;
            }
        },
        detach() {
            epoch += 1;
            scope = null;
            backoffUntil = 0;
            // `failure` is deliberately NOT cleared. The commonest reason this runs at all is a
            // session that just expired, and the sentence explaining that a Save is still owed is
            // the one thing a musician needs at that moment. `attach()` clears it on the way back
            // in, which is the honest place: a fresh session has no failure to report yet.
            publish({
                owner: null,
                running: false,
                sending: false,
                observation: null,
                documents: UNOBSERVED,
            });
        },
        setActiveDocument(documentId) {
            activeDocumentId = documentId;
        },
        async watch(documentId) {
            if (watched === documentId) {
                return;
            }
            watched = documentId;
            await observe();
        },
        async listLibrary(owner = null) {
            const current = await heldScope(owner);
            const songs: SavedSong[] = [];
            let cursor: string | undefined;
            // The same ceiling `runLibraryDownload` uses locally: more pages than the server's
            // per-owner cap allows means a broken store, not a bigger library.
            for (let page = 0; page <= MAX_REMOTE_CANDIDATES / MAX_LIST_LIMIT; page += 1) {
                const listing = await songbook.list(current, {
                    limit: MAX_LIST_LIMIT,
                    ...(cursor === undefined ? {} : { afterDocumentId: cursor }),
                });
                songs.push(...listing.songs);
                if (listing.nextAfterDocumentId === null) {
                    return songs;
                }
                cursor = listing.nextAfterDocumentId;
            }
            throw new Error('Account library paging did not terminate.');
        },
        async save(document, expected, owner) {
            // #1311: before `songbook.save`, deliberately. A Save refused here has written
            // nothing at all — no record, no queued operation, no bump of this owner's library.
            const current = await ownedScope(owner);
            const song = await songbook.save(current, document, expected);
            publish({ libraryVersion: state.libraryVersion + 1 });
            await observe();
            return song;
        },
        async recover(document, baseRevision, owner) {
            await songbook.recover(await heldScope(owner), writerId, document, baseRevision);
        },
        async retainedDraft(documentId) {
            return newestDraft(await settledScope(), documentId);
        },
        async preservedDrafts(documentId) {
            const live = await liveDrafts(await settledScope(), documentId);
            return (live?.rows ?? []).map((draft) => ({
                document: draft.document,
                capturedAt: draft.capturedAt,
            }));
        },
        async retainedDrafts(documentIds, owner = null) {
            const current = await heldScope(owner);
            const held = new Map<string, ChartDocument>();
            for (const documentId of documentIds) {
                const draft = await newestDraft(current, documentId);
                if (draft) {
                    held.set(documentId, draft.document);
                }
            }
            return held;
        },
        async discardDraft(documentId, owner) {
            await songbook.discardDraft(await ownedScope(owner), documentId, writerId);
        },
        async discardDrafts(documentId, owner) {
            await songbook.discardDrafts(await ownedScope(owner), documentId);
        },
        async rememberOpened(documentId, owner) {
            await songbook.rememberOpened(await ownedScope(owner), documentId);
        },
        async lastOpened() {
            return songbook.lastOpened(await settledScope());
        },
        async deleteFromCloud(documentId, owner) {
            const current = await settledScope();
            if (belongsToAnotherAccount(owner, current.ownerId)) {
                // #1311: the id on the stand is another account's, so this device has no honest
                // request to build — the revision it would name is a fact about a library it is
                // not attached to. Refused here, ahead of `prepareDelete`, so nothing is frozen
                // and nothing local moves; reported rather than thrown, like the two refusals
                // below, because the confirm step renders the sentence beside its own button.
                return { kind: 'refused', retry: false, message: OWNER_MESSAGES.mismatch };
            }
            if (Date.now() < backoffUntil) {
                // The 429 the Save path already met answers for the whole ORIGIN, and a
                // destructive POST inside that window is precisely what the server asked this
                // device not to send. Refused before `prepareDelete`, so nothing is frozen for a
                // request that never left — there are no bytes to replay.
                return { kind: 'refused', retry: true, message: DELETE_MESSAGES.rateLimited };
            }
            const request = await songbook.prepareDelete(current, documentId);
            if (request === 'missing') {
                // Nothing here mirrors that id, so there is no confirmed revision to name and no
                // honest request to build. Reported rather than thrown: the list this was invoked
                // from can legitimately be a moment stale.
                return { kind: 'refused', retry: false, message: DELETE_MESSAGES.absent };
            }
            if (request === 'unconfirmed') {
                return { kind: 'refused', retry: false, message: DELETE_MESSAGES.unconfirmed };
            }
            let response: unknown;
            try {
                response = await deleteTransport(request);
            } catch (error) {
                if (!(error instanceof DeleteTransportError)) {
                    throw error;
                }
                if (error.reason.kind === 'code' && FORGET_FROZEN_ID.has(error.reason.code)) {
                    // A storage failure while cleaning up is not worth losing the real reason
                    // over: a stale frozen record costs nothing but a later `operation_mismatch`
                    // the musician is already being told to retry through.
                    await songbook.discardDelete(current, documentId).catch(() => {});
                }
                if (error.reason.kind === 'code' && error.reason.code === 'rate_limited') {
                    // A 429 answers for the whole origin, exactly as on the Save path.
                    backoffUntil = Math.max(backoffUntil, Date.now() + BACKOFF_FALLBACK_MS);
                }
                if (error.reason.kind === 'code' && error.reason.code === 'not_found') {
                    // The account holds neither this id nor a tombstone for it, so the local
                    // mirror is claiming a cloud confirmation that does not exist — and left alone
                    // it would keep reading "Saved to your account" forever. That is the same fact
                    // a downloaded tombstone carries, so it goes through the same rule rather than
                    // a second spelling of it: a clean mirror is dropped, a held one is retained
                    // and flagged. The revision named is the last one this device confirmed, since
                    // a 404 carries none; it is only ever read back as the candidate's own label.
                    const cleaned = await songbook
                        .reconcile(
                            current,
                            { kind: 'deleted', documentId, revision: request.expectedRevision },
                            {
                                active: documentId === activeDocumentId,
                                expectedRemoteRevision: request.expectedRevision,
                            },
                        )
                        .then(
                            () => true,
                            () => false,
                        );
                    if (cleaned) {
                        publish({ libraryVersion: state.libraryVersion + 1 });
                        await observe();
                    }
                }
                const failure = deleteFailure(error.reason);
                return { kind: 'refused', ...failure };
            }
            const outcome = await songbook.acknowledgeDelete(current, request, response, {
                // Asked at the moment of the commit, never from a list captured before the
                // request went out — the same rule the download pass follows.
                active: documentId === activeDocumentId,
            });
            if (outcome === 'conflict') {
                // Nothing was deleted and nothing local changed. Left there this is a dead end:
                // the record still names the revision the server refused, and while the chart is
                // on the stand a download pass can only preserve a candidate, never advance the
                // record past it. So a pass is asked for here — the musician's own act is the
                // trigger, as there is no timer — and the sentence names the step that actually
                // finishes the job: close the chart, let the account sync, reopen.
                void loop.run().catch(() => {});
                return { kind: 'refused', retry: false, message: DELETE_MESSAGES.changed };
            }
            const retained = outcome === 'retained-deleted';
            publish({ libraryVersion: state.libraryVersion + 1 });
            await observe();
            return {
                kind: 'deleted',
                retained,
                message: retained ? DELETE_MESSAGES.retained : DELETE_MESSAGES.deleted,
            };
        },
        async keepBoth(documentId, owner) {
            // #1311: before the transaction opens. Keeping both CREATES a local line for the
            // chart on the stand, and under the wrong account that is one person's music filed
            // in another person's library — the one outcome this resolution must never have.
            const current = await ownedScope(owner);
            const mine = epoch;
            const resolution = await songbook.keepBoth(current, documentId);
            if (mine !== epoch) {
                // Signed out, or attached to another account, while the transaction was open. The
                // commit still happened — it is reported, because the caller has to move the chart
                // on the stand with it — but nothing of THIS loop's state may be written from a
                // superseded epoch: a publish, a re-pointed `watched` or a pass would all describe
                // an account that is no longer attached. The same rule `pass()` follows.
                return resolution === 'none' ? null : { ...resolution, ownerId: current.ownerId };
            }
            if (resolution === 'none') {
                // Nothing moved, so the library is unchanged — but the observation the caller was
                // reading may be why they asked, so it is re-read rather than left alone.
                await observe();
                return null;
            }
            publish({ libraryVersion: state.libraryVersion + 1 });
            if (watched === documentId) {
                // The line this caller was watching has MOVED, and the observation has to move
                // with it. Left pointed at the original id, the very next publish would describe
                // the version the account kept — an empty queue and a confirmed revision, so
                // "Saved to your account" — about a chart whose local line has not been uploaded
                // at all. The shell re-points this a render later anyway; the point is that there
                // is no render in between where the chip says something untrue of what is open.
                watched = resolution.documentId;
            }
            await observe();
            // Detached, exactly as `deleteFromCloud`'s own follow-up pass is: the resolution is
            // already committed here, and the upload is the loop's problem from this point.
            void loop.run().catch(() => {});
            return { ...resolution, ownerId: current.ownerId };
        },
        async signOutPreflight(owner = null) {
            const current = await heldScope(owner);
            const songs = await loop.listLibrary(owner);
            let unsentSaves = 0;
            let refusedSaves = 0;
            let drafts = 0;
            const documentIds: string[] = [];
            const atRisk: string[] = [];
            for (const song of songs) {
                documentIds.push(song.documentId);
                // Two reads per song rather than one sweep of the outbox: `pending` and `drafts`
                // are the same queries the rest of this module counts work with, and a library
                // bounded at `MAX_REMOTE_CANDIDATES` makes this a bounded preflight, not a scan.
                const operations = await songbook.pending(current, song.documentId);
                // LIVE rows only (#1299 patch review P1), the same rule `retainedDraft` offers
                // one under: a row an earlier page load's Save has moved past is not an experiment
                // this sign-out is about to destroy, and counting it would announce unsaved work
                // that no export could write out and no musician could point at.
                const kept = (await songbook.drafts(current, song.documentId)).filter(
                    (draft) => draft.capturedAt >= song.document.updatedAt,
                ).length;
                unsentSaves += operations.length;
                // Counted off the same read rather than a second query: a refused Save is one of
                // these operations, not a separate store. The WHOLE queue counts when the head is
                // refused, not just the marked row — `prepare()` never advances past that head, so
                // an ordinary Save sitting behind it is exactly as unsendable as the refusal
                // itself, and calling it syncable would put a Sync now button in front of work
                // that cannot move.
                if (operations[0]?.status === 'refused') {
                    refusedSaves += operations.length;
                }
                drafts += kept;
                if (operations.length > 0 || kept > 0) {
                    atRisk.push(song.documentId);
                }
            }
            return { documentIds, atRisk, unsentSaves, refusedSaves, drafts };
        },
        async heldOwner() {
            if (attaching) {
                await attaching;
            }
            return scope ? scope.ownerId : ((await songbook.currentScope())?.ownerId ?? null);
        },
        async signOut(revoke, claimed = null) {
            /**
             * An optional `owner` is a convenience for a caller the loop can already answer for,
             * never a licence to clear whatever this device happens to hold (#1351 patch R5).
             *
             * Detached, `heldScope(null)` resolves through `currentScope()` and names no owner to
             * compare — so an unnamed sign-out would destroy an account nobody asked about, where
             * before #1351 it simply threw "not available while signed out". The two callers that
             * omit it (#1269's sign-out, #1271's delete) are attached by construction, so this
             * refuses only the case that has no answer.
             *
             * Deliberately here and not in `heldScope`: `recover(document, revision, null)` is a
             * legitimate detached, unnamed write (#1299 — an expired session's draft goes to the
             * account this device holds), and that call is additive where this one is destructive.
             */
            if (scope === null && attaching === null && claimed === null) {
                throw new Error('Signing out of this device needs the account it is leaving.');
            }
            // Ahead of everything, including the fence (#1351): a step that names an account this
            // device no longer holds has nothing here to sign out of, and applying it to whoever
            // IS held would delete that person's whole library instead.
            //
            // It is a check-then-act against storage, and the window it leaves is bounded by what
            // follows (#1351 patch R7): another tab can switch `meta.active` between this read and
            // the `switchAccount(null)` below, but everything after it is keyed on `owner` — the
            // id read HERE — and `clearAccount(owner)` bounds all six of its ranges by that id.
            // So the worst a lost race can do is move a fence that a second tab will mint afresh on
            // its next write, and delete exactly the rows the musician asked to delete. It can
            // never reach the other account's records, which is the property that matters.
            const current = await heldScope(claimed);
            const owner = current.ownerId;
            /**
             * Was this device ATTACHED when the sign-out began? Re-attaching below is putting back
             * what `detach()` took, and it only took something if there was something to take.
             *
             * An expired session (#1351) starts detached and must end detached however this goes:
             * the loop has no live session to run a pass against, `app/account/library.tsx` will
             * not detach it again (its effect is keyed on an owner that is already null), and an
             * attach here would publish an owner while the header is still telling the musician to
             * sign back in. Both of today's other callers reach this with a scope attached, so
             * nothing about #1269 or #1271 changes.
             */
            const reattach = scope !== null;
            // Held across the round trip because `detach()` and `attach()` both clear them, and a
            // sign-out the server REFUSED must leave this device exactly as it found it. The 429
            // floor is the load-bearing one: a refusal is not the server withdrawing the wait it
            // asked for, and a re-attach that reset it would re-POST the refused request inside
            // the very window it was told to sit out. The sentence is the same argument in words —
            // a Save is still owed, and the chip must not go quiet about it.
            const heldBackoff = backoffUntil;
            const heldFailure = state.failure;
            /** Puts back what `detach`/`attach` cleared, for a sign-out that did not happen. */
            const restore = () => {
                backoffUntil = Math.max(backoffUntil, heldBackoff);
                if (heldFailure) {
                    publish({ failure: heldFailure });
                }
            };
            /**
             * Gives the account back, for a sign-out that did not happen — in whichever sense this
             * device had it. `attach` mints a fresh generation, which is what un-strands the stale
             * scope a detach left behind.
             *
             * With nothing attached (#1351) there is no loop scope to restore, but the FENCE has
             * still moved: returning without putting the owner back into `meta.active` would leave
             * this device holding an account nothing can see, with its songs, outbox and drafts all
             * still on disk. `switchAccount` puts it back under a fresh generation, fencing off
             * anything in flight exactly as the move out did. (Unreachable while the only detached
             * caller answers `revoke` with a resolved `true`, and deliberately not left to rot.)
             */
            const reopen = async () => {
                if (reattach) {
                    await loop.attach(owner);
                    return;
                }
                await songbook.switchAccount(owner);
            };
            // Detach before the fence moves, not after: the loop's own scope is now stale, and a
            // pass that started against it would spend requests for an account this device is in
            // the middle of leaving. It also makes `attach(owner)` below a real re-attach rather
            // than the idempotent no-op it is for an owner already held.
            loop.detach();
            // THE FENCE, and it moves before the request. From here a late reply for `owner` —
            // a Save committed seconds ago, a download that was already in flight — meets a
            // generation that does not match and writes nothing, whatever the server says next.
            let revoked: boolean;
            try {
                await songbook.switchAccount(null);
                revoked = await revoke();
            } catch (error) {
                // Storage that would not commit the fence, or a `revoke` that threw instead of
                // answering. Either way the sign-out did not happen, and leaving the loop detached
                // would strand the outbox behind a scope nothing re-attaches — the session state
                // has not changed, so no effect is coming to do it.
                await reopen().catch(() => {});
                restore();
                throw error;
            }
            if (!revoked) {
                // The sign-out did not happen. Giving the account back is the whole point: the
                // outbox, the drafts and the library are untouched, and the musician can retry.
                await reopen();
                restore();
                if (Date.now() >= backoffUntil) {
                    void loop.run().catch(() => {});
                }
                return 'kept';
            }
            let cleared = true;
            let restored = true;
            try {
                await songbook.clearAccount(owner);
            } catch {
                cleared = false;
                /**
                 * **The invariant, and how it is met.** The revocation already happened and cannot
                 * be undone, so this IS a sign-out: the session is gone, and re-attaching would put
                 * the shell back into an account the server has stopped honouring. What must never
                 * follow is the shell telling this musician to "sign in again to keep syncing"
                 * about an account they deliberately left — or, for #1271, one that no longer
                 * exists at all. That reading is now prevented where it is actually produced, in
                 * the BANNER COPY (`heldAccountBanner` in `lib/account/messages.ts`, #1351 patch
                 * N1): `expired` keeps that sentence, `guest` and `deleted` get their own.
                 *
                 * Which frees the FENCE to do the other job. It is only settled once the records
                 * are really gone: left pointing at nobody, `meta.active` would claim this device
                 * holds no account while every one of `owner`'s songs, queued Saves and drafts is
                 * still on the disk — and since the sign-out surface is derived from exactly that
                 * pointer, there would be nothing left to ask for the clear with. Putting the owner
                 * back keeps the retry reachable and does not weaken anything: the generation it
                 * mints is a THIRD one, and the fence compares generations by equality, so a reply
                 * captured under the original scope is still refused.
                 *
                 * Retried once (#1351 patch N2) rather than abandoned on a single rejection, since
                 * a blocked or momentarily unavailable store is the likeliest reason to be here at
                 * all. Whether it worked decides which sentence is owed, so it is answered rather
                 * than swallowed: a control that is not on screen must not be named.
                 */
                restored = await songbook.switchAccount(owner).then(
                    () => true,
                    () =>
                        songbook.switchAccount(owner).then(
                            () => true,
                            () => false,
                        ),
                );
            }
            // The queue this sentence was about is gone with the account. `detach` deliberately
            // preserves a failure — a session that expired still owes an explanation — but a
            // completed sign-out has nothing left to owe, unless the wipe is what failed.
            publish({
                failure: cleared
                    ? null
                    : {
                          reason: 'server',
                          message: restored
                              ? SIGN_OUT_MESSAGES.notCleared
                              : SIGN_OUT_MESSAGES.notClearedStranded,
                      },
            });
            return 'signed-out';
        },
        run() {
            if (!scope) {
                return Promise.resolve();
            }
            if (inFlight) {
                // Coalesced, not queued: a second request during a pass earns exactly one more
                // pass afterwards, however many times it was asked.
                rerun = true;
                return inFlight;
            }
            const started = (async () => {
                try {
                    await pass();
                } finally {
                    inFlight = null;
                    if (rerun) {
                        rerun = false;
                        // Detached, so nothing awaits it: a throwing subscriber (or any other
                        // surprise a pass can raise) must not become an unhandled rejection in
                        // the shell. The pass has already published whatever it learned.
                        void loop.run().catch(() => {});
                    }
                }
            })();
            inFlight = started;
            return started;
        },
    };
    return loop;
}

/**
 * The app's one loop, beside the one session store `client.ts` owns. Constructing it is inert —
 * no request, no storage access, no listener, no timer — so importing this module cannot touch
 * guest startup; the dark-launch flag still gates every call.
 */
export const accountSync = createSyncLoop(accountApi, accountSession);
