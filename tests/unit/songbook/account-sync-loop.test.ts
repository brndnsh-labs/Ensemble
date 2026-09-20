import { describe, expect, it, vi } from 'vitest';
import type { AccountApi, ApiResult } from '../../../prototypes/v2/lib/account/api.js';
import { createAccountSession } from '../../../prototypes/v2/lib/account/session.js';
import {
    AccountMismatchError,
    belongsToAnotherAccount,
    createSyncLoop,
    DELETE_MESSAGES,
    OWNER_MESSAGES,
    SIGN_OUT_MESSAGES,
    SYNC_MESSAGES,
} from '../../../prototypes/v2/lib/account/sync-loop.js';
import { MAX_PENDING_SAVES, type PreparedSave } from '../../../prototypes/v2/lib/sync/protocol.js';
import type { AccountSongbook } from '../../../prototypes/v2/lib/sync/repository.js';
import { accountChart } from '../../utils/account-songbook-fixture.js';

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
        await loop.save({ id: 'song-1' } as never, null, OWNER);
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
        const result = await loop.deleteFromCloud('song-1', OWNER);
        return { loop, result, ...parts };
    }

    it('sends the frozen bytes verbatim to the delete route and reports the removal', async () => {
        const { api } = fakeApi({ ok: true, value: { outcome: 'removed' }, status: 200 });
        const parts = deletable();
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);
        loop.setActiveDocument(null);
        const before = loop.getSnapshot().libraryVersion;

        const result = await loop.deleteFromCloud('song-1', OWNER);

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
        await loop.deleteFromCloud('song-1', OWNER);
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

        expect((await loop.deleteFromCloud('song-1', OWNER)).kind).toBe('refused');

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

        const first = await loop.deleteFromCloud('song-1', OWNER);
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
        const second = await loop.deleteFromCloud('song-1', OWNER);
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
            expect(await loop.deleteFromCloud('song-1', OWNER)).toEqual({
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

        expect(await loop.keepBoth('song-1', OWNER)).toEqual({ ...resolution, ownerId: OWNER });

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
        expect(await loop.keepBoth('song-1', OWNER)).toEqual({ ...resolution, ownerId: OWNER });

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

        expect(await loop.keepBoth('song-1', OWNER)).toBe(null);

        expect(parts.asked).toEqual(['song-1']);
        expect(loop.getSnapshot().libraryVersion).toBe(before);
        expect(loop.getSnapshot().observation).toMatchObject({ conflict: 'none', pendingCount: 1 });
    });

    it('refuses to resolve anything while signed out', async () => {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const parts = resolvable('none');
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await expect(loop.keepBoth('song-1', OWNER)).rejects.toThrow('signed out');
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
     * The `drafts` half of this plan is the ACCOUNT DATABASE's, which since #1299 is where an
     * account chart's unsaved text actually sits. What it cannot see is a draft whose storage
     * write was refused and a guest slot left under an account id by an older build; the SHELL
     * adds those (`withLocalDrafts` in `app/ensemble.tsx`), and that composition is proven end to
     * end in `prototypes/v2/checks/account-sign-out.chromium.spec.ts`.
     */
    it('counts unsent Saves and unsaved drafts as two separate facts', async () => {
        /** What every song below has committed; the draft rows are placed either side of it. */
        const SAVED_AT = '2026-09-18T10:00:00.000Z';
        const { api } = fakeApi({ ok: true, value: {}, status: 204 });
        const loop = createSyncLoop(
            api,
            createAccountSession(api),
            stubSongbook({
                list: async () => ({
                    // `song-3` holds neither: it is already safely in the account, so an export
                    // that wrote it out too would bury the files that actually matter. It DOES
                    // hold a draft row — one an earlier page load's Save has already moved past,
                    // which is not an experiment anybody can be offered or shown (#1299 patch
                    // review P1).
                    songs: [
                        { documentId: 'song-1', document: { updatedAt: SAVED_AT } },
                        { documentId: 'song-2', document: { updatedAt: SAVED_AT } },
                        { documentId: 'song-3', document: { updatedAt: SAVED_AT } },
                    ],
                    nextAfterDocumentId: null,
                }),
                pending: async (_scope: unknown, documentId: string) =>
                    documentId === 'song-1' ? [{ status: 'queued' }, { status: 'queued' }] : [],
                drafts: async (_scope: unknown, documentId: string) => {
                    if (documentId === 'song-2') {
                        return [{ writerId: 'w', capturedAt: '2026-09-18T10:30:00.000Z' }];
                    }
                    return documentId === 'song-3'
                        ? [{ writerId: 'stale', capturedAt: '2026-09-18T09:00:00.000Z' }]
                        : [];
                },
            }),
        );
        await loop.attach(OWNER);

        // Two counts, never one total: a committed version the cloud has not taken and an
        // experiment that was never committed are protected differently, so the preflight has to
        // be able to say which is at stake.
        expect(await loop.signOutPreflight()).toEqual({
            documentIds: ['song-1', 'song-2', 'song-3'],
            // Both songs hold work the account has not got, by two different routes: one a queued
            // Save, the other an unsaved experiment. Export has to reach both — and song-3's
            // superseded row reaches neither this list nor the count below, or the step would
            // warn about an experiment no export could write and no musician could point at.
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

/**
 * Where an account chart's unsaved experiment goes, and which one comes back (#1299).
 *
 * The STORE's behavior is proven against real IndexedDB in `tests/browser/account-*`; what is
 * decided here is the loop's own logic — which scope a draft may be written under, and which of
 * several retained rows is still worth offering a musician.
 */
describe('the sync loop retains an account chart’s unsaved experiment', () => {
    const SONG = {
        documentId: 'song-1',
        remoteRevision: 'r1',
        document: {
            id: 'song-1',
            title: 'Set list',
            revision: 2,
            updatedAt: '2026-09-18T10:00:00.000Z',
        },
    };
    const EDIT = { ...accountChart('Set list three', 'song-1'), revision: 2 };

    function draftRow(title: string, capturedAt: string, baseRevision = 2) {
        return {
            writerId: 'writer-1',
            document: { id: 'song-1', title, revision: baseRevision },
            baseRevision,
            capturedAt,
        };
    }

    async function attached(songbook: AccountSongbook) {
        const { api } = fakeApi({ ok: true, value: {}, status: 204 });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);
        return loop;
    }

    it('offers the newest retained draft, whatever order the rows come back in', async () => {
        const loop = await attached(
            stubSongbook({
                read: async () => SONG,
                drafts: async () => [
                    draftRow('second', '2026-09-18T10:30:00.000Z'),
                    draftRow('newest', '2026-09-18T11:00:00.000Z'),
                    draftRow('first', '2026-09-18T10:05:00.000Z'),
                ],
            }),
        );

        const held = await loop.retainedDraft('song-1');

        expect(held?.document.title).toBe('newest');
        // Captured against the revision that is committed now, so restoring it loses nothing.
        expect(held?.conflict).toBe(false);
    });

    it('does not offer a draft captured before the version it sits on', async () => {
        // A Save — this tab's, another tab's, or a Keep-both — has moved past this experiment.
        // Offering it would invite the musician to restore text they have already replaced.
        const loop = await attached(
            stubSongbook({
                read: async () => SONG,
                drafts: async () => [draftRow('stale', '2026-09-18T09:00:00.000Z')],
            }),
        );

        expect(await loop.retainedDraft('song-1')).toBeNull();
    });

    it('flags a draft based on a different committed revision, so the menu can say so', async () => {
        const loop = await attached(
            stubSongbook({
                read: async () => SONG,
                drafts: async () => [draftRow('mine', '2026-09-18T11:00:00.000Z', 1)],
            }),
        );

        expect(await loop.retainedDraft('song-1')).toMatchObject({ conflict: true });
    });

    it('answers nothing for a song this account does not hold here', async () => {
        const loop = await attached(
            stubSongbook({
                read: async () => null,
                drafts: async () => [draftRow('orphan', '2026-09-18T11:00:00.000Z')],
            }),
        );

        expect(await loop.retainedDraft('song-1')).toBeNull();
    });

    it('reads a whole at-risk set in one call, for an export that cannot await between files', async () => {
        const loop = await attached(
            stubSongbook({
                read: async (_scope: unknown, documentId: string) => ({
                    ...SONG,
                    documentId,
                    document: { ...SONG.document, id: documentId },
                }),
                drafts: async (_scope: unknown, documentId: string) =>
                    documentId === 'song-2' ? [] : [draftRow('edited', '2026-09-18T11:00:00.000Z')],
            }),
        );

        const held = await loop.retainedDrafts(['song-1', 'song-2']);

        expect(held.get('song-1')?.title).toBe('edited');
        // A song with nothing retained is absent rather than present-and-committed: the caller
        // falls back to the library copy, and an entry here would claim an edit that is not one.
        expect(held.has('song-2')).toBe(false);
    });

    it('still retains a draft after the session expired, under the account this device holds', async () => {
        // Expiry detaches the loop (`app/account/library.tsx`), which is right for everything that
        // sends — but the chart on the stand is still the account's, and its text has to go
        // somewhere that is not the guest namespace. The local fence has not moved.
        const written: unknown[][] = [];
        const loop = await attached(
            stubSongbook({
                recover: async (...args: unknown[]) => {
                    written.push(args);
                },
            }),
        );
        loop.detach();

        // Named with the account the CHART belongs to, which is still the one this device holds.
        await loop.recover(EDIT, 2, OWNER);
        await loop.recover({ ...EDIT, title: 'again' }, 2, OWNER);

        expect(written).toHaveLength(2);
        expect(written[0][0]).toEqual(SCOPE);
        expect(written[0][3]).toBe(2);
        // One writer per page load, shared with the guest namespace's key shape: two edits are one
        // experiment, not two competing rows.
        expect(typeof written[0][1]).toBe('string');
        expect(written[1][1]).toBe(written[0][1]);
        // And it is only the DRAFT that reaches past the detached scope — a Save still waits for
        // reauthentication, which is the whole point of pausing the outbox.
        await expect(loop.save(EDIT, 2, OWNER)).rejects.toThrow(/signed out/);
    });

    it('refuses to retain anything once the device is genuinely signed out', async () => {
        // No account is held here at all, so there is nowhere this text belongs. The shell's
        // in-tab fallback is what catches this, exactly as it catches a refused storage write.
        const { api } = fakeApi({ ok: true, value: {}, status: 204 });
        const signedOut = createSyncLoop(
            api,
            createAccountSession(api),
            stubSongbook({ currentScope: async () => null }),
        );

        await expect(signedOut.recover(EDIT, 2, OWNER)).rejects.toThrow(/signed out/);
    });

    it('refuses to retain one account’s chart under a different account (#1299 patch review)', async () => {
        // The transition this fence exists for: the session expires under A's chart, "Sign in
        // again" is answered with B's passkey, and the very next keystroke would write A's chart
        // text into B's database — where B's sign-out is what removes it and B's library download
        // is what it protects. Refused, so the shell's in-tab fallback keeps it exportable.
        const written: unknown[][] = [];
        const loop = await attached(
            stubSongbook({
                recover: async (...args: unknown[]) => {
                    written.push(args);
                },
            }),
        );

        await expect(loop.recover(EDIT, 2, 'owner-b')).rejects.toThrow(/different account/);

        expect(written).toEqual([]);
        // And the same call naming the attached account still writes: the fence is about the
        // MISMATCH, not about naming an owner at all.
        await loop.recover(EDIT, 2, OWNER);
        expect(written).toHaveLength(1);
    });

    it('rethrows an unreadable store rather than answering "no retained draft"', async () => {
        // The shell tells those two apart (`retainedDraftFor` in `app/ensemble.tsx`): a song with
        // no draft opens silently, a store that could not be asked opens with a warning and does
        // not replace what this tab already believed. Collapsing them here would make that
        // impossible — an unreadable store would open the committed copy as the whole truth and
        // the first keystroke would retain an experiment over a draft nobody ever saw.
        const loop = await attached(
            stubSongbook({
                read: async () => {
                    throw new Error('Account storage unavailable.');
                },
            }),
        );

        await expect(loop.retainedDraft('song-1')).rejects.toThrow(/storage unavailable/);
    });

    it('offers every live retained draft to the menu, newest first, and no superseded one', async () => {
        // The song menu's "Preserved drafts" list (#1299 patch review P2). Without it a SECOND
        // tab's experiment on this song is unreachable: nothing in the product can open it, and
        // the only thing that mentions it is a sign-out warning.
        const loop = await attached(
            stubSongbook({
                read: async () => SONG,
                drafts: async () => [
                    { ...draftRow('mine', '2026-09-18T10:30:00.000Z'), writerId: 'writer-1' },
                    { ...draftRow('theirs', '2026-09-18T11:00:00.000Z'), writerId: 'writer-2' },
                    { ...draftRow('superseded', '2026-09-18T09:00:00.000Z'), writerId: 'writer-0' },
                ],
            }),
        );

        expect(await loop.preservedDrafts('song-1')).toEqual([
            {
                document: { id: 'song-1', title: 'theirs', revision: 2 },
                capturedAt: '2026-09-18T11:00:00.000Z',
            },
            {
                document: { id: 'song-1', title: 'mine', revision: 2 },
                capturedAt: '2026-09-18T10:30:00.000Z',
            },
        ]);
    });
});

/**
 * The stand is bound to an OWNER, not just to a store (#1311).
 *
 * The transition every test here is about: the session expires under account A's chart, the
 * musician answers "Sign in again" with B's passkey, and the shell still has A's song on the
 * stand. #1299 fenced the draft half of that; the Save half shipped unfenced, and `Save a copy`
 * — which passes `expected: null`, so it cannot even report a conflict — would quietly create
 * A's music inside B's library.
 *
 * What is proven here is the LOOP's half: every account-store write takes the owner the caller
 * believes the chart belongs to, compares it to the scope this device actually holds, and refuses
 * a mismatch BEFORE touching storage. The shell carries its own copy of the same check
 * (`standBelongsElsewhere` in `app/ensemble.tsx`, over the same `belongsToAnotherAccount`), and
 * the two are deliberately independent: neither is allowed to be the only thing standing there.
 */
describe('the sync loop refuses a write for a chart that belongs to another account', () => {
    const OTHER = 'owner-b';
    const CHART = accountChart('Set list', 'song-1');

    /** Records every write the loop asks the songbook for, so "nothing happened" is measurable. */
    function recording(overrides: Record<string, unknown> = {}) {
        const writes: string[] = [];
        const songbook = stubSongbook({
            read: async () => ({ remoteRevision: 'cloud-1' }),
            pending: async () => [{ status: 'conflict', remote: null }],
            save: async () => {
                writes.push('save');
                return { documentId: 'song-1', remoteRevision: null, document: CHART };
            },
            recover: async () => {
                writes.push('recover');
            },
            keepBoth: async () => {
                writes.push('keepBoth');
                return 'none';
            },
            prepareDelete: async () => {
                writes.push('prepareDelete');
                return 'missing';
            },
            ...overrides,
        });
        return { songbook, writes };
    }

    async function attachedTo(songbook: AccountSongbook) {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);
        await loop.watch('song-1');
        return { api, loop };
    }

    it('refuses a Save for another account’s chart before committing a single byte', async () => {
        const parts = recording();
        const { loop } = await attachedTo(parts.songbook);
        const before = loop.getSnapshot().libraryVersion;

        await expect(loop.save(CHART, null, OTHER)).rejects.toThrow(AccountMismatchError);

        // `expected: null` is `Save a copy`, which is the dangerous shape: a plain Save at least
        // reports a nonsense conflict, while a create simply succeeds. Nothing reached storage,
        // so B's library holds no record, no queued operation and no bump the songbook re-reads.
        expect(parts.writes).toEqual([]);
        expect(loop.getSnapshot().libraryVersion).toBe(before);
    });

    it('still saves for the attached account, so the fence is about the mismatch and not the claim', async () => {
        const parts = recording();
        const { loop } = await attachedTo(parts.songbook);

        await loop.save(CHART, null, OWNER);
        await loop.save(CHART, null, null);

        // Naming the attached account writes, and naming NO account writes: a caller with nothing
        // to claim — a brand-new song, an imported file, a guest song being adopted — belongs to
        // whichever account is live, which is exactly what it was before this fence existed.
        expect(parts.writes).toEqual(['save', 'save']);
    });

    it('refuses a retained draft for another account, with the same typed error the rest use', async () => {
        // #1299 fenced this path first, with its own inline comparison and its own sentence. It
        // asks `belongsToAnotherAccount` now, and answers with the one sentence — a musician who
        // meets this refusal by typing and again by pressing Save must not be told two stories.
        const parts = recording();
        const { loop } = await attachedTo(parts.songbook);

        await expect(loop.recover(CHART, 2, OTHER)).rejects.toThrow(AccountMismatchError);
        await expect(loop.recover(CHART, 2, OTHER)).rejects.toThrow(OWNER_MESSAGES.mismatch);

        expect(parts.writes).toEqual([]);
    });

    it('refuses Keep both for another account’s chart, so no line is created in B’s library', async () => {
        // The one operation here that CREATES a document: `keepBoth` files the local line under a
        // fresh id in the attached account. Run against a chart that is not that account's, it is
        // one person's music appearing in another person's songbook out of nowhere.
        const parts = recording();
        const { loop } = await attachedTo(parts.songbook);
        expect(loop.getSnapshot().observation?.conflict).toBe('gone');

        await expect(loop.keepBoth('song-1', OTHER)).rejects.toThrow(AccountMismatchError);

        expect(parts.writes).toEqual([]);
    });

    it('refuses a cloud delete for another account’s chart without freezing or sending anything', async () => {
        // Reported rather than thrown, like this method's other pre-send refusals — and, like
        // them, ahead of `prepareDelete`, so no operation id is frozen for a request that never
        // left and there are no bytes a later retry could replay.
        const parts = recording();
        const { api, loop } = await attachedTo(parts.songbook);

        expect(await loop.deleteFromCloud('song-1', OTHER)).toEqual({
            kind: 'refused',
            retry: false,
            message: OWNER_MESSAGES.mismatch,
        });

        expect(parts.writes).toEqual([]);
        // Nothing was sent, so nothing can have been deleted from either account.
        expect(api.post).not.toHaveBeenCalled();
    });

    it('answers "signed out" rather than "another account" when this device holds none', async () => {
        // Two different facts, and the sentences are not interchangeable: a device with no account
        // has nowhere to put this chart, while a device attached to B is being asked to file A's
        // music. Telling a musician their own chart belongs to somebody else is the failure mode.
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const signedOut = createSyncLoop(
            api,
            createAccountSession(api),
            stubSongbook({ currentScope: async () => null }),
        );

        await expect(signedOut.save(CHART, null, OWNER)).rejects.toThrow(/signed out/);
        await expect(signedOut.recover(CHART, 2, OWNER)).rejects.toThrow(/signed out/);
    });

    it('says what actually works, and never a retry or an account id', async () => {
        const sentence = OWNER_MESSAGES.mismatch;

        // Export is the move that always works — a file on the musician's own disk needs no
        // account at all — and signing back in is the other. A retry is not offered, because
        // nothing about trying again changes which account this device is attached to.
        expect(sentence).toContain('export it');
        expect(sentence).toContain('sign back in');
        expect(sentence).not.toContain('try again');
        // An owner id is a server identifier, not something a musician can read or act on.
        expect(sentence).not.toContain(OWNER);
        expect(new AccountMismatchError(OTHER, OWNER).message).toBe(sentence);
    });

    it('refuses every smaller account write too, not just the ones that commit a version', async () => {
        // #1311 patch review R4. These three are easy to read as bookkeeping — a last-opened
        // pointer, a draft row being dropped — but each is a WRITE into an account database keyed
        // by a document id, and "it would be a no-op against the wrong store" is only true while
        // the assumption that it is the wrong store holds. A shell guard was the only thing in
        // front of them; now there are two, like every other write here.
        const writes: string[] = [];
        const { loop } = await attachedTo(
            stubSongbook({
                rememberOpened: async () => {
                    writes.push('rememberOpened');
                },
                discardDraft: async () => {
                    writes.push('discardDraft');
                },
                discardDrafts: async () => {
                    writes.push('discardDrafts');
                },
            }),
        );

        await expect(loop.rememberOpened('song-1', OTHER)).rejects.toThrow(AccountMismatchError);
        await expect(loop.discardDraft('song-1', OTHER)).rejects.toThrow(AccountMismatchError);
        await expect(loop.discardDrafts('song-1', OTHER)).rejects.toThrow(AccountMismatchError);
        expect(writes).toEqual([]);

        // ...and all three still write for the account that IS attached.
        await loop.rememberOpened('song-1', OWNER);
        await loop.discardDraft('song-1', OWNER);
        await loop.discardDrafts('song-1', OWNER);
        expect(writes).toEqual(['rememberOpened', 'discardDraft', 'discardDrafts']);
    });

    it('reports the account Keep both actually settled to, not the caller’s claim', async () => {
        // #1311 patch review R1: the shell re-points the chart on the stand at the identity this
        // resolution created, and binds it to an account. Reading that account from a render
        // snapshot is how a stale `null` owner becomes an unfenced binding, so the transaction
        // reports the scope it really committed in and the shell binds from THAT.
        const resolution = {
            conflict: 'gone',
            documentId: 'song-2',
            document: { id: 'song-2' },
            operationId: 'op-fresh',
            adopted: null,
        };
        const { loop } = await attachedTo(
            stubSongbook({
                read: async () => ({ remoteRevision: 'cloud-1' }),
                pending: async () => [{ status: 'conflict', remote: null }],
                keepBoth: async () => resolution,
            }),
        );

        // Claimed with no owner at all, which is the caller saying "whichever account is live".
        expect(await loop.keepBoth('song-1', null)).toEqual({ ...resolution, ownerId: OWNER });
    });

    it('treats a missing owner on either side as no mismatch at all', async () => {
        // The predicate both layers ask. A null `owner` is a caller making no claim; a null
        // `attached` is a device holding no account — and reading either as a mismatch would
        // refuse a brand-new song, or print the wrong sentence for a signed-out device.
        expect(belongsToAnotherAccount(OWNER, OTHER)).toBe(true);
        expect(belongsToAnotherAccount(OWNER, OWNER)).toBe(false);
        expect(belongsToAnotherAccount(null, OWNER)).toBe(false);
        expect(belongsToAnotherAccount(OWNER, null)).toBe(false);
        expect(belongsToAnotherAccount(null, null)).toBe(false);
    });
});

/**
 * "Sign out on this device", for a session that has already expired (#1351).
 *
 * The state every test here starts in is the one an expiry leaves behind: the loop is DETACHED
 * (`app/account/library.tsx` detaches the moment the session stops reporting an owner), while
 * `meta.active` still names the account whose songs, outbox, receipts and drafts are on this disk.
 * Before this, nothing in the product could remove them — `signOut()` needed a live scope and a
 * logout round trip, and expiry has neither — so a device that changed hands kept A's library
 * forever, fenced out of B's reach but still on the disk.
 *
 * What is proven here is that this is the SAME clearing path rather than a second one: the ordered
 * `switchAccount(null)` -> revoke -> `clearAccount(owner)` that #1269 and #1271 both run, with the
 * revocation pre-resolved because there is nothing left to revoke. What differs is only where the
 * scope comes from — the account this device HOLDS, named by the caller and refused if it is not
 * the one held — and that it sends nothing at all, so it works offline.
 *
 * The real transaction behavior of the clear is proven against IndexedDB in
 * `tests/browser/account-sign-out.browser.test.ts`, which also drives this exact call.
 */
describe('an expired session signs out on this device without a round trip (#1351)', () => {
    const OTHER = 'owner-b';

    /**
     * A device that HOLDS an account with nothing attached, recording every write the loop asks
     * for. `currentScope` is what answers, because there is no attached scope to answer with.
     */
    function held(overrides: Record<string, unknown> = {}) {
        const steps: string[] = [];
        const songbook = stubSongbook({
            currentScope: async () => SCOPE,
            switchAccount: async (ownerId: string | null) => {
                steps.push(`switchAccount:${ownerId}`);
                return ownerId === null ? null : SCOPE;
            },
            clearAccount: async (ownerId: string) => {
                steps.push(`clearAccount:${ownerId}`);
            },
            save: async () => {
                steps.push('save');
                return { documentId: 'song-1', remoteRevision: null };
            },
            recover: async () => {
                steps.push('recover');
            },
            discardDrafts: async () => {
                steps.push('discardDrafts');
            },
            ...overrides,
        });
        return { steps, songbook };
    }

    /** The loop as an expiry leaves it: constructed, never attached. */
    function expired(songbook: AccountSongbook) {
        const { api, reads } = fakeApi({ ok: true, value: {}, status: 204 });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        expect(loop.getSnapshot().owner).toBeNull();
        return { api, reads, loop };
    }

    it('bumps the fence, then forgets the account, from the scope this device holds', async () => {
        const { steps, songbook } = held();
        const { api, reads, loop } = expired(songbook);

        const outcome = await loop.signOut(async () => {
            steps.push('revoke');
            return true;
        }, OWNER);

        expect(outcome).toBe('signed-out');
        // The same three steps in the same order #1269 proves for a live session, and the fence
        // is still first: a reply for this account that is somehow still in flight meets a
        // generation that no longer matches. `clearAccount` is named with the held owner, which
        // is the only thing that could have told it which rows to take.
        expect(steps).toEqual(['switchAccount:null', 'revoke', `clearAccount:${OWNER}`]);
        // And nothing was sent, by either half of the API. There is no session to revoke, so a
        // logout would be a request spent to be told what this device already knows — which is
        // also why this whole step works with the network off.
        expect(api.post).not.toHaveBeenCalled();
        expect(api.get).not.toHaveBeenCalled();
        expect(documentReads(reads)).toEqual([]);
    });

    it('refuses an account this device no longer holds, before the fence moves', async () => {
        // Another tab signed in as somebody else while this one still showed the expired banner.
        // Applying the step to whoever is held now would delete THEIR whole library — which is
        // why the refusal has to land ahead of `switchAccount(null)`, not after it.
        const { steps, songbook } = held();
        const { loop } = expired(songbook);

        await expect(
            loop.signOut(async () => {
                steps.push('revoke');
                return true;
            }, OTHER),
        ).rejects.toThrow(AccountMismatchError);

        // Not one step ran: no fence, no revocation, no clear. The device is exactly as it was.
        expect(steps).toEqual([]);
    });

    it('leaves the loop detached, whether the clear lands or the fence write fails', async () => {
        // An expiry detached this loop deliberately, and `app/account/library.tsx` will not do it
        // again — its effect is keyed on an owner that is already null. So a re-attach here would
        // stick: the loop would hold a scope for a dead session, publish an owner while the header
        // is telling the musician to sign back in, and spend a pass on the next `online` event.
        const { loop } = expired(held().songbook);
        await loop.signOut(async () => true, OWNER);
        expect(loop.getSnapshot().owner).toBeNull();

        const broken = expired(
            held({
                switchAccount: async () => {
                    throw new Error('storage went away');
                },
            }).songbook,
        );
        await expect(broken.loop.signOut(async () => true, OWNER)).rejects.toThrow(
            'storage went away',
        );
        expect(broken.loop.getSnapshot().owner).toBeNull();
    });

    it('reads the same preflight off the held scope, and reading it writes nothing', async () => {
        const SAVED_AT = '2026-09-18T10:00:00.000Z';
        const { steps, songbook } = held({
            list: async () => ({
                songs: [
                    { documentId: 'song-1', document: { updatedAt: SAVED_AT } },
                    { documentId: 'song-2', document: { updatedAt: SAVED_AT } },
                ],
                nextAfterDocumentId: null,
            }),
            pending: async (_scope: unknown, documentId: string) =>
                documentId === 'song-1' ? [{ status: 'queued' }] : [],
            drafts: async (_scope: unknown, documentId: string) =>
                documentId === 'song-2'
                    ? [{ writerId: 'w', capturedAt: '2026-09-18T10:30:00.000Z' }]
                    : [],
        });
        const { api, loop } = expired(songbook);

        // The identical two counts #1269's step names, from a device with nothing attached: the
        // committed version the account never took, and the experiment that was never committed.
        expect(await loop.signOutPreflight(OWNER)).toEqual({
            documentIds: ['song-1', 'song-2'],
            atRisk: ['song-1', 'song-2'],
            unsentSaves: 1,
            refusedSaves: 0,
            drafts: 1,
        });
        // The export the step offers reads through the held scope too, or it would have no library
        // to write files from — the loop is detached, so `accountSongs` in the shell is gone.
        expect((await loop.listLibrary(OWNER)).map((song) => song.documentId)).toEqual([
            'song-1',
            'song-2',
        ]);
        expect((await loop.retainedDrafts(['song-2'], OWNER)).size).toBe(0);

        // A CANCEL is this, and nothing after it. The preflight is a read: it moved no fence,
        // cleared no account and wrote nothing at all, so a musician who backs out has lost
        // nothing — which is the whole reason the step is allowed to be in front of the button.
        expect(steps).toEqual([]);
        expect(api.post).not.toHaveBeenCalled();
    });

    it('refuses a library read for the account the SESSION names while storage still holds another', async () => {
        // #1351 patch R6 — the attach-lag window. `refreshSongs` and `computeAdoptCandidates` are
        // both gated on a session fact ("B is signed in") while `listLibrary` reads a storage one,
        // and `attach` runs from a passive effect: between B's session landing and `meta.active`
        // moving, an UNNAMED read hands back the account this device still HOLDS. Rendered under
        // B's heading, that is A's whole library shown as B's.
        const { loop } = expired(held().songbook);

        await expect(loop.listLibrary('owner-b')).rejects.toThrow(AccountMismatchError);
        // Named with the account that really is held, the same read answers normally.
        expect(await loop.listLibrary(OWNER)).toEqual([]);
    });

    it('refuses every read of the step for an account this device no longer holds', async () => {
        // The counts, the library the export writes from and the drafts that make those files the
        // newest bytes all answer about ONE account, and answering them about whoever is held now
        // would put another person's song titles in front of this musician.
        const { loop } = expired(held().songbook);

        await expect(loop.signOutPreflight(OTHER)).rejects.toThrow(AccountMismatchError);
        await expect(loop.listLibrary(OTHER)).rejects.toThrow(AccountMismatchError);
        await expect(loop.retainedDrafts(['song-1'], OTHER)).rejects.toThrow(AccountMismatchError);
    });

    it('still says what it could not remove when the clear itself fails', async () => {
        // Shared with #1269 and #1271 because it is the same code: the account is being left
        // whatever storage did, and a cheerful "signed out" over a library that is still on the
        // disk is the one reading this step must never produce.
        const { loop } = expired(
            held({
                clearAccount: async () => {
                    throw new Error('storage went away');
                },
            }).songbook,
        );

        expect(await loop.signOut(async () => true, OWNER)).toBe('signed-out');
        expect(loop.getSnapshot().failure).toEqual({
            reason: 'server',
            message: SIGN_OUT_MESSAGES.notCleared,
        });
    });

    it('puts the owner back when the clear fails, so the retry stays reachable (patch R2)', async () => {
        // The fence is only SETTLED once the records are actually gone. Left pointing at nobody
        // with every row still on the disk, `heldOwner()` would answer null, the banner would not
        // render, and there would be no surface left anywhere to ask for the clear again — the
        // exact dead end this whole story exists to remove.
        const steps: string[] = [];
        const { songbook } = held({
            clearAccount: async (ownerId: string) => {
                steps.push(`clearAccount:${ownerId}`);
                throw new Error('storage went away');
            },
            switchAccount: async (ownerId: string | null) => {
                steps.push(`switchAccount:${ownerId}`);
                return ownerId === null ? null : SCOPE;
            },
        });
        const { loop } = expired(songbook);

        expect(await loop.signOut(async () => true, OWNER)).toBe('signed-out');

        // Out, then back: two more generations, so nothing captured under the original scope can
        // commit — and the device is holding its account again, which is what makes it offerable.
        expect(steps).toEqual([
            'switchAccount:null',
            `clearAccount:${OWNER}`,
            `switchAccount:${OWNER}`,
        ]);
        expect(await loop.heldOwner()).toBe(OWNER);
        // And the sentence names the step that is now reachable rather than a whole sign-in.
        expect(SIGN_OUT_MESSAGES.notCleared).toContain('Sign out on this device');
    });

    it('refuses an UNNAMED sign-out while nothing is attached (patch R5)', async () => {
        // An optional `owner` must never mean "no fence". Detached, an unnamed claim resolves
        // through `currentScope()` with nothing to compare — so it would destroy whichever account
        // this device happens to hold, where before #1351 it simply threw.
        const { steps, songbook } = held();
        const { loop } = expired(songbook);

        await expect(loop.signOut(async () => true)).rejects.toThrow(/needs the account/);

        expect(steps).toEqual([]);
        // Named, the very same call works: the refusal is about the missing claim, not the shape.
        expect(await loop.signOut(async () => true, OWNER)).toBe('signed-out');
    });

    it('still lets the two ATTACHED callers omit the owner, exactly as #1269 and #1271 do', async () => {
        // The attached scope IS the answer, so there is nothing for a claim to add — and both
        // legacy callers pass no owner at all.
        const { steps, songbook } = held();
        const { api } = fakeApi({ ok: true, value: {}, status: 204 });
        const loop = createSyncLoop(api, createAccountSession(api), songbook);
        await loop.attach(OWNER);
        steps.length = 0;

        expect(await loop.signOut(async () => true)).toBe('signed-out');
        expect(steps).toEqual(['switchAccount:null', `clearAccount:${OWNER}`]);
    });

    it('answers which account this device holds, from storage rather than from an attach', async () => {
        // The banner's condition (patch R1). It has to be readable with nothing attached, because
        // that is the only state it is ever asked in — and it must answer null for a device that
        // has never held an account, which is every ordinary guest.
        const { loop } = expired(held().songbook);
        expect(await loop.heldOwner()).toBe(OWNER);

        const { api } = fakeApi({ ok: true, value: {}, status: 204 });
        const guest = createSyncLoop(
            api,
            createAccountSession(api),
            stubSongbook({ currentScope: async () => null }),
        );
        expect(await guest.heldOwner()).toBeNull();
        // A read, not a claim: nothing was written and nothing was sent to answer it.
        expect(api.get).not.toHaveBeenCalled();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('names the retry control only while it is on screen (patch N2)', async () => {
        // Three outcomes, three sentences. The one that must not be reused is "Signed out — …Use
        // “Sign out on this device”": with the fence restore ALSO refused, `meta.active` names
        // nobody, no banner renders, and that sentence is an instruction to press something that
        // is not there.
        const stranded = held({
            clearAccount: async () => {
                throw new Error('storage went away');
            },
            switchAccount: async (ownerId: string | null) => {
                if (ownerId === null) {
                    return null;
                }
                throw new Error('storage went away');
            },
        });
        const { loop } = expired(stranded.songbook);

        expect(await loop.signOut(async () => true, OWNER)).toBe('signed-out');

        expect(loop.getSnapshot().failure).toEqual({
            reason: 'server',
            message: SIGN_OUT_MESSAGES.notClearedStranded,
        });
        expect(SIGN_OUT_MESSAGES.notClearedStranded).not.toContain('Sign out on this device');
        expect(SIGN_OUT_MESSAGES.notClearedStranded).toContain('Reload this page');
    });

    it('retries the fence restore once before giving up on it (patch N2)', async () => {
        // A blocked or momentarily unavailable store is the likeliest reason to be here at all, so
        // one rejection is not an answer. The second attempt succeeding is the difference between
        // a retry the musician can press and a reload.
        let attempts = 0;
        const { songbook } = held({
            clearAccount: async () => {
                throw new Error('storage went away');
            },
            switchAccount: async (ownerId: string | null) => {
                if (ownerId === null) {
                    return null;
                }
                attempts += 1;
                if (attempts === 1) {
                    throw new Error('storage was busy');
                }
                return SCOPE;
            },
        });
        const { loop } = expired(songbook);

        expect(await loop.signOut(async () => true, OWNER)).toBe('signed-out');

        expect(attempts).toBe(2);
        expect(loop.getSnapshot().failure?.message).toBe(SIGN_OUT_MESSAGES.notCleared);
    });

    it('does not open "Signed out" about a step that changed nothing (patch N2)', async () => {
        // `signOutOnThisDevice`'s catch is reached only when the fence never moved and not a row
        // was touched, so the sentence it throws must not claim a sign-out happened.
        expect(SIGN_OUT_MESSAGES.notChanged).not.toContain('Signed out');
        expect(SIGN_OUT_MESSAGES.notChanged).toContain('nothing was changed');
        // And the two that DO follow a completed sign-out both say so.
        expect(SIGN_OUT_MESSAGES.notCleared.startsWith('Signed out')).toBe(true);
        expect(SIGN_OUT_MESSAGES.notClearedStranded.startsWith('Signed out')).toBe(true);
    });

    it('names the account that is signed in now, and never the chart sentence', async () => {
        // A musician who meets this refusal is not being told about a chart on a stand — this step
        // never mentioned one — so `OWNER_MESSAGES.mismatch`'s "export it" would send them looking
        // for a song nobody named. It says which account to sign out from instead.
        const sentence = SIGN_OUT_MESSAGES.elsewhere;
        expect(sentence).not.toBe(OWNER_MESSAGES.mismatch);
        expect(sentence).not.toContain('chart');
        expect(sentence).not.toContain(OWNER);
        expect(sentence).toContain('nothing here to sign out of');
    });
});

/**
 * Publishing a preserved remote advance, and adopting one (#1310).
 *
 * The loop's half only, as everywhere else in this file: WHICH observations reach a musician's
 * screen, which owner may ask for the resolution, and what the loop does with its own state
 * afterwards. The transaction is proven against real IndexedDB in
 * `tests/browser/account-adopt-candidate.browser.test.ts`.
 */
describe('the sync loop publishes the remote updates it preserved', () => {
    const version = (documentId: string, revision: string) => ({
        kind: 'version',
        documentId,
        revision,
        document: { id: documentId },
    });

    it('publishes one entry per preserved version, with nothing on the stand', async () => {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const loop = createSyncLoop(
            api,
            createAccountSession(api),
            stubSongbook({
                remoteCandidates: async () => [version('song-1', 'cloud-9')],
            }),
        );

        await loop.attach(OWNER);

        // The songbook is exactly where this is needed and exactly where nothing is watched.
        expect(loop.getSnapshot().observation).toBe(null);
        expect(loop.getSnapshot().candidates).toEqual([
            { documentId: 'song-1', revision: 'cloud-9' },
        ]);
    });

    it('publishes only versions — never a tombstone or a body it cannot read', async () => {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const loop = createSyncLoop(
            api,
            createAccountSession(api),
            stubSongbook({
                remoteCandidates: async () => [
                    { kind: 'deleted', documentId: 'song-gone', revision: 'cloud-2' },
                    {
                        kind: 'unsupported',
                        documentId: 'song-future',
                        revision: 'cloud-3',
                        body: { schemaVersion: 99 },
                        reason: 'needs-app-update',
                    },
                    version('song-1', 'cloud-9'),
                ],
            }),
        );

        await loop.attach(OWNER);

        // "A newer version is in your account" is a sentence about a version. A tombstone is the
        // account no longer holding the song at all, and an unsupported body is one this build
        // cannot read — marking either as a newer version would describe a document that does not
        // exist in the form the marker claims.
        expect(loop.getSnapshot().candidates).toEqual([
            { documentId: 'song-1', revision: 'cloud-9' },
        ]);
    });

    it('keeps the last list rather than retracting it when the store cannot be read', async () => {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        let readable = true;
        const loop = createSyncLoop(
            api,
            createAccountSession(api),
            stubSongbook({
                read: async () => ({ remoteRevision: 'cloud-1' }),
                remoteCandidates: async () => {
                    if (!readable) {
                        throw new Error('one corrupt row');
                    }
                    return [version('song-1', 'cloud-9')];
                },
            }),
        );
        await loop.attach(OWNER);
        expect(loop.getSnapshot().candidates).toHaveLength(1);

        readable = false;
        await loop.watch('song-1');

        // Unreadable is not "none": dropping the marker would quietly retract a state nothing has
        // resolved. The observation beside it is still published — one corrupt candidate row must
        // not silence the chip for every document in the account.
        expect(loop.getSnapshot().candidates).toHaveLength(1);
        expect(loop.getSnapshot().observation).toMatchObject({ remoteRevision: 'cloud-1' });
    });

    it('publishes none at all for an account it is no longer attached to', async () => {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const loop = createSyncLoop(
            api,
            createAccountSession(api),
            stubSongbook({ remoteCandidates: async () => [version('song-1', 'cloud-9')] }),
        );
        await loop.attach(OWNER);
        expect(loop.getSnapshot().candidates).toHaveLength(1);

        loop.detach();

        // A marker is a claim about one library's rows, and this device is reading none.
        expect(loop.getSnapshot().candidates).toEqual([]);
    });
});

describe('the sync loop adopts a preserved remote version on the musician’s word', () => {
    const OTHER = 'owner-b';

    function adoptable(result: unknown, overrides: Record<string, unknown> = {}) {
        const asked: Array<{ documentId: string; revision: string }> = [];
        let preserved: unknown[] = [
            {
                kind: 'version',
                documentId: 'song-1',
                revision: 'cloud-9',
                document: { id: 'song-1' },
            },
        ];
        const songbook = stubSongbook({
            read: async () => ({ remoteRevision: 'cloud-1' }),
            remoteCandidates: async () => preserved,
            adoptRemoteVersion: async (_scope: unknown, documentId: string, revision: string) => {
                asked.push({ documentId, revision });
                if (typeof result !== 'string') {
                    preserved = [];
                }
                return result;
            },
            ...overrides,
        });
        return { songbook, asked };
    }

    const adopted = {
        documentId: 'song-1',
        document: { id: 'song-1' },
        revision: 'cloud-9',
    };

    it('carries the revision the musician was shown, and republishes what moved', async () => {
        const { api, reads } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const parts = adoptable(adopted);
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);
        await loop.watch('song-1');
        const before = loop.getSnapshot().libraryVersion;

        expect(await loop.adoptRemoteVersion('song-1', 'cloud-9', OWNER)).toEqual({
            ...adopted,
            ownerId: OWNER,
        });

        // The compare-and-swap base is the one the banner was rendering, never re-derived here.
        expect(parts.asked).toEqual([{ documentId: 'song-1', revision: 'cloud-9' }]);
        expect(loop.getSnapshot().libraryVersion).toBeGreaterThan(before);
        // The marker goes with the divergence it described.
        expect(loop.getSnapshot().candidates).toEqual([]);
        // No pass: the record now sits at a revision the account already holds, and nothing is
        // queued for it. Spending requests here would ask to be told what just committed.
        // `run()` starts `pass()` synchronously and `pass()` publishes `running` before its first
        // await, so a detached one — `keepBoth`'s shape — would already be visible here.
        expect(loop.getSnapshot().running).toBe(false);
        expect(documentReads(reads)).toEqual([]);
    });

    it('re-reads rather than guessing when the store refuses the resolution', async () => {
        for (const refusal of ['none', 'stale', 'queued'] as const) {
            const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
            const parts = adoptable(refusal);
            const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
            await loop.attach(OWNER);
            await loop.watch('song-1');
            const before = loop.getSnapshot().libraryVersion;

            expect(await loop.adoptRemoteVersion('song-1', 'cloud-9', OWNER)).toBe(refusal);

            // Nothing moved, so the library is unchanged — but the fact the caller was reading is
            // very likely why they are here, so it is re-read rather than left alone.
            expect(loop.getSnapshot().libraryVersion).toBe(before);
            expect(loop.getSnapshot().candidates).toHaveLength(1);
        }
    });

    it('refuses a chart that belongs to another account, before the store is touched', async () => {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const parts = adoptable(adopted);
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);

        // #1311 — this resolution DESTROYS local work, so a claim naming somebody else's library
        // must not reach a store that would delete this one's drafts.
        await expect(loop.adoptRemoteVersion('song-1', 'cloud-9', OTHER)).rejects.toThrow(
            AccountMismatchError,
        );
        expect(parts.asked).toEqual([]);
    });

    it('refuses to adopt anything while signed out', async () => {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        const parts = adoptable(adopted);
        const loop = createSyncLoop(api, createAccountSession(api), parts.songbook);

        await expect(loop.adoptRemoteVersion('song-1', 'cloud-9', OWNER)).rejects.toThrow(
            'signed out',
        );
        expect(parts.asked).toEqual([]);
    });

    it('writes none of its own state back from an epoch that has been superseded', async () => {
        const { api } = fakeApi({ ok: true, value: { kind: 'committed' }, status: 200 });
        let loop!: ReturnType<typeof createSyncLoop>;
        const parts = adoptable(adopted, {
            adoptRemoteVersion: async () => {
                // The session expires, or the musician signs out, while the transaction is open.
                loop.detach();
                return adopted;
            },
        });
        loop = createSyncLoop(api, createAccountSession(api), parts.songbook);
        await loop.attach(OWNER);
        await loop.watch('song-1');
        const before = loop.getSnapshot().libraryVersion;

        // Still reported: the commit happened, and the caller has to re-open the chart on the
        // stand with it whatever this loop is attached to now.
        expect(await loop.adoptRemoteVersion('song-1', 'cloud-9', OWNER)).toEqual({
            ...adopted,
            ownerId: OWNER,
        });

        expect(loop.getSnapshot().owner).toBe(null);
        expect(loop.getSnapshot().libraryVersion).toBe(before);
        expect(loop.getSnapshot().observation).toBe(null);
    });
});
