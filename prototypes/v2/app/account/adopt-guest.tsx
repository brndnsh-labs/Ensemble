'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';
import {
    type AdoptCandidate,
    type AdoptFailure,
    adoptGuestCollections,
    adoptGuestSongs,
    computeAdoptCandidates,
    pendingGuestCollections,
    rememberAdoptionDecision,
} from '../../lib/account/adopt-guest';
import { AccountMismatchError } from '../../lib/account/sync-loop';
import { whenClosed } from '../dialog-close';

/**
 * "Add your N songs on this device to your account?" (#1268) — a `<dialog>` in the same pattern
 * as `delete-song.tsx` and `sign-out.tsx`: the shell owns `dialogRef` and drives
 * `showModal()`/`close()` from `open`, which gives this the browser's own focus trap, Escape
 * handling and focus restore for free.
 *
 * Opened three ways, all driven by the shell: automatically once per sign-in, once this device has
 * downloaded the account library at least once and found candidates and the offer has not been
 * answered yet (`hasDecidedAdoption`); manually from the account page's "Add this device's songs"
 * button at any time after that; and straight after a signed-in v1 import that actually put songs
 * in the guest songbook (#1359), which is the same gesture as that button — the musician asked for
 * these songs, so the once-per-owner answer is not consulted to OPEN it. Answering it is recorded
 * like any other answer (`rememberAdoptionDecision` below), which also retires the sign-in offer
 * for that owner. All three paths render this same component; only how `open` gets set, and
 * whether `scopeGuestIds` narrows it, differs. The download gate lives in the shell
 * (`libraryDownloaded` in `lib/account/adopt-guest.ts`) because every entry point needs it:
 * candidates are computed by diffing against the ACCOUNT library, and an empty not-yet-downloaded
 * library re-offers songs the account already has.
 *
 * The decision — Add or Not now — is what gets remembered, via `rememberAdoptionDecision`. Escape
 * or the backdrop close this dialog without recording a decision, the same as a "checking" step
 * elsewhere in this app: the musician gets asked again next sign-in, which is the safe default for
 * an ambiguous dismissal.
 */

export interface AdoptGuestDialogProps {
    dialogRef: RefObject<HTMLDialogElement | null>;
    open: boolean;
    ownerId: string | null;
    /** Copy only — the outbox queues locally either way; this never blocks on a connection. */
    online: boolean;
    /**
     * The guest songs this particular offer is about (#1359), or null for the whole guest
     * songbook. Set only by the post-import path, where the honest question is about the songs
     * that import just brought over — asking about a songbook's worth of unrelated music because
     * somebody imported one v1 tune is a different question than the one they asked.
     *
     * A stable value from the shell's state, never a fresh array per render: it is a dependency of
     * the effect that computes the offer.
     */
    scopeGuestIds: readonly string[] | null;
    onClose: () => void;
}

type Phase =
    | { kind: 'loading' }
    /**
     * No song to add. `collections` is how many of this device's guest collections still hold
     * songs the account's copies do not (#1477 review R3) — offered on their own, by a button,
     * because a guest whose songs were adopted by an older build would otherwise never get them.
     */
    | { kind: 'empty'; collections: number }
    /** Nothing can be offered because the account is at its own song cap, which is not "nothing new". */
    | { kind: 'full'; omitted: number; collections: number }
    | { kind: 'ask'; candidates: AdoptCandidate[]; omitted: number; room: number }
    | { kind: 'copying'; copied: number; total: number }
    | {
          kind: 'done';
          adopted: number;
          failures: AdoptFailure[];
          /** Guest collections that could not be brought along (#1477), apart from songs. */
          collectionFailures: number;
          /** Guest collections that were (#1477): counted only when a Save was queued. */
          collectionsAdopted: number;
      }
    | { kind: 'error'; message: string };

export function AdoptGuestDialog({
    dialogRef,
    open,
    ownerId,
    online,
    scopeGuestIds,
    onClose,
}: AdoptGuestDialogProps) {
    const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
    const openRef = useRef(false);
    /** True while this offer is about the songs a v1 import just brought over (#1359). */
    const scoped = scopeGuestIds !== null;

    useEffect(() => {
        openRef.current = open;
        if (!open || ownerId === null) {
            return;
        }
        setPhase({ kind: 'loading' });
        let alive = true;
        void computeAdoptCandidates(
            ownerId,
            scopeGuestIds === null ? null : new Set(scopeGuestIds),
        ).then(
            async (offer) => {
                // With no song to offer, the guest's collections are the question instead (#1477
                // review R3) — never for a scoped offer, which is about one import's songs. An
                // unreadable store is not evidence of anything to add: it offers nothing.
                const collections =
                    offer.candidates.length === 0 && scopeGuestIds === null
                        ? await pendingGuestCollections(ownerId).catch(() => 0)
                        : 0;
                if (!alive) {
                    return;
                }
                setPhase(
                    offer.candidates.length > 0
                        ? { kind: 'ask', ...offer }
                        : offer.omitted > 0
                          ? { kind: 'full', omitted: offer.omitted, collections }
                          : { kind: 'empty', collections },
                );
            },
            (error: unknown) => {
                if (!alive) {
                    return;
                }
                setPhase({
                    kind: 'error',
                    // An `AccountMismatchError` here is the attach lag, not a verdict about this
                    // account (#1351 patch N3): the session already names this owner while
                    // `meta.active` still names the last one, and the named library read is
                    // refused until the attach settles. `OWNER_MESSAGES.mismatch` is a sentence
                    // about a CHART on the stand, and this dialog has none — so it says what is
                    // actually true and asks for a moment.
                    message:
                        error instanceof AccountMismatchError
                            ? 'Your account library isn’t ready yet — try again in a moment.'
                            : error instanceof Error
                              ? error.message
                              : String(error),
                });
            },
        );
        return () => {
            alive = false;
        };
    }, [open, ownerId, scopeGuestIds]);

    function decline() {
        if (ownerId !== null) {
            rememberAdoptionDecision(ownerId);
        }
        onClose();
    }

    async function runAdopt(candidates: AdoptCandidate[]) {
        // Remembered BEFORE the copy, deliberately: the musician has answered the question, and a
        // copy that then fails must not re-ask it on every sign-in. A fully failed copy still
        // reaches the account page's standing "Add this device's songs" button, which is where a
        // retry belongs.
        if (ownerId !== null) {
            rememberAdoptionDecision(ownerId);
        }
        setPhase({ kind: 'copying', copied: 0, total: candidates.length });
        const result = await adoptGuestSongs(candidates, (copied, total) => {
            if (openRef.current) {
                setPhase({ kind: 'copying', copied, total });
            }
        });
        // The guest's collections come along with its songs (#1477), remapped to the ids those
        // songs were just adopted under — but only for the WHOLE-songbook offer. A scoped offer
        // (#1359) is about the songs one v1 import brought over, not about this device's lists.
        let collectionFailures = 0;
        let collectionsAdopted = 0;
        if (!scoped && ownerId !== null) {
            try {
                const adopted = await adoptGuestCollections(ownerId);
                collectionFailures = adopted.failures.length;
                collectionsAdopted = adopted.adopted;
            } catch {
                collectionFailures = 1;
            }
        }
        if (!openRef.current) {
            return;
        }
        setPhase({
            kind: 'done',
            adopted: result.adopted,
            failures: result.failures,
            collectionFailures,
            collectionsAdopted,
        });
    }

    /**
     * "Add this device's collections" (#1477 review R3): the musician's own answer, so it is
     * recorded like any other, and the copy is the same idempotent one the song offer runs.
     */
    async function runAdoptCollections() {
        if (ownerId === null) {
            return;
        }
        rememberAdoptionDecision(ownerId);
        setPhase({ kind: 'copying', copied: 0, total: 0 });
        let collectionFailures = 0;
        let collectionsAdopted = 0;
        try {
            const adopted = await adoptGuestCollections(ownerId);
            collectionFailures = adopted.failures.length;
            collectionsAdopted = adopted.adopted;
        } catch {
            collectionFailures = 1;
        }
        if (!openRef.current) {
            return;
        }
        setPhase({
            kind: 'done',
            adopted: 0,
            failures: [],
            collectionFailures,
            collectionsAdopted,
        });
    }

    /**
     * The way out of the `'empty'` and `'full'` phases. With a collections offer on screen it is
     * "Not now", which RECORDS the answer like the song offer's (#1477 review C2): a plain close
     * remembers nothing, and the sign-in offer would reopen on every page load. The account
     * page's own button still opens the dialog afterwards — it consults no answer.
     */
    const dismiss = (collections: number) =>
        collections > 0 ? (
            <button className="btn" data-testid="adopt-guest-decline" onClick={decline}>
                Not now
            </button>
        ) : (
            <button className="btn" data-testid="adopt-guest-close" onClick={onClose}>
                Close
            </button>
        );

    /** The guest-collections half of the `'empty'` and `'full'` phases (#1477 review R3). */
    const collectionsOffer = (count: number) =>
        count > 0 && (
            <>
                <p data-testid="adopt-guest-collections-pending">
                    {count === 1
                        ? 'This device also has a collection with songs your account’s copy doesn’t include (Starred counts).'
                        : `This device also has ${count} collections with songs your account’s copies don’t include (Starred counts).`}
                </p>
                <div className="dialog-actions">
                    <button
                        className="btn primary"
                        data-testid="adopt-guest-collections"
                        onClick={() => void runAdoptCollections()}
                    >
                        Add this device’s collections
                    </button>
                </div>
            </>
        );

    const busy = phase.kind === 'copying';

    return (
        <dialog
            ref={dialogRef}
            className="modal-box"
            aria-labelledby="adopt-guest-title"
            onCancel={(event) => {
                // A copy in flight must not be abandoned mid-write from underneath itself.
                if (busy) {
                    event.preventDefault();
                    return;
                }
                onClose();
            }}
            onClose={whenClosed(onClose)}
        >
            {phase.kind === 'loading' && (
                <h2 id="adopt-guest-title">Checking this device’s songs…</h2>
            )}
            {phase.kind === 'empty' && (
                <>
                    <h2 id="adopt-guest-title">
                        {phase.collections > 0
                            ? 'Add this device’s collections to your account?'
                            : 'Nothing new to add'}
                    </h2>
                    {/* Scoped, this is reached by a v1 rerun as well as by a repeat Add: the
                        import UPDATES the one `v1-session` document in place, and adoption
                        deduplicates by deterministic document id rather than by content (#1268),
                        so an account copy made earlier stays at the version it was copied at.
                        "Already in your account" alone would be a lie on top of a card reading
                        "1 updated". */}
                    <p>
                        {scoped
                            ? 'Your account already has these songs. A song you’ve already added keeps the version you added — later changes on this device stay on this device.'
                            : 'Every song on this device is already in your account.'}
                    </p>
                    {collectionsOffer(phase.collections)}
                    <div className="dialog-actions">{dismiss(phase.collections)}</div>
                </>
            )}
            {phase.kind === 'full' && (
                <>
                    <h2 id="adopt-guest-title">Your account songbook is full</h2>
                    <p data-testid="adopt-guest-full">
                        Your account already holds as many songs as it can, so there’s no room for
                        the {phase.omitted} still on this device. Delete a song from your account to
                        make room.
                    </p>
                    {collectionsOffer(phase.collections)}
                    <div className="dialog-actions">{dismiss(phase.collections)}</div>
                </>
            )}
            {phase.kind === 'ask' && (
                <>
                    {/* Scoped, this is the answer to the import the musician just ran, so it says
                        so: "your N songs on this device" would name a songbook they did not ask
                        about (#1359). */}
                    <h2 id="adopt-guest-title">
                        {scoped
                            ? phase.candidates.length === 1
                                ? 'Add the song you just brought over to your account?'
                                : `Add the ${phase.candidates.length} songs you just brought over to your account?`
                            : `Add your ${phase.candidates.length} ${phase.candidates.length === 1 ? 'song' : 'songs'} on this device to your account?`}
                    </h2>
                    <p>
                        Each becomes its own saved copy in your account. The songs on this device
                        don’t change.
                        {!online &&
                            ' You’re offline — they’ll upload once you’re back online, the same as any other Save.'}
                    </p>
                    {/* The preview the contract asks for: exactly what is about to be copied, by
                        name. No checkboxes — this is one all-or-nothing gesture, and a per-song
                        selection is a different (unasked-for) feature. */}
                    <ul className="adopt-guest-preview" data-testid="adopt-guest-preview">
                        {phase.candidates.map((candidate) => (
                            <li key={candidate.accountDocumentId}>{candidate.document.title}</li>
                        ))}
                    </ul>
                    {phase.omitted > 0 && (
                        <p className="status-detail" data-testid="adopt-guest-omitted">
                            Your account can hold {phase.room} more{' '}
                            {phase.room === 1 ? 'song' : 'songs'}, so this adds the first{' '}
                            {phase.room}. The other {phase.omitted} stay on this device only.
                        </p>
                    )}
                    <div className="dialog-actions">
                        <button
                            className="btn primary"
                            data-testid="adopt-guest-confirm"
                            onClick={() => void runAdopt(phase.candidates)}
                        >
                            Add {phase.candidates.length === 1 ? 'this song' : 'these songs'}
                        </button>
                        <button className="btn" data-testid="adopt-guest-decline" onClick={decline}>
                            Not now
                        </button>
                    </div>
                </>
            )}
            {phase.kind === 'copying' && (
                <>
                    <h2 id="adopt-guest-title">
                        {phase.total === 0 ? 'Adding your collections…' : 'Adding your songs…'}
                    </h2>
                    {/* Songs actually copied, counted after each write (`adoptGuestSongs`): a
                        number published in front of the write would claim a Save that has not
                        happened yet. */}
                    {phase.total > 0 && (
                        <p data-testid="adopt-guest-progress">
                            Copied {phase.copied} of {phase.total}…
                        </p>
                    )}
                </>
            )}
            {phase.kind === 'done' && (
                <>
                    <h2 id="adopt-guest-title">
                        {phase.adopted > 0
                            ? `Copied ${phase.adopted} ${phase.adopted === 1 ? 'song' : 'songs'} into this device’s account songbook`
                            : phase.collectionsAdopted > 0
                              ? `Added ${phase.collectionsAdopted} ${phase.collectionsAdopted === 1 ? 'collection' : 'collections'} to this device’s account songbook`
                              : 'Nothing was added'}
                    </h2>
                    {/* Two facts, kept apart the way `SyncStatus` keeps them apart: the copy is
                        committed HERE, and the upload is a separate thing the per-song chip
                        reports. "Added to your account" claimed the cloud half before it happened. */}
                    <p>
                        {(phase.adopted > 0 || phase.collectionsAdopted > 0) &&
                            (online
                                ? 'Uploading to your account now.'
                                : 'Saved on this device — they’ll upload once you’re back online.')}
                    </p>
                    {phase.failures.length > 0 && (
                        <p className="status-detail" data-testid="adopt-guest-failures">
                            {phase.failures.length === 1
                                ? 'One song could not be added.'
                                : `${phase.failures.length} songs could not be added.`}{' '}
                            Try again from your account page.
                        </p>
                    )}
                    {phase.collectionFailures > 0 && (
                        <p className="status-detail" data-testid="adopt-guest-collection-failures">
                            {phase.collectionFailures === 1
                                ? 'One collection could not be added.'
                                : `${phase.collectionFailures} collections could not be added.`}{' '}
                            They are still on this device.
                        </p>
                    )}
                    <div className="dialog-actions">
                        <button className="btn" data-testid="adopt-guest-done" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </>
            )}
            {phase.kind === 'error' && (
                <>
                    <h2 id="adopt-guest-title">Couldn’t check this device’s songs</h2>
                    <p className="sync-failure" role="status">
                        {phase.message}
                    </p>
                    <div className="dialog-actions">
                        <button className="btn" data-testid="adopt-guest-close" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </>
            )}
        </dialog>
    );
}
