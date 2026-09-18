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
 * Opened two ways, both driven by the shell: automatically once, after the first sign-in on this
 * device that finds candidates and has not been answered yet (`hasDecidedAdoption`), and manually
 * from the account page's "Add this device's songs" button at any time after that. Both paths
 * render this same component; only how `open` gets set differs.
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
    | { kind: 'ask'; candidates: AdoptCandidate[] }
    | { kind: 'copying'; current: number; total: number }
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
            (candidates) => {
                if (!alive) {
                    return;
                }
                setPhase(candidates.length > 0 ? { kind: 'ask', candidates } : { kind: 'empty' });
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
        if (ownerId !== null) {
            rememberAdoptionDecision(ownerId);
        }
        setPhase({ kind: 'copying', current: 0, total: candidates.length });
        const result = await adoptGuestSongs(candidates, (current, total) => {
            if (openRef.current) {
                setPhase({ kind: 'copying', current, total });
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
                    <p data-testid="adopt-guest-progress">
                        Adding {phase.current} of {phase.total}…
                    </p>
                </>
            )}
            {phase.kind === 'done' && (
                <>
                    <h2 id="adopt-guest-title">
                        {phase.adopted === 0
                            ? 'Nothing was added'
                            : `Added ${phase.adopted} ${phase.adopted === 1 ? 'song' : 'songs'} to your account`}
                    </h2>
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
