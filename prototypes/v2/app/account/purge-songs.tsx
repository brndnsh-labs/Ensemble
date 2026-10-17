'use client';

import type { RefObject } from 'react';
import { PURGE_MESSAGES } from '../../lib/account/messages';
import { whenClosed } from '../dialog-close';

/**
 * The confirm step for deleting account songs from THIS DEVICE for good (#1754): one song a cloud
 * delete cannot remove (the account no longer holds it, or never received it), or — from All
 * songs — every song marked "No longer in your account" at once. Purely local
 * (`accountSync.purgeLocal`): no request, so it works offline and needs no export preflight the
 * way `delete-song.tsx`'s cloud delete does.
 *
 * The shell owns the ref and drives `showModal()`/`close()`, and nothing dismisses this step while
 * the purge runs, the same posture as the other delete steps.
 */
export interface PurgeSongsDialogProps {
    dialogRef: RefObject<HTMLDialogElement | null>;
    /** One song's title, or null for the bulk removal of `count` songs. */
    title: string | null;
    count: number;
    /**
     * The one song was never confirmed by the cloud (#1756), so no cloud delete came before this
     * step and the copy here is the only one. Otherwise a cloud delete came first, or the account
     * no longer holds the song ("No longer in your account").
     */
    unconfirmed: boolean;
    busy: boolean;
    /** Writes the one song to a file first; the bulk removal has none. */
    onExport: (() => void) | null;
    onConfirm: () => void;
    onClose: () => void;
}

export function PurgeSongsDialog({
    dialogRef,
    title,
    count,
    unconfirmed,
    busy,
    onExport,
    onConfirm,
    onClose,
}: PurgeSongsDialogProps) {
    return (
        <dialog
            ref={dialogRef}
            className="modal-box"
            aria-labelledby="purge-songs-title"
            data-testid="purge-songs"
            onCancel={(event) => {
                if (busy) {
                    event.preventDefault();
                    return;
                }
                onClose();
            }}
            onClose={whenClosed(onClose)}
        >
            {title === null ? (
                <>
                    <h2 id="purge-songs-title">{PURGE_MESSAGES.bulk(count)}?</h2>
                    <p>{PURGE_MESSAGES.bulkDetail}</p>
                </>
            ) : (
                <>
                    <h2 id="purge-songs-title">
                        {unconfirmed ? PURGE_MESSAGES.unconfirmedQuestion : PURGE_MESSAGES.question}
                    </h2>
                    <p>
                        <strong>{title}</strong> —{' '}
                        {unconfirmed ? PURGE_MESSAGES.unconfirmedDetail : PURGE_MESSAGES.detail}
                    </p>
                </>
            )}
            <div className="dialog-actions">
                {onExport && (
                    <button
                        className="btn"
                        data-testid="purge-songs-export"
                        disabled={busy}
                        onClick={onExport}
                    >
                        Export file
                    </button>
                )}
                <button
                    className="btn danger"
                    data-testid="purge-songs-confirm"
                    disabled={busy}
                    onClick={onConfirm}
                >
                    {title === null ? 'Remove' : 'Delete'}
                </button>
                <button
                    className="btn"
                    data-testid="purge-songs-cancel"
                    disabled={busy}
                    onClick={onClose}
                >
                    Cancel
                </button>
            </div>
        </dialog>
    );
}
