import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    DownloadOutcome,
    LibraryTransport,
    ManifestOutcome,
} from '../../prototypes/v2/lib/sync/download.js';
import { runLibraryDownload } from '../../prototypes/v2/lib/sync/download.js';
import {
    ACCOUNT_DATABASE,
    AccountChangedError,
    type AccountScope,
    type ChartDocument,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * The library download (#1265) against real IndexedDB in both engines. Everything asserted here
 * depends on a native transaction actually committing or aborting as one unit — a fake store
 * would agree with a wrong implementation just as readily as with a right one, which is the same
 * reason the sibling account suites live in this config rather than under happy-dom.
 *
 * The transport is a fake throughout: `tests/unit/songbook/sync-download.test.ts` proves the real
 * adapter over `lib/account/api.ts` separately, and a browser test that also mocked HTTP would be
 * testing two fakes against each other instead of the storage rules that matter here.
 */

interface RemoteDocument {
    revision: string;
    document?: unknown;
    deleted?: boolean;
}

interface Cloud {
    transport: LibraryTransport;
    /** Mutable: a test moves the cloud between passes exactly as another device would. */
    docs: Map<string, RemoteDocument>;
    /** Every id this fake was asked for, in order, across every pass it served. */
    downloads: string[];
    manifests: number;
    /** Set to intercept one route; returning undefined falls through to the stored document. */
    interceptDownload?: (documentId: string) => Promise<DownloadOutcome | undefined>;
    interceptManifest?: () => Promise<ManifestOutcome | undefined>;
}

function cloud(entries: Record<string, RemoteDocument> = {}): Cloud {
    const state: Cloud = {
        docs: new Map(Object.entries(entries)),
        downloads: [],
        manifests: 0,
        transport: {
            async manifest(after, limit) {
                state.manifests += 1;
                const intercepted = await state.interceptManifest?.();
                if (intercepted) {
                    return intercepted;
                }
                const ids = [...state.docs.keys()].sort();
                const window = ids.filter((id) => after === null || id > after).slice(0, limit);
                const last = window.at(-1);
                return {
                    kind: 'page',
                    page: {
                        documents: window.map((id) => {
                            const entry = state.docs.get(id)!;
                            return {
                                documentId: id,
                                revision: entry.revision,
                                deleted: entry.deleted === true,
                                bytes: JSON.stringify(entry.document ?? null).length,
                            };
                        }),
                        nextAfterDocumentId:
                            last !== undefined && ids.indexOf(last) < ids.length - 1 ? last : null,
                    },
                };
            },
            async download(documentId) {
                state.downloads.push(documentId);
                const intercepted = await state.interceptDownload?.(documentId);
                if (intercepted) {
                    return intercepted;
                }
                const entry = state.docs.get(documentId);
                if (!entry || entry.deleted) {
                    return { kind: 'missing' };
                }
                return {
                    kind: 'body',
                    body: { documentId, revision: entry.revision, document: entry.document },
                };
            },
        },
    };
    return state;
}

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

/** Zero pacing: the request budget is the server's concern, and `sync-download` proves it. */
function run(target: Cloud, options: Record<string, unknown> = {}, active = scope) {
    return runLibraryDownload(book, active, target.transport, {
        minimumIntervalMs: 0,
        ...options,
    });
}

async function titles(): Promise<Array<[string, string]>> {
    const page = await book.list(scope, { limit: 100 });
    return page.songs.map((song) => [song.documentId, song.document.title]);
}

function remoteChart(title: string, id: string, revision: number): ChartDocument {
    return { ...accountChart(title, id), revision };
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

describe('library download and reconcile on real IndexedDB', () => {
    it('adopts a cold library and reports every document as verified', async () => {
        const sky = cloud({
            [songId(1)]: { revision: 'r1', document: remoteChart('One', songId(1), 3) },
            [songId(2)]: { revision: 'r1', document: remoteChart('Two', songId(2), 0) },
        });

        const result = await run(sky);

        expect(result.complete).toBe(true);
        expect(result.advanced).toEqual([songId(1), songId(2)]);
        expect(result.failures).toEqual([]);
        expect(result.documents).toEqual({ required: 2, verified: 2 });
        expect(await titles()).toEqual([
            [songId(1), 'One'],
            [songId(2), 'Two'],
        ]);
        // The body and its label commit together, so a reader never sees one without the other.
        const saved = await book.read(scope, songId(1));
        expect(saved?.remoteRevision).toBe('r1');
        expect(saved?.document.revision).toBe(3);
        expect(await book.remoteCandidate(scope, songId(1))).toBeNull();
    });

    it('a second pass over an unchanged library downloads nothing and stays complete', async () => {
        const sky = cloud({
            [songId(1)]: { revision: 'r1', document: remoteChart('One', songId(1), 0) },
        });
        await run(sky);
        sky.downloads.length = 0;

        const again = await run(sky);

        // The diff, not a stored cursor, is what makes a repeat pass cheap.
        expect(sky.downloads).toEqual([]);
        expect(again.advanced).toEqual([]);
        expect(again.unchanged).toEqual([songId(1)]);
        expect(again.complete).toBe(true);
        expect(again.documents).toEqual({ required: 1, verified: 1 });
    });

    it('an interrupted run resumes without duplicates and is not reported complete', async () => {
        const sky = cloud({
            [songId(1)]: { revision: 'r1', document: remoteChart('One', songId(1), 0) },
            [songId(2)]: { revision: 'r1', document: remoteChart('Two', songId(2), 0) },
            [songId(3)]: { revision: 'r1', document: remoteChart('Three', songId(3), 0) },
        });
        sky.interceptDownload = async (id) =>
            id === songId(2)
                ? { kind: 'failed', reason: 'network', detail: 'Connection lost.' }
                : undefined;

        // Concurrency 1 so the interruption lands on a known document rather than a race.
        const first = await run(sky, { concurrency: 1 });
        expect(first.complete).toBe(false);
        expect(first.advanced).toEqual([songId(1), songId(3)]);
        expect(first.failures).toEqual([
            { documentId: songId(2), reason: 'network', detail: 'Connection lost.' },
        ]);
        expect(first.documents).toEqual({ required: 3, verified: 2 });

        sky.interceptDownload = undefined;
        sky.downloads.length = 0;
        const second = await run(sky);

        // Only the unfinished document costs a request; the two already mirrored are skipped.
        expect(sky.downloads).toEqual([songId(2)]);
        expect(second.advanced).toEqual([songId(2)]);
        expect(second.unchanged).toEqual([songId(1), songId(3)]);
        expect(second.complete).toBe(true);
        // Resumption adds the missing record rather than a duplicate of the finished ones.
        expect(await titles()).toEqual([
            [songId(1), 'One'],
            [songId(2), 'Two'],
            [songId(3), 'Three'],
        ]);
    });

    it('never reports an empty-library success when the manifest itself failed', async () => {
        const sky = cloud({
            [songId(1)]: { revision: 'r1', document: remoteChart('One', songId(1), 0) },
        });
        await run(sky);

        sky.interceptManifest = async () => ({
            kind: 'failed',
            reason: 'network',
            detail: 'Connection lost.',
        });
        const result = await run(sky);

        expect(result.complete).toBe(false);
        // Every array is empty and the counts are unknown — but nothing here reads as "your
        // library is empty and that is confirmed", which is the failure this guards.
        expect(result.advanced).toEqual([]);
        expect(result.unchanged).toEqual([]);
        expect(result.removed).toEqual([]);
        expect(result.absent).toEqual([]);
        expect(result.documents).toEqual({ required: null, verified: null });
        expect(result.failures).toEqual([
            { documentId: null, reason: 'network', detail: 'Connection lost.' },
        ]);
        // A failed pass wrote nothing and removed nothing.
        expect(await titles()).toEqual([[songId(1), 'One']]);
    });

    it('stops on an expired session and on a back-off without issuing further requests', async () => {
        const seed = {
            [songId(1)]: { revision: 'r1', document: remoteChart('One', songId(1), 0) },
            [songId(2)]: { revision: 'r1', document: remoteChart('Two', songId(2), 0) },
        };
        for (const outcome of [
            { kind: 'expired' } as const,
            { kind: 'backoff', retryAfterSeconds: 30 } as const,
        ]) {
            const sky = cloud(seed);
            sky.interceptDownload = async (id) => (id === songId(1) ? outcome : undefined);
            const result = await run(sky, { concurrency: 1 });

            expect(result.complete).toBe(false);
            expect(sky.downloads).toEqual([songId(1)]);
            expect(result.advanced).toEqual([]);
            expect(result.failures[0].reason).toBe(
                outcome.kind === 'expired' ? 'expired' : 'rate-limited',
            );
            if (outcome.kind === 'backoff') {
                expect(result.backoffUntil).toBeGreaterThan(Date.now());
            }
            await book.switchAccount('owner-a');
            scope = (await book.currentScope())!;
        }
    });

    it('an owner switch mid-download writes nothing, to either account', async () => {
        const sky = cloud({
            [songId(1)]: { revision: 'r1', document: remoteChart('One', songId(1), 0) },
            [songId(2)]: { revision: 'r1', document: remoteChart('Two', songId(2), 0) },
        });
        let elsewhere: AccountScope | undefined;
        sky.interceptDownload = async (id) => {
            if (id === songId(1) && !elsewhere) {
                // The musician signs into another account while the bodies are in flight.
                elsewhere = (await book.switchAccount('owner-b'))!;
            }
            return undefined;
        };

        // The fence rejects rather than resolving: a pass that cannot prove whose library it is
        // holding must not report progress of any kind.
        await expect(run(sky, { concurrency: 1 })).rejects.toBeInstanceOf(AccountChangedError);

        // Nothing reached the new owner — not a record, not a preserved candidate.
        expect(await book.list(elsewhere!, { limit: 100 })).toEqual({
            songs: [],
            nextAfterDocumentId: null,
        });
        expect(await book.remoteCandidates(elsewhere!)).toEqual([]);
        // And the stale handle stays fenced out of its own account too.
        await expect(book.list(scope)).rejects.toBeInstanceOf(AccountChangedError);
        // Once owner-a is active again, its library is exactly as the pass found it.
        scope = (await book.switchAccount('owner-a'))!;
        expect((await book.list(scope)).songs).toEqual([]);
        expect(await book.remoteCandidates(scope)).toEqual([]);
        // The sibling worker was stopped rather than left asking on the new owner's behalf.
        expect(sky.downloads).toEqual([songId(1)]);
    });

    it('a dirty record survives a newer remote revision, whatever makes it dirty', async () => {
        const holds: Array<[string, (id: string) => Promise<Record<string, unknown>>]> = [
            [
                'a queued Save',
                async (id) => {
                    const local = (await book.read(scope, id))!;
                    await book.save(
                        scope,
                        { ...local.document, title: 'mine' },
                        local.document.revision,
                    );
                    return {};
                },
            ],
            [
                'an unsaved draft',
                async (id) => {
                    const local = (await book.read(scope, id))!;
                    await book.recover(
                        scope,
                        'writer-1',
                        { ...local.document, title: 'scratch' },
                        local.document.revision,
                    );
                    return {};
                },
            ],
            ['the chart on the stand', async (id) => ({ activeDocumentIds: [id] })],
        ];

        for (const [label, dirty] of holds) {
            const id = songId(1);
            const sky = cloud({ [id]: { revision: 'r1', document: remoteChart('head', id, 0) } });
            await run(sky);
            const options = await dirty(id);
            const before = (await book.read(scope, id))!;

            // The cloud moves underneath the local work.
            sky.docs.set(id, { revision: 'r2', document: remoteChart('theirs', id, 9) });
            const result = await run(sky, options);

            expect(result.candidates, label).toEqual([id]);
            expect(result.advanced, label).toEqual([]);
            // Resolved, so the run is complete — but NOT verified, because this device does not
            // hold the cloud's revision and claiming otherwise would over-promise readiness.
            expect(result.complete, label).toBe(true);
            expect(result.documents, label).toEqual({ required: 1, verified: 0 });

            const after = (await book.read(scope, id))!;
            expect(after.document, label).toEqual(before.document);
            expect(after.remoteRevision, label).toBe('r1');
            const candidate = await book.remoteCandidate(scope, id);
            expect(candidate?.kind, label).toBe('version');
            expect(candidate?.revision, label).toBe('r2');
            expect(candidate?.kind === 'version' ? candidate.document.title : null, label).toBe(
                'theirs',
            );

            // Fresh account for the next hold, so each one is proved from a clean library.
            scope = (await book.switchAccount(`owner-${label.length}`))!;
        }
    });

    it('preserves and flags a body from a newer schema, and never asks for it twice', async () => {
        const id = songId(1);
        const future = { schemaVersion: 99, id, title: 'from the future' };
        const sky = cloud({ [id]: { revision: 'r7', document: future } });

        const result = await run(sky);

        expect(result.unsupported).toEqual([id]);
        expect(result.advanced).toEqual([]);
        expect(result.failures).toEqual([]);
        // Resolved — no retry would improve it — but explicitly not offline-ready.
        expect(result.complete).toBe(true);
        expect(result.documents).toEqual({ required: 1, verified: 0 });
        // Nothing this build cannot read ever becomes the local song.
        expect(await book.read(scope, id)).toBeNull();

        const candidate = await book.remoteCandidate(scope, id);
        expect(candidate?.kind).toBe('unsupported');
        expect(candidate?.kind === 'unsupported' ? candidate.reason : null).toBe(
            'needs-app-update',
        );
        // Preserved exactly as it arrived: never migrated, coerced or re-encoded.
        expect(candidate?.kind === 'unsupported' ? candidate.body : null).toEqual(future);

        sky.downloads.length = 0;
        const again = await run(sky);
        expect(sky.downloads).toEqual([]);
        expect(again.unchanged).toEqual([id]);
        expect(again.complete).toBe(true);

        // A newer revision is worth asking for again — this build may be able to read that one.
        sky.docs.set(id, { revision: 'r8', document: remoteChart('readable', id, 0) });
        const third = await run(sky);
        expect(sky.downloads).toEqual([id]);
        expect(third.advanced).toEqual([id]);
        expect((await book.read(scope, id))?.document.title).toBe('readable');
        // The candidate no longer describes a divergence, so it is gone.
        expect(await book.remoteCandidate(scope, id)).toBeNull();
    });

    it('an invalid body fails the run loudly and writes nothing', async () => {
        const id = songId(1);
        const clean = songId(2);
        const sky = cloud({
            [id]: { revision: 'r1', document: { schemaVersion: 1, id, nonsense: true } },
            [clean]: { revision: 'r1', document: remoteChart('Fine', clean, 0) },
        });

        const result = await run(sky, { concurrency: 1 });

        expect(result.complete).toBe(false);
        expect(result.failures).toEqual([
            {
                documentId: id,
                reason: 'malformed-body',
                detail: 'The downloaded body is not a valid chart document.',
            },
        ]);
        // Not quarantined: corrupt content is a fact about the data, not about this build, so
        // it is never dressed up as a preserved candidate inside a successful-looking run.
        expect(result.unsupported).toEqual([]);
        expect(await book.read(scope, id)).toBeNull();
        expect(await book.remoteCandidate(scope, id)).toBeNull();
        // One refused body does not starve the rest of the library.
        expect(result.advanced).toEqual([clean]);
    });

    it('a body whose frame does not answer the request fails without touching the record', async () => {
        const id = songId(1);
        const sky = cloud({ [id]: { revision: 'r1', document: remoteChart('One', id, 0) } });
        await run(sky);
        sky.docs.set(id, { revision: 'r2', document: remoteChart('Two', id, 1) });
        sky.interceptDownload = async () => ({
            kind: 'body',
            body: { documentId: 'somebody-else', revision: 'r2', document: {} },
        });

        const result = await run(sky);

        expect(result.complete).toBe(false);
        expect(result.failures[0].reason).toBe('malformed-body');
        expect(result.advanced).toEqual([]);
        // The record still holds the revision it actually has.
        const saved = await book.read(scope, id);
        expect(saved?.document.title).toBe('One');
        expect(saved?.remoteRevision).toBe('r1');
    });

    it('a tombstone removes a clean mirror and retains divergent local work', async () => {
        const clean = songId(1);
        const dirty = songId(2);
        const sky = cloud({
            [clean]: { revision: 'r1', document: remoteChart('Clean', clean, 0) },
            [dirty]: { revision: 'r1', document: remoteChart('Dirty', dirty, 0) },
        });
        await run(sky);
        const local = (await book.read(scope, dirty))!;
        await book.save(scope, { ...local.document, title: 'mine' }, local.document.revision);

        sky.docs.set(clean, { revision: 'r2', deleted: true });
        sky.docs.set(dirty, { revision: 'r2', deleted: true });
        sky.downloads.length = 0;
        const result = await run(sky);

        // A tombstone needs no request at all.
        expect(sky.downloads).toEqual([]);
        expect(result.removed).toEqual([clean]);
        expect(result.retainedDeleted).toEqual([dirty]);
        expect(result.complete).toBe(true);
        expect(await book.read(scope, clean)).toBeNull();
        // The divergent work stays, with the flag that explains where the cloud copy went.
        expect((await book.read(scope, dirty))?.document.title).toBe('mine');
        expect((await book.remoteCandidate(scope, dirty))?.kind).toBe('deleted');
        expect(await book.remoteCandidate(scope, clean)).toBeNull();
        // A deleted row is not part of the library this device must hold.
        expect(result.documents).toEqual({ required: 0, verified: 0 });
    });

    it('reports a record the manifest never mentions without removing it', async () => {
        const kept = songId(1);
        const sky = cloud({ [kept]: { revision: 'r1', document: remoteChart('One', kept, 0) } });
        await run(sky);
        // A local-only Save that the cloud has never heard of.
        await book.save(scope, accountChart('Local only', songId(9)), null);

        const result = await run(sky);

        expect(result.absent).toEqual([songId(9)]);
        expect(result.removed).toEqual([]);
        expect(result.complete).toBe(true);
        // Absence from a manifest is not deletion — only an explicit tombstone row removes.
        expect((await book.read(scope, songId(9)))?.document.title).toBe('Local only');
    });

    it('a manifest the server listed but cannot serve removes nothing', async () => {
        const id = songId(1);
        const sky = cloud({ [id]: { revision: 'r1', document: remoteChart('One', id, 0) } });
        await run(sky);
        sky.docs.set(id, { revision: 'r2', document: remoteChart('Two', id, 1) });
        sky.interceptDownload = async () => ({ kind: 'missing' });

        const result = await run(sky);

        // Absent, tombstoned and foreign are one reply, so this is not evidence of a deletion.
        expect(result.missing).toEqual([id]);
        expect(result.removed).toEqual([]);
        // Resolved, but the device does not hold the manifest's revision.
        expect(result.complete).toBe(true);
        expect(result.documents).toEqual({ required: 1, verified: 0 });
        expect((await book.read(scope, id))?.document.title).toBe('One');
    });

    it('refuses a manifest whose rows are not ordered, before any record is touched', async () => {
        const sky = cloud();
        sky.interceptManifest = async () => ({
            kind: 'page',
            page: {
                documents: [
                    { documentId: songId(2), revision: 'r1', deleted: false, bytes: 1 },
                    { documentId: songId(1), revision: 'r1', deleted: false, bytes: 1 },
                ],
                nextAfterDocumentId: null,
            },
        });

        const result = await run(sky);

        expect(result.complete).toBe(false);
        expect(result.failures).toEqual([
            {
                documentId: null,
                reason: 'malformed-manifest',
                detail: 'Manifest rows are not ordered.',
            },
        ]);
        expect(sky.downloads).toEqual([]);
    });

    it('a storage failure mid-commit rolls the whole observation back', async () => {
        const id = songId(1);
        const sky = cloud({ [id]: { revision: 'r1', document: remoteChart('One', id, 0) } });
        // The first `put` of the run is the adoption itself: the saved record and the candidate
        // cleanup are one transaction, so an abort must leave neither behind.
        const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (
            this: IDBObjectStore,
        ) {
            throw new DOMException('Injected write failure', 'UnknownError');
        });

        await expect(run(sky)).rejects.toThrow('Injected write failure');
        fault.mockRestore();

        expect(await book.read(scope, id)).toBeNull();
        expect(await book.remoteCandidates(scope)).toEqual([]);
        // And the pass simply runs again cleanly, because nothing recorded partial progress at all.
        const result = await run(sky);
        expect(result.advanced).toEqual([id]);
        expect(result.complete).toBe(true);
    });

    it('rejects invalid options rather than running a pass nobody asked for', async () => {
        const sky = cloud();
        for (const options of [
            { concurrency: 0 },
            { concurrency: 1.5 },
            { manifestLimit: 10_000 },
            { minimumIntervalMs: -1 },
            { activeDocumentIds: ['not a valid id'] },
        ]) {
            await expect(run(sky, options)).rejects.toThrow();
        }
        await expect(
            runLibraryDownload(book, scope, {} as unknown as LibraryTransport),
        ).rejects.toThrow('Invalid library transport');
        expect(sky.manifests).toBe(0);
    });
});

describe('remote candidates are owner-scoped on real IndexedDB', () => {
    it('never returns another owner’s candidates, even under identical document ids', async () => {
        const id = songId(1);
        const future = { schemaVersion: 99, id, title: 'unreadable' };
        await run(cloud({ [id]: { revision: 'r1', document: future } }));

        const b = (await book.switchAccount('owner-b'))!;
        await run(cloud({ [id]: { revision: 'r2', document: future } }), {}, b);

        const theirs = await book.remoteCandidates(b);
        expect(theirs.map((entry) => [entry.ownerId, entry.documentId, entry.revision])).toEqual([
            ['owner-b', id, 'r2'],
        ]);

        const back = (await book.switchAccount('owner-a'))!;
        const mine = await book.remoteCandidates(back);
        expect(mine.map((entry) => [entry.ownerId, entry.documentId, entry.revision])).toEqual([
            ['owner-a', id, 'r1'],
        ]);
        // The `'active'` pointer shares the store and is never mistaken for a candidate.
        expect(mine.every((entry) => entry.key.startsWith('remote:owner-a:'))).toBe(true);
    });

    it('an owner whose ID is a prefix of another’s sees only its own', async () => {
        // `':'` terminates the owner segment and the identifier grammar excludes it, which is
        // the whole reason a prefix range is sound here rather than a fetch-then-filter.
        const id = songId(1);
        const future = { schemaVersion: 99, id, title: 'unreadable' };
        for (const owner of ['owner', 'owner-a', 'owner_b']) {
            const active = (await book.switchAccount(owner))!;
            await run(cloud({ [id]: { revision: `rev-${owner}`, document: future } }), {}, active);
        }
        for (const owner of ['owner', 'owner-a', 'owner_b']) {
            const active = (await book.switchAccount(owner))!;
            expect(
                (await book.remoteCandidates(active)).map((entry) => [
                    entry.ownerId,
                    entry.revision,
                ]),
            ).toEqual([[owner, `rev-${owner}`]]);
        }
    });
});
