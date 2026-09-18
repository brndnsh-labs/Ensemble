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
import type { AccountFailure } from '../../lib/account/messages';
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
    /**
     * `true` once the FIRST session read has answered — signed in, guest, or "couldn't tell"
     * (offline). Until then the shell does not know WHICH songbook it is showing, and rendering
     * the guest list only to swap it for the account library a moment later is a wrong claim,
     * not a loading state (#1266). It settles on any answer, so an offline cold start still
     * reaches the guest songbook without a server — accounts must never gate guest startup.
     */
    settled: boolean;
    signingOut: boolean;
    /**
     * `navigator.onLine`, kept live. Rollout decision 9 S2: offline, sign-out is disabled with a
     * reason rather than left to fail silently against a server it cannot reach — export stays
     * available either way, since it never leaves the device.
     */
    online: boolean;
    /** Set only when the last sign-out attempt reached the server and was refused. */
    signOutFailure: AccountFailure | null;
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
    const [settled, setSettled] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [signOutFailure, setSignOutFailure] = useState<AccountFailure | null>(null);
    // `true` until the effect below resolves the real value — `navigator` is unavailable during
    // the static export's prerender, and a device is assumed reachable until proven otherwise.
    const [online, setOnline] = useState(true);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (typeof navigator === 'undefined' || typeof window === 'undefined') {
            return;
        }
        setOnline(navigator.onLine);
        const goOnline = () => setOnline(true);
        const goOffline = () => setOnline(false);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    /**
     * One read of both facts, in order: the session first, because the recovery status is only
     * meaningful (and only authorized) for a signed-in owner. Never throws and never awaited by
     * a render path.
     */
    const refresh = useCallback(() => {
        void accountSession.refresh().then(async () => {
            // Any answer settles it, including "still unknown" after a network failure: the
            // device has now asked, and the guest songbook is the honest fallback.
            if (mounted.current) {
                setSettled(true);
            }
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
        setSignOutFailure(null);
        void signOut(accountApi).then((outcome) => {
            if (!mounted.current) {
                return;
            }
            setSigningOut(false);
            if (!outcome.ok) {
                setSignOutFailure(outcome.failure);
            }
            // Refresh either way: on success the server has revoked the session, and on failure
            // the only honest thing to do is re-read who the server still thinks we are.
            refresh();
        });
    }, [refresh]);

    return {
        session,
        recoveryEnrolled: enrolled,
        settled,
        signingOut,
        online,
        signOutFailure,
        refresh,
        signOut: runSignOut,
    };
}
