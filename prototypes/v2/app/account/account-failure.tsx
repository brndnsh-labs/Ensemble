'use client';

import type { AccountFailure } from '../../lib/account/messages';

/**
 * The one way an `AccountFailure` is rendered, shared by every account surface (#1262, extracted
 * for #1263).
 *
 * A `notice` is an expected answer, not a fault — `registration_closed` is what the server says
 * while sign-ups are closed by policy or the account cap is full — so it gets calm styling and
 * `role="status"`, never the error treatment. A `cancelled` failure renders nothing at all: the
 * person dismissed a platform prompt, which is an answer, not a problem to report back to them.
 *
 * Every message here came out of `lib/account/messages.ts`. Nothing else may be passed in: a raw
 * server code, an HTTP status or an exception message must never reach the DOM.
 */
export function AccountFailureNotice({ failure }: { failure: AccountFailure | null }) {
    if (failure === null || failure.kind === 'cancelled') {
        return null;
    }
    return failure.kind === 'notice' ? (
        <p className="account-notice" role="status" data-testid="account-notice">
            {failure.message}
        </p>
    ) : (
        <p className="account-error" role="alert" data-testid="account-error">
            {failure.message}
        </p>
    );
}
