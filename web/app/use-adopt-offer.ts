import {
    type Dispatch,
    type RefObject,
    type SetStateAction,
    useEffect,
    useRef,
    useState,
} from 'react';
import {
    computeAdoptCandidates,
    hasDecidedAdoption,
    libraryDownloaded,
    pendingGuestCollections,
} from '../lib/account/adopt-guest';
import type { SyncSnapshot } from '../lib/account/sync-loop';
import type { AccountDialogMode } from './account/sign-in';
import { useModalDialog } from './use-modal-dialog';

/** What the shell hands `useAdoptOffer`. */
interface AdoptOfferOptions {
    /**
     * The loop's published snapshot: its `owner` is the attached account, or null, and its
     * `documents` the account library's download progress (`UNOBSERVED` until a download has
     * paged the whole manifest).
     */
    sync: Pick<SyncSnapshot, 'owner' | 'documents'>;
    /** The session is signed in. */
    signedIn: boolean;
    /** The sign-in dialog's mode while it is open, else null. */
    accountDialog: AccountDialogMode | null;
    /** A chart is on the stand. */
    onStand: boolean;
    /**
     * The owner this device has already been offered the copy for during this attach (#1268
     * patch review P3-6a). The shell's ref: `useAccountExit` clears it on a sign-out too.
     */
    adoptOffered: RefObject<string | null>;
    /** The guest songbook's `count()` from its home slice, or null before one is read. */
    guestSongCount: number | null;
}

/** What the adoption dialog and the account page's button read back. */
interface AdoptOffer {
    /** The adoption dialog is open. */
    adoptOpen: boolean;
    /** Opens or closes it (the account page's button, the dialog's own close). */
    setAdoptOpen: Dispatch<SetStateAction<boolean>>;
    /** The adoption dialog's `<dialog>`. */
    adoptDialogRef: RefObject<HTMLDialogElement | null>;
}

/**
 * The signed-in adoption offer (#1268's whole-songbook copy, #1477's collections offer): the
 * dialog's open state, its `<dialog>`, and the effects that open it once per sign-in and clear it
 * with the session. The shell keeps `adoptOffered` (`useAccountExit` clears it too) and the
 * account page's button that opens it by hand. Call it after `useAccountExit`, where these
 * effects always ran.
 */
export function useAdoptOffer({
    sync,
    signedIn,
    accountDialog,
    onStand,
    adoptOffered,
    guestSongCount: guestCount,
}: AdoptOfferOptions): AdoptOffer {
    // #1268 — copy this device's guest songs into the account: opened automatically once per
    // (device, owner) after a sign-in that finds candidates and has not been answered yet, and
    // manually from the account page's "Add this device's songs" button at any later time.
    const [adoptOpen, setAdoptOpen] = useState(false);
    /**
     * Is an offer on screen right now (#1359 patch P2-2)?
     *
     * A mirror of `adoptOpen` rather than the state itself, because the sign-in effect below must
     * be able to BAIL on it without taking it as a dependency: in the dependency array it would
     * re-run the moment a dialog closed, and an offer the musician escaped without answering would
     * be reopened as the whole-songbook question — the nag `adoptOffered` exists to prevent.
     */
    const adoptOnScreen = useRef(false);
    const adoptDialogRef = useModalDialog(adoptOpen);
    useEffect(() => {
        // Mirrored here rather than written during render, the way the dialog itself mirrors its
        // own `open` prop: one place that knows whether a question is on screen (#1359).
        adoptOnScreen.current = adoptOpen;
    }, [adoptOpen]);
    /**
     * An offer cannot outlive the session it is about (#1359 patch P1-2).
     *
     * The dialog only renders while signed in, so a sign-out (or an expiry) with one on screen
     * takes the dialog away without touching `adoptOpen` — which then stays true, and every later
     * `setAdoptOpen(true)` is a no-op transition that never reaches `showModal`. Clearing the flag
     * with the session is what keeps the account page's standing button working after signing back
     * in during the same page load.
     */
    useEffect(() => {
        if (!signedIn) {
            setAdoptOpen(false);
        }
    }, [signedIn]);
    /**
     * The inputs the last COMPLETED zero-candidate check ran against (#1441 review P5), or null.
     *
     * `computeAdoptCandidates` reads the whole guest songbook and the whole account library, and
     * this effect re-runs on every download progress publish, every dialog and every return from
     * the stand. When nothing it diffs has changed since a check that found nothing to offer, the
     * answer is the same "nothing", so it is not asked again. The key is the owner, the account
     * library's downloaded counts and the guest songbook's own `count()` — candidates are decided
     * by document ID, so only a song arriving or leaving on either side can change the answer.
     * Only a check that finished with zero candidates is remembered: one that found some opens the
     * offer (and `adoptOffered` takes over), and one that failed or was superseded proves nothing.
     */
    const adoptCheckedKey = useRef<string | null>(null);
    // Read by the effect below without re-running it: a guest write changes the key, and the
    // next ordinary trigger then checks again, exactly when it always would have.
    const guestSongCount = useRef<number | null>(null);
    guestSongCount.current = guestCount;
    /**
     * #1268 — offer the copy once per sign-in, once this device can actually tell what the account
     * already holds. `sync.owner` is the right dependency for the same reason the sign-out preflight
     * effect (`useAccountExit`'s) uses it rather than `signedIn`: it is published only once `attach`
     * actually has a scope, so this cannot race it and open on a scope that isn't ready to be read
     * from yet.
     *
     * `libraryDownloaded(sync.documents)` is the P0 gate (#1268 patch review): the offer is a DIFF
     * against the account library, and `attach` publishes `UNOBSERVED` until a download has paged
     * the whole manifest. Computing it before then diffs against an empty library and re-offers
     * every song the account already has — which on a second device, or after a cloud delete, is a
     * create for a document id the server already holds. `sync.documents` is therefore a
     * dependency: the download lands well after the owner does.
     *
     * `accountDialog !== null` holds this off while the sign-in dialog — including its OWN
     * recovery-code step, which keeps that dialog open well after the account already exists and
     * `sync.owner` is already set — is still showing. Without it this raced a second `showModal()`
     * on top of the first, blocking "Not now"/"Finish" underneath it. `accountDialog` is in the
     * dependency array so this re-evaluates the moment that dialog actually closes, not only when
     * the owner changes.
     *
     * `hasDecidedAdoption` guards a decline (or a completed Add) from ever reopening this on a
     * later sign-in to the same account on this device, and `adoptOffered` guards an ESCAPED
     * prompt — which is deliberately not a decision — from reopening on the next `accountDialog`
     * or download transition within this attach. Finding zero candidates does NOT count as either:
     * nothing was asked, so a guest song created later in this session, or on the next sign-in,
     * still gets offered.
     *
     * `onStand` holds it off while a chart is open. The download gate above means this opens
     * whenever the library lands, and on a slow connection that is after the musician has
     * already opened a song — found on the live test host (2026-09-20), where the modal arrived
     * over a half-typed title and took the Save button away. The question is about the songbook,
     * so it waits for the songbook: `onStand` is a dependency, and going back re-asks it.
     */
    useEffect(() => {
        const owner = sync.owner;
        if (owner === null) {
            // Signed out: this attach is over, and the next one — same account or not — is a
            // fresh offer rather than one this device has already made.
            adoptOffered.current = null;
            adoptCheckedKey.current = null;
            return;
        }
        if (
            accountDialog !== null ||
            onStand ||
            // A question already on screen is never re-asked underneath its own musician (#1359
            // patch P2-2): this effect re-runs whenever the library's counts change, and the
            // account page's own offer carries no `adoptOffered` mark until it opens.
            adoptOnScreen.current ||
            adoptOffered.current === owner ||
            hasDecidedAdoption(owner) ||
            !libraryDownloaded(sync.documents)
        ) {
            return;
        }
        const key = `${owner}|${sync.documents.required}|${sync.documents.verified}|${guestSongCount.current}`;
        if (adoptCheckedKey.current === key) {
            return;
        }
        let alive = true;
        void computeAdoptCandidates(owner)
            .then(async (offer) => {
                // No song to add, but guest collections the account's copies lack (#1477 review
                // R3), is an offer too: the dialog then asks about the collections alone. Only a
                // device that has never answered on this owner reaches it (the gate above): one
                // signing into an account that already holds its songs under the same ids — a
                // second device with the same seeded or imported songs — or one whose songs were
                // adopted without this device being asked. A device that answered before uses
                // the account page's button, which asks no matter what.
                const collections =
                    offer.candidates.length === 0
                        ? await pendingGuestCollections(owner).catch(() => 0)
                        : 0;
                if (alive && offer.candidates.length === 0 && collections === 0) {
                    adoptCheckedKey.current = key;
                }
                if (alive && (offer.candidates.length > 0 || collections > 0)) {
                    adoptOffered.current = owner;
                    setAdoptOpen(true);
                }
            })
            .catch(() => {
                // An unreadable store is not evidence there is nothing to offer; simply don't
                // auto-prompt this time. The account page's own button still reaches this.
            });
        return () => {
            alive = false;
        };
        // `adoptOffered` is the shell's ref, the same object every render, so naming it never
        // re-runs this: it is listed only because, handed in, it is no longer visibly stable.
    }, [sync.owner, sync.documents, accountDialog, onStand, adoptOffered]);
    return { adoptOpen, setAdoptOpen, adoptDialogRef };
}
