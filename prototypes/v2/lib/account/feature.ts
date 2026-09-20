/**
 * The per-device account switch (#1262; default flipped ON by the cutover, #1357).
 *
 * The dark launch is over. This app is the site, accounts shipped, and a musician who opens it
 * gets the entry point without having to know a query parameter. What survives from the beta is
 * the per-device switch, INVERTED: `?accounts=off` turns every account surface off for this
 * browser profile — the entry point, the dialog and, crucially, every `/api/*` request — and
 * `?accounts=on` is the way back. A profile that has never asked gets the product.
 *
 * Still not a build flag, for the reason it never was: the switch has to be exercisable against
 * the real deployment. The stored value is now an opt-OUT, which is what makes the inversion
 * free — nothing has ever written `'off'`, so no device is opted out by accident, and a beta
 * profile still carrying the old `'on'` reads as on, which is the default anyway.
 *
 * The flag is a per-device convenience under v2's existing `localStorage` prefix (`lib/session.ts`
 * owns the same namespace), never a document field and never a security boundary — a device that
 * has it on gets the UI, not an account. Authorization still comes only from a verified server
 * session. Every storage access is wrapped: a private window, blocked site data or a quota error
 * must leave the app playable, which for this flag now means the DEFAULT rather than "off" —
 * see `accountsEnabled`.
 */

import { hasV1SharePayload } from '../v1-link';

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

/**
 * On unless THIS device has explicitly opted out.
 *
 * Unreadable storage answers `true` — the default — because the stored value is an opt-OUT and a
 * device that cannot be asked has not opted out of anything. Answering "off" instead would hide
 * the sign-in button from exactly the profile most likely to be a private window or a locked-down
 * borrowed browser, and it would not even be a stable answer: the same blocked storage cannot
 * persist an opt-out either, so every reload would ask again. What "on" costs a profile with no
 * session is one `GET /api/auth/session` after the songbook is up (`use-account-session.ts`),
 * which no startup or playback path awaits.
 */
export function accountsEnabled(): boolean {
    try {
        return localStorage.getItem(ACCOUNTS_FLAG) !== 'off';
    } catch {
        return true;
    }
}

export function setAccountsEnabled(enabled: boolean): void {
    try {
        if (enabled) {
            // Removed rather than set to 'on': an absent key is the default state, so coming
            // back leaves no trace — and it retires a beta profile's old opt-in value on the way.
            localStorage.removeItem(ACCOUNTS_FLAG);
        } else {
            localStorage.setItem(ACCOUNTS_FLAG, 'off');
        }
    } catch {
        // The choice simply does not persist past this page; nothing else depends on it.
    }
}

/**
 * What `syncAccountsFlag` should do with a `?accounts=` request, given the URL's hash too.
 *
 * A share link must never carry a feature-flag side effect: a stranger who only meant to open a
 * shared song would otherwise have this device's account UI flipped — since #1357 the side effect
 * worth naming is `?accounts=off`, which would silently take the product's account surfaces away
 * from whoever followed the link. So the request is ignored outright — not merely left unpersisted — whenever the URL is a share link,
 * whatever it asked for. There are two shapes of one, and both are refused:
 *
 * - a v2 payload, which lives in the hash (`ensemble.tsx`'s `decodeChartLink`) — any non-empty
 *   hash, since a `#chart=` that fails to decode is still somebody's attempt at a share link;
 * - an old v1 payload (#1279), which is a QUERY-string link with no hash at all, so the hash
 *   test above cannot see it — `hasV1SharePayload` is what recognises `/v2/?s=…&accounts=on`.
 *
 * Refusing to APPLY it is only half: the shell also strips the parameter when it consumes a
 * share link (`stripAccountsParam` below), so a reload of the tidied URL cannot apply it either.
 */
export function accountsFlagRequest(search: string, hash: string): AccountsFlagRequest {
    if (hash !== '' || hasV1SharePayload(search)) {
        return null;
    }
    return accountsFlagFromSearch(search);
}

/**
 * The query string without the account flag, for a caller that is rewriting the URL for its own
 * reasons — the shell, consuming a share link. Lives here because this module owns the parameter
 * name; `syncAccountsFlag` below keeps its own whole-URL form, which has a hash to preserve.
 */
export function stripAccountsParam(search: string): string {
    const params = new URLSearchParams(search);
    params.delete(ACCOUNTS_PARAM);
    const rest = params.toString();
    return rest ? `?${rest}` : '';
}

/**
 * Applies any `?accounts=on|off` request, strips the parameter from the address bar, and reports
 * whether the account UI is enabled for this device. Safe to call only after mount — it touches
 * `location`, `history` and `localStorage`, none of which exist during the static export's
 * prerender (which is also why `useAccountsEnabled` resolves it in an effect, not during render).
 *
 * The parameter is removed with `replaceState` so it never survives into a shared or bookmarked
 * URL: the choice belongs to the device, and a link carrying it would silently change the account
 * surfaces for whoever opened it. A request riding alongside a share hash is never applied at
 * all (see `accountsFlagRequest`), so the flag setter above is never reached for one.
 */
export function syncAccountsFlag(): boolean {
    const requested = accountsFlagRequest(window.location.search, window.location.hash);
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
