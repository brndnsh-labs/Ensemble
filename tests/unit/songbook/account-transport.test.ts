import { describe, expect, it, vi } from 'vitest';
import type { AccountApi, ApiResult } from '../../../prototypes/v2/lib/account/api.js';
import { createAccountSession } from '../../../prototypes/v2/lib/account/session.js';
import {
    createSaveTransport,
    SaveTransportError,
} from '../../../prototypes/v2/lib/account/transport.js';
import type { PreparedSave } from '../../../prototypes/v2/lib/sync/protocol.js';

/**
 * `lib/sync/send.ts`'s `sendNext` has exactly two outcomes for a `SaveTransport`: a REJECTED
 * promise keeps the frozen operation queued and reports `'retry'` (proven for the transport
 * contract in general by `tests/browser/account-outbox-pass.browser.test.ts`'s `cloud()`/
 * `failingTransport` fakes); a RESOLVED value is validated as a `SaveReply` by `reply()` and
 * becomes `'committed'`/`'conflict'`. These tests assert `createSaveTransport` picks the right
 * one of those two shapes for each server outcome — that IS "the keep-the-operation outcome"
 * for anything this transport cannot commit.
 */

const REQUEST: PreparedSave = {
    ownerId: 'acct-1',
    documentId: 'song-1',
    operationId: 'op-1',
    body: '{"canonical":"bytes"}',
    digest: 'a'.repeat(64),
};

function fakeApi(...posts: Array<ApiResult<unknown>>): { api: AccountApi; calls: unknown[][] } {
    const calls: unknown[][] = [];
    let index = 0;
    const api = {
        get: vi.fn(async () => {
            throw new Error('not used by the transport');
        }),
        post: vi.fn(async (path: string, body: string) => {
            calls.push([path, body]);
            return posts[Math.min(index++, posts.length - 1)];
        }),
    } as unknown as AccountApi;
    return { api, calls };
}

describe('createSaveTransport', () => {
    it('resolves a committed reply untouched, so `reply()` can validate it', async () => {
        const committed = {
            ...REQUEST,
            kind: 'committed',
            revision: 'epoch-1:r1',
        };
        const { api } = fakeApi({ ok: true, value: committed, status: 200 });
        const session = createAccountSession(api);
        const transport = createSaveTransport(api, session);
        await expect(transport(REQUEST)).resolves.toBe(committed);
    });

    it('resolves a conflict reply untouched — a 409 conflict is a protocol outcome, not a failure', async () => {
        const conflict = {
            ...REQUEST,
            kind: 'conflict',
            revision: 'epoch-1:r2',
            remote: null,
        };
        const { api } = fakeApi({ ok: true, value: conflict, status: 409 });
        const session = createAccountSession(api);
        const transport = createSaveTransport(api, session);
        await expect(transport(REQUEST)).resolves.toBe(conflict);
    });

    it('quota_exceeded throws (keeps the operation queued) rather than resolving an invalid reply', async () => {
        const { api } = fakeApi({
            ok: false,
            error: { kind: 'code', code: 'quota_exceeded', status: 409 },
        });
        const session = createAccountSession(api);
        const transport = createSaveTransport(api, session);
        const rejection = expect(transport(REQUEST)).rejects;
        await rejection.toBeInstanceOf(SaveTransportError);
        await rejection.toMatchObject({ reason: { kind: 'code', code: 'quota_exceeded' } });
    });

    it('a 401 calls session.markExpired() AND throws, so the operation is kept, not dropped', async () => {
        const { api } = fakeApi({
            ok: false,
            error: { kind: 'code', code: 'unauthenticated', status: 401 },
        });
        const session = createAccountSession(api);
        const markExpired = vi.spyOn(session, 'markExpired');
        const transport = createSaveTransport(api, session);
        await expect(transport(REQUEST)).rejects.toBeInstanceOf(SaveTransportError);
        expect(markExpired).toHaveBeenCalledTimes(1);
        expect(session.getSnapshot()).toEqual({ status: 'expired' });
    });

    it('a network failure throws too, and never touches the session', async () => {
        const { api } = fakeApi({ ok: false, error: { kind: 'network' } });
        const session = createAccountSession(api);
        const markExpired = vi.spyOn(session, 'markExpired');
        const transport = createSaveTransport(api, session);
        const rejection = expect(transport(REQUEST)).rejects;
        await rejection.toBeInstanceOf(SaveTransportError);
        await rejection.toMatchObject({ reason: { kind: 'network' } });
        expect(markExpired).not.toHaveBeenCalled();
    });

    it('sends the exact same request bytes on a retry — never re-serializes the document', async () => {
        const committed = { ...REQUEST, kind: 'committed', revision: 'epoch-1:r1' };
        const { api, calls } = fakeApi(
            { ok: true, value: committed, status: 200 },
            { ok: true, value: committed, status: 200 },
        );
        const session = createAccountSession(api);
        const transport = createSaveTransport(api, session);
        await transport(REQUEST);
        await transport(REQUEST);
        expect(calls).toEqual([
            ['/api/documents/save', REQUEST.body],
            ['/api/documents/save', REQUEST.body],
        ]);
        // Reference equality on the body string itself, not just deep-equal content, per the
        // acceptance criterion: byte-identical retries, asserted against the frozen bytes.
        expect(calls[0]?.[1]).toBe(REQUEST.body);
        expect(calls[1]?.[1]).toBe(REQUEST.body);
        expect(calls[0]?.[1]).toBe(calls[1]?.[1]);
    });
});
