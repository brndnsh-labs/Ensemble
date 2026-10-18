'use client';

import type { SessionState } from '../../lib/account/session';

/**
 * The account entry point in the site header (#1262) — presentational, props only, like every
 * other surface the shell hands props to.
 *
 * `unknown` renders "Sign in" rather than nothing: the first session read can be slow, or fail
 * outright with the API unreachable, and a musician should still see their way in (where they
 * will get the "can't reach the server" explanation) instead of an entry point that
 * silently never appears. Being wrong in that direction costs one pointless click; being wrong
 * the other way hides the feature.
 *
 * Signed in, the header holds only the account chip (#1760): "Signed in", or "Finish protecting
 * your account" beside "Account" for an account with no recovery code. Each opens the account
 * page (#1264) — passkeys, sessions, recovery code — and Sign out lives there now
 * (`account-page.tsx`), with its offline reason, not as a bare button in the header.
 */

interface AccountEntryProps {
    session: SessionState;
    /** Signed in, with the server reporting no confirmed recovery code — an abandoned enrolment. */
    unprotected: boolean;
    onSignIn: () => void;
    onFinishProtecting: () => void;
    onOpenAccount: () => void;
}

export function AccountEntry({
    session,
    unprotected,
    onSignIn,
    onFinishProtecting,
    onOpenAccount,
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
