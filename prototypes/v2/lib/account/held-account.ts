/**
 * The held-account marker (#1357): whether this device has any reason to ask the server who it is.
 *
 * A leaf on purpose. `sync-loop.ts` writes this beside every move of the `meta.active` fence, and
 * the sync layer must not reach the document codec to do it — `feature.ts`, where this first
 * lived, imports `v1-link`, which imports `documents.ts` and the whole `@engine` songbook with it.
 * Nothing here may import more than the protocol constants.
 */

import { ACCOUNT_DATABASE } from '../sync/protocol';

const HELD_FLAG = 'ensemble-v2-preview:account-held';

/**
 * Whether this device has any reason to ask the server who it is (#1357 patch).
 *
 * A device that has never held an account cannot have a session to discover: signing in is what
 * creates its records, and that path asks for itself. So the bootstrap `GET /api/auth/session`
 * is skipped for it entirely — no request, and therefore no account database either, since
 * `ensemble.tsx`'s held-account read is gated on the session having answered.
 *
 * That is a guest-boundary rule before it is anything else — a musician who never signed in
 * should not have this app talking to a server on their behalf — but it was found the hard way.
 * With accounts on by default, that one request fires on EVERY load including an offline one,
 * where it fails against a dead socket, and on WebKit a failed request in the window around a
 * service-worker-served navigation loses the GUEST database: measured 2026-09-20 on
 * `checks/semantic-chart.spec.ts` at 7 failures in 180 against 0 in 180 with the flag off and 0
 * in 180 on `main`, with a trace showing `indexedDB.open('ensemble-v2-preview', 1)` firing
 * `upgradeneeded` and returning zero object stores seconds after the app had listed songs out of
 * it. Answering the same read locally, with no socket, was 20/20 green — including the account
 * database being created and opened, which is how we know the second database was never the
 * problem. Their songbook is not worth one request nobody needed.
 *
 * The marker MIRRORS `meta.active`, which `lib/sync/repository.ts`'s `switchAccount` owns and
 * `lib/account/sync-loop.ts`'s `moveFence` mirrors from, so the two cannot drift. Three states,
 * and the absent one matters: a device that signed in under an older build has account records
 * and no marker, so "absent" is resolved ONCE against `indexedDB.databases()` and then written
 * down. Anything this cannot answer — no `databases()`, a rejection, unreadable storage — reads
 * as "ask", because a missing marker must never be what hides a held account.
 */
export async function deviceMayHoldAccount(): Promise<boolean> {
    let stored: string | null;
    try {
        stored = localStorage.getItem(HELD_FLAG);
    } catch {
        return true;
    }
    if (stored === 'yes' || stored === 'no') {
        return stored === 'yes';
    }
    const existing = await accountDatabaseExists();
    if (existing !== null) {
        rememberAccountHeld(existing);
    }
    return existing ?? true;
}

/** `null` when this browser cannot be asked, which is not the same as "no". */
async function accountDatabaseExists(): Promise<boolean | null> {
    try {
        if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
            return null;
        }
        const existing = await indexedDB.databases();
        return existing.some((database) => database.name === ACCOUNT_DATABASE);
    } catch {
        return null;
    }
}

/**
 * Records whether this device holds account records, beside every move of the `meta.active`
 * fence it mirrors. Written rather than removed in both directions: an absent marker means "not
 * asked yet" and costs a `databases()` probe, while `'no'` is an answer worth keeping.
 */
export function rememberAccountHeld(held: boolean): void {
    try {
        localStorage.setItem(HELD_FLAG, held ? 'yes' : 'no');
    } catch {
        // Unreadable storage already answers `true` above: it asks, every load.
    }
}
