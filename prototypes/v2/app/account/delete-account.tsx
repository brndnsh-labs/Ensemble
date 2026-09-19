'use client';

import { useEffect, useRef, useState } from 'react';
import type { AccountFailure } from '../../lib/account/messages';
import { AccountFailureNotice } from './account-failure';

/**
 * "Delete my account" — the confirmation step (#1271, DECISION 2026-09-17: accounts do not ship
 * without a way out).
 *
 * A SECTION of the account page's existing `<dialog>`, not a second dialog of its own — the same
 * shape `RecoveryCodeStep` takes, and for the same reason: the shell owns exactly one
 * `showModal()`/`close()` per dialog, and a nested modal would need a second ref, a second
 * open-state and its own focus plumbing to say something this page is already the right place for.
 *
 * Three things stand between the button and the deletion, in this order:
 *
 * 1. **What goes, in plain words** — the cloud songbook, the passkeys, the recovery code — and
 *    what does not: the guest songbook is a different library on this device and is untouched.
 * 2. **Export first, from right here.** One file per song, written from the account library on
 *    this device. It is the only thing that survives this, which is why it sits above the
 *    destructive button rather than in a sentence suggesting the musician go and find it.
 * 3. **A typed confirmation.** The word `delete`, typed — not a second "are you sure" button that
 *    a practised hand dismisses in the same gesture as the first. Nothing else unlocks Delete.
 *
 * The copy is honest about backups: nightly snapshots age out on their own schedule, and no client
 * can promise an instant erasure from them. Saying so is the contract; implying otherwise is not.
 */

/** Typed verbatim to unlock the destructive button. Compared trimmed and case-insensitively. */
export const DELETE_CONFIRMATION = 'delete';

const OFFLINE_REASON = 'Connect to delete your account — exporting works either way.';

export interface DeleteAccountStepProps {
    /** The account page's own heading id, so this step names the dialog while it is open. */
    headingId: string;
    /** `false` disables the destructive action and shows the offline reason. */
    online: boolean;
    busy: boolean;
    /**
     * How many songs the account library holds on this device, or `null` while it is still being
     * read. Export writes files FROM that library, so offering the button before it exists is a
     * click that silently writes nothing — the same rule the sign-out step's `songsReady` follows.
     */
    songCount: number | null;
    failure: AccountFailure | null;
    /** Writes one file per song in the account library. Never disabled by the network. */
    onExport: () => void;
    onConfirm: () => void;
    /** Back to the account page. Refused while the request is in flight. */
    onCancel: () => void;
}

export function DeleteAccountStep({
    headingId,
    online,
    busy,
    songCount,
    failure,
    onExport,
    onConfirm,
    onCancel,
}: DeleteAccountStepProps) {
    const [typed, setTyped] = useState('');

    /**
     * The button that got us here unmounts the instant this step replaces it, so focus would
     * otherwise fall back to `<body>` — outside the dialog and silent for a screen reader. Same
     * fix, for the same reason, as `RecoveryCodeStep`'s own mount effect.
     */
    const headingRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        headingRef.current?.focus();
    }, []);

    const confirmed = typed.trim().toLowerCase() === DELETE_CONFIRMATION;
    return (
        <>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>
                Delete your account?
            </h2>
            <p>
                Your account songbook, your passkeys and your recovery code are deleted from the
                server, and this device is signed out. There is no undo and no support override.
                Songs you saved as a guest are a different library on this device — they are
                untouched.
            </p>
            <p className="status-detail" data-testid="delete-account-backups">
                Nightly backups are kept for a while and age out on their own schedule, so the
                deletion is not instant everywhere. Nothing in them is reachable from the app, and
                nothing is restored to a deleted account.
            </p>
            {songCount !== null && songCount > 0 && (
                <p className="status-detail" data-testid="delete-account-songs">
                    {songCount === 1
                        ? 'One song is in your account songbook.'
                        : `${songCount} songs are in your account songbook.`}{' '}
                    Export them first if you want to keep them — a file on this device is the only
                    copy that survives.
                </p>
            )}
            {songCount === null && (
                <p className="status-detail" data-testid="delete-account-counting">
                    Checking what’s in your account songbook…
                </p>
            )}
            {!online && (
                <p className="status-detail" data-testid="delete-account-offline">
                    {OFFLINE_REASON}
                </p>
            )}
            <AccountFailureNotice failure={failure} />
            <label className="delete-confirm" htmlFor="delete-account-input">
                Type <strong>{DELETE_CONFIRMATION}</strong> to confirm
            </label>
            <input
                id="delete-account-input"
                data-testid="delete-account-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={typed}
                disabled={busy}
                onChange={(event) => setTyped(event.currentTarget.value)}
            />
            <div className="dialog-actions">
                {(songCount === null || songCount > 0) && (
                    <button
                        className="btn"
                        data-testid="delete-account-export"
                        // Never disabled by the NETWORK: a file written to this device's own disk
                        // is the one thing that survives whatever happens next. `songCount ===
                        // null` is a different fact — the library these files are written from
                        // has not been read yet, and a button that wrote nothing would be worse
                        // than a disabled one (same rule as the sign-out step's `songsReady`).
                        disabled={busy || songCount === null}
                        onClick={onExport}
                    >
                        {songCount === null
                            ? 'Export your songs'
                            : songCount === 1
                              ? 'Export that song'
                              : `Export those ${songCount} songs`}
                    </button>
                )}
                <button
                    className="btn danger"
                    data-testid="delete-account-confirm"
                    // Never while the library is unread: deleting before `songCount` resolves
                    // means the Export button above may still be disabled, and Delete must not
                    // outrun the one safeguard standing between the musician and losing songs.
                    disabled={busy || !online || songCount === null || !confirmed}
                    title={online ? undefined : OFFLINE_REASON}
                    onClick={onConfirm}
                >
                    Delete my account
                </button>
                <button
                    className="btn"
                    data-testid="delete-account-cancel"
                    // Nothing dismisses this step while the request is in flight — the answer to a
                    // destructive request is written here, not walked away from.
                    disabled={busy}
                    onClick={onCancel}
                >
                    Cancel
                </button>
            </div>
        </>
    );
}
