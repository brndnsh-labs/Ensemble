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
import {
    accountsEnabled,
    deviceMayHoldAccount,
    setAccountsEnabled,
    syncAccountsFlag,
} from '../../lib/account/feature';
import type { AccountFailure } from '../../lib/account/messages';
import { recoveryEnrolled, signOut } from '../../lib/account/passkeys';
import type { SessionState } from '../../lib/account/session';
import {
    AccountMismatchError,
    accountSync,
    SIGN_OUT_MESSAGES,
    type SignOutOutcome,
} from '../../lib/account/sync-loop';

// Module scope keeps both references stable across renders, which is what `useSyncExternalStore`
// requires to avoid resubscribing (and, for the snapshot, re-rendering) on every pass.
const subscribe = (listener: () => void) => accountSession.subscribe(listener);
const snapshot = () => accountSession.getSnapshot();

/**
 * How long the songbook waits for the FIRST session read before falling back to the guest
 * library (`settled` below). Long enough that an ordinary slow connection answers first — the
 * read is one same-origin GET of a few bytes — and short enough that a hung origin is not a hung
 * song list.
 */
const FIRST_READ_DEADLINE_MS = 4_000;

export interface AccountsSwitch {
    /**
     * Whether the account UI is on for this device — the default since the cutover (#1357), off
     * only for a profile that asked with `?accounts=off`. `false` until `resolved`, so nothing
     * account-shaped is ever in the first render: the prerendered HTML has no storage to read,
     * and the guest app is what every device sees first whatever this settles on.
     */
    enabled: boolean;
    /**
     * `true` once this device's answer has actually been read. It exists so the songbook can tell
     * "off" from "not asked yet" — without it, the opted-out notice would flash on every load of
     * every device, since `enabled` starts `false` for all of them.
     */
    resolved: boolean;
    /**
     * The way back from `?accounts=off`, for the notice the songbook renders (#1357). No reload:
     * every account surface in `ensemble.tsx` is derived from this hook's `enabled` through hooks
     * that key off it — `useAccountSession(accountsOn && ready)` starts the session read, and
     * `useAccountLibrary(accountsOn, …)` stays detached until a session says otherwise — so
     * flipping it re-renders the shell into exactly the state a fresh load would have reached.
     */
    turnOn: () => void;
}

/**
 * This device's account switch. Applies and strips a `?accounts=` parameter on the way.
 */
export function useAccountsSwitch(): AccountsSwitch {
    const [state, setState] = useState<{ enabled: boolean; resolved: boolean }>({
        enabled: false,
        resolved: false,
    });
    useEffect(() => {
        setState({ enabled: syncAccountsFlag(), resolved: true });
    }, []);
    const turnOn = useCallback(() => {
        setAccountsEnabled(true);
        // Read back rather than assuming `true`: unreadable storage swallows the write, and this
        // hook's answer is whatever `accountsEnabled` says — which for that device is also `true`,
        // so the switch still works, it just does not persist past this page.
        setState({ enabled: accountsEnabled(), resolved: true });
    }, []);
    return { enabled: state.enabled, resolved: state.resolved, turnOn };
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
     *
     * Since #1357 it also settles on a DEADLINE, because with accounts on by default this is
     * every device's startup path — see `FIRST_READ_DEADLINE_MS` and `fellBack`.
     */
    settled: boolean;
    /**
     * `true` when `settled` came from that deadline and no answer has landed since (#1357 patch
     * P1-4). The songbook says so, because a deadline settle is a FALLBACK, not an answer: on a
     * signed-in device whose read lands at six seconds it puts the guest library under "Your
     * songbook" for those six seconds, and a silent one is indistinguishable from a claim that
     * this is the library. It clears the moment the read resolves — late or not — after which
     * everything proceeds exactly as an on-time answer would have.
     */
    fellBack: boolean;
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
    /**
     * Runs the whole sign-out (#1269): fence, revoke, forget. Resolves `'kept'` when the server
     * never confirmed the revocation — nothing was removed, and the caller must leave the chart on
     * the stand and the songbook exactly where they are.
     *
     * The caller stops playback and clears the account's recovery slots around this; neither
     * belongs to a hook that knows only about the session.
     */
    signOut: () => Promise<SignOutOutcome>;
    /**
     * The local half of sign-out, for an account the server has ALREADY deleted (#1271).
     *
     * Same ordered work as `signOut` — fence first, then forget this device's account records —
     * but with no revocation request in front of it: `POST /api/auth/account/delete` deleted the
     * session row and cleared the cookie on its own response, so a logout round trip could only
     * answer "already gone", and a failure of it would be indistinguishable from the account still
     * existing. The revoke step is therefore a resolved `true`, which is the honest answer here: it
     * means "the server has confirmed this session is gone", and it has, by deleting it.
     *
     * Unlike `signOut` this cannot resolve `'kept'`. There is nothing to keep.
     *
     * THROWS when the local half did not finish — the fence write (`songbook.switchAccount`)
     * itself failed on unreadable storage — so the caller's own error handling (`ensemble.tsx`'s
     * `run()`) shows `SIGN_OUT_MESSAGES.notCleared` instead of a misleading "Account deleted"
     * success message. `markSignedOut` still runs first: the account is gone on the server
     * whatever this device's storage did, and nothing may offer "sign in again" to it.
     *
     * Since #1351 that last rule has a second surface to hold on: a deletion whose local clear
     * failed leaves this device HOLDING an account, which is what the held-account banner renders
     * for. The shell remembers that a deletion ran in this tab and asks for
     * `heldAccountBanner('deleted')`, which states the fact and offers no sign-in control at all —
     * only the step that finishes removing the songs (patch N1).
     */
    forgetDeletedAccount: () => Promise<void>;
    /**
     * The local half of sign-out for an EXPIRED session (#1351) — "Sign out on this device".
     *
     * The third and last way the same ordered work is reached, and the only one that needs no
     * network: the server session is already dead, so `revoke` is a resolved `true` exactly as
     * `forgetDeletedAccount`'s is, and rollout decision 9 S2's "sign-out needs a connection" does
     * not apply — there is nothing to revoke, so there is nothing this device could be dishonest
     * about having revoked. It works offline.
     *
     * `owner` is the account the expired banner is talking about, named rather than derived: the
     * expiry detached the loop, so there is no attached scope to read one from. The loop compares
     * it to the account this device actually holds and refuses a mismatch BEFORE the fence moves —
     * which is why that failure must not reach `markSignedOut`: nothing was cleared, and this
     * device is still exactly what it was.
     *
     * THROWS only when NOTHING happened, with the sentence that fits: `elsewhere` when this device
     * holds somebody else's account now, `notChanged` when the fence write itself failed. A clear
     * that failed AFTER the fence moved does not throw — `signOut` reports that one on the loop's
     * snapshot, having put the owner back so the step stays reachable for a retry. The caller
     * renders either inside the step's own dialog (#1351 patch R3), never behind it.
     */
    signOutOnThisDevice: (owner: string) => Promise<void>;
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
    const [fellBack, setFellBack] = useState(false);
    // Whether the first read has resolved, for the deadline below to check. A ref, not the
    // `settled` state: the timer closes over the value it was scheduled with, and re-scheduling
    // it on every settle change would restart the deadline instead of honouring it.
    const answered = useRef(false);
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
            answered.current = true;
            if (mounted.current) {
                setSettled(true);
                // An answer retires the fallback notice whenever it lands — including long after
                // the deadline, which is the whole case the notice was written for.
                setFellBack(false);
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
        if (!active) {
            return;
        }
        let alive = true;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        answered.current = false;
        /**
         * The first read is BOUNDED, because since the cutover (#1357) accounts are on by default:
         * `songbookLoading` in `ensemble.tsx` waits for `settled` to know which library it is
         * showing, and `lib/account/api.ts` sets no deadline of its own — deliberately, since a
         * Save upload has no business being cut off mid-flight. A server that REFUSES the
         * connection rejects at once and needs none of this; one that accepts and then says
         * nothing would otherwise leave the song list behind "Loading your songbook…" for as long
         * as the tab stays open. Settling on the timer claims exactly what settling on a failed
         * read already claims — this device has asked, and the guest songbook is the honest
         * fallback — and a late answer still applies, because `refresh` sets the session state
         * whenever it lands. It is not a SILENT claim either: `fellBack` is what the songbook says
         * it out loud with (patch P1-4).
         */
        const askTheServer = () => {
            refresh();
            deadline = setTimeout(() => {
                if (answered.current || !mounted.current) {
                    return;
                }
                setSettled(true);
                setFellBack(true);
            }, FIRST_READ_DEADLINE_MS);
        };
        // A device that has never held an account is asked NOTHING on its behalf (#1357 patch) —
        // `deviceMayHoldAccount` explains why that is a guest-boundary rule before it is anything
        // else, and what it cost to find out. Settled at once: there is no question outstanding,
        // so there is nothing to wait for and nothing to fall back from.
        void deviceMayHoldAccount().then((may) => {
            if (!alive) {
                return;
            }
            if (!may) {
                answered.current = true;
                if (mounted.current) {
                    setSettled(true);
                }
                return;
            }
            askTheServer();
        });
        return () => {
            alive = false;
            clearTimeout(deadline);
        };
    }, [active, refresh]);

    const runSignOut = useCallback(async (): Promise<SignOutOutcome> => {
        setSigningOut(true);
        setSignOutFailure(null);
        let refusal: AccountFailure | null = null;
        // Read through a call: control-flow analysis does not follow the assignment made inside
        // the callback below, so a direct read narrows to the `null` it was initialized with.
        const refused = () => refusal;
        try {
            const outcome = await accountSync.signOut(async () => {
                const result = await signOut(accountApi);
                if (!result.ok) {
                    refusal = result.failure;
                }
                // `POST /api/auth/logout` is idempotent and answers 204 even with no session
                // cookie at all, so `ok` is the server having confirmed there is no session left.
                return result.ok;
            });
            if (outcome === 'signed-out') {
                // Before the refresh below, which would otherwise read this deliberate sign-out's
                // own 401 as an expiry and offer "Sign in again" to somebody who just left.
                accountSession.markSignedOut();
            }
            return outcome;
        } finally {
            if (mounted.current) {
                setSigningOut(false);
                setSignOutFailure(refused());
            }
            // Either way: on success the server has revoked the session, and on failure the only
            // honest thing to do is re-read who the server still thinks we are.
            refresh();
        }
    }, [refresh]);

    const forgetDeletedAccount = useCallback(async (): Promise<void> => {
        // The loop turns a failed record WIPE into its own `notCleared` failure and returns
        // normally (`accountSync`'s own `state.failure`, read by `ensemble.tsx` via
        // `accountSync.getSnapshot().failure`) — that path needs nothing extra here. What reaches
        // this `catch` is the FENCE write (`songbook.switchAccount`) itself throwing: `signOut`
        // re-attaches this device to the (deleted) owner and restores whatever `state.failure`
        // held before the attempt — typically `null` — before rethrowing, so by the time this
        // catch runs, the loop no longer has any record that anything went wrong. Left silent,
        // that would send `ensemble.tsx`'s `forgetDeletedAccount` (which reads exactly that
        // now-blank `state.failure`) straight to "Account deleted · your guest songbook is
        // unchanged" while the account's records — re-attached, not cleared — are still on this
        // device. Rethrowing the friendly sentence routes it through the same `run()` error
        // handling every other failure in the shell already uses.
        let localWipeFailed = false;
        try {
            await accountSync.signOut(async () => true);
        } catch {
            localWipeFailed = true;
        } finally {
            // A deletion that has already committed must reach `markSignedOut` whatever storage
            // did. Being told to "sign in again" to an account that no longer exists is the one
            // reading this must never produce.
            accountSession.markSignedOut();
            refresh();
        }
        if (localWipeFailed) {
            throw new Error(SIGN_OUT_MESSAGES.notCleared);
        }
    }, [refresh]);

    // No `refresh()` anywhere below, and that is the point rather than an omission: this path makes
    // NO request of any kind, so it works with the network off. `signOut`'s sibling paths re-read
    // the session because something just happened on the server that this device should hear about;
    // here nothing did — the session was already gone before the musician pressed anything, and
    // `markSignedOut` states the one fact a read could have confirmed. A `GET /api/auth/session`
    // would answer 401 into a store that is already `guest`, which is a request spent to learn
    // nothing and a failure to swallow whenever this runs offline.
    const signOutOnThisDevice = useCallback(async (owner: string): Promise<void> => {
        // NOTHING HAPPENED if this throws (#1351 patch R2). A failed `clearAccount` does not
        // reach here at all — `signOut` turns it into its own `notCleared` failure on the snapshot
        // and returns normally — so the only throws are `heldScope` refusing the named account and
        // the fence write itself failing, and in both the fence never moved and every row is still
        // on the disk. `markSignedOut` would be wrong for either: it takes the device to `guest`,
        // and with the sign-out surface derived from `meta.active` that is a state the retry is
        // still reachable from, but claiming the session was resolved when it was not is a lie
        // this hook has no business telling. The sentence is what is owed instead.
        try {
            await accountSync.signOut(async () => true, owner);
        } catch (error) {
            throw new Error(
                error instanceof AccountMismatchError
                    ? SIGN_OUT_MESSAGES.elsewhere
                    : // NOT `notCleared` (#1351 patch N2): that sentence opens "Signed out —",
                      // and nothing here was signed out of. The fence never moved and not a row
                      // was touched, so the honest answer is that nothing changed.
                      SIGN_OUT_MESSAGES.notChanged,
            );
        }
        // The session was dead before this ran; `markSignedOut` is what stops the header and the
        // expired banner going on offering "sign in again" for an account whose records this
        // device has just removed.
        accountSession.markSignedOut();
    }, []);

    return {
        session,
        recoveryEnrolled: enrolled,
        settled,
        fellBack,
        signingOut,
        online,
        signOutFailure,
        refresh,
        signOut: runSignOut,
        forgetDeletedAccount,
        signOutOnThisDevice,
    };
}
