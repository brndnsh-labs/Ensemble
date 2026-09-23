'use client';

import type { RefObject } from 'react';
import { whenClosed } from '../dialog-close';

/**
 * The confirm step for deleting one song from the cloud (#1270).
 *
 * A `<dialog>` in the same pattern as `sign-in.tsx` and `account-page.tsx` — the SHELL owns the
 * ref and drives `showModal()`/`close()`, which is what gives this the browser's own focus trap,
 * Escape handling and focus restore for free. Nothing is added on top of that.
 *
 * Four rules this component exists to hold:
 *
 * 1. **The export preflight is offered, not implied.** `docs/design/ensemble-v2-sync.md`:
 *    "Cloud document deletion is an explicit online operation with a tombstone and
 *    recovery/export preflight". Export is a real button here, right beside the destructive one,
 *    because a file on the musician's disk is the only thing that survives this either way.
 * 2. **Offline, the destructive button is DISABLED with a reason** (rollout decision 9 S2's posture
 *    for sign-out, applied for the same reason): deleting is a server operation, and a button that
 *    looks live and then fails teaches nothing. Export stays available offline — it never leaves
 *    the device.
 * 3. **Local work is named before it is risked, not after.** Unsaved edits and Saves still waiting
 *    to upload are two different facts with two different consequences, so they are two sentences.
 * 4. **Nothing dismisses this step while the request is in flight** — not Cancel, not Escape. The
 *    answer to a destructive request is written here, and a step that vanished mid-flight would
 *    take that answer with it. The Escape default is the one browser behaviour above that is
 *    overridden, and only while `busy`.
 */

export interface DeleteSongDialogProps {
    dialogRef: RefObject<HTMLDialogElement | null>;
    title: string;
    /** `false` disables the destructive action and shows the offline reason. */
    online: boolean;
    busy: boolean;
    /** Edits on the stand that have never been committed to a version. */
    unsavedEdits: boolean;
    /** Committed versions still in this device's outbox for this song. */
    pendingCount: number;
    /** The last attempt's sentence, when one was refused. Cleared by the shell on reopen. */
    failure: string | null;
    onExport: () => void;
    onConfirm: () => void;
    onClose: () => void;
}

export function DeleteSongDialog({
    dialogRef,
    title,
    online,
    busy,
    unsavedEdits,
    pendingCount,
    failure,
    onExport,
    onConfirm,
    onClose,
}: DeleteSongDialogProps) {
    return (
        <dialog
            ref={dialogRef}
            className="modal-box"
            aria-labelledby="delete-song-title"
            onCancel={(event) => {
                // Escape while the request is in flight would close the step its own answer is
                // written to. The shell has a fallback for a refusal that arrives at a closed
                // dialog, but the musician would still have lost the place they were standing.
                if (busy) {
                    event.preventDefault();
                    return;
                }
                onClose();
            }}
            onClose={whenClosed(onClose)}
        >
            <h2 id="delete-song-title">Delete “{title}” from your account?</h2>
            <p>
                This removes it from your account. Other devices drop their copy on their next sync
                — except any that still hold unsent work, which keep it. It can’t be undone, and it
                isn’t a backup you can restore from — export a file first if you want to keep this
                song.
            </p>
            {unsavedEdits && (
                <p className="status-detail" data-testid="delete-song-unsaved">
                    You have unsaved edits to this song. Deleting closes it, and those edits were
                    never in your account — export them first if you want them.
                </p>
            )}
            {pendingCount > 0 && (
                <p className="status-detail" data-testid="delete-song-pending">
                    {pendingCount === 1
                        ? 'One saved version hasn’t reached your account yet.'
                        : `${pendingCount} saved versions haven’t reached your account yet.`}{' '}
                    Your account will refuse them once this song is deleted, and they stay on this
                    device.
                </p>
            )}
            {!online && (
                <p className="status-detail" data-testid="delete-song-offline">
                    You’re offline. Deleting from your account needs a connection — exporting
                    doesn’t.
                </p>
            )}
            {failure !== null && (
                <p className="sync-failure" role="status" data-testid="delete-song-failure">
                    {failure}
                </p>
            )}
            <div className="dialog-actions">
                <button
                    className="btn"
                    data-testid="delete-song-export"
                    disabled={busy}
                    onClick={onExport}
                >
                    Export file
                </button>
                <button
                    className="btn"
                    data-testid="delete-song-confirm"
                    disabled={busy || !online}
                    onClick={onConfirm}
                >
                    Delete from my account
                </button>
                <button
                    className="btn"
                    data-testid="delete-song-cancel"
                    disabled={busy}
                    onClick={onClose}
                >
                    Cancel
                </button>
            </div>
        </dialog>
    );
}
