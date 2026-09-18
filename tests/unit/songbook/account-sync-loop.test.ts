import { describe, expect, it, vi } from 'vitest';
import type { AccountApi, ApiResult } from '../../../prototypes/v2/lib/account/api.js';
import { createAccountSession } from '../../../prototypes/v2/lib/account/session.js';
import { createSyncLoop, SYNC_MESSAGES } from '../../../prototypes/v2/lib/account/sync-loop.js';
import { MAX_PENDING_SAVES, type PreparedSave } from '../../../prototypes/v2/lib/sync/protocol.js';
import type { AccountSongbook } from '../../../prototypes/v2/lib/sync/repository.js';

/**
 * The half of #1266 that needs neither IndexedDB nor a browser: WHICH pass runs, and what a
 * musician is told when one cannot finish.
 *
 * The failure-reason surfacing is the point. `sendNext` collapses every transport rejection to
 * `'retry'` — deliberately, so "queued, never lost" stays easy to prove — which is why the loop
 * wraps the transport to capture the `SaveTransportError` reason on its way past. These tests are
 * what proves that capture actually happens for each server verdict, and that each one becomes a
 * sentence rather than a code. Everything that commits (the fence, the preservation rules, real
 * transaction behavior) is proven against real IDB in `tests/browser/account-*.browser.test.ts`;
 * a stub store would agree with a wrong transaction as readily as with a right one, so nothing
 * here asserts about storage.
 */

const OWNER = 'owner-1';
const SCOPE = { ownerId: OWNER, generation: 1 };

const PREPARED: PreparedSave = {
    ownerId: OWNER,
    documentId: 'song-1',
    operationId: 'op-1',
    body: '{"canonical":"bytes"}',
    digest: 'a'.repeat(64),
};

function stubSongbook(overrides: Record<string, unknown> = {}): AccountSongbook {
    return {
        currentScope: async () => SCOPE,
        switchAccount: async () => SCOPE,
        read: async () => null,
        pending: async () => [],
        list: async () => ({ songs: [], nextAfterDocumentId: null }),
        remoteCandidates: async () => [],
        reconcile: async () => 'unchanged',
        prepare: async () => 'idle',
        acknowledge: async () => 'committed',
        ...overrides,
    } as unknown as AccountSongbook;
}

/**
 * One queued Save, so every pass below actually reaches the transport — and exactly one: an
 * acknowledged operation leaves the real outbox, and a stub that never empties would keep the
 * loop sweeping (a sweep sends at most one Save per song) until its bound.
 */
function withQueuedSave(overrides: Record<string, unknown> = {}): AccountSongbook {
    let queued = 1;
    return stubSongbook({
        list: async () => ({
            songs: [{ documentId: 'song-1', remoteRevision: null }],
            nextAfterDocumentId: null,
        }),
        prepare: async () => (queued > 0 ? PREPARED : 'idle'),
        acknowledge: async () => {
            queued -= 1;
            return 'committed';
        },
        ...overrides,
    });
}

const EMPTY_MANIFEST: ApiResult<unknown> = {
    ok: true,
    value: { documents: [], nextAfterDocumentId: null },
    status: 200,
};

/** `GET /api/auth/session` answers for the owner, so `session.refresh()` reaches `signedIn`. */
const SESSION_OK: ApiResult<unknown> = { ok: true, value: { accountId: OWNER }, status: 200 };

function fakeApi(
    post: ApiResult<unknown>,
    get: ApiResult<unknown> = EMPTY_MANIFEST,
): { api: AccountApi; reads: string[] } {
    const reads: string[] = [];
    const api: AccountApi = {
        get: vi.fn(async (path: string) => {
            reads.push(path);
            // The session route is a different question from the library routes, and answering it
            // with a manifest would leave every session in this file stuck at `unknown` — where
            // `markExpired()` correctly refuses to act (`lib/account/session.ts`).
            return path.startsWith('/api/auth/session') ? SESSION_OK : get;
        }),
        post: vi.fn(async () => post),
    } as unknown as AccountApi;
    return { api, reads };
}

async function passWith(
    post: ApiResult<unknown>,
    songbook: AccountSongbook = withQueuedSave(),
    get: ApiResult<unknown> = EMPTY_MANIFEST,
) {
    const { api, reads } = fakeApi(post, get);
    const loop = createSyncLoop(api, createAccountSession(api), songbook);
    await loop.attach(OWNER);
    await loop.run();
    return { loop, reads, snapshot: loop.getSnapshot() };
}

/** Requests the DOWNLOAD half made. The session/recovery reads go through other modules. */
const documentReads = (reads: string[]) =>
    reads.filter((path) => path.startsWith('/api/documents'));

describe('the sync loop surfaces the reason a Save could not be sent', () => {
    it('turns a quota refusal into a readable sentence, never the server code', async () => {
        const { snapshot } = await passWith({
            ok: false,
            error: { kind: 'code', code: 'quota_exceeded', status: 409 },
        });

        expect(snapshot.failure).toEqual({ reason: 'quota', message: SYNC_MESSAGES.quota });
        // The sentence leads with the local truth and never names the server's vocabulary.
        expect(snapshot.failure?.message).toContain('Saved on this device');
        expect(snapshot.failure?.message).not.toContain('quota_exceeded');
    });

    it('reads an expired session as reauthentication, and asks the server for nothing more', async () => {
        // The app's own order, not a shortcut through it: the Save transport calls
        // `session.markExpired()` on the 401, React re-renders on that state change, and the
        // library effect detaches the loop — all while this pass is still unwinding. So the
        // sentence has to survive losing the epoch race, or the one line telling a musician why
        // nothing uploaded is published into a snapshot nobody ever reads.
        const { api, reads } = fakeApi({
            ok: false,
            error: { kind: 'code', code: 'unauthenticated', status: 401 },
        });
        const session = createAccountSession(api);
        await session.refresh();
        expect(session.getSnapshot().status).toBe('signedIn');
        const loop = createSyncLoop(api, session, withQueuedSave());
        await loop.attach(OWNER);
        session.subscribe(() => {
            if (session.getSnapshot().status === 'expired') {
                loop.detach();
            }
        });

        await loop.run();

        const snapshot = loop.getSnapshot();
        expect(snapshot.failure).toEqual({ reason: 'expired', message: SYNC_MESSAGES.expired });
        // Detached, and the sentence is still there: `detach()` clears the scope, not the reason.
        expect(snapshot.owner).toBeNull();
        // A 401 would refuse every download request too; spending them proves nothing.
        expect(documentReads(reads)).toEqual([]);
    });

    it('reads a dead network as "we’ll upload it when you’re back online"', async () => {
        const { snapshot, reads } = await passWith({ ok: false, error: { kind: 'network' } });

        expect(snapshot.failure).toEqual({ reason: 'offline', message: SYNC_MESSAGES.offline });
        expect(snapshot.failure?.message).toContain('Saved on this device');
        // The outbox has already proved the network is down; the download learns nothing.
        expect(documentReads(reads)).toEqual([]);
    });

    it('reads a back-off as a wait, and stops asking for this pass', async () => {
        const { snapshot, reads } = await passWith({
            ok: false,
            error: { kind: 'code', code: 'rate_limited', status: 429 },
        });

        expect(snapshot.failure).toEqual({
            reason: 'rate-limited',
            message: SYNC_MESSAGES.rateLimited,
        });
        expect(documentReads(reads)).toEqual([]);
    });

    it('names no code at all for a verdict this client has no specific answer to', async () => {
        const { snapshot } = await passWith({
            ok: false,
            error: { kind: 'code', code: 'internal_error', status: 500 },
        });

        expect(snapshot.failure).toEqual({ reason: 'server', message: SYNC_MESSAGES.server });
    });

    it('clears the failure and reports the library moved once a Save commits', async () => {
        const { snapshot } = await passWith({
            ok: true,
            value: { kind: 'committed' },
            status: 200,
        });

        expect(snapshot.failure).toBeNull();
        expect(snapshot.running).toBe(false);
        // The shell re-lists on this, which is how a committed Save reaches the songbook.
        expect(snapshot.libraryVersion).toBeGreaterThan(0);
    });
});

describe('the sync loop empties the queue rather than leaving it one version short', () => {
    it('sends every queued version of a song, not one per musician event', async () => {
        // `runOutboxPass` sends at most ONE Save per document, and nothing here is scheduled:
        // with no timer and no poll, a second queued version would sit in the outbox until the
        // musician happened to create another trigger — which may be days away, and which the
        // status chip would meanwhile describe as an upload still owed. So one `run()` has to
        // keep sweeping while a sweep is still committing something.
        let queued = 3;
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const songbook = withQueuedSave({
            prepare: async () => (queued > 0 ? PREPARED : 'idle'),
            acknowledge: async () => {
                queued -= 1;
                return 'committed';
            },
        });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        await loop.run();

        expect(queued).toBe(0);
        expect(api.post).toHaveBeenCalledTimes(3);
    });

    it('stops sweeping the moment the transport fails, rather than hammering a dead server', async () => {
        // One song commits, the next cannot be reached. Sweeping again because the first one
        // made progress would retry the unreachable one on every sweep — once per queued
        // version in the whole library — against a network that has already answered.
        const reachable = JSON.stringify({ song: 'song-1' });
        let queued = 3;
        const api: AccountApi = {
            get: vi.fn(async () => EMPTY_MANIFEST),
            post: vi.fn(async (_path: string, body: string) =>
                body === reachable
                    ? { ok: true, value: { kind: 'committed' }, status: 200 }
                    : { ok: false, error: { kind: 'network' } },
            ),
        } as unknown as AccountApi;
        const songbook = stubSongbook({
            list: async () => ({
                songs: [
                    { documentId: 'song-1', remoteRevision: null },
                    { documentId: 'song-2', remoteRevision: null },
                ],
                nextAfterDocumentId: null,
            }),
            prepare: async (_scope: unknown, documentId: string) => {
                if (documentId !== 'song-1') {
                    return { ...PREPARED, documentId, body: JSON.stringify({ song: documentId }) };
                }
                return queued > 0 ? { ...PREPARED, body: reachable } : 'idle';
            },
            acknowledge: async () => {
                queued -= 1;
                return 'committed';
            },
        });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        await loop.run();

        // One attempt each, and one honest sentence; two of song-1's three versions stay queued
        // for the next trigger rather than buying another round of refused requests.
        expect(api.post).toHaveBeenCalledTimes(2);
        expect(queued).toBe(2);
        expect(loop.getSnapshot().failure?.reason).toBe('offline');
    });

    it('steps over a song the server refuses as too large, and keeps sending the rest', async () => {
        // A 413 is a verdict on ONE chart's bytes, not on the server or the network — but
        // `sendNext` reports it as the same `'retry'` as a dead connection. Ending the sweep
        // there parks every song behind it behind a document no retry will ever fix, and with no
        // timer in this loop "the next trigger" can be days away: the queue simply stops moving.
        const posts: string[] = [];
        let queued = 1;
        const api: AccountApi = {
            get: vi.fn(async () => EMPTY_MANIFEST),
            post: vi.fn(async (_path: string, body: string) => {
                const documentId = (JSON.parse(body) as { song: string }).song;
                posts.push(documentId);
                return documentId === 'song-1'
                    ? { ok: false, error: { kind: 'code', code: 'payload_too_large', status: 413 } }
                    : { ok: true, value: { kind: 'committed' }, status: 200 };
            }),
        } as unknown as AccountApi;
        const queuedFor = (documentId: string) => ({
            ...PREPARED,
            documentId,
            body: JSON.stringify({ song: documentId }),
        });
        const songbook = stubSongbook({
            // Honours the resume cursor, because stepping over the refused song IS the cursor.
            list: async (_scope: unknown, options: { afterDocumentId?: string } = {}) => ({
                songs: [
                    { documentId: 'song-1', remoteRevision: null },
                    { documentId: 'song-2', remoteRevision: null },
                ].filter((song) => song.documentId > (options.afterDocumentId ?? '')),
                nextAfterDocumentId: null,
            }),
            prepare: async (_scope: unknown, documentId: string) =>
                documentId === 'song-1' || queued > 0 ? queuedFor(documentId) : 'idle',
            acknowledge: async () => {
                queued -= 1;
                return 'committed';
            },
        });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        await loop.run();

        // The refused song, then the song behind it — in the SAME pass. The third post is the
        // re-sweep that a commit earns; it ends as soon as song-2 has nothing queued left.
        expect(posts).toEqual(['song-1', 'song-2', 'song-1']);
        expect(queued).toBe(0);
        // Still reported, and as its own reason: a chart the server will not take is not a full
        // account library, and deleting a song in the cloud would not fix it.
        expect(loop.getSnapshot().failure).toEqual({
            reason: 'too-large',
            message: SYNC_MESSAGES.tooLarge,
        });
    });

    it('bounds the re-sweep at the deepest a single song’s queue can be', async () => {
        // A store that acknowledges forever never empties, so nothing but the sweep ceiling ends
        // this drain. `MAX_PENDING_SAVES` is the deepest one song's queue can be, which is why it
        // is the bound: a runaway store costs one bounded pass rather than an unbounded one.
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const songbook = stubSongbook({
            list: async () => ({
                songs: [{ documentId: 'song-1', remoteRevision: null }],
                nextAfterDocumentId: null,
            }),
            prepare: async () => PREPARED,
            acknowledge: async () => 'committed',
        });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        await loop.run();

        expect(api.post).toHaveBeenCalledTimes(MAX_PENDING_SAVES);
    });
});

describe('the sync loop backs off the whole origin, not one half of it', () => {
    it('spends no request on either half while the server’s back-off window is open', async () => {
        // The 300/min transport budget is keyed by network identity and shared by every route, so
        // a 429 the OUTBOX met is one the download would meet too — and so would the next
        // trigger's outbox. Backing off only the half that happened to meet it re-POSTs the same
        // refused request on the very next `online` or `visibilitychange`.
        const { api, reads } = fakeApi({
            ok: false,
            error: { kind: 'code', code: 'rate_limited', status: 429 },
        });
        const loop = createSyncLoop(api, createAccountSession(api), withQueuedSave());
        await loop.attach(OWNER);

        await loop.run();
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(documentReads(reads)).toEqual([]);

        await loop.run();

        expect(api.post).toHaveBeenCalledTimes(1);
        expect(documentReads(reads)).toEqual([]);
        // A pass that only waits still has to SAY it is waiting: there is a Save owed.
        expect(loop.getSnapshot().failure).toEqual({
            reason: 'rate-limited',
            message: SYNC_MESSAGES.rateLimited,
        });
    });
});

describe('the sync loop never publishes a stale observation over a fresher one', () => {
    it('keeps the queue a Save just added, even when an older read finishes after it', async () => {
        // The exact interleaving the app produces: a pass ends and asks for an observation, a
        // Save lands while that read is in flight, and the Save's own (newer) observation
        // publishes first. Letting the older read publish last would report an empty queue —
        // "Saved to your account" — with a Save still waiting to upload.
        let releaseFirstRead = () => {};
        const firstRead = new Promise<void>((resolve) => {
            releaseFirstRead = resolve;
        });
        const queue: Array<{ status: string }> = [];
        let reads = 0;
        const song = {
            ownerId: OWNER,
            documentId: 'song-1',
            document: { id: 'song-1' },
            remoteRevision: 'rev-1',
        };
        const songbook = stubSongbook({
            read: async () => song,
            save: async () => song,
            pending: async () => {
                reads += 1;
                // Snapshotted BEFORE the wait, which is what makes the held read genuinely
                // stale: it answers with the queue as it was when it started, exactly as a
                // real IDB transaction opened at that moment would.
                const observed = [...queue];
                if (reads === 1) {
                    await firstRead;
                }
                return observed;
            },
        });
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        // The stale read: it starts against an empty queue and is held open.
        const stale = loop.watch('song-1');
        await Promise.resolve();
        queue.push({ status: 'queued' });
        await loop.save({ id: 'song-1' } as never, null);
        expect(loop.getSnapshot().observation?.pendingCount).toBe(1);

        releaseFirstRead();
        await stale;

        expect(loop.getSnapshot().observation?.pendingCount).toBe(1);
    });
});

describe('the sync loop never lets a download swap the chart on the stand', () => {
    /** A tombstone row commits with no body request, so this needs no document fixture. */
    function tombstoneOf(documentId: string) {
        return {
            ok: true as const,
            value: {
                documents: [{ documentId, revision: 'r2', deleted: true, bytes: 0 }],
                nextAfterDocumentId: null,
            },
            status: 200,
        };
    }

    it('answers `isActive` from the chart open RIGHT NOW, not from when the pass started', async () => {
        // Typed against the real signature so `mock.calls[0]?.[2]` below is a known tuple slot —
        // an untyped `vi.fn(async () => …)` infers `[]` parameters and `typecheck:tests` rejects
        // the index.
        const reconcile = vi.fn<AccountSongbook['reconcile']>(async () => 'retained-deleted');
        const songbook = stubSongbook({
            reconcile,
            list: async () => ({
                songs: [{ documentId: 'song-1', remoteRevision: 'r1' }],
                nextAfterDocumentId: null,
            }),
        });
        const { api } = fakeApi(
            { ok: true, value: { kind: 'committed' }, status: 200 },
            tombstoneOf('song-1'),
        );
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        loop.setActiveDocument('song-1');
        await loop.run();
        // `expectedRemoteRevision` is asserted beside it because the two travel together: the
        // commit's compare-and-swap base is the revision the PLAN was diffed against, and a
        // tombstone applied without it would remove a record that moved since.
        expect(reconcile.mock.calls[0]?.[2]).toMatchObject({
            active: true,
            expectedRemoteRevision: 'r1',
        });

        // The same document, with the musician now back on the songbook: the predicate is a live
        // question, so the second pass answers it differently without the loop being rebuilt.
        reconcile.mockClear();
        loop.setActiveDocument(null);
        await loop.run();
        expect(reconcile.mock.calls[0]?.[2]).toMatchObject({
            active: false,
            expectedRemoteRevision: 'r1',
        });
    });
});

describe('the sync loop runs one pass at a time', () => {
    it('coalesces a request made during a pass instead of starting a second one', async () => {
        // `runLibraryDownload` REJECTS a second concurrent pass for the same account rather than
        // coalescing it — so overlapping triggers (a Save while an `online` pass is in flight)
        // must be serialized here or they become an unhandled rejection in the shell.
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const loop = createSyncLoop(api, createAccountSession(api), withQueuedSave());
        await loop.attach(OWNER);

        const first = loop.run();
        const second = loop.run();
        await expect(Promise.all([first, second])).resolves.toBeDefined();
        // The coalesced re-run is dispatched detached; let it settle, then read the verdict. A
        // rejected second download would have been caught and reported as a 'server' failure,
        // so a null failure here IS the proof the two triggers never overlapped.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(loop.getSnapshot().failure).toBeNull();
    });

    it('does nothing at all while signed out', async () => {
        const { api, reads } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const loop = createSyncLoop(api, createAccountSession(api), withQueuedSave());

        await loop.run();

        expect(reads).toEqual([]);
        expect(loop.getSnapshot().owner).toBeNull();
    });
});
