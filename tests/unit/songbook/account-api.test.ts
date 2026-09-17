import { describe, expect, it } from 'vitest';
import { createAccountApi } from '../../../prototypes/v2/lib/account/api.js';

interface FakeCall {
    path: string;
    init: RequestInit;
}

function fakeFetch(
    make: () => Response | Promise<Response>,
    calls: FakeCall[] = [],
): { fetchImpl: typeof fetch; calls: FakeCall[] } {
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ path: String(input), init: init ?? {} });
        return await make();
    }) as typeof fetch;
    return { fetchImpl, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('createAccountApi', () => {
    it('resolves ok:true for a success body, with the HTTP status preserved', async () => {
        const { fetchImpl } = fakeFetch(() => jsonResponse({ accountId: 'acct-1' }));
        const api = createAccountApi(fetchImpl);
        const result = await api.get<{ accountId: string }>('/api/auth/session');
        expect(result).toEqual({ ok: true, value: { accountId: 'acct-1' }, status: 200 });
    });

    it('discriminates success from failure on the body`s `error` field, not the HTTP status', async () => {
        // A Save conflict is a normal protocol outcome carried on a 409 — the presence of a
        // `kind` field and absence of an `error` field is what makes it a SUCCESS value here.
        const conflictBody = {
            ownerId: 'o',
            documentId: 'd',
            operationId: 'op',
            digest: 'x'.repeat(64),
            revision: 'epoch-1:r2',
            kind: 'conflict',
            remote: null,
        };
        const { fetchImpl } = fakeFetch(() => jsonResponse(conflictBody, 409));
        const api = createAccountApi(fetchImpl);
        const result = await api.post('/api/documents/save', '{}');
        expect(result).toEqual({ ok: true, value: conflictBody, status: 409 });
    });

    it('maps a known `{ error: <code> }` body to a closed-union code, at any status', async () => {
        const { fetchImpl } = fakeFetch(() => jsonResponse({ error: 'quota_exceeded' }, 409));
        const api = createAccountApi(fetchImpl);
        const result = await api.post('/api/documents/save', '{}');
        expect(result).toEqual({
            ok: false,
            error: { kind: 'code', code: 'quota_exceeded', status: 409 },
        });
    });

    it('maps an unrecognized `{ error: <code> }` string to `unknown`, never accepting it as valid', async () => {
        const { fetchImpl } = fakeFetch(() =>
            jsonResponse({ error: 'a_future_code_this_app_has_never_seen' }, 400),
        );
        const api = createAccountApi(fetchImpl);
        const result = await api.get('/api/auth/session');
        expect(result).toEqual({ ok: false, error: { kind: 'unknown', status: 400 } });
    });

    it('maps a fetch rejection (offline, DNS, refused) to `network`, never throwing', async () => {
        const fetchImpl = (async () => {
            throw new TypeError('Failed to fetch');
        }) as typeof fetch;
        const api = createAccountApi(fetchImpl);
        const result = await api.get('/api/auth/session');
        expect(result).toEqual({ ok: false, error: { kind: 'network' } });
    });

    it('maps a non-JSON body to `unknown` without leaking the raw body text', async () => {
        const fetchImpl = (async () =>
            new Response('<html>not json</html>', { status: 502 })) as typeof fetch;
        const api = createAccountApi(fetchImpl);
        const result = await api.get('/api/auth/session');
        expect(result).toEqual({ ok: false, error: { kind: 'unknown', status: 502 } });
        expect(JSON.stringify(result)).not.toContain('html');
    });

    it('sends a GET with no body, same-origin credentials and no-store caching', async () => {
        const { fetchImpl, calls } = fakeFetch(() => jsonResponse({ accountId: 'a' }));
        const api = createAccountApi(fetchImpl);
        await api.get('/api/auth/session');
        expect(calls).toEqual([
            {
                path: '/api/auth/session',
                init: { method: 'GET', credentials: 'same-origin', cache: 'no-store' },
            },
        ]);
    });

    it('POSTs the given body verbatim with a JSON content type, never re-serializing it', async () => {
        const { fetchImpl, calls } = fakeFetch(() => jsonResponse({ kind: 'committed' }));
        const api = createAccountApi(fetchImpl);
        const body = '{"already":"canonical bytes"}';
        await api.post('/api/documents/save', body);
        expect(calls[0]).toEqual({
            path: '/api/documents/save',
            init: {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                credentials: 'same-origin',
                cache: 'no-store',
            },
        });
        // Reference equality, not just structural: proves the exact string was handed to
        // fetch, not a copy produced by re-stringifying a parsed intermediate.
        expect(calls[0]?.init.body).toBe(body);
    });
});
