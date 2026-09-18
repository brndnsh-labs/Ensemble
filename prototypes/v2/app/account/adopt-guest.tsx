'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';
import {
    type AdoptCandidate,
    type AdoptFailure,
    adoptGuestSongs,
    computeAdoptCandidates,
    rememberAdoptionDecision,
} from '../../lib/account/adopt-guest';

/**
 * "Add your N songs on this device to your account?" (#1268) — a `<dialog>` in the same pattern
 * as `delete-song.tsx` and `sign-out.tsx`: the shell owns `dialogRef` and drives
 * `showModal()`/`close()` from `open`, which gives this the browser's own focus trap, Escape
 * handling and focus restore for free.
 *
 * Opened two ways, both driven by the shell: automatically once per sign-in, once this device has
 * downloaded the account library at least once and found candidates and the offer has not been
 * answered yet (`hasDecidedAdoption`), and manually from the account page's "Add this device's
 * songs" button at any time after that. Both paths render this same component; only how `open`
 * gets set differs. The download gate lives in the shell (`libraryDownloaded` in
 * `lib/account/adopt-guest.ts`) because both entry points need it: candidates are computed by
 * diffing against the ACCOUNT library, and an empty not-yet-downloaded library re-offers songs the
 * account already has.
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
    onClose: () => void;
}

type Phase =
    | { kind: 'loading' }
    | { kind: 'empty' }
    /** Nothing can be offered because the account is at its own song cap, which is not "nothing new". */
    | { kind: 'full'; omitted: number }
    | { kind: 'ask'; candidates: AdoptCandidate[]; omitted: number; room: number }
    | { kind: 'copying'; copied: number; total: number }
    | { kind: 'done'; adopted: number; failures: AdoptFailure[] }
    | { kind: 'error'; message: string };

export function AdoptGuestDialog({
    dialogRef,
    open,
    ownerId,
    online,
    onClose,
}: AdoptGuestDialogProps) {
    const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
    const openRef = useRef(false);

    useEffect(() => {
        openRef.current = open;
        if (!open || ownerId === null) {
            return;
        }
        setPhase({ kind: 'loading' });
        let alive = true;
        void computeAdoptCandidates(ownerId).then(
            (offer) => {
                if (!alive) {
                    return;
                }
                setPhase(
                    offer.candidates.length > 0
                        ? { kind: 'ask', ...offer }
                        : offer.omitted > 0
                          ? { kind: 'full', omitted: offer.omitted }
                          : { kind: 'empty' },
                );
            },
            (error: unknown) => {
                if (!alive) {
                    return;
                }
                setPhase({
                    kind: 'error',
                    message: error instanceof Error ? error.message : String(error),
                });
            },
        );
        return () => {
            alive = false;
        };
    }, [open, ownerId]);

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
        if (!openRef.current) {
            return;
        }
        setPhase({ kind: 'done', adopted: result.adopted, failures: result.failures });
    }

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
            onClose={onClose}
        >
            {phase.kind === 'loading' && (
                <h2 id="adopt-guest-title">Checking this device’s songs…</h2>
            )}
            {phase.kind === 'empty' && (
                <>
                    <h2 id="adopt-guest-title">Nothing new to add</h2>
                    <p>Every song on this device is already in your account.</p>
                    <div className="dialog-actions">
                        <button className="btn" data-testid="adopt-guest-close" onClick={onClose}>
                            Close
                        </button>
                    </div>
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
                    <div className="dialog-actions">
                        <button className="btn" data-testid="adopt-guest-close" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </>
            )}
            {phase.kind === 'ask' && (
                <>
                    <h2 id="adopt-guest-title">
                        Add your {phase.candidates.length}{' '}
                        {phase.candidates.length === 1 ? 'song' : 'songs'} on this device to your
                        account?
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
                    <h2 id="adopt-guest-title">Adding your songs…</h2>
                    {/* Songs actually copied, counted after each write (`adoptGuestSongs`): a
                        number published in front of the write would claim a Save that has not
                        happened yet. */}
                    <p data-testid="adopt-guest-progress">
                        Copied {phase.copied} of {phase.total}…
                    </p>
                </>
            )}
            {phase.kind === 'done' && (
                <>
                    <h2 id="adopt-guest-title">
                        {phase.adopted === 0
                            ? 'Nothing was added'
                            : `Copied ${phase.adopted} ${phase.adopted === 1 ? 'song' : 'songs'} into this device’s account songbook`}
                    </h2>
                    {/* Two facts, kept apart the way `SyncStatus` keeps them apart: the copy is
                        committed HERE, and the upload is a separate thing the per-song chip
                        reports. "Added to your account" claimed the cloud half before it happened. */}
                    <p>
                        {phase.adopted > 0 &&
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
