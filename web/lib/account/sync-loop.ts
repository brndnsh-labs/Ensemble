import { homeRequest } from '../home';
import { BACKOFF_FALLBACK_MS, type LibraryFacts, runLibraryDownload } from '../sync/download';
import { runOutboxPass } from '../sync/drain';
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
    heldByAccount,
    MAX_LIST_LIMIT,
    MAX_REMOTE_CANDIDATES,
} from '../sync/repository';
import type { SaveTransport } from '../sync/send';
import { writerId } from '../writer';
import type { AccountApi } from './api';
import { accountApi, accountSession } from './client';
import { rememberAccountHeld } from './held-account';
import { createLibraryTransport } from './library-transport';
import type { AccountSession } from './session';
import {
    AccountMismatchError,
    belongsToAnotherAccount,
    capturing,
    deleteFailure,
    FORGET_FROZEN_ID,
    failureFromApi,
    failureFromDownload,
    LibraryUnverifiedError,
    libraryCheck,
    NO_UPDATES,
    OUTBOX_PAGE_CEILING,
    type Refusal,
    resumeDelay,
    STEP_OVER_CODES,
    sameSnapshot,
    UNOBSERVED,
} from './sync-helpers';
import type { RetainedDraft, SyncFailure, SyncLoop, SyncSnapshot } from './sync-loop-types';
import {
    COLLECTION_MESSAGES,
    DELETE_MESSAGES,
    OWNER_MESSAGES,
    SIGN_OUT_MESSAGES,
    SYNC_MESSAGES,
} from './sync-messages';
import { createDeleteTransport, createSaveTransport, DeleteTransportError } from './transport';

export { AccountMismatchError, belongsToAnotherAccount } from './sync-helpers';
export type {
    CloudDeleteResult,
    RemoteCandidateKind,
    RemoteUpdate,
    SignOutOutcome,
    SignOutPreflight,
    SyncSnapshot,
} from './sync-loop-types';
export { OWNER_MESSAGES, SIGN_OUT_MESSAGES } from './sync-messages';

/**
 * The account songbook's sync loop (#1266): the one place that decides WHEN the shipped
 * `runOutboxPass` and `runLibraryDownload` run, and the one place that turns their outcomes into
 * facts a musician can read.
 *
 * **Event-driven, never scheduled — with one exception.** A pass runs on exactly five things, all
 * of them moments the musician or the device created: an explicit Save, signing in, the `online`
 * event, a `visibilitychange` back to visible, and a cloud delete the account refused as a
 * conflict (#1270) — that last one because the refusal is otherwise a dead end, not because time
 * passed. There is no poll and no background sync registration — the rollout's decision 9 keeps
 * this deliberately small, and a loop that runs while nobody is looking is both a battery cost and
 * a class of bug (a pass firing against a half-torn-down session) that nothing in this product
 * needs. The browser events are registered by the React wrapper (`app/account/library.tsx`); this
 * module only knows `run()`.
 *
 * **The one time-based trigger (#1478, DECISION 2026-10-02, Brandon):** a pass that ends on a rate
 * limit arms ONE timer for the end of the back-off (`armResume`), and only while this page is
 * attached, visible and still has work queued. A 429 is the server naming a specific wait, not a
 * failure that a later moment might fix; and a playlist import queues a thousand Saves from ONE
 * gesture, drained at the server's 120 a minute, so there is no later musician action to wait for
 * — without it the upload would stop after the first 120 songs of an open tab. Every other
 * failure (offline, a server error, a full account, an expired session) still waits for a real
 * trigger: none of them names a moment when trying again would work.
 *
 * **It closes #1261's known gap.** `sendNext` (`lib/sync/send.ts`) collapses every transport
 * rejection to `'retry'` — correct for the outbox, whose whole job is to keep the operation
 * queued no matter why the send failed, but it means the REASON never reaches a caller. Rather
 * than widen that contract (its narrowness is what makes "queued, never lost" easy to prove),
 * the loop wraps the transport: `capturing()` (in `sync-helpers.ts`) records the
 * `SaveTransportError.reason` on its way
 * past and rethrows it unchanged, so `sendNext` still sees exactly the rejection it expects while
 * the loop learns whether the pass stopped for a 401, a quota refusal, a back-off or a dead
 * network. The wrapper is the seam `transport.ts`'s own comment anticipated.
 *
 * **Three facts stay three facts.** Nothing here collapses local safety, cloud confirmation and
 * offline readiness into one badge; it publishes the cloud observation and the document progress
 * separately and `status.ts` projects them. A Save that is safely on this device and refused by
 * the cloud is exactly the case the separation exists for.
 */

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
        candidates: NO_UPDATES,
        documents: UNOBSERVED,
        libraryVersion: 0,
        collectionsVersion: 0,
        collectionSaves: 0,
        songsWaiting: 0,
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
    /**
     * Epoch-ms floor the server asked for after a 429. Its end is the one moment a timer waits for
     * (`armResume`, #1478); every pass inside it sends nothing.
     */
    let backoffUntil = 0;
    /**
     * What the latest pass that ran a download learned about the account (#1478 review R1, C1):
     * its `LibraryFacts`, null when that pass read no complete manifest, undefined before any.
     */
    let latestLibrary: LibraryFacts | null | undefined;
    /**
     * The latest SETTLED facts in this page load (no chart unfetched for a transient reason) —
     * `libraryCheck`'s fallback while the latest pass read no manifest. Cleared with the owner.
     */
    let lastSettled: LibraryFacts | null = null;
    /**
     * The one timer this loop ever holds (#1478, DECISION 2026-10-02): a single resume at the end of
     * a rate-limit back-off. See `armResume`. Null whenever nothing is armed.
     */
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    /**
     * The last library download stopped on a rate limit (#1478): the manifest diff is unfinished,
     * which is work queued even when the outbox is empty. Cleared by a download that is not.
     */
    let downloadOwed = false;

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
    /**
     * Move the `meta.active` fence AND the per-device marker that mirrors it (#1357 patch).
     *
     * One helper rather than the five call sites below, because the marker is a CACHE of that
     * pointer — `lib/account/held-account.ts`'s `deviceMayHoldAccount` reads it to decide whether this
     * device asks the server who it is at all — and a cache written in five places is a cache that
     * drifts. Every path that moves the fence goes through here, including sign-out's restore of
     * an owner whose records a failed clear left behind: that device still holds an account, and
     * the marker has to say so or its next load would stop asking about it.
     */
    async function moveFence(ownerId: string | null): Promise<AccountScope | null> {
        const next = await songbook.switchAccount(ownerId);
        rememberAccountHeld(ownerId !== null);
        return next;
    }

    async function observe(): Promise<void> {
        const mine = epoch;
        observation += 1;
        const token = observation;
        const current = scope;
        const documentId = watched;
        if (!current) {
            publish({
                observation: null,
                candidates: NO_UPDATES,
                collectionSaves: 0,
                songsWaiting: 0,
            });
            return;
        }
        // Read in its own try, and BEFORE the early return below: the songbook shows its rows with
        // nothing on the stand, so `watched === null` is exactly when the list needs this. Its
        // failure must not take the observation with it either — one corrupt candidate row would
        // otherwise silence the chip for every document in the account.
        //
        // COST, stated rather than optimised (#1310 patch R8): `remoteCandidates` validates every
        // row it returns, which decodes each preserved body, and this runs on every watch, Save and
        // pass. Normally that is zero or one or two rows — a preserved candidate is an exception,
        // not a steady state — and it is bounded by `MAX_REMOTE_CANDIDATES` either way. The
        // validation is deliberately kept rather than skipped for speed: an unvalidated row is
        // exactly what must never reach a musician as an offer to replace their song.
        //
        // Every kind is published now (#1362) — `version`, `deleted` and `unsupported` alike. Which
        // of them a surface may say and act on is that surface's call, not a filter made here.
        let candidates = state.candidates;
        try {
            const preserved = await songbook.remoteCandidates(current);
            if (mine !== epoch || token !== observation) {
                return;
            }
            candidates = preserved.map((row) => ({
                documentId: row.documentId,
                revision: row.revision,
                kind: row.kind,
            }));
        } catch {
            // Unreadable is not "none": leaving the last published list alone is the conservative
            // direction, since dropping it would quietly retract a marker nothing has resolved.
        }
        // The collection half of the outbox (#1477), read in its own try for the same reason the
        // candidates are: a collection is never the watched document, so this is the only place
        // its unsent Saves are counted, and its failure must not silence the chart's chip.
        let collectionSaves = state.collectionSaves;
        try {
            const outbox = await songbook.collectionOutbox(current);
            if (mine !== epoch || token !== observation) {
                return;
            }
            collectionSaves = outbox.unsent;
        } catch {
            // Unreadable is not "none" here either: the last count stands.
        }
        // The songs half (#1478), the same way: a key walk of the outbox, in its own try.
        let songsWaiting = state.songsWaiting;
        try {
            const waiting = await songbook.songsWaiting(current);
            if (mine !== epoch || token !== observation) {
                return;
            }
            songsWaiting = waiting;
        } catch {
            // Unreadable is not "none": the last count stands.
        }
        if (documentId === null) {
            publish({ observation: null, candidates, collectionSaves, songsWaiting });
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
                candidates,
                collectionSaves,
                songsWaiting,
            });
        } catch {
            // An unreadable record is not evidence about the cloud. Leave the last observation
            // alone rather than publish a fabricated one — but the candidate list above was read
            // successfully, and it is a fact about a different store's rows.
            publish({ candidates, collectionSaves, songsWaiting });
        }
    }

    /**
     * The outbox half. One sweep pages to the end of the library, stopping at the first unsent
     * document — and a sweep sends at most ONE queued Save per song (`sync/drain.ts`).
     *
     * So a song with several queued versions needs several sweeps, and this is the only place
     * that can ask for them: no timer waits on this (the one timer is a rate limit's, #1478),
     * and the musician's next `online`, `visibilitychange` or Save may be days away. Sweeping again whenever the previous sweep
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
     * park every song behind it behind a document no retry will ever fix — and with no timer for it,
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
    ): Promise<{ songs: boolean; collections: boolean }> {
        // Two facts, never one (#1477 review R1): a song moving re-reads the whole library, a
        // collection moving re-reads only the collections.
        let changed = false;
        let collectionsChanged = false;
        const outcome = () => ({ songs: changed, collections: collectionsChanged });
        for (let sweep = 0; sweep < MAX_PENDING_SAVES; sweep += 1) {
            let committed = 0;
            let cursor: string | undefined;
            for (let page = 0; page < OUTBOX_PAGE_CEILING; page += 1) {
                const result = await runOutboxPass(songbook, current, transport, {
                    ...(cursor === undefined ? {} : { afterDocumentId: cursor }),
                });
                committed += result.counts.committed;
                changed ||=
                    result.counts.committed > result.collections.committed ||
                    result.counts.conflict > result.collections.conflict;
                collectionsChanged ||=
                    result.collections.committed > 0 || result.collections.conflict > 0;
                if (result.kind !== 'more' || result.resumeAfterDocumentId === null) {
                    // A transport failure ends the drain outright: another sweep would only
                    // fail again on the same song, and the reason is already captured.
                    if (result.kind === 'retry' || result.kind === 'aborted') {
                        const refused = result.kind === 'retry' ? await refusedDocument() : null;
                        if (refused === null) {
                            return outcome();
                        }
                        // Strictly past the refused song, so the page ceiling still bounds this.
                        cursor = refused;
                        continue;
                    }
                    break;
                }
                cursor = result.resumeAfterDocumentId;
            }
            // A collection Save that met a newer version is resolved here, without asking
            // (#1477): merged onto the remote revision and re-queued, so the NEXT sweep sends it.
            // Asked after every sweep — also clearing a conflict parked by an older build — and a
            // merge is a reason to sweep again exactly as a commit is. A merge that conflicts
            // again (the other device moved again) merges again, still bounded by the sweeps.
            // Its own error boundary, like the collections page the outbox walks: a collection row
            // this build cannot read must not turn every pass into a "couldn't reach your
            // account" for the songs that did upload. A moved fence still ends the pass.
            let merged = 0;
            try {
                merged = await songbook.mergeCollectionConflicts(current);
            } catch (error) {
                if (error instanceof AccountChangedError) {
                    throw error;
                }
            }
            collectionsChanged ||= merged > 0;
            if (committed === 0 && merged === 0) {
                return outcome();
            }
        }
        return outcome();
    }

    function pageVisible(): boolean {
        return typeof document !== 'undefined' && document.visibilityState === 'visible';
    }

    function workQueued(): boolean {
        return state.songsWaiting + state.collectionSaves > 0 || downloadOwed;
    }

    function clearResume(): void {
        if (resumeTimer !== null) {
            clearTimeout(resumeTimer);
            resumeTimer = null;
        }
    }

    /** Every condition a resume needs, asked when it is armed AND again when it fires. */
    function resumeAllowed(mine: number, owner: string): boolean {
        return mine === epoch && scope?.ownerId === owner && pageVisible() && workQueued();
    }

    /**
     * Arm the ONE resume a rate-limited pass may leave behind (#1478, DECISION 2026-10-02). Called
     * only at the end of a pass whose failure is a rate limit, with this page's epoch and owner:
     *
     * - only while attached to that owner at that epoch, the page visible and work queued (Saves
     *   in the outbox, or a download the limit cut short) — never for an empty queue;
     * - at most one: every pass clears it as it starts — whichever trigger runs first, this timer,
     *   a Save, `online` or a visible tab, is the only one, and a pass inside the back-off re-arms
     *   the same single timer — and `detach()` (sign-out, an owner change) clears it too;
     * - when it fires it asks every condition again — the queue re-read from storage — and that the
     *   back-off has passed, and otherwise does nothing — no rescheduling. A tab hidden at that moment resumes through the
     *   ordinary visibility trigger; a pass that meets the limit again arms the next window, so a
     *   big import walks through its windows and stops when the queue is empty.
     */
    function armResume(mine: number, owner: string): void {
        // Never a second timer: only the end of a pass (or this timer's own early wake-up, below)
        // arms one, and every pass cleared the last one as it started (`pass`). That clear IS the
        // one-per-window rule.
        const wait = resumeDelay(backoffUntil, Date.now());
        if (wait === null || !resumeAllowed(mine, owner)) {
            return;
        }
        resumeTimer = setTimeout(() => {
            resumeTimer = null;
            void (async () => {
                if (!resumeAllowed(mine, owner)) {
                    return;
                }
                if (Date.now() < backoffUntil) {
                    // Woken early — a timer may fire a moment before its time, or the clock moved
                    // (#1478 review C6). Wait out the rest, once more; never a tight loop, since the
                    // wait is at least `BACKOFF_MIN_MS`.
                    armResume(mine, owner);
                    return;
                }
                // The queue as storage has it NOW — another tab may have drained it meanwhile.
                await observe();
                if (!resumeAllowed(mine, owner)) {
                    return;
                }
                await loop.run();
            })().catch(() => {});
        }, wait);
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
        // Whatever started this pass, it is the one: a resume armed by an earlier pass must not
        // run a second (`armResume`).
        clearResume();
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
        let collectionsChanged = false;
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
                    const drained = await drain(current, transport, async () => {
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
                    changed = drained.songs;
                    collectionsChanged = drained.collections;
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
                    // `result.superseded` is deliberately absent (#1310 patch R1): that outcome
                    // writes nothing at all, so there is no stored library change for a re-read to
                    // find. Folding it in would bump `libraryVersion` — and re-render the songbook
                    // — every time a Save raced a download of the previous revision.
                    //
                    // A collection the download moved is the collections' re-read, not the
                    // library's (#1477 review R1): `result.collections` is their share of these.
                    const collectionIds = new Set(result.collections);
                    changed ||= [
                        ...result.advanced,
                        ...result.removed,
                        ...result.candidates,
                        ...result.retainedDeleted,
                    ].some((documentId) => !collectionIds.has(documentId));
                    collectionsChanged ||= collectionIds.size > 0;
                    if (result.backoffUntil !== undefined && Number.isFinite(result.backoffUntil)) {
                        // Never shortened: the outbox half may already have met a 429 that asked
                        // for longer. A non-finite floor is refused (#1478 review C5): NaN compares
                        // false against every clock and would let every pass send inside it.
                        backoffUntil = Math.max(backoffUntil, result.backoffUntil);
                    }
                    downloadOwed = result.backoffUntil !== undefined;
                    publish({ documents: result.documents });
                    latestLibrary = result.library;
                    if (result.library !== null && result.library.unsettled === 0) {
                        lastSettled = result.library;
                    }
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
                ...(collectionsChanged ? { collectionsVersion: state.collectionsVersion + 1 } : {}),
            });
            await observe();
            // The one time-based trigger, and only for a rate limit (#1478): after `observe()`, so
            // the queued-work counts it asks about are this pass's.
            if (mine === epoch && failure?.reason === 'rate-limited') {
                armResume(mine, current.ownerId);
            }
        } finally {
            // Whatever happened — including an early return on a superseded epoch — this pass is
            // no longer running. A stuck `running` flag would leave the chip claiming an upload
            // is in flight forever, which is exactly the kind of lie this surface must not tell.
            if (mine === epoch) {
                publish({ running: false, sending: false });
            }
        }
    }

    /**
     * A local removal (`purgeLocal`, `removeUnreadable`) in the loop's ONE serialization slot, as a
     * pass takes it. Waiting for a pass once is not enough: `run()`'s `finally` starts a coalesced
     * re-run the moment it clears `inFlight`, and any trigger (online, a Save) could start one
     * while the scope below resolves. A pass sending a frozen Save of an id deleted under it would
     * meet a missing operation at `acknowledge` (a storage error for the whole drain) and the song
     * would come back on the download; a pass mid-send while `removeUnreadable` decides could
     * change what is queued under it. So: wait until no pass holds the slot, take it
     * synchronously, and let every `run()` meanwhile coalesce behind the removal. When `changed`,
     * the library and the collections (whose resolved songs shrink) are published and the
     * observation re-read, so the candidates and counts follow.
     */
    async function exclusively<T>(
        owner: string | null,
        work: (scope: AccountScope) => Promise<T>,
        changed: (result: T) => boolean,
    ): Promise<T> {
        while (inFlight) {
            await inFlight.catch(() => {});
        }
        let release = () => {};
        const slot = new Promise<void>((resolve) => {
            release = resolve;
        });
        inFlight = slot;
        try {
            const current = await ownedScope(owner);
            const mine = epoch;
            const result = await work(current);
            if (mine === epoch && changed(result)) {
                publish({
                    libraryVersion: state.libraryVersion + 1,
                    collectionsVersion: state.collectionsVersion + 1,
                });
                await observe();
            }
            return result;
        } finally {
            if (inFlight === slot) {
                inFlight = null;
            }
            release();
            if (rerun) {
                // A pass asked for while the removal held the slot, dispatched the way `run()`
                // dispatches its own coalesced re-run.
                rerun = false;
                void loop.run().catch(() => {});
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
                const next = existing?.ownerId === ownerId ? existing : await moveFence(ownerId);
                if (mine !== epoch || !next) {
                    return;
                }
                scope = next;
                backoffUntil = 0;
                latestLibrary = undefined;
                lastSettled = null;
                downloadOwed = false;
                clearResume();
                publish({
                    owner: ownerId,
                    failure: null,
                    observation: null,
                    // Never the previous account's (#1310): a marker is a claim about one library's
                    // rows, and `observe()` below fills this one in from the account just attached.
                    candidates: NO_UPDATES,
                    documents: UNOBSERVED,
                    collectionSaves: 0,
                    songsWaiting: 0,
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
            latestLibrary = undefined;
            lastSettled = null;
            downloadOwed = false;
            clearResume();
            // `failure` is deliberately NOT cleared. The commonest reason this runs at all is a
            // session that just expired, and the sentence explaining that a Save is still owed is
            // the one thing a musician needs at that moment. `attach()` clears it on the way back
            // in, which is the honest place: a fresh session has no failure to report yet.
            publish({
                owner: null,
                running: false,
                sending: false,
                observation: null,
                candidates: NO_UPDATES,
                documents: UNOBSERVED,
                collectionSaves: 0,
                songsWaiting: 0,
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
        async unreadableSongs(owner = null) {
            return songbook.unreadableSongs(await heldScope(owner));
        },
        async unreadableRemoval(owner = null) {
            return songbook.unreadableRemoval(await heldScope(owner));
        },
        async homeLibrary(owner = null) {
            const current = await heldScope(owner);
            const [openedAt, continueId] = await Promise.all([
                songbook.openedAtMap(current),
                songbook.lastOpened(current),
            ]);
            return songbook.home(current, homeRequest(openedAt, continueId));
        },
        async readSong(documentId, owner = null) {
            const current = await heldScope(owner);
            return (await songbook.read(current, documentId))?.document ?? null;
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
        async recordOpened(documentId, owner) {
            await songbook.recordOpened(await ownedScope(owner), documentId);
        },
        async openedAtMap() {
            return songbook.openedAtMap(await settledScope());
        },
        async listCollections(owner = null) {
            return songbook.listCollections(await heldScope(owner));
        },
        async editCollection(documentId, edit, owner) {
            const current = await ownedScope(owner);
            const saved = await songbook.editCollection(current, documentId, edit);
            // The chip's collection count moves, and `collectionsVersion` with it — so a write the
            // collections' reader did not make itself (adopting a guest's collections) is still
            // re-read. `libraryVersion` deliberately does not: it means "the SONGS changed,
            // re-read the list", and a star is not worth re-reading a 2,000-song library for.
            if (saved !== null) {
                publish({ collectionsVersion: state.collectionsVersion + 1 });
                await observe();
            }
            return saved;
        },
        async importRoom(owner = null) {
            const current = await heldScope(owner);
            const check = libraryCheck(latestLibrary ?? null, lastSettled);
            if (check.kind === 'unverified') {
                return { refusal: check.message };
            }
            const counts = await songbook.documentCounts(current);
            return {
                held: heldByAccount(counts.documents, counts.collections, check.facts),
                unverifiable: check.facts.unverifiable,
            };
        },
        async importPlaylist(songs, collection, owner, pace) {
            const current = await ownedScope(owner);
            // Before anything is written (#1478 review R1): room and duplicates are only as good
            // as this device's copy of the account.
            const check = libraryCheck(latestLibrary ?? null, lastSettled);
            if (check.kind === 'unverified') {
                throw new LibraryUnverifiedError(check.message);
            }
            const result = await songbook.importPlaylist(current, songs, collection, {
                pace,
                remote: { charts: check.facts.charts, collections: check.facts.collections },
            });
            publish({
                libraryVersion: state.libraryVersion + 1,
                ...(result.collection !== null
                    ? { collectionsVersion: state.collectionsVersion + 1 }
                    : {}),
            });
            await observe();
            return result;
        },
        async deleteCollection(documentId, owner) {
            const current = await ownedScope(owner);
            const local = await songbook.deleteCollection(current, documentId);
            if (local === 'removed' || local === 'missing') {
                if (local === 'removed') {
                    publish({ collectionsVersion: state.collectionsVersion + 1 });
                    await observe();
                }
                return { kind: 'deleted', retained: false, message: COLLECTION_MESSAGES.deleted };
            }
            if (local === 'queued') {
                return { kind: 'refused', retry: true, message: COLLECTION_MESSAGES.uploading };
            }
            const result = await loop.deleteFromCloud(documentId, owner);
            return result.kind === 'deleted'
                ? { ...result, message: COLLECTION_MESSAGES.deleted }
                : result;
        },
        async collectionDeleteRefusal(documentId, owner) {
            const current = await ownedScope(owner);
            try {
                const local = await songbook.deleteCollection(current, documentId, {
                    dryRun: true,
                });
                return local === 'queued' ? COLLECTION_MESSAGES.uploading : null;
            } catch (error) {
                return error instanceof Error ? error.message : String(error);
            }
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
                // trigger, as no timer waits on a conflict — and the sentence names the step that
                // actually finishes the job: close the chart, let the account sync, reopen.
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
        purgeLocal(documentIds, owner) {
            return exclusively(
                owner,
                (current) => songbook.purgeLocal(current, documentIds),
                (result) => result.purged.length > 0,
            );
        },
        removeUnreadable(documentIds, owner) {
            return exclusively(
                owner,
                (current) => songbook.removeUnreadable(current, documentIds),
                (result) => result.removed.length > 0,
            );
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
        async adoptRemoteVersion(documentId, revision, owner) {
            // #1311's fence, before the transaction opens, for the reason `keepBoth` states — and
            // with more at stake: this call discards drafts, so applying it to the account this
            // device happens to hold would destroy an experiment nobody asked about.
            const current = await ownedScope(owner);
            const mine = epoch;
            const resolution = await songbook.adoptRemoteVersion(current, documentId, revision);
            if (typeof resolution === 'string') {
                // Nothing moved. The observation the caller was reading is very likely WHY they
                // are here — a candidate that has just been superseded, or a Save queued since the
                // banner rendered — so it is re-read rather than left alone, exactly as a `'none'`
                // Keep-both does.
                if (mine === epoch) {
                    await observe();
                }
                return resolution;
            }
            if (mine !== epoch) {
                // Signed out, or attached elsewhere, while the transaction was open. The commit
                // still happened and is still reported — the caller has to re-open the chart on
                // the stand with it — but nothing of THIS loop's state may be written from a
                // superseded epoch. `keepBoth`'s rule exactly.
                return { ...resolution, ownerId: current.ownerId };
            }
            publish({ libraryVersion: state.libraryVersion + 1 });
            // No `run()`: the record now sits at a revision the account already has, and there is
            // nothing queued for it — that is what `'queued'` refuses. A pass here would spend
            // requests to be told what this transaction just committed.
            await observe();
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
            const unreadable = await songbook.unreadableSongs(current);
            for (const { documentId } of unreadable) {
                documentIds.push(documentId);
                atRisk.push(documentId);
            }
            // Collections too (#1477): a queued star or set-list change is committed work the
            // account has not got, and a sign-out that said nothing about it would drop it.
            const collections = await songbook.collectionOutbox(current);
            return {
                documentIds,
                atRisk,
                unreadable,
                unsentSaves,
                refusedSaves,
                unsentCollections: collections.unsent,
                refusedCollections: collections.refused,
                drafts,
            };
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
                await moveFence(owner);
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
                await moveFence(null);
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
                // Always (#1478 review C2): outside a back-off this is the pass the sign-out
                // interrupted; inside one it sends nothing and re-arms the resume `detach` cleared,
                // so the chip's "continues by itself" stays true.
                void loop.run().catch(() => {});
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
                restored = await moveFence(owner).then(
                    () => true,
                    () =>
                        moveFence(owner).then(
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
 * guest startup, and the loop stays detached until a session says otherwise.
 */
export const accountSync = createSyncLoop(accountApi, accountSession);
