'use client';

import type { RefObject } from 'react';

/**
 * The confirm step for taking the account's newer version of the open song (#1310).
 *
 * A `<dialog>` in the same pattern as `delete-song.tsx` and `sign-out.tsx` — the SHELL owns the ref
 * and drives `showModal()`/`close()`, which is what gives this the browser's own focus trap, Escape
 * handling and focus restore for free. Nothing is added on top of that.
 *
 * It exists because the banner behind it cannot ask this. `conflict.tsx` is non-modal on the
 * grounds that nothing there is at risk, and that stops being true for this one action: it replaces
 * the song on the stand, and with an experiment on it that experiment exists on no other device and
 * in no account. `docs/design/ensemble-v2-sync.md` — "Cancel or export them first; discarding
 * requires an explicit confirmation" — is the rule, and this is where it is met. It is asked with a
 * clean chart too: the version arriving is still a different piece of music, and the band stops to
 * load it.
 *
 * Three rules, the same three `delete-song.tsx` holds, for the same reasons:
 *
 * 1. **The export is offered, not implied**, and it comes FIRST — before the destructive button, in
 *    reading order — because a file on the musician's own disk is the only copy of this experiment
 *    that survives either answer. It writes the chart as it stands on the stand, edits included.
 * 2. **What is lost is named before it is risked.** The song by name, and the experiment as the
 *    thing that goes: a sentence about "syncing" would describe a housekeeping task rather than a
 *    discard.
 * 3. **Nothing dismisses this step while the write is in flight** — not Cancel, not Escape. The
 *    answer to a destructive question is written here.
 *
 * Offline is deliberately NOT a gate, unlike deleting or signing out. This sends nothing: the
 * version being adopted is already on this device, preserved by a download that has already
 * happened, and one local transaction is the whole operation.
 */

export interface AdoptRemoteDialogProps {
    dialogRef: RefObject<HTMLDialogElement | null>;
    title: string;
    busy: boolean;
    /** True when this device holds unsaved changes to the song — the thing this discards. */
    unsavedEdits: boolean;
    /** The last attempt's sentence, when one was refused. Cleared by the shell on reopen. */
    failure: string | null;
    onExport: () => void;
    onConfirm: () => void;
    onClose: () => void;
}

export function AdoptRemoteDialog({
    dialogRef,
    title,
    busy,
    unsavedEdits,
    failure,
    onExport,
    onConfirm,
    onClose,
}: AdoptRemoteDialogProps) {
    return (
        <dialog
            ref={dialogRef}
            className="modal-box"
            aria-labelledby="adopt-remote-title"
            onCancel={(event) => {
                if (busy) {
                    event.preventDefault();
                    return;
                }
                onClose();
            }}
            onClose={onClose}
        >
            <h2 id="adopt-remote-title">Use your account’s version of “{title}”?</h2>
            <p>
                This song is replaced with the version from your account, under the same name. The
                song reloads on the stand, so playback stops. Nothing is merged, and it can’t be
                undone — export a file first if you want to keep what’s here.
            </p>
            {/*
             * Both of these are about work that exists only here, so both are withheld when there
             * is none (#1310 patch R2): reaching this step with a clean chart is the ordinary case,
             * because a song merely OPEN holds the record against a download. The banner behind
             * this branches on the same prop from the same derivation.
             */}
            {unsavedEdits && (
                <>
                    <p className="status-detail" data-testid="adopt-remote-unsaved">
                        Your unsaved changes to this song are only on this device. They were never
                        in your account, and this discards them.
                    </p>
                    <p className="status-detail" data-testid="adopt-remote-keep-both">
                        To keep both instead, cancel and save your own version first — your account
                        will then offer to keep it as a separate song.
                    </p>
                </>
            )}
            {failure !== null && (
                <p className="sync-failure" role="status" data-testid="adopt-remote-failure">
                    {failure}
                </p>
            )}
            <div className="dialog-actions">
                <button
                    className="btn"
                    data-testid="adopt-remote-export"
                    disabled={busy}
                    onClick={onExport}
                >
                    Export file
                </button>
                <button
                    className="btn"
                    data-testid="adopt-remote-confirm"
                    disabled={busy}
                    onClick={onConfirm}
                >
                    Use the account’s version
                </button>
                <button
                    className="btn"
                    data-testid="adopt-remote-cancel"
                    disabled={busy}
                    onClick={onClose}
                >
                    Cancel
                </button>
            </div>
        </dialog>
    );
}
