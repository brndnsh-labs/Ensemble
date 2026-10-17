import { TIME_SIGNATURES } from '@engine/config';
import type { ReactNode, RefObject } from 'react';
import type * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import { backdropDismiss, whenClosed } from './dialog-close';
import { downloadImportSource } from './import-dialog';

type Recovery = ReturnType<typeof repository.recoveriesFor>[number];

/** The Choruses control's counts (#1475). The chart format allows up to 64 (`score-codec.ts`). */
const CHORUS_COUNTS = Array.from({ length: 16 }, (_, i) => i + 1);

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
    onClose: () => void;
    onShare: () => void;
    onSaveCopy: () => void;
    onExport: () => void;
    onExportMidi: () => void;
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
    /**
     * #1460 — the three sync facts (`SyncStatus`, `app/account/library.tsx`), moved here from the
     * stand's now-removed footer. Null for a signed-out device or a guest song; a failure among
     * these facts ALSO surfaces on the stand itself without opening this menu — see
     * `syncFailureNotice` and `app/ensemble.tsx`'s `standSyncFailure` — so nothing here is the
     * only place a musician can learn their Save didn't reach the cloud.
     */
    syncStatus: ReactNode;
    /** The song's own meter (`score.meter`), not a section's or a bar's. Measure charts only. */
    onSongMeter: (meter: string) => void;
    /** The song's own major/minor (`score.isMinor`, #1375), never a section or bar override. */
    onSongMode: (isMinor: boolean) => void;
    /** How many choruses the band plays, then stops (#1475); `undefined` repeats continuously. */
    onChoruses: (choruses: number | undefined) => void;
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
    onClose,
    onShare,
    onSaveCopy,
    onExport,
    onExportMidi,
    onRevert,
    onOpenRecovery,
    exportingAudio,
    exportAudioProgress,
    onExportAudioMix,
    onExportAudioStems,
    onCancelExportAudio,
    onDeleteFromAccount,
    syncStatus,
    onSongMeter,
    onSongMode,
    onChoruses,
}: SongMenuProps) {
    const score = current?.schemaVersion === 2 ? current.chart.score : null;
    return (
        <dialog
            ref={dialogRef}
            className="modal-box"
            data-testid="song-menu"
            onCancel={onClose}
            onClose={whenClosed(onClose)}
            {...backdropDismiss}
        >
            {/* Grouped by what each action is FOR (#1700): it was one flat wall of eleven equal
                buttons under a heading ("Keep a good take.") that named none of them, with the
                audio export's progress and Cancel landing below the whole wall. */}
            <h2>Song actions</h2>
            {!inAccount && (
                <p>
                    Saved songs and recovered drafts stay on this device. Export a file to move a
                    song to another computer.
                </p>
            )}
            {/* #1460 — the three sync facts, moved here from the stand's now-removed footer. */}
            {syncStatus && (
                <div className="song-menu-status" data-testid="song-menu-status">
                    <p className="song-menu-status-label">Status</p>
                    {syncStatus}
                </div>
            )}
            <section className="song-menu-group" aria-labelledby="song-menu-share">
                <h3 id="song-menu-share">Share</h3>
                <div className="dialog-actions">
                    <button className="btn primary" disabled={busy} onClick={onShare}>
                        Copy link
                    </button>
                </div>
            </section>
            <section className="song-menu-group" aria-labelledby="song-menu-export">
                <h3 id="song-menu-export">Export</h3>
                <div className="dialog-actions">
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
                </div>
                {exportingAudio && (
                    <p className="sound-progress" role="status">
                        {exportAudioProgress || 'Preparing sounds…'}
                        <button className="btn" onClick={onCancelExportAudio}>
                            Cancel
                        </button>
                    </p>
                )}
            </section>
            <section className="song-menu-group" aria-labelledby="song-menu-song">
                <h3 id="song-menu-song">This song</h3>
                <div className="dialog-actions">
                    <button className="btn" disabled={busy || !saved} onClick={onSaveCopy}>
                        Save a copy
                    </button>
                    <button className="btn" disabled={busy || !dirty || !saved} onClick={onRevert}>
                        Revert to saved
                    </button>
                    {inAccount && (
                        // Offered only for a song the cloud actually holds, and disabled rather
                        // than hidden while offline — a control that vanishes teaches nothing, and
                        // the reason lives in the confirm step (#1270).
                        <button
                            className="btn danger"
                            data-testid="delete-from-account"
                            disabled={busy}
                            onClick={onDeleteFromAccount}
                        >
                            Delete from my account
                        </button>
                    )}
                </div>
            </section>
            {/* The whole song's meter, mode and choruses (#1726): set once a song, so they live
                here rather than where bars are typed. Each is one unsaved change, as a bar is. */}
            {score && (
                <section className="song-menu-group" aria-labelledby="song-menu-chart">
                    <h3 id="song-menu-chart">Chart</h3>
                    <div className="song-menu-fields">
                        <label htmlFor="song-meter">Song meter</label>
                        <select
                            id="song-meter"
                            disabled={busy}
                            value={score.meter}
                            onChange={(e) => onSongMeter(e.target.value)}
                        >
                            {[...new Set([...Object.keys(TIME_SIGNATURES), score.meter])].map(
                                (meter) => (
                                    <option key={meter}>{meter}</option>
                                ),
                            )}
                        </select>
                        <p className="field-hint">
                            Chords keep their share of each bar. A section or bar with its own meter
                            keeps it.
                        </p>
                        <label htmlFor="song-mode">Song mode</label>
                        <select
                            id="song-mode"
                            disabled={busy}
                            value={score.isMinor ? 'minor' : 'major'}
                            onChange={(e) => onSongMode(e.target.value === 'minor')}
                        >
                            <option value="major">Major</option>
                            <option value="minor">Minor</option>
                        </select>
                        <p className="field-hint">
                            Chord names stay as written, and so does the key: for A minor, pick A,
                            then Minor. A section or bar with its own mode keeps it.
                        </p>
                        <label htmlFor="song-choruses">Choruses</label>
                        <select
                            id="song-choruses"
                            disabled={busy}
                            value={score.choruses ?? 'loop'}
                            onChange={(e) =>
                                onChoruses(
                                    e.target.value === 'loop' ? undefined : Number(e.target.value),
                                )
                            }
                        >
                            {/* Named as the chart footer's form-length menu names it. */}
                            <option value="loop">Repeats continuously</option>
                            {[
                                // A chart from elsewhere may count more than the menu offers; it
                                // still shows its own count, as Song meter shows an unlisted meter.
                                ...new Set([...CHORUS_COUNTS, score.choruses ?? 1]),
                            ].map((count) => (
                                <option key={count} value={count}>
                                    {count}
                                </option>
                            ))}
                        </select>
                        <p className="field-hint">
                            Repeats continuously plays the form until you stop. A number plays it
                            that many times, then stops: an Intro at the start plays the first time
                            only, and an Outro at the end or a last-chorus coda the last time only.
                        </p>
                    </div>
                </section>
            )}
            <div className="dialog-actions song-menu-close">
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
