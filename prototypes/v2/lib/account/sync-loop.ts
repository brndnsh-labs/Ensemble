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
    MAX_PENDING_SAVES,
    type SavedSong,
} from '../sync/protocol';
import { AccountSongbook, MAX_LIST_LIMIT, MAX_REMOTE_CANDIDATES } from '../sync/repository';
import type { SaveTransport } from '../sync/send';
import type { Progress } from '../sync/status';
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
 * The one sentence signing out can need beyond the preflight's own counts (#1269).
 *
 * Revoking the session is the irreversible half and it goes first, so by the time the local wipe
 * can fail the sign-out has already happened — there is no honest way to take it back, and
 * re-attaching a revoked account would strand the shell signed in to a session the server has
 * dropped. What is left is to say what did NOT happen, in the same posture as the tables above:
 * lead with the fact, never print a storage error, and name the step that finishes the job.
 */
export const SIGN_OUT_MESSAGES = {
    notCleared:
        'Signed out — but your account’s songs could not be removed from this device. Sign in again and sign out to clear them.',
} as const;

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
 */
const STEP_OVER_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
    'payload_too_large',
    'operation_mismatch',
    'not_found',
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
        case 'not_found':
            // A verdict about these exact bytes, not a wait: the account has spent this operation
            // id on something else, or holds neither the id nor a tombstone for it. The default
            // below would promise a retry that can only be refused again — see `SYNC_MESSAGES.refused`.
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

/** The last rejection this pass's transport saw, and the song it was about. */
interface Refusal {
    error: ApiError;
    documentId: string;
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
                onRefusal({ error: error.reason, documentId: request.documentId });
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
        a.conflict === b.conflict
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
     * Unsaved experiments this device kept for account songs.
     *
     * **This count is the loop's half only, and the loop's half is currently always zero.** It
     * reads the account database's `drafts` store, whose one writer (`AccountSongbook.recover`)
     * has no caller in the app yet — account charts still retain their unsaved text in the GUEST
     * `localStorage` namespace (`lib/repository.ts`'s `recover`, the known #1299 gap), which the
     * loop neither owns nor can see. The SHELL completes both this number and `atRisk` from that
     * namespace before showing them; see `withLocalDrafts` in `app/ensemble.tsx`. The store read
     * stays because #1299 is where it starts answering, and a preflight that stopped asking would
     * quietly stop counting on the day it does.
     */
    drafts: number;
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
    /** Every saved song for this account, paged to the end. */
    listLibrary(): Promise<SavedSong[]>;
    /** Commit locally and queue that exact version. Does NOT send; the caller triggers a pass. */
    save(document: ChartDocument, expected: number | null): Promise<SavedSong>;
    /**
     * Delete one document from the cloud (#1270): an explicit ONLINE operation with a frozen,
     * retry-safe operation id, never a side effect of removing a local copy. Sends immediately
     * rather than joining the outbox — a delete is a deliberate human act that must report its own
     * outcome, not a queued intention the musician walks away from.
     */
    deleteFromCloud(documentId: string): Promise<CloudDeleteResult>;
    /**
     * What signing out would cost (#1269), as far as the ACCOUNT DATABASE can see. A read; it
     * changes nothing and sends nothing. The caller completes `drafts`/`atRisk` from guest
     * recovery storage before showing them — see `SignOutPreflight['drafts']`.
     */
    signOutPreflight(): Promise<SignOutPreflight>;
    /**
     * Sign this device out of the account (#1269), in the one order that cannot lose work.
     *
     * The FENCE MOVES FIRST — before `revoke` is even called — so a Save reply for this account
     * that arrives after the musician asked to leave finds a generation that no longer matches and
     * commits nothing. Everything else follows from what `revoke` answers: `true` means the server
     * confirmed the session is gone and this device may forget the account; anything else means the
     * sign-out did not happen, and the account is re-attached with everything it had.
     */
    signOut(revoke: () => Promise<boolean>): Promise<SignOutOutcome>;
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
            const refused = queue.find((operation) => operation.status === 'conflict');
            publish({
                observation: {
                    remoteRevision: song?.remoteRevision ?? null,
                    pendingCount: queue.length,
                    conflict: !refused ? 'none' : refused.remote === null ? 'gone' : 'version',
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
     * `refusedDocument` names the rejections that do NOT end the pass. `sendNext` reports every
     * transport failure as `'retry'`, which is right for the outbox but wrong as a stop rule: a
     * 413, an `operation_mismatch` and a `not_found` are verdicts on ONE document, not on the
     * server or the network, so ending the sweep there would park every song behind it behind a
     * document no retry will ever fix — and with no timer here, "the next trigger" can be days
     * away. So that one song is stepped over — the cursor moves PAST it, its queued Save stays
     * queued, and the reason is still reported at the end of the pass. Every other reason keeps
     * the early return, because a 401, a 429 or a dead network would refuse the next song for the
     * same reason.
     */
    async function drain(
        current: AccountScope,
        transport: SaveTransport,
        refusedDocument: () => string | null,
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
                        const refused = result.kind === 'retry' ? refusedDocument() : null;
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
        try {
            if (!backedOff) {
                try {
                    changed = await drain(current, transport, () => {
                        const captured = lastRefusal();
                        return captured?.error.kind === 'code' &&
                            STEP_OVER_CODES.has(captured.error.code)
                            ? captured.documentId
                            : null;
                    });
                } catch (error) {
                    if (error instanceof AccountChangedError) {
                        return;
                    }
                    // A storage or validation failure is local, not a server verdict. It is still
                    // a reason the queue did not move — and the Save is still on this device.
                    failure = { reason: 'server', message: SYNC_MESSAGES.server };
                }
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
        async listLibrary() {
            const current = await settledScope();
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
        async save(document, expected) {
            const current = await settledScope();
            const song = await songbook.save(current, document, expected);
            publish({ libraryVersion: state.libraryVersion + 1 });
            await observe();
            return song;
        },
        async deleteFromCloud(documentId) {
            const current = await settledScope();
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
        async signOutPreflight() {
            const current = await settledScope();
            const songs = await loop.listLibrary();
            let unsentSaves = 0;
            let drafts = 0;
            const documentIds: string[] = [];
            const atRisk: string[] = [];
            for (const song of songs) {
                documentIds.push(song.documentId);
                // Two reads per song rather than one sweep of the outbox: `pending` and `drafts`
                // are the same queries the rest of this module counts work with, and a library
                // bounded at `MAX_REMOTE_CANDIDATES` makes this a bounded preflight, not a scan.
                const queued = (await songbook.pending(current, song.documentId)).length;
                const kept = (await songbook.drafts(current, song.documentId)).length;
                unsentSaves += queued;
                drafts += kept;
                if (queued > 0 || kept > 0) {
                    atRisk.push(song.documentId);
                }
            }
            return { documentIds, atRisk, unsentSaves, drafts };
        },
        async signOut(revoke) {
            const current = await settledScope();
            const owner = current.ownerId;
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
                await loop.attach(owner).catch(() => {});
                restore();
                throw error;
            }
            if (!revoked) {
                // The sign-out did not happen. Giving the account back is the whole point: the
                // outbox, the drafts and the library are untouched, and the musician can retry.
                // `attach` mints a fresh generation, which is what un-strands the stale scope.
                await loop.attach(owner);
                restore();
                if (Date.now() >= backoffUntil) {
                    void loop.run().catch(() => {});
                }
                return 'kept';
            }
            let cleared = true;
            try {
                await songbook.clearAccount(owner);
            } catch {
                // The revocation already happened and cannot be undone, so this is still a
                // sign-out: the session is gone, and claiming otherwise would put the shell back
                // into an account the server has stopped honouring — and show the "sign in again,
                // everything you saved is still on this device" banner about an account whose
                // records really ARE still here, which is the one reading this must never produce.
                // What is owed is the sentence below, and only a fresh sign-in can reach these
                // stores to try again.
                cleared = false;
            }
            // The queue this sentence was about is gone with the account. `detach` deliberately
            // preserves a failure — a session that expired still owes an explanation — but a
            // completed sign-out has nothing left to owe, unless the wipe is what failed.
            publish({
                failure: cleared
                    ? null
                    : { reason: 'server', message: SIGN_OUT_MESSAGES.notCleared },
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
