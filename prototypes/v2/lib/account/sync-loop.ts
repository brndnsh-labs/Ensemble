import { type LibraryDownloadResult, runLibraryDownload } from '../sync/download';
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
import type { AccountApi, ApiError } from './api';
import { accountApi, accountSession } from './client';
import { createLibraryTransport } from './library-transport';
import type { AccountSession } from './session';
import { createSaveTransport, SaveTransportError } from './transport';

/**
 * The account songbook's sync loop (#1266): the one place that decides WHEN the shipped
 * `runOutboxPass` and `runLibraryDownload` run, and the one place that turns their outcomes into
 * facts a musician can read.
 *
 * **Event-driven, never scheduled.** A pass runs on exactly four things, all of them moments the
 * musician or the device created: an explicit Save, signing in, the `online` event, and a
 * `visibilitychange` back to visible. There is no timer, no poll and no background sync
 * registration — the rollout's decision 9 keeps this deliberately small, and a loop that runs
 * while nobody is looking is both a battery cost and a class of bug (a pass firing against a
 * half-torn-down session) that nothing in this product needs. The browser events are registered
 * by the React wrapper (`app/account/library.tsx`); this module only knows `run()`.
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

/** Why the last pass could not finish sending. Never a raw server code or exception text. */
export type SyncFailureReason = 'expired' | 'offline' | 'rate-limited' | 'quota' | 'server';

export interface SyncFailure {
    reason: SyncFailureReason;
    message: string;
}

/** The cloud side of one document, read from storage — never inferred from a request result. */
export interface CloudObservation {
    remoteRevision: string | null;
    pendingCount: number;
    conflict: boolean;
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
    expired: 'Saved on this device · sign in again to upload it.',
    server: 'Saved on this device · we couldn’t reach your account library. We’ll try again.',
} as const;

const UNOBSERVED: Progress = { required: null, verified: null };

/** One page per 25 documents (`OUTBOX_PAGE_LIMIT`) over the server's 2,000-document cap. */
const OUTBOX_PAGE_CEILING = Math.ceil(MAX_REMOTE_CANDIDATES / OUTBOX_PAGE_LIMIT);

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
            return { reason: 'quota', message: SYNC_MESSAGES.tooLarge };
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

/**
 * Records a `SaveTransportError`'s reason on its way past and rethrows it UNCHANGED, so
 * `sendNext` sees the same rejection it always did and keeps the operation queued.
 */
function capturing(inner: SaveTransport, onReason: (reason: ApiError) => void): SaveTransport {
    return async (request) => {
        try {
            return await inner(request);
        } catch (error) {
            if (error instanceof SaveTransportError) {
                onReason(error.reason);
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
            publish({
                observation: {
                    remoteRevision: song?.remoteRevision ?? null,
                    pendingCount: queue.length,
                    // Read from the queue, never from a request result: `status.ts` refuses a
                    // conflict with an empty queue, and this is why that can never happen.
                    conflict: queue.some((operation) => operation.status === 'conflict'),
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
     */
    async function drain(current: AccountScope, transport: SaveTransport): Promise<boolean> {
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
                        return changed;
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
        let reason: ApiError | null = null;
        const transport = capturing(createSaveTransport(api, session), (captured) => {
            reason = captured;
        });
        publish({ running: true, sending: true });
        let changed = false;
        let failure: SyncFailure | null = null;
        try {
            try {
                changed = await drain(current, transport);
            } catch (error) {
                if (error instanceof AccountChangedError) {
                    return;
                }
                // A storage or validation failure is local, not a server verdict. It is still a
                // reason the queue did not move — and the queued Save is still on this device.
                failure = { reason: 'server', message: SYNC_MESSAGES.server };
            }
            if (mine !== epoch) {
                return;
            }
            // The captured transport reason outranks the generic storage one: it names what the
            // server actually said, which is the whole point of the wrapper.
            const captured: ApiError | null = reason;
            if (captured !== null) {
                failure = failureFromApi(captured);
            }
            publish({ sending: false });

            // Three reasons to spend no further requests: a 401 would refuse them all, a 429 is
            // a budget shared across every route, and a dead network has already answered. The
            // download learns nothing in any of those cases that the outbox has not just proved.
            const skipDownload =
                failure?.reason === 'expired' ||
                failure?.reason === 'rate-limited' ||
                failure?.reason === 'offline' ||
                Date.now() < backoffUntil;
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
                        backoffUntil = result.backoffUntil;
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
            publish({
                owner: null,
                running: false,
                sending: false,
                failure: null,
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
                        void loop.run();
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
