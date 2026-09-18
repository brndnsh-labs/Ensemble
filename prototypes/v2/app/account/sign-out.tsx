'use client';

import type { RefObject } from 'react';
import type { SignOutPreflight } from '../../lib/account/sync-loop';

/**
 * The sign-out preflight (#1269) — the step that names what leaving costs before it costs it.
 *
 * A `<dialog>` in the same pattern as `delete-song.tsx`: the SHELL owns the ref and drives
 * `showModal()`/`close()`, which is what gives this the browser's own focus trap, Escape handling
 * and focus restore for free.
 *
 * `docs/design/ensemble-v2-sync.md`: "On explicit sign-out, remove that account's local private
 * data after a preflight that protects unsent saves and drafts. Cancel or export them first;
 * discarding requires an explicit confirmation." Which is the shape of this step:
 *
 * 1. **Unsent Saves and unsaved drafts are two sentences, not one count.** A queued Save is work
 *    the musician committed and the account has not taken yet; a draft is an experiment they never
 *    committed at all. Both are about to be removed from this device, and they are protected
 *    differently — one can still be sent, the other can only be exported.
 * 2. **Export and Sync now are real buttons, beside the destructive one.** Export is the only thing
 *    that survives this whatever the network does, because it never leaves the device; Sync now is
 *    the one move that can make the queue empty before it is discarded.
 * 3. **Offline, the destructive button is DISABLED with a reason** (rollout decision 9 S2:
 *    sign-out needs a connection — there is no persisted logout barrier, so a device that cannot
 *    reach the server cannot honestly claim the session was revoked). The header's Sign out button
 *    is already disabled offline; this covers the network dropping while the step is open.
 * 4. **Nothing dismisses this step while the request is in flight** — not Cancel, not Escape. The
 *    answer to a destructive request is written here.
 */

const OFFLINE_REASON = 'Connect to sign out — exporting works either way.';

export interface SignOutDialogProps {
    dialogRef: RefObject<HTMLDialogElement | null>;
    /** `false` disables the destructive action and shows the offline reason. */
    online: boolean;
    busy: boolean;
    /** Null while this device is still being read. The step never guesses at a count. */
    preflight: SignOutPreflight | null;
    /** The last attempt's sentence, when one was refused. Cleared by the shell on reopen. */
    failure: string | null;
    /**
     * False while the account library is still being read. Export writes files FROM that library,
     * so offering the button before it exists is a click that silently writes nothing.
     */
    songsReady: boolean;
    /** Writes a file for every song holding work the account has not got. */
    onExport: () => void;
    onSyncNow: () => void;
    onConfirm: () => void;
    onClose: () => void;
}

export function SignOutDialog({
    dialogRef,
    online,
    busy,
    preflight,
    failure,
    songsReady,
    onExport,
    onSyncNow,
    onConfirm,
    onClose,
}: SignOutDialogProps) {
    const unsent = preflight?.unsentSaves ?? 0;
    const drafts = preflight?.drafts ?? 0;
    const exposed = preflight?.atRisk.length ?? 0;
    const atRisk = exposed > 0;
    return (
        <dialog
            ref={dialogRef}
            className="modal-box"
            aria-labelledby="sign-out-title"
            onCancel={(event) => {
                if (busy) {
                    event.preventDefault();
                    return;
                }
                onClose();
            }}
            onClose={onClose}
        >
            <h2 id="sign-out-title">Sign out of your account?</h2>
            <p>
                Your account songbook is removed from this device. It stays in your account, and
                signing back in downloads it again. Songs you saved as a guest are untouched.
            </p>
            {preflight === null ? (
                <p className="status-detail" data-testid="sign-out-checking">
                    Checking what’s still on this device…
                </p>
            ) : (
                <>
                    {unsent > 0 && (
                        <p className="status-detail" data-testid="sign-out-unsent">
                            {unsent === 1
                                ? 'One saved version hasn’t reached your account yet.'
                                : `${unsent} saved versions haven’t reached your account yet.`}{' '}
                            Signing out discards them. Sync now, or export the song first.
                        </p>
                    )}
                    {drafts > 0 && (
                        <p className="status-detail" data-testid="sign-out-drafts">
                            {drafts === 1
                                ? 'One unsaved experiment is kept on this device.'
                                : `${drafts} unsaved experiments are kept on this device.`}{' '}
                            They were never in your account — export what you want to keep.
                        </p>
                    )}
                    {!atRisk && (
                        // Said out loud rather than left blank: "nothing is at stake" is the
                        // answer the preflight went and got, and silence would read as unread.
                        <p className="status-detail" data-testid="sign-out-clear">
                            Everything on this device has reached your account.
                        </p>
                    )}
                </>
            )}
            {!online && (
                <p className="status-detail" data-testid="sign-out-offline">
                    {OFFLINE_REASON}
                </p>
            )}
            {failure !== null && (
                <p className="sync-failure" role="status" data-testid="sign-out-failure">
                    {failure}
                </p>
            )}
            <div className="dialog-actions">
                {atRisk && (
                    <button
                        className="btn"
                        data-testid="sign-out-export"
                        // Never disabled by the NETWORK: a file written to this device's own disk
                        // is the one thing that survives whatever happens next. `songsReady` is a
                        // different fact — the library these files are written from has not been
                        // read yet, and a button that wrote nothing would be worse than a
                        // disabled one.
                        disabled={busy || !songsReady}
                        onClick={onExport}
                    >
                        {exposed === 1 ? 'Export that song' : `Export those ${exposed} songs`}
                    </button>
                )}
                {unsent > 0 && (
                    <button
                        className="btn"
                        data-testid="sign-out-sync"
                        disabled={busy || !online}
                        onClick={onSyncNow}
                    >
                        Sync now
                    </button>
                )}
                <button
                    className="btn"
                    data-testid="sign-out-confirm"
                    // Never while the preflight is unread: "Sign out" with nothing said about
                    // what is at stake is the preflight not having happened.
                    disabled={busy || !online || preflight === null}
                    title={online ? undefined : OFFLINE_REASON}
                    onClick={onConfirm}
                >
                    {atRisk ? 'Sign out anyway' : 'Sign out'}
                </button>
                <button
                    className="btn"
                    data-testid="sign-out-cancel"
                    disabled={busy}
                    onClick={onClose}
                >
                    Cancel
                </button>
            </div>
        </dialog>
    );
}
