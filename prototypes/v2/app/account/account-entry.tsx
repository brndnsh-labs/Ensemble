'use client';

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
 */

interface AccountEntryProps {
    session: SessionState;
    /** Signed in, with the server reporting no confirmed recovery code — an abandoned enrolment. */
    unprotected: boolean;
    busy: boolean;
    onSignIn: () => void;
    onFinishProtecting: () => void;
    onSignOut: () => void;
}

export function AccountEntry({
    session,
    unprotected,
    busy,
    onSignIn,
    onFinishProtecting,
    onSignOut,
}: AccountEntryProps) {
    if (session.status === 'signedIn') {
        return (
            <span className="account-entry" data-testid="account-entry">
                {unprotected ? (
                    <button
                        className="account-btn account-warn"
                        data-testid="account-finish-protecting"
                        onClick={onFinishProtecting}
                    >
                        Finish protecting your account
                    </button>
                ) : (
                    <span className="account-state" data-testid="account-state">
                        Signed in
                    </span>
                )}
                <button className="account-btn" disabled={busy} onClick={onSignOut}>
                    Sign out
                </button>
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
