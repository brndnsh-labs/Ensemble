import type { RefObject } from 'react';
import { whenClosed } from './dialog-close';

/**
 * The confirm step for a GUEST-songbook delete (#1440) — the local-only counterpart to
 * `account/delete-song.tsx`'s cloud tombstone, which this must never stand in for: an account
 * song deletes through that route alone.
 *
 * Same posture as the account dialog it sits beside: export offered first, right next to the
 * destructive button, and nothing dismisses this step while the request is in flight.
 */
export interface DeleteGuestSongDialogProps {
    dialogRef: RefObject<HTMLDialogElement | null>;
    title: string;
    busy: boolean;
    /** Whether this device holds a recovered draft for this song — see `repository.recoverySlotCount`. */
    hasRecovery: boolean;
    onExport: () => void;
    onConfirm: () => void;
    onClose: () => void;
}

export function DeleteGuestSongDialog({
    dialogRef,
    title,
    busy,
    hasRecovery,
    onExport,
    onConfirm,
    onClose,
}: DeleteGuestSongDialogProps) {
    return (
        <dialog
            ref={dialogRef}
            className="modal-box"
            aria-labelledby="delete-guest-song-title"
            onCancel={(event) => {
                if (busy) {
                    event.preventDefault();
                    return;
                }
                onClose();
            }}
            onClose={whenClosed(onClose)}
        >
            <h2 id="delete-guest-song-title">Delete “{title}”?</h2>
            <p>
                This removes it from this device. It can’t be undone — export a file first if you
                want to keep it.
            </p>
            {hasRecovery && (
                <p className="status-detail" data-testid="delete-guest-song-recovery">
                    A recovered draft is kept for this song on this device. Deleting removes that
                    too.
                </p>
            )}
            <div className="dialog-actions">
                <button
                    className="btn"
                    data-testid="delete-guest-song-export"
                    disabled={busy}
                    onClick={onExport}
                >
                    Export file
                </button>
                <button
                    className="btn danger"
                    data-testid="delete-guest-song-confirm"
                    disabled={busy}
                    onClick={onConfirm}
                >
                    Delete
                </button>
                <button
                    className="btn"
                    data-testid="delete-guest-song-cancel"
                    disabled={busy}
                    onClick={onClose}
                >
                    Cancel
                </button>
            </div>
        </dialog>
    );
}
