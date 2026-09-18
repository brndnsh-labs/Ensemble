'use client';

/**
 * The two hooks the shell needs to render an account entry point (#1262), and nothing else — the
 * sign-in dialog owns its own ceremony state, so `app/ensemble.tsx` gains wiring, not a state
 * machine.
 *
 * Both hooks are deliberately effect-driven rather than render-driven: `localStorage`, `location`
 * and `fetch` are all unavailable during the static export's prerender, and reading them during
 * render would also make the server and client HTML disagree. Resolving them after mount means
 * the first paint is always the plain guest app — which is the contract anyway, since accounts
 * must never gate guest startup.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { accountApi, accountSession } from '../../lib/account/client';
import { syncAccountsFlag } from '../../lib/account/feature';
import { recoveryEnrolled, signOut } from '../../lib/account/passkeys';
import type { SessionState } from '../../lib/account/session';

// Module scope keeps both references stable across renders, which is what `useSyncExternalStore`
// requires to avoid resubscribing (and, for the snapshot, re-rendering) on every pass.
const subscribe = (listener: () => void) => accountSession.subscribe(listener);
const snapshot = () => accountSession.getSnapshot();

/**
 * Whether this device opted into the unfinished account UI. Applies and strips a `?accounts=`
 * parameter on the way. `false` until the effect runs, so nothing account-shaped is ever in the
 * first render.
 */
export function useAccountsEnabled(): boolean {
    const [enabled, setEnabled] = useState(false);
    useEffect(() => {
        setEnabled(syncAccountsFlag());
    }, []);
    return enabled;
}

export interface AccountView {
    session: SessionState;
    /**
     * `true` once the server reports a confirmed recovery code, `false` for an account left
     * unprotected by an abandoned enrolment, `null` while unknown (not signed in, not asked yet,
     * or the request failed — an ambiguous answer must never be read as "unprotected", which
     * would nag a perfectly protected account).
     */
    recoveryEnrolled: boolean | null;
    signingOut: boolean;
    /** Re-reads the session and, when signed in, the recovery status. */
    refresh: () => void;
    signOut: () => void;
}

/**
 * Reads the account session, and only while `active` — the caller passes
 * `accountsEnabled && songbookReady`, so the one bootstrap read lands after the songbook is up
 * and is never awaited by startup or playback.
 */
export function useAccountSession(active: boolean): AccountView {
    // `snapshot` doubles as the server snapshot: it is `{ status: 'unknown' }` before any
    // refresh, which is precisely what the prerendered HTML should reflect.
    const session = useSyncExternalStore(subscribe, snapshot, snapshot);
    const [enrolled, setEnrolled] = useState<boolean | null>(null);
    const [signingOut, setSigningOut] = useState(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    /**
     * One read of both facts, in order: the session first, because the recovery status is only
     * meaningful (and only authorized) for a signed-in owner. Never throws and never awaited by
     * a render path.
     */
    const refresh = useCallback(() => {
        void accountSession.refresh().then(async () => {
            if (accountSession.getSnapshot().status !== 'signedIn') {
                if (mounted.current) {
                    setEnrolled(null);
                }
                return;
            }
            const outcome = await recoveryEnrolled(accountApi);
            if (mounted.current) {
                setEnrolled(outcome.ok ? outcome.value : null);
            }
        });
    }, []);

    useEffect(() => {
        if (active) {
            refresh();
        }
    }, [active, refresh]);

    const runSignOut = useCallback(() => {
        setSigningOut(true);
        void signOut(accountApi).then(() => {
            if (!mounted.current) {
                return;
            }
            setSigningOut(false);
            // Refresh either way: on success the server has revoked the session, and on failure
            // the only honest thing to do is re-read who the server still thinks we are.
            refresh();
        });
    }, [refresh]);

    return {
        session,
        recoveryEnrolled: enrolled,
        signingOut,
        refresh,
        signOut: runSignOut,
    };
}
