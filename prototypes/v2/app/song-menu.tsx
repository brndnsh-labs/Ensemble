import type { RefObject } from 'react';
import type * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import { whenClosed } from './dialog-close';
import { downloadImportSource } from './import-dialog';

type Recovery = ReturnType<typeof repository.recoveriesFor>[number];

interface SongMenuProps {
    /** Owned by the shell, which drives `showModal()`/`close()` from its `menu` state. */
    dialogRef: RefObject<HTMLDialogElement | null>;
    current: ChartDocument | null;
    saved: ChartDocument | null;
    busy: boolean;
    dirty: boolean;
    shareLinkFallback: string | null;
    recoveryOptions: Recovery[];
    /**
     * Whether this chart is one the musician's ACCOUNT holds a confirmed copy of (#1270) — signed
     * in, opened from the account songbook, and acknowledged by the cloud at some revision. False
     * for every other case: a guest song, an account song that has never uploaded, or a shared
     * draft. Deleting from the cloud is only offered for a song that is actually in the cloud.
     */
    inAccount: boolean;
    /**
     * Does this device hold an old-Ensemble (v1) profile (#1274)? The entry below is the
     * permanent way back into the import (DECISION 2026-09-19): it is shown for as long as
     * there is v1 data on this origin, including after a "Not now" and after everything has
     * already been brought over — which is the point, since the automatic offer never
     * returns once declined.
     */
    v1Available: boolean;
    onBringOverV1: () => void;
    onClose: () => void;
    onShare: () => void;
    onSaveCopy: () => void;
    onExport: () => void;
    onExportMidi: () => void;
    onImport: () => void;
    onRevert: () => void;
    onOpenRecovery: (record: Recovery) => void;
    /** #1278 — audio export is a distinct busy state from `busy` so its Cancel
     * button stays clickable while the render is in flight; see `onCancelExportAudio`. */
    exportingAudio: boolean;
    exportAudioProgress: string;
    onExportAudioMix: () => void;
    onExportAudioStems: () => void;
    onCancelExportAudio: () => void;
    onDeleteFromAccount: () => void;
}

export function SongMenu({
    dialogRef,
    current,
    saved,
    busy,
    dirty,
    shareLinkFallback,
    recoveryOptions,
    inAccount,
    v1Available,
    onBringOverV1,
    onClose,
    onShare,
    onSaveCopy,
    onExport,
    onExportMidi,
    onImport,
    onRevert,
    onOpenRecovery,
    exportingAudio,
    exportAudioProgress,
    onExportAudioMix,
    onExportAudioStems,
    onCancelExportAudio,
    onDeleteFromAccount,
}: SongMenuProps) {
    return (
        <dialog
            ref={dialogRef}
            className="modal-box"
            onCancel={onClose}
            onClose={whenClosed(onClose)}
        >
            <h2>Keep a good take.</h2>
            <p>
                Saved setups and recovered drafts stay on this device. Export a file to move a song
                to another computer.
            </p>
            <div className="dialog-actions">
                <button className="btn primary" disabled={busy} onClick={onShare}>
                    Copy link
                </button>
                <button className="btn" disabled={busy || !saved} onClick={onSaveCopy}>
                    Save a copy
                </button>
                <button className="btn" disabled={busy} onClick={onExport}>
                    Export file
                </button>
                <button className="btn" disabled={busy} onClick={onExportMidi}>
                    Export MIDI
                </button>
                <button className="btn" disabled={busy} onClick={onExportAudioMix}>
                    Export audio (mix)
                </button>
                <button className="btn" disabled={busy} onClick={onExportAudioStems}>
                    Export audio (stems)
                </button>
                {current?.schemaVersion === 2 && current.importSource && (
                    <button
                        className="btn"
                        disabled={busy}
                        onClick={() => downloadImportSource(current.importSource!.text)}
                    >
                        Download original source
                    </button>
                )}
                <button className="btn" disabled={busy} onClick={onImport}>
                    Import chart
                </button>
                {v1Available && (
                    <button
                        className="btn"
                        data-testid="bring-over-v1"
                        disabled={busy}
                        onClick={onBringOverV1}
                    >
                        Bring over old Ensemble songs
                    </button>
                )}
                <button className="btn" disabled={busy || !dirty || !saved} onClick={onRevert}>
                    Revert to saved
                </button>
                {inAccount && (
                    // Offered only for a song the cloud actually holds, and disabled rather than
                    // hidden while offline — a control that vanishes teaches nothing, and the
                    // reason lives in the confirm step (#1270).
                    <button
                        className="btn"
                        data-testid="delete-from-account"
                        disabled={busy}
                        onClick={onDeleteFromAccount}
                    >
                        Delete from my account
                    </button>
                )}
                <button className="btn" onClick={onClose}>
                    Close
                </button>
            </div>
            {exportingAudio && (
                <p className="sound-progress" role="status">
                    {exportAudioProgress || 'Preparing sounds…'}
                    <button className="btn" onClick={onCancelExportAudio}>
                        Cancel
                    </button>
                </p>
            )}
            {shareLinkFallback && (
                <p className="share-link-fallback">
                    <label htmlFor="share-link-url">
                        Clipboard isn't available here — copy this link manually:
                    </label>
                    <input
                        id="share-link-url"
                        type="text"
                        readOnly
                        value={shareLinkFallback}
                        data-testid="share-link-fallback"
                        onFocus={(event) => event.currentTarget.select()}
                    />
                </p>
            )}
            {recoveryOptions.length > 0 && (
                <details className="recovery-list">
                    <summary>Preserved drafts ({recoveryOptions.length})</summary>
                    <p>
                        Older or competing drafts are kept here even after a newer save. Open one as
                        an independent copy, leaving your current setup intact.
                    </p>
                    {recoveryOptions.map((record) => (
                        <button
                            className="jam-tile"
                            key={`${record.capturedAt}-${record.document.revision}-${JSON.stringify(record.document.chart)}`}
                            disabled={busy}
                            onClick={() => onOpenRecovery(record)}
                        >
                            <span>
                                <strong>
                                    Open copy of {record.document.title} ·{' '}
                                    {record.document.chart.performance.bpm} BPM
                                </strong>
                                <small>
                                    {new Date(record.capturedAt).toLocaleString()} · based on
                                    revision {record.document.revision}
                                </small>
                            </span>
                        </button>
                    ))}
                </details>
            )}
        </dialog>
    );
}
