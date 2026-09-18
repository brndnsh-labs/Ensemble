import { describe, expect, it, vi } from 'vitest';
import type { AccountApi, ApiResult } from '../../../prototypes/v2/lib/account/api.js';
import { createAccountSession } from '../../../prototypes/v2/lib/account/session.js';
import {
    createSyncLoop,
    DELETE_MESSAGES,
    SIGN_OUT_MESSAGES,
    SYNC_MESSAGES,
} from '../../../prototypes/v2/lib/account/sync-loop.js';
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
        refuse: async () => 'refused',
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

    it('says a refusal is permanent rather than promising a retry that cannot work', async () => {
        // #1268 patch review P1: `operation_mismatch` fell through to the generic server sentence,
        // which ends "We’ll try again" — and the retry is refused for exactly the same reason
        // every time, because the account has already answered about these bytes.
        const { snapshot } = await passWith({
            ok: false,
            error: { kind: 'code', code: 'operation_mismatch', status: 409 },
        });

        expect(snapshot.failure).toEqual({
            reason: 'refused',
            message: SYNC_MESSAGES.refused,
        });
        // Still leads with the local truth, still names no server vocabulary — and, unlike
        // every other sentence here, makes no promise about trying again.
        expect(snapshot.failure?.message).toContain('Saved on this device');
        expect(snapshot.failure?.message).not.toContain('operation_mismatch');
        expect(snapshot.failure?.message).not.toContain('try again');
    });

    it('does not call a 404 a refusal of this chart — the Save route never answers one', async () => {
        // #1298 patch review P1: `commitSave` resolves an unknown or tombstoned id as a
        // `conflict` with `remote: null`, so the only thing that answers 404 for
        // `POST /api/documents/save` is the server's catch-all `app.notFound` — an unmounted
        // route, an older image, a proxy rewrite. That is account-wide, so "save it as a copy"
        // would send the musician to make copies that 404 for the same reason. It is the
        // ordinary server sentence, which promises the retry that does work once the deployment
        // is fixed.
        const { snapshot } = await passWith({
            ok: false,
            error: { kind: 'code', code: 'not_found', status: 404 },
        });

        expect(snapshot.failure).toEqual({ reason: 'server', message: SYNC_MESSAGES.server });
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
        let refusedFlag = false;
        const refuse = vi.fn(async () => {
            refusedFlag = true;
            return 'refused' as const;
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
            // #1298: once `refuse()` has marked the head, real storage answers `'refused'` here
            // without a request. A fake that kept handing back a queued Save would model the
            // pre-#1298 store and quietly assert the re-POST this story exists to stop.
            prepare: async (_scope: unknown, documentId: string) => {
                if (documentId === 'song-1') {
                    return refusedFlag ? 'refused' : queuedFor(documentId);
                }
                return queued > 0 ? queuedFor(documentId) : 'idle';
            },
            acknowledge: async () => {
                queued -= 1;
                return 'committed';
            },
            refuse,
        });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        await loop.run();

        // The refused song, then the song behind it — in the SAME pass. The re-sweep a commit
        // earns costs song-1 no second request: its head is marked by then.
        expect(posts).toEqual(['song-1', 'song-2']);
        expect(queued).toBe(0);
        // Still reported, and as its own reason: a chart the server will not take is not a full
        // account library, and deleting a song in the cloud would not fix it.
        expect(loop.getSnapshot().failure).toEqual({
            reason: 'too-large',
            message: SYNC_MESSAGES.tooLarge,
        });
        // #1298: the durable half — persisted on the head so the NEXT pass answers `'refused'`
        // without spending a request, rather than rediscovering this same rejection. By OPERATION
        // id, so a head another tab committed underneath the rejection is not refused in its place.
        expect(refuse).toHaveBeenCalledWith(
            expect.objectContaining({ ownerId: OWNER }),
            'song-1',
            'op-1',
            'too-large',
        );
    });

    it('steps over a song the account has permanently refused, and keeps sending the rest', async () => {
        // The same rule as the 413 above, for the refusal #1268's adoption could actually produce
        // (patch review P1): an `operation_mismatch` is a verdict on ONE document's frozen bytes,
        // so ending the sweep there parks every song behind it behind a document no retry can fix.
        const posts: string[] = [];
        let queued = 1;
        const api: AccountApi = {
            get: vi.fn(async () => EMPTY_MANIFEST),
            post: vi.fn(async (_path: string, body: string) => {
                const documentId = (JSON.parse(body) as { song: string }).song;
                posts.push(documentId);
                return documentId === 'song-1'
                    ? {
                          ok: false,
                          error: { kind: 'code', code: 'operation_mismatch', status: 409 },
                      }
                    : { ok: true, value: { kind: 'committed' }, status: 200 };
            }),
        } as unknown as AccountApi;
        const queuedFor = (documentId: string) => ({
            ...PREPARED,
            documentId,
            body: JSON.stringify({ song: documentId }),
        });
        let refusedFlag = false;
        const refuse = vi.fn(async () => {
            refusedFlag = true;
            return 'refused' as const;
        });
        const songbook = stubSongbook({
            list: async (_scope: unknown, options: { afterDocumentId?: string } = {}) => ({
                songs: [
                    { documentId: 'song-1', remoteRevision: null },
                    { documentId: 'song-2', remoteRevision: null },
                ].filter((song) => song.documentId > (options.afterDocumentId ?? '')),
                nextAfterDocumentId: null,
            }),
            prepare: async (_scope: unknown, documentId: string) => {
                if (documentId === 'song-1') {
                    return refusedFlag ? 'refused' : queuedFor(documentId);
                }
                return queued > 0 ? queuedFor(documentId) : 'idle';
            },
            acknowledge: async () => {
                queued -= 1;
                return 'committed';
            },
            refuse,
        });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        await loop.run();

        expect(posts).toEqual(['song-1', 'song-2']);
        expect(queued).toBe(0);
        expect(loop.getSnapshot().failure).toEqual({
            reason: 'refused',
            message: SYNC_MESSAGES.refused,
        });
        expect(refuse).toHaveBeenCalledWith(
            expect.objectContaining({ ownerId: OWNER }),
            'song-1',
            'op-1',
            'refused',
        );
    });

    it('ends the pass on a 404 instead of stepping over it — that is the whole route, not one song', async () => {
        // #1298 patch review P1: a 404 for `POST /api/documents/save` can only come from the
        // server's catch-all (`app.notFound`), never from `commitSave`. Stepping over it would
        // spend a request per song for an outage that answers every one of them the same way —
        // and, now that a step-over is DURABLE, would permanently refuse an entire library over a
        // deployment mistake.
        const posts: string[] = [];
        const api: AccountApi = {
            get: vi.fn(async () => EMPTY_MANIFEST),
            post: vi.fn(async (_path: string, body: string) => {
                posts.push((JSON.parse(body) as { song: string }).song);
                return { ok: false, error: { kind: 'code', code: 'not_found', status: 404 } };
            }),
        } as unknown as AccountApi;
        const refuse = vi.fn(async () => 'refused' as const);
        const songbook = stubSongbook({
            list: async (_scope: unknown, options: { afterDocumentId?: string } = {}) => ({
                songs: [
                    { documentId: 'song-1', remoteRevision: null },
                    { documentId: 'song-2', remoteRevision: null },
                ].filter((song) => song.documentId > (options.afterDocumentId ?? '')),
                nextAfterDocumentId: null,
            }),
            prepare: async (_scope: unknown, documentId: string) => ({
                ...PREPARED,
                documentId,
                body: JSON.stringify({ song: documentId }),
            }),
            refuse,
        });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        await loop.run();

        expect(posts).toEqual(['song-1']);
        // Nothing is durably refused, because nothing about one chart was refused.
        expect(refuse).not.toHaveBeenCalled();
        expect(loop.getSnapshot().failure).toEqual({
            reason: 'server',
            message: SYNC_MESSAGES.server,
        });
    });

    it('stops re-sending a step-over refusal once it is durably marked, unlike a fresh capture', async () => {
        // The bug #1298 fixes: `sendNext` collapses every transport rejection to `'retry'`, so
        // without a durable record the refusal is re-discovered — and the body re-POSTed — once
        // per pass. Once `refuse()` marks the head, `prepare()` answers `'refused'` without
        // spending a request, which this fake models directly rather than through real storage.
        const posts: string[] = [];
        let queuedSong2 = 1;
        let refusedFlag = false;
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
        const refuse = vi.fn(async () => {
            refusedFlag = true;
            return 'refused' as const;
        });
        const songbook = stubSongbook({
            list: async (_scope: unknown, options: { afterDocumentId?: string } = {}) => ({
                songs: [
                    { documentId: 'song-1', remoteRevision: null },
                    { documentId: 'song-2', remoteRevision: null },
                ].filter((song) => song.documentId > (options.afterDocumentId ?? '')),
                nextAfterDocumentId: null,
            }),
            prepare: async (_scope: unknown, documentId: string) => {
                if (documentId === 'song-1') {
                    return refusedFlag ? 'refused' : queuedFor(documentId);
                }
                return queuedSong2 > 0 ? queuedFor(documentId) : 'idle';
            },
            acknowledge: async () => {
                queuedSong2 -= 1;
                return 'committed';
            },
            refuse,
        });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        await loop.run();

        // Exactly one POST for song-1, not two: the durable mark stops the re-sweep from
        // re-preparing it, so `prepare()` answers `'refused'` with no network call at all.
        expect(posts).toEqual(['song-1', 'song-2']);
        expect(refuse).toHaveBeenCalledTimes(1);

        posts.length = 0;
        await loop.run();

        // The next trigger (an `online` event, a later Save) sends nothing for song-1 either:
        // the refusal is a fact this device already recorded, not one it has to ask about again.
        expect(posts).toEqual([]);
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

describe('the sync loop names a refused document on its own observation (#1298)', () => {
    it('reads a refused head off storage, not off whichever document the last pass failed on', async () => {
        const song = {
            ownerId: OWNER,
            documentId: 'song-1',
            document: { id: 'song-1' },
            remoteRevision: null,
        };
        const songbook = stubSongbook({
            read: async () => song,
            pending: async () => [{ status: 'refused', reason: 'too-large' }],
        });
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        await loop.watch('song-1');

        expect(loop.getSnapshot().observation).toMatchObject({
            pendingCount: 1,
            conflict: 'none',
            refused: 'too-large',
        });
    });

    it('reports no refusal for an ordinary queued or conflicted head', async () => {
        const song = {
            ownerId: OWNER,
            documentId: 'song-1',
            document: { id: 'song-1' },
            remoteRevision: 'rev-1',
        };
        const songbook = stubSongbook({
            read: async () => song,
            pending: async () => [{ status: 'conflict', remote: null }],
        });
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        await loop.watch('song-1');

        expect(loop.getSnapshot().observation).toMatchObject({ conflict: 'gone', refused: null });
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

/**
 * Explicit cloud deletion (#1270). What is proven here is the loop's CLASSIFICATION: which server
 * answer becomes which sentence, and — the part that actually protects data — when the frozen
 * operation id may be forgotten. The storage rules it drives sit on real IndexedDB in
 * `tests/browser/account-cloud-delete.browser.test.ts`; a stub store would agree with a wrong
 * transaction as readily as with a right one.
 */
describe('the sync loop deletes from the cloud as one explicit, retry-safe operation', () => {
    const PREPARED_DELETE = {
        ownerId: OWNER,
        documentId: 'song-1',
        operationId: 'del-1',
        expectedRevision: 'cloud-1',
        body: '{"canonical":"delete"}',
        digest: 'b'.repeat(64),
    };

    /** A songbook whose delete half is fully stubbed, recording what the loop asked it to do. */
    function deletable(overrides: Record<string, unknown> = {}) {
        const discarded: string[] = [];
        const acknowledged: unknown[] = [];
        const songbook = stubSongbook({
            prepareDelete: async () => PREPARED_DELETE,
            discardDelete: async (_scope: unknown, documentId: string) => {
                discarded.push(documentId);
            },
            acknowledgeDelete: async (
                _scope: unknown,
                _request: unknown,
                response: unknown,
                options: unknown,
            ) => {
                acknowledged.push(options);
                return (response as { outcome?: string }).outcome ?? 'removed';
            },
            ...overrides,
        });
        return { songbook, discarded, acknowledged };
    }

    async function deleting(post: ApiResult<unknown>, parts = deletable()) {
        const { api } = fakeApi(post);
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);
        const result = await loop.deleteFromCloud('song-1');
        return { loop, result, ...parts };
    }

    it('sends the frozen bytes verbatim to the delete route and reports the removal', async () => {
        const { api } = fakeApi({ ok: true, value: { outcome: 'removed' }, status: 200 });
        const parts = deletable();
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);
        loop.setActiveDocument(null);
        const before = loop.getSnapshot().libraryVersion;

        const result = await loop.deleteFromCloud('song-1');

        expect(api.post).toHaveBeenCalledWith('/api/documents/delete', PREPARED_DELETE.body);
        expect(result).toEqual({
            kind: 'deleted',
            retained: false,
            message: DELETE_MESSAGES.deleted,
        });
        // The library moved on disk, so the shell's list is asked to re-read.
        expect(loop.getSnapshot().libraryVersion).toBeGreaterThan(before);
        // The active predicate is answered at the moment of the commit, not from a stale list.
        expect(parts.acknowledged).toEqual([{ active: false }]);
        expect(parts.discarded).toEqual([]);
    });

    it('says so when the cloud copy went but local work kept the one on this device', async () => {
        const { result } = await deleting({
            ok: true,
            value: { outcome: 'retained-deleted' },
            status: 200,
        });
        expect(result).toEqual({
            kind: 'deleted',
            retained: true,
            message: DELETE_MESSAGES.retained,
        });
    });

    it('carries the open chart into the active predicate rather than guessing it', async () => {
        const { api } = fakeApi({ ok: true, value: { outcome: 'removed' }, status: 200 });
        const parts = deletable();
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);
        loop.setActiveDocument('song-1');
        await loop.deleteFromCloud('song-1');
        expect(parts.acknowledged).toEqual([{ active: true }]);
    });

    it('reports a changed cloud version without deleting or retrying', async () => {
        const { result, discarded } = await deleting({
            ok: true,
            value: { outcome: 'conflict' },
            status: 409,
        });
        expect(result).toEqual({ kind: 'refused', retry: false, message: DELETE_MESSAGES.changed });
        // `acknowledgeDelete` forgets the frozen id inside its own transaction on this path, so
        // the loop must NOT also ask — a second discard would be a second write for one decision.
        expect(discarded).toEqual([]);
    });

    it('asks for a pass after a conflict, so the stale local revision is not a dead end', async () => {
        const { api, reads } = fakeApi({ ok: true, value: { outcome: 'conflict' }, status: 409 });
        const parts = deletable();
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);
        expect(documentReads(reads)).toEqual([]);

        expect((await loop.deleteFromCloud('song-1')).kind).toBe('refused');

        // Kicked detached — nothing awaits it inside the delete — so this waits for the pass the
        // refusal asked for rather than starting one of its own, which would prove nothing.
        await vi.waitFor(() => {
            expect(documentReads(reads).length).toBeGreaterThan(0);
        });
    });

    it('cleans up a mirror the account has never held, through the download’s own rule', async () => {
        const reconciled: unknown[] = [];
        const parts = deletable({
            reconcile: async (_scope: unknown, outcome: unknown, options: unknown) => {
                reconciled.push({ outcome, options });
                return 'removed';
            },
        });
        const { loop, result, discarded } = await deleting(
            { ok: false, error: { kind: 'code', code: 'not_found', status: 404 } },
            parts,
        );

        expect(result).toEqual({ kind: 'refused', retry: false, message: DELETE_MESSAGES.absent });
        expect(discarded).toEqual(['song-1']);
        // A 404 is the account saying it holds neither the id nor a tombstone for it, so the local
        // record's confirmed revision is a claim about a cloud copy that does not exist. It is
        // retired by the same rule a downloaded tombstone runs, aimed at the revision this device
        // last confirmed — the only one a 404 leaves it holding.
        expect(reconciled).toEqual([
            {
                outcome: { kind: 'deleted', documentId: 'song-1', revision: 'cloud-1' },
                options: { active: false, expectedRemoteRevision: 'cloud-1' },
            },
        ]);
        // The library moved on disk, so the shell's list is asked to re-read.
        expect(loop.getSnapshot().libraryVersion).toBeGreaterThan(0);
    });

    it('refuses a delete inside the back-off window rather than sending it', async () => {
        const { api } = fakeApi({
            ok: false,
            error: { kind: 'code', code: 'rate_limited', status: 429 },
        });
        let prepared = 0;
        const parts = deletable({
            prepareDelete: async () => {
                prepared += 1;
                return PREPARED_DELETE;
            },
        });
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);

        const first = await loop.deleteFromCloud('song-1');
        expect(first).toEqual({
            kind: 'refused',
            retry: true,
            message: DELETE_MESSAGES.rateLimited,
        });
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(prepared).toBe(1);

        // The 429 answers for the whole ORIGIN, so the next attempt is refused here: a destructive
        // POST inside the window is what the server just asked this device not to send, and
        // nothing is frozen for a request that never left.
        const second = await loop.deleteFromCloud('song-1');
        expect(second).toEqual({
            kind: 'refused',
            retry: true,
            message: DELETE_MESSAGES.rateLimited,
        });
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(prepared).toBe(1);
    });

    it('keeps the frozen id after an uncertain outcome, so a retry is a replay', async () => {
        const uncertain: ApiResult<unknown>[] = [
            { ok: false, error: { kind: 'network' } },
            { ok: false, error: { kind: 'unknown', status: 502 } },
            { ok: false, error: { kind: 'code', code: 'internal_error', status: 500 } },
            { ok: false, error: { kind: 'code', code: 'rate_limited', status: 429 } },
            { ok: false, error: { kind: 'code', code: 'unauthenticated', status: 401 } },
        ];
        for (const post of uncertain) {
            const { result, discarded } = await deleting(post);
            expect(result.kind).toBe('refused');
            // The server may well have committed; the same bytes under the same id are still the
            // only safe way to ask again.
            expect(discarded).toEqual([]);
        }
    });

    it('forgets the frozen id only when the server answered about those exact bytes', async () => {
        for (const code of ['not_found', 'operation_mismatch', 'malformed_request'] as const) {
            const { discarded } = await deleting({
                ok: false,
                error: { kind: 'code', code, status: 400 },
            });
            expect(discarded).toEqual(['song-1']);
        }
    });

    it('turns each refusal into a sentence, never a server code', async () => {
        const cases: Array<[ApiResult<unknown>, string]> = [
            [
                { ok: false, error: { kind: 'code', code: 'unauthenticated', status: 401 } },
                DELETE_MESSAGES.expired,
            ],
            [
                { ok: false, error: { kind: 'code', code: 'rate_limited', status: 429 } },
                DELETE_MESSAGES.rateLimited,
            ],
            [
                { ok: false, error: { kind: 'code', code: 'not_found', status: 404 } },
                DELETE_MESSAGES.absent,
            ],
            [
                { ok: false, error: { kind: 'code', code: 'malformed_request', status: 400 } },
                DELETE_MESSAGES.refused,
            ],
            [
                { ok: false, error: { kind: 'code', code: 'operation_mismatch', status: 409 } },
                DELETE_MESSAGES.refused,
            ],
        ];
        for (const [post, message] of cases) {
            const { result } = await deleting(post);
            expect(result).toMatchObject({ kind: 'refused', message });
            expect(message).not.toMatch(
                /rate_limited|not_found|malformed_request|operation_mismatch|unauthenticated/,
            );
        }
    });

    /**
     * The half of the vocabulary that is about what this device can KNOW. Each of these outcomes
     * is compatible with the server having committed the delete and the reply going missing — the
     * lost-response case `checks/account-delete.chromium.spec.ts` stages end to end — so a sentence
     * claiming nothing was deleted would be a guess this device cannot make.
     */
    it('never claims nothing was deleted when it cannot know', async () => {
        const unknowable: ApiResult<unknown>[] = [
            { ok: false, error: { kind: 'network' } },
            { ok: false, error: { kind: 'unknown', status: 502 } },
            { ok: false, error: { kind: 'code', code: 'internal_error', status: 500 } },
        ];
        for (const post of unknowable) {
            const { result } = await deleting(post);
            expect(result).toEqual({
                kind: 'refused',
                retry: true,
                message: DELETE_MESSAGES.uncertain,
            });
            expect(result.message).not.toMatch(/Nothing was deleted/);
        }
        // And the sentences that DO make that claim are only the ones the account answered.
        for (const message of [
            DELETE_MESSAGES.expired,
            DELETE_MESSAGES.rateLimited,
            DELETE_MESSAGES.refused,
            DELETE_MESSAGES.changed,
        ]) {
            expect(message).toMatch(/Nothing was deleted/);
        }
    });

    it('never builds a request for a song the cloud has never held', async () => {
        const absent = [
            ['missing', DELETE_MESSAGES.absent],
            ['unconfirmed', DELETE_MESSAGES.unconfirmed],
        ] as const;
        for (const [reply, message] of absent) {
            const { api } = fakeApi({ ok: true, value: {}, status: 200 });
            const songbook = stubSongbook({ prepareDelete: async () => reply });
            const loop = createSyncLoop(api, createAccountSession(api), songbook);
            await loop.attach(OWNER);
            expect(await loop.deleteFromCloud('song-1')).toEqual({
                kind: 'refused',
                retry: false,
                message,
            });
            expect(api.post).not.toHaveBeenCalled();
        }
    });
});

describe('a Save the cloud can no longer hold reads differently from a two-sided conflict', () => {
    /** One conflicted operation in the outbox, with whatever remote version the server offered. */
    function conflicted(remote: unknown) {
        return stubSongbook({
            read: async () => ({ remoteRevision: 'cloud-1' }),
            pending: async () => [{ status: 'conflict', remote }],
        });
    }

    it('names a tombstoned id as gone, and a real divergence as a version conflict', async () => {
        const cases = [
            [null, 'gone'],
            [{ revision: 'cloud-2', document: {} }, 'version'],
        ] as const;
        for (const [remote, expected] of cases) {
            const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
            const loop = createSyncLoop(api, createAccountSession(api), conflicted(remote));
            await loop.attach(OWNER);
            await loop.watch('song-1');
            // `remote === null` is the server saying it has nothing to offer — a tombstone, or an
            // id it never held. Either way there is no version to choose between (#1270).
            expect(loop.getSnapshot().observation?.conflict).toBe(expected);
        }
    });

    /**
     * Keeping both (#1267). What is proven here is the loop's half — that the resolution is
     * reported, the library is republished, the observation is re-read and a pass follows, which is
     * what actually unblocks the queue. The transaction itself is proven against real IndexedDB in
     * `tests/browser/account-keep-both.browser.test.ts`; a stub store would agree with a wrong one.
     */
    function resolvable(resolution: unknown, overrides: Record<string, unknown> = {}) {
        const asked: string[] = [];
        let queue: unknown[] = [{ status: 'conflict', remote: null }];
        const songbook = stubSongbook({
            read: async () => ({ remoteRevision: 'cloud-1' }),
            pending: async () => queue,
            keepBoth: async (_scope: unknown, documentId: string) => {
                asked.push(documentId);
                if (resolution !== 'none') {
                    queue = [];
                }
                return resolution;
            },
            ...overrides,
        });
        return { songbook, asked };
    }

    it('resolves the refused Save, republishes the library and sends what it queued', async () => {
        const resolution = {
            conflict: 'gone',
            documentId: 'song-2',
            document: { id: 'song-2' },
            operationId: 'op-fresh',
            adopted: null,
        };
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const parts = resolvable(resolution);
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);
        await loop.watch('song-1');
        expect(loop.getSnapshot().observation?.conflict).toBe('gone');
        const before = loop.getSnapshot().libraryVersion;

        expect(await loop.keepBoth('song-1')).toEqual(resolution);

        expect(parts.asked).toEqual(['song-1']);
        // The library moved on disk — a song left it and another arrived — so the shell re-reads.
        expect(loop.getSnapshot().libraryVersion).toBeGreaterThan(before);
        // And the banner's own fact is re-read rather than left describing a conflict that is
        // no longer there.
        expect(loop.getSnapshot().observation?.conflict).toBe('none');
        // The pass is detached, so give it a turn: the queue is unblocked and holds a create
        // nobody has sent, and there is no timer here to notice that.
        await loop.run();
        expect(api.get).toHaveBeenCalled();
    });

    it('writes none of its own state back from an epoch that has been superseded', async () => {
        const resolution = {
            conflict: 'gone',
            documentId: 'song-2',
            document: { id: 'song-2' },
            operationId: 'op-fresh',
            adopted: null,
        };
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        let loop!: ReturnType<typeof createSyncLoop>;
        const parts = resolvable(resolution, {
            keepBoth: async () => {
                // The session expires, or the musician signs out, while the transaction is open.
                loop.detach();
                return resolution;
            },
        });
        loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);
        await loop.watch('song-1');
        const before = loop.getSnapshot().libraryVersion;

        // Still reported: the commit happened, and the caller has to move the chart on the stand
        // onto the identity its line now lives under whatever this loop is attached to.
        expect(await loop.keepBoth('song-1')).toEqual(resolution);

        // ...but nothing of THIS loop's state may be written from an epoch that is gone: a library
        // bump, a re-pointed `watched` or a pass would all describe an account that has detached.
        expect(loop.getSnapshot().owner).toBe(null);
        expect(loop.getSnapshot().libraryVersion).toBe(before);
        expect(loop.getSnapshot().observation).toBe(null);
    });

    it('reports nothing moved when the refusal is already gone, and touches neither list nor stand', async () => {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const parts = resolvable('none', { pending: async () => [{ status: 'queued' }] });
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);
        await loop.watch('song-1');
        const before = loop.getSnapshot().libraryVersion;

        expect(await loop.keepBoth('song-1')).toBe(null);

        expect(parts.asked).toEqual(['song-1']);
        expect(loop.getSnapshot().libraryVersion).toBe(before);
        expect(loop.getSnapshot().observation).toMatchObject({ conflict: 'none', pendingCount: 1 });
    });

    it('refuses to resolve anything while signed out', async () => {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const parts = resolvable('none');
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await expect(loop.keepBoth('song-1')).rejects.toThrow('signed out');
        expect(parts.asked).toEqual([]);
    });

    it('reports no conflict at all for an ordinary queued Save', async () => {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const loop = createSyncLoop(
            api,
            createAccountSession(api),
            stubSongbook({
                read: async () => ({ remoteRevision: 'cloud-1' }),
                pending: async () => [{ status: 'queued' }],
            }),
        );
        await loop.attach(OWNER);
        await loop.watch('song-1');
        expect(loop.getSnapshot().observation).toMatchObject({
            conflict: 'none',
            pendingCount: 1,
        });
    });
});

/**
 * Signing out (#1269). What is proven here is the ORDER, which is the whole safety property: the
 * generation fence moves before the logout request, so a Save reply for this account that arrives
 * after the musician asked to leave meets a generation that no longer matches. That a mismatched
 * generation actually refuses the write is proven against real IndexedDB in
 * `tests/browser/account-sign-out.browser.test.ts`; a stub store would agree either way.
 */
describe('signing out moves the fence before it asks the server for anything', () => {
    /** Records every ordered step a sign-out takes, through one stub. */
    function recorded(overrides: Record<string, unknown> = {}) {
        const steps: string[] = [];
        const songbook = stubSongbook({
            switchAccount: async (ownerId: string | null) => {
                steps.push(`switchAccount:${ownerId}`);
                return ownerId === null ? null : SCOPE;
            },
            clearAccount: async (ownerId: string) => {
                steps.push(`clearAccount:${ownerId}`);
            },
            ...overrides,
        });
        return { steps, songbook };
    }

    it('bumps the generation, then revokes, then forgets the account', async () => {
        const { api } = fakeApi({ ok: true, value: {}, status: 204 });
        const { steps, songbook } = recorded();
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);
        steps.length = 0;

        const outcome = await loop.signOut(async () => {
            steps.push('revoke');
            return true;
        });

        expect(outcome).toBe('signed-out');
        // The fence is the FIRST step and the revocation the second: a late reply for this
        // account can no longer commit anything, whatever the server says next.
        expect(steps).toEqual(['switchAccount:null', 'revoke', `clearAccount:${OWNER}`]);
        expect(loop.getSnapshot().owner).toBeNull();
    });

    it('removes nothing and gives the account back when the server never confirmed', async () => {
        const { api } = fakeApi({ ok: false, error: { kind: 'network' } });
        const { steps, songbook } = recorded();
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);
        steps.length = 0;

        const outcome = await loop.signOut(async () => {
            steps.push('revoke');
            return false;
        });

        expect(outcome).toBe('kept');
        // No `clearAccount` at any point: an unanswered logout is a sign-out that did not happen,
        // and a device that emptied itself on one would destroy the queue for a live session.
        expect(steps).not.toContain(`clearAccount:${OWNER}`);
        // And the account is attached again, so the outbox is not stranded behind a stale scope.
        expect(loop.getSnapshot().owner).toBe(OWNER);
    });

    it('gives the account back when the revocation throws rather than answering', async () => {
        const { api } = fakeApi({ ok: true, value: {}, status: 204 });
        const { steps, songbook } = recorded();
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        await expect(
            loop.signOut(async () => {
                throw new Error('logout blew up');
            }),
        ).rejects.toThrow('logout blew up');

        expect(steps).not.toContain(`clearAccount:${OWNER}`);
        expect(loop.getSnapshot().owner).toBe(OWNER);
    });

    it('stands by a revocation the server confirmed even when the local wipe fails', async () => {
        const { api } = fakeApi({ ok: true, value: {}, status: 204 });
        const { songbook } = recorded({
            clearAccount: async () => {
                throw new Error('storage went away');
            },
        });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);

        const outcome = await loop.signOut(async () => true);

        // Revoking is the irreversible step and it already happened. Re-attaching here would put
        // the shell back into a session the server has dropped — and show the expired banner's
        // "everything you saved is still on this device" about an account whose records really
        // are still here, which is the one reading this must never produce.
        expect(outcome).toBe('signed-out');
        expect(loop.getSnapshot().owner).toBeNull();
        // So what is owed is the sentence: the sign-out happened, the wipe did not.
        expect(loop.getSnapshot().failure).toEqual({
            reason: 'server',
            message: SIGN_OUT_MESSAGES.notCleared,
        });
    });

    it('keeps the server’s back-off window and its sentence across a refused sign-out', async () => {
        const { api, reads } = fakeApi({
            ok: false,
            error: { kind: 'code', code: 'rate_limited', status: 429 },
        });
        const loop = createSyncLoop(api, createAccountSession(api), withQueuedSave());
        await loop.attach(OWNER);
        await loop.run();
        expect(api.post).toHaveBeenCalledTimes(1);

        // A sign-out the server would not confirm re-attaches the account — and `detach`/`attach`
        // both reset the 429 floor. A refusal is not the server withdrawing the wait it asked
        // for, so a re-attach that cleared it would re-POST the refused Save inside the very
        // window this origin was told to sit out.
        expect(await loop.signOut(async () => false)).toBe('kept');

        // `attach` also publishes `failure: null`, and nothing about a refused sign-out resolved
        // the Save that is still owed — the chip must not go quiet about it.
        expect(loop.getSnapshot().failure).toEqual({
            reason: 'rate-limited',
            message: SYNC_MESSAGES.rateLimited,
        });
        await loop.run();
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(documentReads(reads)).toEqual([]);
    });

    /**
     * The `drafts` half of this plan is the ACCOUNT DATABASE's, and today it is always zero: the
     * one writer of that store (`AccountSongbook.recover`) has no caller in the app yet. The rows
     * below are therefore a contract for the #1299 future, not a reproduction of live storage —
     * what an account chart's unsaved text actually sits in today is a guest recovery slot, which
     * the loop cannot see and the SHELL adds (`withLocalDrafts` in `app/ensemble.tsx`). That
     * composition is proven end to end in `prototypes/v2/checks/account-sign-out.chromium.spec.ts`.
     */
    it('counts unsent Saves and unsaved drafts as two separate facts', async () => {
        const { api } = fakeApi({ ok: true, value: {}, status: 204 });
        const loop = createSyncLoop(
            api,
            createAccountSession(api),
            stubSongbook({
                list: async () => ({
                    // `song-3` holds neither: it is already safely in the account, so an export
                    // that wrote it out too would bury the files that actually matter.
                    songs: [
                        { documentId: 'song-1' },
                        { documentId: 'song-2' },
                        { documentId: 'song-3' },
                    ],
                    nextAfterDocumentId: null,
                }),
                pending: async (_scope: unknown, documentId: string) =>
                    documentId === 'song-1' ? [{ status: 'queued' }, { status: 'queued' }] : [],
                drafts: async (_scope: unknown, documentId: string) =>
                    documentId === 'song-2' ? [{ writerId: 'w' }] : [],
            }),
        );
        await loop.attach(OWNER);

        // Two counts, never one total: a committed version the cloud has not taken and an
        // experiment that was never committed are protected differently, so the preflight has to
        // be able to say which is at stake.
        expect(await loop.signOutPreflight()).toEqual({
            documentIds: ['song-1', 'song-2', 'song-3'],
            // Both songs hold work the account has not got, by two different routes: one a queued
            // Save, the other an unsaved experiment. Export has to reach both.
            atRisk: ['song-1', 'song-2'],
            unsentSaves: 2,
            refusedSaves: 0,
            drafts: 1,
        });
    });

    it('counts a refused head’s whole queue as unsyncable, so the step never offers a dead Sync now', async () => {
        // #1298 patch review P2: "Sync now" is the one move that can empty a queue before it is
        // discarded — and against a refused head it provably cannot, because `prepare()` answers
        // `'refused'` for it without sending. The Save queued BEHIND that head counts too: nothing
        // advances past a refusal, so it is exactly as stuck as the marked row.
        const { api } = fakeApi({ ok: true, value: {}, status: 204 });
        const loop = createSyncLoop(
            api,
            createAccountSession(api),
            stubSongbook({
                list: async () => ({
                    songs: [{ documentId: 'song-1' }, { documentId: 'song-2' }],
                    nextAfterDocumentId: null,
                }),
                pending: async (_scope: unknown, documentId: string) =>
                    documentId === 'song-1'
                        ? [{ status: 'refused', reason: 'too-large' }, { status: 'queued' }]
                        : [{ status: 'queued' }],
                drafts: async () => [],
            }),
        );
        await loop.attach(OWNER);

        expect(await loop.signOutPreflight()).toMatchObject({
            unsentSaves: 3,
            // song-1's two, never song-2's: an ordinary queue behind an ordinary head still syncs.
            refusedSaves: 2,
        });
    });
});
