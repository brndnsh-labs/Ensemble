import type { RefObject } from 'react';

export type ExportFormat = 'song' | 'midi' | 'mix' | 'stems' | 'source';

interface ExportDialogProps {
    /** Owned by the shell, which drives `showModal()`/`close()` from its own state. */
    dialogRef: RefObject<HTMLDialogElement | null>;
    title: string;
    busy: boolean;
    /** The song came from an import that kept its original text (`importSource`). */
    hasSource: boolean;
    /**
     * #1278 — an audio render is in flight. It is a distinct state from `busy` so Cancel stays
     * clickable for the whole render while every format is disabled.
     */
    exportingAudio: boolean;
    exportAudioProgress: string;
    onExport: (format: ExportFormat) => void;
    onCancelAudio: () => void;
    onClose: () => void;
}

/** The formats, in plain words, each with the file it writes. */
const FORMATS: readonly { format: ExportFormat; label: string; file: string }[] = [
    { format: 'song', label: 'Song file', file: '.ensemble' },
    { format: 'midi', label: 'MIDI', file: '.mid' },
    { format: 'mix', label: 'Audio (mix)', file: '.wav' },
    { format: 'stems', label: 'Audio (separate tracks)', file: 'a .wav per part' },
];

/**
 * Export… (#1756): the one place a song leaves the app as a file, opened from the Song menu. The
 * formats are a short list of plain names; the original import text is offered too when the song
 * has one. An audio render keeps the dialog open with its progress and Cancel, and nothing but
 * Cancel dismisses it meanwhile, so the render is never left running out of sight. Esc's `cancel`
 * is refused, but a browser honours that refusal only while the page has fresh user activation:
 * a third Esc, or Android's Back gesture, closes the dialog anyway. So a close that lands while
 * the render runs re-opens it at once. Every other format writes its file and the dialog closes.
 */
export function ExportDialog({
    dialogRef,
    title,
    busy,
    hasSource,
    exportingAudio,
    exportAudioProgress,
    onExport,
    onCancelAudio,
    onClose,
}: ExportDialogProps) {
    const formats = hasSource
        ? [...FORMATS, { format: 'source' as const, label: 'Original source', file: '.txt' }]
        : FORMATS;
    return (
        <dialog
            ref={dialogRef}
            className="modal-box export-dialog"
            aria-labelledby="export-dialog-title"
            data-testid="export-dialog"
            onCancel={(event) => {
                if (exportingAudio) {
                    event.preventDefault();
                    return;
                }
                onClose();
            }}
            onClose={(event) => {
                const dialog = event.currentTarget;
                // A queued close reaching a dialog already open again is stale (`whenClosed`).
                if (dialog.open) {
                    return;
                }
                if (exportingAudio) {
                    dialog.showModal();
                    return;
                }
                onClose();
            }}
        >
            <h2 id="export-dialog-title">Export “{title}”</h2>
            <div className="export-formats" role="group" aria-label="Format">
                {formats.map(({ format, label, file }) => (
                    <button
                        key={format}
                        type="button"
                        className="btn export-format"
                        data-testid={`export-${format}`}
                        disabled={busy}
                        onClick={() => onExport(format)}
                    >
                        <span>{label}</span>
                        <span className="export-file" aria-hidden="true">
                            {file}
                        </span>
                    </button>
                ))}
            </div>
            {exportingAudio && (
                <p className="sound-progress export-progress" role="status">
                    {exportAudioProgress || 'Preparing sounds…'}
                </p>
            )}
            <div className="dialog-actions">
                {exportingAudio ? (
                    <button className="btn" onClick={onCancelAudio}>
                        Cancel
                    </button>
                ) : (
                    <button className="btn" disabled={busy} onClick={onClose}>
                        Close
                    </button>
                )}
            </div>
        </dialog>
    );
}
