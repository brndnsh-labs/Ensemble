import { describe, expect, it, vi } from 'vitest';
import type { AccountApi, ApiError, ApiResult } from '../../../prototypes/v2/lib/account/api.js';
import { createLibraryTransport } from '../../../prototypes/v2/lib/account/library-transport.js';
import { createAccountSession } from '../../../prototypes/v2/lib/account/session.js';
import {
    type LibraryTransport,
    type LocalMirror,
    type ManifestRow,
    planLibraryDownload,
    runLibraryDownload,
} from '../../../prototypes/v2/lib/sync/download.js';
import type { AccountScope } from '../../../prototypes/v2/lib/sync/protocol.js';
import type { AccountSongbook } from '../../../prototypes/v2/lib/sync/repository.js';

/**
 * The two halves of #1265 that need neither IndexedDB nor a browser: the pure manifest diff, and
 * the adapter that turns an `ApiResult` into the download pass's outcome vocabulary. Everything
 * that commits — the fence, the preservation rules, resumption — is proven against real IDB in
 * `tests/browser/account-library-download.browser.test.ts`, because a fake store would agree
 * with a wrong transaction just as readily as with a right one.
 */

function row(documentId: string, revision: string, deleted = false): ManifestRow {
    return { documentId, revision, deleted, bytes: 128 };
}

function mirror(documentId: string, overrides: Partial<LocalMirror> = {}): LocalMirror {
    return {
        documentId,
        saved: true,
        remoteRevision: null,
        quarantinedRevision: null,
        ...overrides,
    };
}

describe('planLibraryDownload — the manifest diff, decision S1', () => {
    it('fetches every live row a device has never mirrored', () => {
        const plan = planLibraryDownload([row('a', 'r1'), row('b', 'r1')], []);
        expect(plan.fetch).toEqual([
            { documentId: 'a', revision: 'r1' },
            { documentId: 'b', revision: 'r1' },
        ]);
        expect(plan.unchanged).toEqual([]);
        expect(plan.documents).toEqual({ required: 2, mirrored: 0 });
    });

    it('skips a row a saved record already mirrors at that exact revision', () => {
        const plan = planLibraryDownload(
            [row('a', 'r1'), row('b', 'r2')],
            [mirror('a', { remoteRevision: 'r1' }), mirror('b', { remoteRevision: 'r1' })],
        );
        // `b` moved in the cloud; `a` did not. Only the mover costs a request — which is the
        // whole mechanism that makes rerunning an interrupted pass cheap.
        expect(plan.fetch).toEqual([
            { documentId: 'b', revision: 'r2', expectedRemoteRevision: 'r1' },
        ]);
        expect(plan.unchanged).toEqual(['a']);
        expect(plan.documents).toEqual({ required: 2, mirrored: 1 });
    });

    it('carries the revision each row was diffed against, as the commit’s compare-and-swap base', () => {
        const plan = planLibraryDownload(
            [row('fresh', 'r1'), row('mirrored', 'r2'), row('kept', 'r3')],
            [
                mirror('mirrored', { remoteRevision: 'r1' }),
                mirror('kept', { saved: false, quarantinedRevision: 'r2' }),
            ],
        );
        // Three distinct bases, and the difference between them is load-bearing: `undefined`
        // asserts there was no saved record at all, `null` asserts there was one the cloud had
        // never confirmed. A quarantine is not a record, so `kept` is the `undefined` case even
        // though this device holds a preserved body for it.
        expect(plan.fetch).toEqual([
            { documentId: 'fresh', revision: 'r1', expectedRemoteRevision: undefined },
            { documentId: 'mirrored', revision: 'r2', expectedRemoteRevision: 'r1' },
            { documentId: 'kept', revision: 'r3', expectedRemoteRevision: undefined },
        ]);
        expect(Object.hasOwn(plan.fetch[0], 'expectedRemoteRevision')).toBe(true);
    });

    it('fetches a divergent record, because a candidate with no remote body decides nothing', () => {
        // Locally saved but never cloud-confirmed. The body is still worth fetching: it becomes
        // a preserved candidate, and a keep-both decision needs both sides to show.
        const plan = planLibraryDownload([row('a', 'r9')], [mirror('a', { remoteRevision: null })]);
        expect(plan.fetch).toEqual([
            { documentId: 'a', revision: 'r9', expectedRemoteRevision: null },
        ]);
        expect(plan.documents).toEqual({ required: 1, mirrored: 0 });
    });

    it('never re-fetches a revision already preserved as needing an app update', () => {
        const plan = planLibraryDownload(
            [row('a', 'r5'), row('b', 'r5')],
            [
                mirror('a', { saved: false, quarantinedRevision: 'r5' }),
                // A newer revision than the quarantined one is worth asking for again: this
                // build may be able to read it even though it could not read `r4`.
                mirror('b', { saved: false, quarantinedRevision: 'r4' }),
            ],
        );
        expect(plan.fetch).toEqual([{ documentId: 'b', revision: 'r5' }]);
        expect(plan.unchanged).toEqual(['a']);
        // A quarantined body is genuinely not offline-ready, so it is required and not mirrored.
        expect(plan.documents).toEqual({ required: 2, mirrored: 0 });
    });

    it('plans a tombstone only where a saved record exists for it to act on', () => {
        const plan = planLibraryDownload(
            [row('a', 'r1', true), row('b', 'r1', true)],
            [mirror('a', { remoteRevision: 'r1' })],
        );
        // A removal carries the same compare-and-swap base as a fetch: it is the only thing that
        // stops a tombstone deleting a record that moved after the plan was drawn.
        expect(plan.tombstone).toEqual([
            { documentId: 'a', revision: 'r1', expectedRemoteRevision: 'r1' },
        ]);
        expect(plan.unchanged).toEqual(['b']);
        // A deleted row is not part of the library a device must hold to be offline-ready.
        expect(plan.documents).toEqual({ required: 0, mirrored: 0 });
    });

    it('reports a saved record the manifest never mentions without planning to remove it', () => {
        const plan = planLibraryDownload([row('a', 'r1')], [mirror('a'), mirror('gone')]);
        expect(plan.absent).toEqual(['gone']);
        expect(plan.tombstone).toEqual([]);
        // Absence is not deletion: only an explicit tombstone row removes anything.
        expect(plan.fetch).toEqual([
            { documentId: 'a', revision: 'r1', expectedRemoteRevision: null },
        ]);
    });

    it('does not report a candidate-only record as absent — there is no record to lose', () => {
        const plan = planLibraryDownload([], [mirror('q', { saved: false })]);
        expect(plan).toEqual({
            fetch: [],
            tombstone: [],
            unchanged: [],
            absent: [],
            documents: { required: 0, mirrored: 0 },
        });
    });
});

/**
 * Two rules of the pass itself that are decided before any record is touched, and therefore need
 * no store at all: how long a manifest may be, and what happens when the local library cannot be
 * read. The songbook below is a stub on purpose — it stands in for reads that never reach a
 * commit, and every rule that DOES commit is proven against real IndexedDB in the browser suite.
 */
const stubScope: AccountScope = { ownerId: 'owner-a', generation: 1 };

function stubSongbook(overrides: Record<string, unknown> = {}): AccountSongbook {
    return {
        remoteCandidates: async () => [],
        list: async () => ({ songs: [], nextAfterDocumentId: null }),
        reconcile: async () => 'unchanged',
        ...overrides,
    } as unknown as AccountSongbook;
}

/** Keyset paging over a fixed row list, exactly as the #1259 route pages it. */
function manifestOf(rows: readonly ManifestRow[]): LibraryTransport {
    return {
        async manifest(after, limit) {
            const window = rows
                .filter((entry) => after === null || entry.documentId > after)
                .slice(0, limit);
            const last = window.at(-1);
            const end = rows.at(-1);
            return {
                kind: 'page',
                page: {
                    documents: window,
                    nextAfterDocumentId:
                        last && end && last.documentId !== end.documentId ? last.documentId : null,
                },
            };
        },
        async download() {
            throw new Error('No body should have been requested.');
        },
    };
}

function pass(songbook: AccountSongbook, transport: LibraryTransport, limit?: number) {
    return runLibraryDownload(songbook, stubScope, transport, {
        isActive: () => false,
        minimumIntervalMs: 0,
        ...(limit === undefined ? {} : { manifestLimit: limit }),
    });
}

describe('runLibraryDownload — what the pass refuses before it touches anything', () => {
    it('accepts a full library plus its tombstones, which the document cap does not bound', async () => {
        // The manifest is `documents UNION ALL tombstones` and tombstones are never pruned, so a
        // full 2,000-document library plus ONE delete is 2,001 rows. Reading the server's
        // per-owner document cap as a row ceiling made exactly that library fail every pass,
        // forever, with nothing the musician could do about it.
        const rows: ManifestRow[] = [];
        for (let index = 0; index < 2_000; index += 1) {
            rows.push(row(`doc-${String(index).padStart(4, '0')}`, 'r1'));
        }
        rows.push(row('doc-9999', 'r2', true));
        const reconcile = vi.fn(async () => 'unchanged');
        const songbook = stubSongbook({
            reconcile,
            // One page: this stub is a local mirror, not a pager. The paging itself is proven
            // against real IndexedDB in `account-songbook-list.browser.test.ts`.
            list: async () => ({
                songs: rows
                    .filter((entry) => !entry.deleted)
                    .map((entry) => ({ documentId: entry.documentId, remoteRevision: 'r1' })),
                nextAfterDocumentId: null,
            }),
        });

        const result = await pass(songbook, manifestOf(rows));

        expect(result.failures).toEqual([]);
        expect(result.complete).toBe(true);
        expect(result.unchanged).toHaveLength(2_001);
        expect(result.documents).toEqual({ required: 2_000, verified: 2_000 });
        // Nothing moved: the whole library was already mirrored, tombstone included.
        expect(reconcile).not.toHaveBeenCalled();
    });

    it('still stops a server whose pages never end', async () => {
        // The fuse that remains is about a runaway server, not about library size.
        let served = 0;
        const endless: LibraryTransport = {
            async manifest() {
                served += 1;
                const id = `doc-${String(served).padStart(6, '0')}`;
                return {
                    kind: 'page',
                    page: {
                        documents: [row(id, 'r1')],
                        nextAfterDocumentId: id,
                    },
                };
            },
            async download() {
                throw new Error('No body should have been requested.');
            },
        };

        const result = await pass(stubSongbook(), endless, 1);

        expect(result.complete).toBe(false);
        expect(result.failures).toEqual([
            {
                documentId: null,
                reason: 'malformed-manifest',
                detail: 'Manifest did not end within its page budget.',
            },
        ]);
        expect(served).toBe(2_000);
    });

    it('reports a library it could not read, rather than rejecting with no result at all', async () => {
        // A single corrupt row would otherwise reject every future pass at the same row, with
        // nothing in `failures` a musician could be shown and no way back.
        const songbook = stubSongbook({
            list: async () => {
                throw new Error('Invalid account record ownership. Stored source is unchanged.');
            },
        });

        const result = await pass(songbook, manifestOf([row('a', 'r1')]));

        expect(result.complete).toBe(false);
        expect(result.failures).toEqual([
            {
                documentId: null,
                reason: 'malformed-local',
                detail: 'Invalid account record ownership. Stored source is unchanged.',
            },
        ]);
        // Abandoned before the diff, so nothing is claimed about coverage and nothing was asked
        // for — the transport above throws on any body request.
        expect(result.documents).toEqual({ required: null, verified: null });
        expect(result.advanced).toEqual([]);
        expect(result.removed).toEqual([]);
    });
});

function fakeApi(result: ApiResult<unknown>): { api: AccountApi; paths: string[] } {
    const paths: string[] = [];
    const get = vi.fn(async (path: string) => {
        paths.push(path);
        return result;
    });
    return {
        api: { get, post: vi.fn(async () => result) } as unknown as AccountApi,
        paths,
    };
}

function code(value: string): ApiResult<never> {
    return { ok: false, error: { kind: 'code', code: value as never, status: 400 } };
}

function transportFor(result: ApiResult<unknown>) {
    const { api, paths } = fakeApi(result);
    const session = createAccountSession(api);
    return { transport: createLibraryTransport(api, session), session, paths };
}

describe('createLibraryTransport — the #1259 routes in the pass’s vocabulary', () => {
    it('asks for the manifest page the pass asked for, and hands the body through unvalidated', async () => {
        const page = { documents: [], nextAfterDocumentId: null };
        const { transport, paths } = transportFor({ ok: true, value: page, status: 200 });
        expect(await transport.manifest(null, 500)).toEqual({ kind: 'page', page });
        expect(await transport.manifest('song-9', 100)).toEqual({ kind: 'page', page });
        expect(paths).toEqual([
            '/api/documents?limit=500',
            '/api/documents?after=song-9&limit=100',
        ]);
    });

    it('downloads by id and reports a 404 as missing, never as a deletion', async () => {
        const { transport, paths } = transportFor(code('not_found'));
        expect(await transport.download('song-1')).toEqual({ kind: 'missing' });
        expect(paths).toEqual(['/api/documents/song-1']);
        // The manifest is the only place a deletion is learned, so the same 404 on the manifest
        // route is an ordinary server refusal rather than a missing document.
        expect(await transport.manifest(null, 10)).toEqual({
            kind: 'failed',
            reason: 'server',
            detail: 'The server refused the request: not_found.',
        });
    });

    it('marks the session expired once and stops the pass on a 401', async () => {
        for (const call of [
            (t: ReturnType<typeof transportFor>) => t.transport.manifest(null, 10),
            (t: ReturnType<typeof transportFor>) => t.transport.download('song-1'),
        ]) {
            const fixture = transportFor(code('unauthenticated'));
            const markExpired = vi.spyOn(fixture.session, 'markExpired');
            // Asserted as the CALL, not as the resulting state: this transport's contract is to
            // report the 401 to the session, and what that does is the session's own rule —
            // `lib/account/session.ts` only ever moves a `signedIn` session to `expired`, so a
            // device that was never signed in (this fixture) stays exactly where it was.
            expect(await call(fixture)).toEqual({ kind: 'expired' });
            expect(markExpired).toHaveBeenCalledTimes(1);
        }
    });

    it('turns a 429 into a back-off with no wait, because api.ts cannot see Retry-After', async () => {
        const fixture = transportFor(code('rate_limited'));
        const expected = { kind: 'backoff', retryAfterSeconds: null };
        expect(await fixture.transport.manifest(null, 10)).toEqual(expected);
        expect(await fixture.transport.download('song-1')).toEqual(expected);
        // A back-off is not a sign-out: the session is untouched.
        expect(fixture.session.getSnapshot()).toEqual({ status: 'unknown' });
    });

    it('reports every other failure rather than throwing, so the pass records it and continues', async () => {
        const cases: Array<[ApiError, 'network' | 'server', string]> = [
            [{ kind: 'network' }, 'network', 'The server could not be reached.'],
            [
                { kind: 'unknown', status: 502 },
                'server',
                'The server answered 502 with an unrecognized body.',
            ],
            [
                { kind: 'code', code: 'internal_error', status: 500 },
                'server',
                'The server refused the request: internal_error.',
            ],
        ];
        for (const [error, reason, detail] of cases) {
            const { transport } = transportFor({ ok: false, error });
            expect(await transport.manifest(null, 10)).toEqual({ kind: 'failed', reason, detail });
            expect(await transport.download('song-1')).toEqual({ kind: 'failed', reason, detail });
        }
    });
});
