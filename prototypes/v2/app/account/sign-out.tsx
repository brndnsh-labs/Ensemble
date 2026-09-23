'use client';

import type { RefObject } from 'react';
import type { SignOutPreflight } from '../../lib/account/sync-loop';
import { whenClosed } from '../dialog-close';

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
 *    the one move that can make the queue empty before it is discarded — **unless every unsent
 *    Save has been permanently refused** (#1298), in which case Sync now is a button that provably
 *    cannot do anything (`prepare()` answers `'refused'` for those heads and sends nothing), so it
 *    is not offered at all and the sentence names Export as the step that works.
 * 3. **Offline, the destructive button is DISABLED with a reason** (rollout decision 9 S2:
 *    sign-out needs a connection — there is no persisted logout barrier, so a device that cannot
 *    reach the server cannot honestly claim the session was revoked). The header's Sign out button
 *    is already disabled offline; this covers the network dropping while the step is open.
 * 4. **Nothing dismisses this step while the request is in flight** — not Cancel, not Escape. The
 *    answer to a destructive request is written here.
 *
 * `mode` is the one thing that varies (#1351), and every difference follows from a single fact:
 * whether there is still a session to revoke.
 *
 * - `'session'` — the ordinary sign-out. A live session, a logout round trip, and a queue that can
 *   still be emptied before it is discarded.
 * - `'device'` — "Sign out on this device", for a device that still HOLDS an account with no live
 *   session (#1351): the session expired, or it expired and the page was reloaded. There is no
 *   request to make, so point 3 does not apply and the destructive button works offline.
 *
 *   Sync now is not offered either, and the copy has to be careful about why. It is NOT that the
 *   queued Save can never upload — signing in again as the same account re-attaches the same scope
 *   and drains the outbox, which is the other button on the banner this step was opened from. It
 *   is that THIS action discards it, and that no button on THIS step can send it first. So the
 *   sentence is scoped to the action and names the alternative (#1351 patch R4); promising that
 *   the work is doomed would talk a musician out of the one move that saves it.
 */

const OFFLINE_REASON = 'Connect to sign out — exporting works either way.';

export type SignOutMode = 'session' | 'device';

export interface SignOutDialogProps {
    dialogRef: RefObject<HTMLDialogElement | null>;
    /** Which of the two steps this is; see the module comment. */
    mode: SignOutMode;
    /** `false` disables the destructive action and shows the offline reason — `'session'` only. */
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
    mode,
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
    const device = mode === 'device';
    // Every unsent Save is one the account has already refused, so there is nothing left for a
    // sync to send. A partial overlap still offers Sync now: it can empty the rest of the queue,
    // and the refused ones were never going anywhere either way.
    //
    // With the session already gone (#1351) that is true of the WHOLE queue, whatever the account
    // said about any of it: there is no session left to send through.
    const onlyRefused = device || (unsent > 0 && (preflight?.refusedSaves ?? 0) >= unsent);
    // The network gates the destructive button only while there is a request to make of it.
    const blocked = !device && !online;
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
            onClose={whenClosed(onClose)}
        >
            <h2 id="sign-out-title">
                {device ? 'Sign out on this device?' : 'Sign out of your account?'}
            </h2>
            <p>
                {device
                    ? 'Your session has ended, so this device isn’t uploading anything until you sign in again. Signing out here removes your account songbook from this device instead. It stays in your account, and signing in downloads it again. Songs you saved as a guest are untouched.'
                    : 'Your account songbook is removed from this device. It stays in your account, and signing back in downloads it again. Songs you saved as a guest are untouched.'}
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
                            {device
                                ? // Scoped to THIS action, and naming the move that still works
                                  // (#1351 patch R4). "Sync now, or export the song first" would
                                  // name a button that is not on this step; "it can never upload"
                                  // would be false, because cancelling and signing back in as this
                                  // account re-attaches the same scope and drains the queue.
                                  unsent === 1
                                    ? 'Signing out here discards it — this session can’t upload it any more. Export it, or cancel and sign in again to let it upload.'
                                    : 'Signing out here discards them — this session can’t upload them any more. Export them, or cancel and sign in again to let them upload.'
                                : onlyRefused
                                  ? unsent === 1
                                      ? 'Your account won’t accept this version — export it before signing out.'
                                      : 'Your account won’t accept these versions — export them before signing out.'
                                  : 'Signing out discards them. Sync now, or export the song first.'}
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
            {blocked && (
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
                {unsent > 0 && !onlyRefused && (
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
                    disabled={busy || blocked || preflight === null}
                    title={blocked ? OFFLINE_REASON : undefined}
                    onClick={onConfirm}
                >
                    {atRisk ? 'Sign out anyway' : device ? 'Sign out on this device' : 'Sign out'}
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
