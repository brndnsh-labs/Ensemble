import type { AccountApi } from './api';

/**
 * The account session state machine (#1261). Framework-free on purpose: `subscribe`/
 * `getSnapshot` is the exact shape `useSyncExternalStore` wants, which is how #1262 wired it into
 * the app — `app/account/use-account-session.ts` is that thin wrapper, over the single instance
 * `lib/account/client.ts` owns. This module still knows nothing about React or about when the
 * app chooses to `refresh()`.
 *
 * `unknown` is the only state before the first `refresh()` resolves. `guest` and `expired` are
 * both "not signed in", but they mean different things to the UI this eventually feeds: `guest`
 * is the ordinary anonymous state, `expired` is "you WERE signed in and the server no longer
 * agrees" — the distinction `refresh()` and `markExpired()` both preserve by only ever moving
 * a signed-in session to `expired`, never straight to `guest`.
 */
export type SessionState =
    | { status: 'unknown' }
    | { status: 'guest' }
    | { status: 'signedIn'; owner: string }
    | { status: 'expired' };

const UNKNOWN: SessionState = { status: 'unknown' };
const GUEST: SessionState = { status: 'guest' };
const EXPIRED: SessionState = { status: 'expired' };

export interface AccountSession {
    getSnapshot(): SessionState;
    /** Returns the unsubscribe function, matching `useSyncExternalStore`'s contract. */
    subscribe(listener: () => void): () => void;
    /**
     * Resolves from `GET /api/auth/session`. Never throws and never blocks/delays guest
     * startup — nothing in the app awaits this today, and it must stay safe to call from
     * anywhere without a loading gate.
     */
    refresh(): Promise<void>;
    /** The Save transport calls this on a 401 mid-session; nothing else should need to. */
    markExpired(): void;
}

interface SessionResponse {
    accountId: unknown;
}

function sameState(a: SessionState, b: SessionState): boolean {
    if (a.status !== b.status) {
        return false;
    }
    return a.status === 'signedIn' && b.status === 'signedIn' ? a.owner === b.owner : true;
}

export function createAccountSession(api: AccountApi): AccountSession {
    let state: SessionState = UNKNOWN;
    const listeners = new Set<() => void>();

    // Same-content updates are dropped rather than replacing the object: `useSyncExternalStore`
    // treats a changed snapshot reference as "re-render", so a no-op refresh must return the
    // exact previous reference or every poll would cost a wasted render once this is wired up.
    function set(next: SessionState): void {
        if (sameState(state, next)) {
            return;
        }
        state = next;
        for (const listener of listeners) {
            listener();
        }
    }

    return {
        getSnapshot: () => state,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        async refresh() {
            const result = await api.get<SessionResponse>('/api/auth/session');
            if (result.ok) {
                const owner = result.value?.accountId;
                if (typeof owner === 'string' && owner.length > 0) {
                    set({ status: 'signedIn', owner });
                }
                // A 200 that cannot name an owner is not this contract; leave state as-is
                // rather than fabricate a sign-in.
                return;
            }
            if (result.error.kind === 'code' && result.error.code === 'unauthenticated') {
                // Was signed in and the server disagrees now -> expired. Never was -> guest.
                set(state.status === 'signedIn' ? EXPIRED : GUEST);
                return;
            }
            // Network failure, or any other server code (rate-limited, forbidden-origin, an
            // unrecognized future code): ambiguous evidence, so the state is left exactly as
            // it was. A transient blip must never flip a live signed-in session to guest.
        },
        markExpired() {
            set(EXPIRED);
        },
    };
}
