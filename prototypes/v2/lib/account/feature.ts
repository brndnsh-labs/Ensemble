/**
 * The dark-launch gate for every account surface (#1262, orchestrator DECISION 2026-09-17).
 *
 * Merging to `main` publishes this app to the public `/v2/` beta, and accounts are not finished:
 * prod registration stays closed by policy until #1272 lands, the sign-out preflight is #1269 and
 * passkey management is #1264. So the entry point, the dialog and — crucially — every `/api/*`
 * request are hidden behind a PER-DEVICE opt-in: visiting `/v2/?accounts=on` turns them on for
 * this browser profile, `?accounts=off` turns them back off, and a profile that has never asked
 * sees the app exactly as it was before this story. Not a build flag, because the whole point is
 * being able to exercise the real thing on the real deployment without exposing it.
 *
 * The flag is a per-device convenience under v2's existing `localStorage` prefix (`lib/session.ts`
 * owns the same namespace), never a document field and never a security boundary — a device that
 * flips it on gets the UI, not an account. Authorization still comes only from a verified server
 * session. Every storage access is wrapped: a private window, blocked site data or a quota error
 * must leave the app playable, which for this flag means "off".
 */

const ACCOUNTS_FLAG = 'ensemble-v2-preview:accounts';
const ACCOUNTS_PARAM = 'accounts';

/** What a `?accounts=` query parameter is asking for, or `null` when it is absent/unrecognized. */
export type AccountsFlagRequest = 'on' | 'off' | null;

export function accountsFlagFromSearch(search: string): AccountsFlagRequest {
    const value = new URLSearchParams(search).get(ACCOUNTS_PARAM);
    if (value === 'on') {
        return 'on';
    }
    return value === 'off' ? 'off' : null;
}

export function accountsEnabled(): boolean {
    try {
        return localStorage.getItem(ACCOUNTS_FLAG) === 'on';
    } catch {
        // No readable storage means no opt-in on record, which is the safe answer.
        return false;
    }
}

export function setAccountsEnabled(enabled: boolean): void {
    try {
        if (enabled) {
            localStorage.setItem(ACCOUNTS_FLAG, 'on');
        } else {
            // Removed rather than set to 'off': an absent key is the default state, so opting
            // back out leaves no trace of the experiment behind.
            localStorage.removeItem(ACCOUNTS_FLAG);
        }
    } catch {
        // The opt-in simply does not persist past this page; nothing else depends on it.
    }
}

/**
 * Applies any `?accounts=on|off` request, strips the parameter from the address bar, and reports
 * whether the account UI is enabled for this device. Safe to call only after mount — it touches
 * `location`, `history` and `localStorage`, none of which exist during the static export's
 * prerender (which is also why `useAccountsEnabled` resolves it in an effect, not during render).
 *
 * The parameter is removed with `replaceState` so it never survives into a shared or bookmarked
 * URL: the opt-in belongs to the device, and a link carrying it would silently enable unfinished
 * account UI for whoever opened it.
 */
export function syncAccountsFlag(): boolean {
    const requested = accountsFlagFromSearch(window.location.search);
    if (requested !== null) {
        setAccountsEnabled(requested === 'on');
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete(ACCOUNTS_PARAM);
            window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
        } catch {
            // A refused history write costs only a tidy URL.
        }
    }
    return accountsEnabled();
}
