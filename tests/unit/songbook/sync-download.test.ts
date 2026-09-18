import { describe, expect, it, vi } from 'vitest';
import type { AccountApi, ApiError, ApiResult } from '../../../prototypes/v2/lib/account/api.js';
import { createLibraryTransport } from '../../../prototypes/v2/lib/account/library-transport.js';
import { createAccountSession } from '../../../prototypes/v2/lib/account/session.js';
import {
    type LocalMirror,
    type ManifestRow,
    planLibraryDownload,
} from '../../../prototypes/v2/lib/sync/download.js';

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
        expect(plan.fetch).toEqual([{ documentId: 'b', revision: 'r2' }]);
        expect(plan.unchanged).toEqual(['a']);
        expect(plan.documents).toEqual({ required: 2, mirrored: 1 });
    });

    it('fetches a divergent record, because a candidate with no remote body decides nothing', () => {
        // Locally saved but never cloud-confirmed. The body is still worth fetching: it becomes
        // a preserved candidate, and a keep-both decision needs both sides to show.
        const plan = planLibraryDownload([row('a', 'r9')], [mirror('a', { remoteRevision: null })]);
        expect(plan.fetch).toEqual([{ documentId: 'a', revision: 'r9' }]);
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
        expect(plan.tombstone).toEqual([{ documentId: 'a', revision: 'r1' }]);
        expect(plan.unchanged).toEqual(['b']);
        // A deleted row is not part of the library a device must hold to be offline-ready.
        expect(plan.documents).toEqual({ required: 0, mirrored: 0 });
    });

    it('reports a saved record the manifest never mentions without planning to remove it', () => {
        const plan = planLibraryDownload([row('a', 'r1')], [mirror('a'), mirror('gone')]);
        expect(plan.absent).toEqual(['gone']);
        expect(plan.tombstone).toEqual([]);
        // Absence is not deletion: only an explicit tombstone row removes anything.
        expect(plan.fetch).toEqual([{ documentId: 'a', revision: 'r1' }]);
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
            // A session that was never signed in reads `guest`; `markExpired` is the stronger
            // claim, so asserting it directly is what proves this path ran.
            expect(await call(fixture)).toEqual({ kind: 'expired' });
            expect(fixture.session.getSnapshot()).toEqual({ status: 'expired' });
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
