'use client';

import type { AccountFailure } from '../../lib/account/messages';
import type { SessionState } from '../../lib/account/session';

/**
 * The account entry point in the site header (#1262) — presentational, props only, like every
 * other surface the shell hands props to.
 *
 * `unknown` renders "Sign in" rather than nothing: the first session read can be slow, or fail
 * outright with the API unreachable, and a device that opted in should still see its way in
 * (where it will get the "can't reach the server" explanation) instead of an entry point that
 * silently never appears. Being wrong in that direction costs one pointless click; being wrong
 * the other way hides the feature.
 *
 * Sign out needs a round trip to revoke the server session (rollout decision 9 S2: "Offline,
 * sign-out is disabled with a reason and export stays available"), so it is disabled with a
 * visible, honest reason whenever `online` is false, rather than shipping enabled and failing
 * silently against a server it cannot reach.
 *
 * `onOpenAccount` (#1264) opens the account page — passkeys, sessions, recovery code. Reachable
 * whether or not the account is protected: an unprotected account still has a passkey list worth
 * seeing, and "Replace recovery code" works with or without a prior confirmed code.
 */

const OFFLINE_REASON = 'Sign out needs a connection';

interface AccountEntryProps {
    session: SessionState;
    /** Signed in, with the server reporting no confirmed recovery code — an abandoned enrolment. */
    unprotected: boolean;
    busy: boolean;
    online: boolean;
    /** Set only when the last sign-out attempt reached the server and was refused. */
    signOutFailure: AccountFailure | null;
    onSignIn: () => void;
    onFinishProtecting: () => void;
    onOpenAccount: () => void;
    onSignOut: () => void;
}

export function AccountEntry({
    session,
    unprotected,
    busy,
    online,
    signOutFailure,
    onSignIn,
    onFinishProtecting,
    onOpenAccount,
    onSignOut,
}: AccountEntryProps) {
    if (session.status === 'signedIn') {
        return (
            <span className="account-entry" data-testid="account-entry">
                {unprotected ? (
                    <>
                        <button
                            className="account-btn account-warn"
                            data-testid="account-finish-protecting"
                            onClick={onFinishProtecting}
                        >
                            Finish protecting your account
                        </button>
                        <button
                            className="account-btn"
                            data-testid="account-open"
                            onClick={onOpenAccount}
                        >
                            Account
                        </button>
                    </>
                ) : (
                    <button
                        className="account-state"
                        data-testid="account-state"
                        // The visible word is the state; the accessible name has to be what the
                        // control DOES, or a screen reader announces "Signed in, button" and
                        // leaves the account page undiscoverable.
                        aria-label="Your account — signed in"
                        onClick={onOpenAccount}
                    >
                        Signed in
                    </button>
                )}
                <button
                    className="account-btn"
                    data-testid="account-sign-out"
                    disabled={busy || !online}
                    title={online ? undefined : OFFLINE_REASON}
                    onClick={onSignOut}
                >
                    Sign out
                </button>
                {!online && (
                    <span className="account-status-detail" data-testid="account-offline-note">
                        {OFFLINE_REASON}
                    </span>
                )}
                {signOutFailure !== null && signOutFailure.kind !== 'cancelled' && (
                    <span
                        className="account-status-detail"
                        role="alert"
                        data-testid="account-sign-out-error"
                    >
                        {signOutFailure.message}
                    </span>
                )}
            </span>
        );
    }
    return (
        <span className="account-entry" data-testid="account-entry">
            <button className="account-btn" data-testid="account-sign-in" onClick={onSignIn}>
                {session.status === 'expired' ? 'Sign in again' : 'Sign in'}
            </button>
        </span>
    );
}
