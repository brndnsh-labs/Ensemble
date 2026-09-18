import { describe, expect, it, vi } from 'vitest';
import type { AccountApi, ApiResult } from '../../../prototypes/v2/lib/account/api.js';
import { createAccountSession } from '../../../prototypes/v2/lib/account/session.js';

function apiReturning(...results: Array<ApiResult<unknown>>): AccountApi {
    let index = 0;
    return {
        get: vi.fn(async () => results[Math.min(index++, results.length - 1)]),
        post: vi.fn(async () => {
            throw new Error('not used by session.ts');
        }),
    } as unknown as AccountApi;
}

describe('createAccountSession', () => {
    it('starts unknown before the first refresh', () => {
        const session = createAccountSession(apiReturning());
        expect(session.getSnapshot()).toEqual({ status: 'unknown' });
    });

    it('a 200 session read moves to signedIn with the owner', async () => {
        const session = createAccountSession(
            apiReturning({ ok: true, value: { accountId: 'acct-42' }, status: 200 }),
        );
        await session.refresh();
        expect(session.getSnapshot()).toEqual({ status: 'signedIn', owner: 'acct-42' });
    });

    it('401 while never signed in resolves to guest, not expired', async () => {
        const session = createAccountSession(
            apiReturning({
                ok: false,
                error: { kind: 'code', code: 'unauthenticated', status: 401 },
            }),
        );
        await session.refresh();
        expect(session.getSnapshot()).toEqual({ status: 'guest' });
    });

    it('401 after having been signedIn resolves to expired, not guest', async () => {
        const session = createAccountSession(
            apiReturning(
                { ok: true, value: { accountId: 'acct-1' }, status: 200 },
                { ok: false, error: { kind: 'code', code: 'unauthenticated', status: 401 } },
            ),
        );
        await session.refresh();
        expect(session.getSnapshot()).toEqual({ status: 'signedIn', owner: 'acct-1' });
        await session.refresh();
        expect(session.getSnapshot()).toEqual({ status: 'expired' });
    });

    it('a network failure never throws and leaves the prior state exactly as it was', async () => {
        const session = createAccountSession(
            apiReturning(
                { ok: true, value: { accountId: 'acct-1' }, status: 200 },
                { ok: false, error: { kind: 'network' } },
            ),
        );
        await session.refresh();
        const before = session.getSnapshot();
        await expect(session.refresh()).resolves.toBeUndefined();
        expect(session.getSnapshot()).toBe(before);
    });

    it('an unrecognized server code leaves state unchanged rather than guessing', async () => {
        const session = createAccountSession(
            apiReturning({ ok: false, error: { kind: 'unknown', status: 500 } }),
        );
        expect(session.getSnapshot()).toEqual({ status: 'unknown' });
        await session.refresh();
        expect(session.getSnapshot()).toEqual({ status: 'unknown' });
    });

    it('a malformed 200 body (no accountId) does not fabricate a sign-in', async () => {
        const session = createAccountSession(apiReturning({ ok: true, value: {}, status: 200 }));
        await session.refresh();
        expect(session.getSnapshot()).toEqual({ status: 'unknown' });
    });

    it('markExpired moves a signed-in session to expired and notifies subscribers once', async () => {
        const session = createAccountSession(
            apiReturning({ ok: true, value: { accountId: 'acct-1' }, status: 200 }),
        );
        await session.refresh();
        const listener = vi.fn();
        session.subscribe(listener);
        session.markExpired();
        expect(session.getSnapshot()).toEqual({ status: 'expired' });
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('markExpired leaves a guest or never-refreshed session exactly where it was', async () => {
        // The same rule `refresh()` keeps, enforced here rather than trusted to every caller:
        // only a session that WAS signed in can expire. A device that meets a 401 having never
        // signed in has learned nothing, and "sign in again" would be a lie to whoever reads it.
        const never = createAccountSession(apiReturning());
        never.markExpired();
        expect(never.getSnapshot()).toEqual({ status: 'unknown' });

        const guest = createAccountSession(
            apiReturning({
                ok: false,
                error: { kind: 'code', code: 'unauthenticated', status: 401 },
            }),
        );
        await guest.refresh();
        guest.markExpired();
        expect(guest.getSnapshot()).toEqual({ status: 'guest' });
    });

    it('unsubscribe stops further notifications', async () => {
        // Signed in first, so `markExpired()` is a REAL state change: from `unknown` it is a
        // no-op, and this would then pass without unsubscribe doing anything at all.
        const session = createAccountSession(
            apiReturning({ ok: true, value: { accountId: 'acct-1' }, status: 200 }),
        );
        await session.refresh();
        const listener = vi.fn();
        const unsubscribe = session.subscribe(listener);
        unsubscribe();
        session.markExpired();
        expect(session.getSnapshot()).toEqual({ status: 'expired' });
        expect(listener).not.toHaveBeenCalled();
    });

    it('getSnapshot returns the SAME reference across a no-op update (useSyncExternalStore contract)', async () => {
        const session = createAccountSession(
            apiReturning(
                { ok: true, value: { accountId: 'acct-1' }, status: 200 },
                { ok: true, value: { accountId: 'acct-1' }, status: 200 },
            ),
        );
        await session.refresh();
        const first = session.getSnapshot();
        const listener = vi.fn();
        session.subscribe(listener);
        await session.refresh();
        expect(session.getSnapshot()).toBe(first);
        expect(listener).not.toHaveBeenCalled();
    });
});
