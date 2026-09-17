import type { RefObject } from 'react';
import type * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
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
    onClose: () => void;
    onShare: () => void;
    onSaveCopy: () => void;
    onExport: () => void;
    onExportMidi: () => void;
    onImport: () => void;
    onRevert: () => void;
    onOpenRecovery: (record: Recovery) => void;
}

export function SongMenu({
    dialogRef,
    current,
    saved,
    busy,
    dirty,
    shareLinkFallback,
    recoveryOptions,
    onClose,
    onShare,
    onSaveCopy,
    onExport,
    onExportMidi,
    onImport,
    onRevert,
    onOpenRecovery,
}: SongMenuProps) {
    return (
        <dialog ref={dialogRef} className="modal-box" onCancel={onClose} onClose={onClose}>
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
                <button className="btn" disabled={busy || !dirty || !saved} onClick={onRevert}>
                    Revert to saved
                </button>
                <button className="btn" onClick={onClose}>
                    Close
                </button>
            </div>
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
