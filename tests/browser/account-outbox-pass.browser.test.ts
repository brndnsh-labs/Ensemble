import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOX_PAGE_LIMIT, runOutboxPass } from '../../prototypes/v2/lib/sync/drain.js';
import {
    ACCOUNT_DATABASE,
    AccountChangedError,
    type AccountScope,
    type PreparedSave,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import type { SaveTransport } from '../../prototypes/v2/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * One caller-driven outbox pass against real IndexedDB in both engines: the same fence,
 * transaction serialization and idempotent replay machinery already proven for a single
 * `sendNext` call, now composed into a bounded multi-song walk. The transport is always a
 * local fake — this proves the composition, not a cloud integration.
 */

let name: string;
let book: AccountSongbook;
let scope: AccountScope;
const connections: AccountSongbook[] = [];

function connection(): AccountSongbook {
    const instance = new AccountSongbook(name);
    connections.push(instance);
    return instance;
}

function songId(index: number): string {
    return `song-${String(index).padStart(2, '0')}`;
}

async function seed(count: number, instance = book, active = scope): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 1; index <= count; index++) {
        const id = songId(index);
        await instance.save(active, accountChart(`title-${id}`, id), null);
        ids.push(id);
    }
    return ids;
}

function committedResponse(request: PreparedSave, revision: string) {
    return {
        kind: 'committed',
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        revision,
    };
}

function conflictResponse(request: PreparedSave, revision: string) {
    return {
        kind: 'conflict',
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        revision,
        remote: null,
    };
}

/**
 * Independent idempotent per-document server: a repeated call for the same operation ID
 * returns the exact cached response rather than recomputing one, so tests can assert on bytes
 * rather than trusting a call count alone.
 */
function cloud(options: { conflict?: Set<string>; fail?: Set<string> } = {}) {
    const counters = new Map<string, number>();
    const receipts = new Map<string, unknown>();
    const calls: PreparedSave[] = [];
    const transport: SaveTransport = async (request) => {
        calls.push(request);
        if (options.fail?.has(request.documentId)) {
            throw new Error('Injected transport failure');
        }
        const cached = receipts.get(request.operationId);
        if (cached) {
            return cached;
        }
        const response = options.conflict?.has(request.documentId)
            ? conflictResponse(request, `cloud-${request.documentId}-conflict`)
            : committedResponse(
                  request,
                  `cloud-${request.documentId}-${(counters.get(request.documentId) ?? 0) + 1}`,
              );
        if (response.kind === 'committed') {
            counters.set(request.documentId, (counters.get(request.documentId) ?? 0) + 1);
        }
        receipts.set(request.operationId, response);
        return response;
    };
    return { transport, calls };
}

/**
 * A transport whose response stays pending until the test releases it, so a test can abort
 * mid-flight and prove an already-sent request still settles through acknowledge.
 */
function deferredTransport() {
    let requestSeen!: (request: PreparedSave) => void;
    const invoked = new Promise<PreparedSave>((resolve) => {
        requestSeen = resolve;
    });
    let release: (value: unknown) => void = () => {};
    const transport: SaveTransport = (request) => {
        requestSeen(request);
        return new Promise((resolve) => {
            release = resolve;
        });
    };
    return { transport, invoked, respond: (value: unknown) => release(value) };
}

beforeEach(async () => {
    name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    book = connection();
    scope = (await book.switchAccount('owner-a'))!;
});

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(connections.splice(0).map((instance) => instance.close()));
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Test connection leaked.'));
    });
});

describe('one bounded outbox pass on real IndexedDB', () => {
    it('an empty owner completes with zero counts and a null cursor', async () => {
        const cloudTransport = cloud();
        const result = await runOutboxPass(book, scope, cloudTransport.transport);
        expect(result).toEqual({
            kind: 'complete',
            resumeAfterDocumentId: null,
            counts: { idle: 0, committed: 0, conflict: 0, retry: 0 },
        });
        expect(cloudTransport.calls).toHaveLength(0);
    });

    it('a conflicted song does not block a different song in the same pass', async () => {
        const ids = await seed(2);
        const cloudTransport = cloud({ conflict: new Set([ids[0]]) });
        const result = await runOutboxPass(book, scope, cloudTransport.transport);
        expect(result.kind).toBe('complete');
        expect(result.counts).toEqual({ idle: 0, committed: 1, conflict: 1, retry: 0 });
        expect(cloudTransport.calls.map((call) => call.documentId)).toEqual(ids);
    });

    it('sends only the head of a song with multiple queued Saves', async () => {
        const [id] = await seed(1);
        await book.save(scope, accountChart('title-song-01-v2', id), 0);
        expect((await book.pending(scope, id)).length).toBe(2);
        const cloudTransport = cloud();
        const result = await runOutboxPass(book, scope, cloudTransport.transport);
        expect(cloudTransport.calls).toHaveLength(1);
        expect(result.counts.committed).toBe(1);
        // Ordered and undisturbed: the second queued Save is still there, for the next pass.
        expect((await book.pending(scope, id)).length).toBe(1);
    });

    it('a draft never becomes a request', async () => {
        const [id] = await seed(1);
        await book.recover(scope, 'writer-1', accountChart('draft-title', id), 0);
        const cloudTransport = cloud();
        await runOutboxPass(book, scope, cloudTransport.transport);
        // The one call made is the seeded queued Save, not a request built from the draft.
        expect(cloudTransport.calls.map((call) => call.documentId)).toEqual([id]);
        expect((await book.pending(scope, id)).length).toBe(0);
        const drafts = await book.drafts(scope, id);
        expect(drafts).toHaveLength(1);
        expect(drafts[0].document.title).toBe('draft-title');
    });

    it('sends at most one page per pass, never concurrently, and the cursor reaches the rest', async () => {
        const ids = await seed(30);
        let inFlight = 0;
        let maxInFlight = 0;
        const cloudTransport = cloud();
        const wrapped: SaveTransport = async (request) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            try {
                return await cloudTransport.transport(request);
            } finally {
                inFlight -= 1;
            }
        };

        const first = await runOutboxPass(book, scope, wrapped);
        expect(first.kind).toBe('more');
        expect(cloudTransport.calls).toHaveLength(OUTBOX_PAGE_LIMIT);
        expect(cloudTransport.calls.map((call) => call.documentId)).toEqual(
            ids.slice(0, OUTBOX_PAGE_LIMIT),
        );
        expect(first.resumeAfterDocumentId).toBe(ids[OUTBOX_PAGE_LIMIT - 1]);
        expect(maxInFlight).toBe(1);

        const second = await runOutboxPass(book, scope, wrapped, {
            afterDocumentId: first.resumeAfterDocumentId!,
        });
        expect(second.kind).toBe('complete');
        expect(cloudTransport.calls).toHaveLength(30);
        // Not resent: the second pass's calls are exactly the remaining, later songs.
        expect(
            cloudTransport.calls.slice(OUTBOX_PAGE_LIMIT).map((call) => call.documentId),
        ).toEqual(ids.slice(OUTBOX_PAGE_LIMIT));
    });

    it('a transport failure ends the pass before the failed song, and resumption retries the same frozen bytes across a close/reopen', async () => {
        const ids = await seed(3);
        const failing = cloud({ fail: new Set([ids[1]]) });
        const result = await runOutboxPass(book, scope, failing.transport);
        expect(result).toMatchObject({
            kind: 'retry',
            resumeAfterDocumentId: ids[0],
            counts: { idle: 0, committed: 1, conflict: 0, retry: 1 },
        });
        expect(failing.calls.map((call) => call.documentId)).toEqual([ids[0], ids[1]]);
        const frozenBody = failing.calls[1].body;
        const frozenOperationId = failing.calls[1].operationId;

        // Lost replies survive a close/reopen: a fresh connection must resume the same bytes.
        await book.close();
        book = connection();
        const rescope = (await book.switchAccount('owner-a'))!;

        const working = cloud();
        const resumed = await runOutboxPass(book, rescope, working.transport, {
            afterDocumentId: result.resumeAfterDocumentId!,
        });
        expect(resumed.kind).toBe('complete');
        expect(working.calls).toHaveLength(2);
        // The same frozen operation, not a fresh Save built from current state.
        expect(working.calls[0].operationId).toBe(frozenOperationId);
        expect(working.calls[0].body).toBe(frozenBody);
    });

    it('abort observed while a transport failure settles reports aborted, not retry, but still counts it', async () => {
        // The one priority row nothing else in this file pins: a settled outcome of 'retry'
        // with abort already true must report 'aborted', not 'retry' — proven by mutation,
        // `kind: signal?.aborted ? 'aborted' : 'retry'` reduced to `kind: 'retry'` left every
        // other case in this file green.
        await seed(2);
        const controller = new AbortController();
        const transport: SaveTransport = async () => {
            controller.abort();
            throw new Error('Injected transport failure');
        };
        const result = await runOutboxPass(book, scope, transport, {
            signal: controller.signal,
        });
        expect(result.kind).toBe('aborted');
        expect(result.counts).toEqual({ idle: 0, committed: 0, conflict: 0, retry: 1 });
        expect(result.resumeAfterDocumentId).toBeNull();
    });

    it('cancellation before the pass starts sends nothing', async () => {
        await seed(2);
        const controller = new AbortController();
        controller.abort();
        const cloudTransport = cloud();
        const result = await runOutboxPass(book, scope, cloudTransport.transport, {
            signal: controller.signal,
        });
        expect(result).toEqual({
            kind: 'aborted',
            resumeAfterDocumentId: null,
            counts: { idle: 0, committed: 0, conflict: 0, retry: 0 },
        });
        expect(cloudTransport.calls).toHaveLength(0);
    });

    it('cancellation during page loading discards the whole page and sends nothing', async () => {
        await seed(2);
        const controller = new AbortController();
        const originalList = book.list.bind(book);
        const listSpy = vi
            .spyOn(book, 'list')
            .mockImplementationOnce(async (...args: Parameters<typeof originalList>) => {
                const page = await originalList(...args);
                controller.abort();
                return page;
            });
        const cloudTransport = cloud();
        const result = await runOutboxPass(book, scope, cloudTransport.transport, {
            signal: controller.signal,
        });
        expect(result).toEqual({
            kind: 'aborted',
            resumeAfterDocumentId: null,
            counts: { idle: 0, committed: 0, conflict: 0, retry: 0 },
        });
        expect(cloudTransport.calls).toHaveLength(0);
        listSpy.mockRestore();
    });

    it('cancellation during page loading of an EMPTY page still reports aborted, not complete', async () => {
        // With no songs, the loop body never runs, so only the dedicated post-listing check —
        // not the in-loop one the previous test can also pass through — can catch this. Proven
        // by mutation: dropping the dedicated check leaves the two-song case above green
        // (the loop's own check masks it) while this one alone catches it.
        const controller = new AbortController();
        const originalList = book.list.bind(book);
        const listSpy = vi
            .spyOn(book, 'list')
            .mockImplementationOnce(async (...args: Parameters<typeof originalList>) => {
                const page = await originalList(...args);
                controller.abort();
                return page;
            });
        const cloudTransport = cloud();
        const result = await runOutboxPass(book, scope, cloudTransport.transport, {
            signal: controller.signal,
        });
        expect(result).toEqual({
            kind: 'aborted',
            resumeAfterDocumentId: null,
            counts: { idle: 0, committed: 0, conflict: 0, retry: 0 },
        });
        expect(cloudTransport.calls).toHaveLength(0);
        listSpy.mockRestore();
    });

    it('an already-sent request still settles through acknowledge after abort, and is not claimed canceled', async () => {
        const [id] = await seed(1);
        const deferred = deferredTransport();
        const controller = new AbortController();
        const pending = runOutboxPass(book, scope, deferred.transport, {
            signal: controller.signal,
        });
        const request = await deferred.invoked;
        controller.abort();
        deferred.respond(committedResponse(request, 'cloud-1'));
        const result = await pending;
        expect(result.kind).toBe('aborted');
        expect(result.counts).toEqual({ idle: 0, committed: 1, conflict: 0, retry: 0 });
        expect(result.resumeAfterDocumentId).toBe(id);
        // Truly committed, not just counted: a fresh read agrees.
        expect((await book.read(scope, id))?.remoteRevision).toBe('cloud-1');
    });

    it('a stale account rejects and sends nothing, rather than resolving with fabricated progress', async () => {
        await seed(2);
        const stale = scope;
        await book.switchAccount('owner-b');
        const cloudTransport = cloud();
        await expect(runOutboxPass(book, stale, cloudTransport.transport)).rejects.toBeInstanceOf(
            AccountChangedError,
        );
        expect(cloudTransport.calls).toHaveLength(0);
    });

    it('late callbacks cannot acknowledge into another owner’s scope', async () => {
        const [id] = await seed(1);
        const deferred = deferredTransport();
        const pending = runOutboxPass(book, scope, deferred.transport);
        const request = await deferred.invoked;
        const other = connection();
        await other.switchAccount('owner-b');
        deferred.respond(committedResponse(request, 'cloud-1'));
        await expect(pending).rejects.toBeInstanceOf(AccountChangedError);
        // The account switch decided this, not the pass — the operation is still queued.
        const backToA = (await book.switchAccount('owner-a'))!;
        expect((await book.pending(backToA, id)).length).toBeGreaterThan(0);
    });

    it('captures the scope and cursor before yielding, so mutating the caller’s objects cannot retarget it', async () => {
        const ids = await seed(2);
        const mutableScope = { ...scope };
        const options: { afterDocumentId?: string } = {};
        const cloudTransport = cloud();
        const pending = runOutboxPass(book, mutableScope, cloudTransport.transport, options);
        mutableScope.ownerId = 'owner-b';
        mutableScope.generation = 999;
        options.afterDocumentId = ids[1];
        const result = await pending;
        expect(result.kind).toBe('complete');
        expect(cloudTransport.calls.map((call) => call.documentId)).toEqual(ids);
        expect(cloudTransport.calls.every((call) => call.ownerId === 'owner-a')).toBe(true);
    });

    it('two simultaneous passes may deliver the same operation, and settle it identically and safely', async () => {
        const ids = await seed(3);
        const cloudTransport = cloud();
        const [a, b] = await Promise.all([
            runOutboxPass(book, scope, cloudTransport.transport),
            runOutboxPass(book, scope, cloudTransport.transport),
        ]);
        expect(a.kind).toBe('complete');
        expect(b.kind).toBe('complete');

        // Every operation sent more than once carries byte-identical bytes: not exactly-once
        // networking, but safe, idempotent delivery.
        const byOperation = new Map<string, string[]>();
        for (const call of cloudTransport.calls) {
            const bodies = byOperation.get(call.operationId) ?? [];
            bodies.push(call.body);
            byOperation.set(call.operationId, bodies);
        }
        for (const bodies of byOperation.values()) {
            expect(new Set(bodies).size).toBe(1);
        }

        for (const id of ids) {
            expect((await book.read(scope, id))?.remoteRevision).toBe(`cloud-${id}-1`);
        }
    });
});
