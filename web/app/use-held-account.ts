import { useEffect, useState } from 'react';
import { heldAccountBanner } from '../lib/account/messages';
import { accountSync, type SyncSnapshot } from '../lib/account/sync-loop';
import type { AccountView } from './account/use-account-session';

/**
 * Which account this device HOLDS, from storage (#1351 patch R1) — `meta.active`, through the
 * loop rather than by reaching into the repository.
 *
 * Module-level so both readers share one expression: `useHeldAccount`'s effect that watches the
 * transitions which can change it, and `useAccountExit`'s clears (handed it as a prop), which
 * have just changed it.
 *
 * An unreadable store answers null, which hides the sign-out offer rather than showing one that
 * cannot name what it would clear — the conservative direction, and the same one `heldScope`
 * takes when it refuses.
 */
function heldAccount(): Promise<string | null> {
    return accountSync.heldOwner().catch(() => null);
}

/** What the shell hands `useHeldAccount`. */
interface HeldAccountOptions {
    /** The guest songbook is up: the storage read never runs on the first-paint path. */
    ready: boolean;
    /** The account session, and whether its first read has answered (or the deadline released it). */
    account: Pick<AccountView, 'session' | 'settled'>;
    /**
     * The loop's attached owner (`sync.owner`), or null: read only as the effect's re-run
     * trigger, since an attach is what moves `meta.active` to a new owner.
     */
    owner: SyncSnapshot['owner'];
}

/**
 * The held-account fact (#1351): which account this device's STORAGE holds, independent of the
 * session — the two owners it is read into, the banner's condition (`heldWithoutSession`), which
 * of its three sentences it says (`banner`), and the effect that re-reads storage on every
 * transition that can change it. `heldAccount` comes back too, for `useAccountExit`'s clears.
 * Call it before `useAccountExit`, which takes `heldOwner`, `setHeldOwner`, `setDeletedOwner`,
 * `heldWithoutSession` and `heldAccount`.
 */
export function useHeldAccount({ ready, account, owner }: HeldAccountOptions) {
    /**
     * Which account this device HOLDS on disk, or null (#1351, storage-derived per patch R1).
     *
     * A STORAGE fact, read through `heldAccount()`, never a mirror of anything in memory. That is
     * the whole correction: an earlier draft followed the loop's published owner, which made the
     * sign-out offer depend on the session state — and `expired` only exists in the page load
     * where a live session lapsed (`session.ts` moves a `signedIn` session to `expired`, and a
     * cold `unknown` straight to `guest`). So a RELOAD of an expired device landed on `guest` with
     * every one of that account's rows still here and nothing on screen able to name them, which
     * is exactly the sequence this story exists for: the device changes hands, and it is restarted
     * in between.
     *
     * Written in two places, one expression: the effect below, on every transition that can change
     * it, and the sign-out cleanup, which has just changed it and re-reads rather than assuming —
     * a clear that failed after the fence moved puts the owner back (patch R2), and the offer has
     * to come back with it or the retry is unreachable.
     */
    const [heldOwner, setHeldOwner] = useState<string | null>(null);
    /**
     * The owner a DELETION ran for in this tab, when its local clear did not finish (#1351 patch
     * N1). In-memory on purpose: it is the one thing storage cannot tell us apart — `meta.active`
     * naming an account looks identical whether that account still exists or was deleted a second
     * ago — and a reload legitimately falls back to the generic held-account sentence, which stays
     * true. What it buys is that this tab never offers to sign in to an account it just deleted.
     */
    const [deletedOwner, setDeletedOwner] = useState<string | null>(null);
    /**
     * This device HOLDS an account and has no live session for it (#1351 patch R1) — the banner's
     * condition, and the one state in which "Sign out on this device" exists.
     *
     * Two routes into it, and the honest condition covers both because it asks storage rather than
     * the session: the session lapsed in this page load (`expired`), or it lapsed and the page was
     * reloaded, which lands on `guest` with `meta.active` unchanged. `unknown` is excluded, not
     * treated as guest — before the first session read this device does not know whether it has a
     * live session, and offering to clear the account on that basis would be a guess.
     *
     * A plain guest device that has never signed in holds nothing, so `heldOwner` is null and this
     * is false without the session state ever mattering.
     */
    const heldWithoutSession =
        heldOwner !== null &&
        (account.session.status === 'expired' || account.session.status === 'guest');
    /**
     * Which of the three things that banner is about (#1351 patch N1) — because ONE sentence said
     * in all three states is a lie in two of them. `deleted` outranks the session state: this tab
     * watched the account go, and "sign in again" must never be offered for it.
     */
    const banner = heldAccountBanner(
        heldOwner !== null && heldOwner === deletedOwner
            ? 'deleted'
            : account.session.status === 'expired'
              ? 'expired'
              : 'guest',
    );
    /**
     * #1351 patch R1 — read which account this device HOLDS, from storage.
     *
     * Deliberately off the guest first-paint path, on two counts: `ready` means the guest
     * songbook is already up, and `settled` means the first session read has answered (or the
     * deadline released it). Nothing here is ever awaited by startup or by playback.
     *
     * `unknown` is excluded rather than read: the answer would be fine, but acting on it is not —
     * see `heldWithoutSession`.
     *
     * `owner` (`sync.owner`) is not read in the body: it is the loop's "I attached or detached"
     * signal, and `attach` is what moves `meta.active` to a new owner — re-running this read is
     * exactly why the effect depends on it. The only other thing that moves the pointer is the
     * clear, which writes `heldOwner` itself rather than going round through a counter.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `owner` is listed but not read: it is the deliberate re-run trigger described above.
    useEffect(() => {
        if (!ready || !account.settled || account.session.status === 'unknown') {
            return;
        }
        let alive = true;
        void heldAccount().then((held) => {
            if (alive) {
                setHeldOwner(held);
            }
        });
        return () => {
            alive = false;
        };
    }, [ready, account.settled, account.session.status, owner]);
    return { heldOwner, setHeldOwner, setDeletedOwner, heldWithoutSession, banner, heldAccount };
}
