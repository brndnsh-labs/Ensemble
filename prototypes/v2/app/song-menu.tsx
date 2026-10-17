import { TIME_SIGNATURES } from '@engine/config';
import { type ReactNode, useEffect, useRef } from 'react';
import type * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import { backdropDismiss, whenClosed } from './dialog-close';
import { Menu, type MenuItem } from './menu';

type Recovery = ReturnType<typeof repository.recoveriesFor>[number];

/**
 * Which part of the Song menu is showing (#1756): its five actions, the More list, or one of the
 * small dialogs a More item opens. The shell holds it, so an action that fails (a bar that will
 * not fit a new meter) can close whatever is open.
 */
export type SongMenuView = 'actions' | 'more' | 'settings' | 'drafts';

interface SongMenuProps {
    view: SongMenuView | null;
    /** The header's •••, which the menu opens at and hands focus back to. */
    anchor: () => Element | null;
    current: ChartDocument | null;
    saved: ChartDocument | null;
    busy: boolean;
    dirty: boolean;
    /** Whether the song on the stand can be deleted: a saved song, guest or account. */
    canDelete: boolean;
    recoveryOptions: Recovery[];
    /**
     * #1460 — the sync facts (`SyncStatus`, `app/account/library.tsx`), shown above the actions.
     * Null for a signed-out device or a guest song; a failure among these facts ALSO surfaces on
     * the stand itself without opening this menu — see `syncFailureNotice` and
     * `app/ensemble.tsx`'s `standSyncFailure`.
     */
    syncStatus: ReactNode;
    /** The link Copy link could not put on the clipboard, shown to copy by hand; else null. */
    shareLinkFallback: string | null;
    onView: (view: SongMenuView | null) => void;
    onShare: () => void;
    onDuplicate: () => void;
    onExport: () => void;
    onRevert: () => void;
    onOpenRecovery: (record: Recovery) => void;
    onDelete: () => void;
    onCloseShareLink: () => void;
    /** The song's own meter (`score.meter`), not a section's or a bar's. Measure charts only. */
    onSongMeter: (meter: string) => void;
    /** The song's own major/minor (`score.isMinor`, #1375), never a section or bar override. */
    onSongMode: (isMinor: boolean) => void;
}

/** Drives a `<dialog>`'s `showModal()`/`close()` from whether it should be open. */
function useModal(open: boolean) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (open) {
            if (!ref.current?.open) {
                ref.current?.showModal();
            }
        } else {
            ref.current?.close();
        }
    }, [open]);
    return ref;
}

/**
 * The Song menu (•••, #1756): an anchored `<Menu>` of five actions — Copy link, Duplicate,
 * Export…, More, then Delete… after a divider — with the sync facts above them. It holds no form
 * fields and no help text: anything that needs more than a pick opens its own small dialog
 * (Export… is the shell's `ExportDialog`).
 *
 * More opens a second `<Menu>` in place of the first, at the same •••: Revert to saved, Preserved
 * drafts… (when this device holds any) and, for a measure chart, Song settings…. A submenu beside
 * the first would be a second list to aim at on a laptop and makes no sense in a phone's sheet;
 * swapping the list keeps one menu on screen, and Esc still lands back on the •••.
 *
 * Song settings… (Song meter and Song mode) is a stopgap until the transport's Key popover
 * (#1757) takes them; Choruses lives only on the chart footer's form-length menu.
 */
export function SongMenu({
    view,
    anchor,
    current,
    saved,
    busy,
    dirty,
    canDelete,
    recoveryOptions,
    syncStatus,
    shareLinkFallback,
    onView,
    onShare,
    onDuplicate,
    onExport,
    onRevert,
    onOpenRecovery,
    onDelete,
    onCloseShareLink,
    onSongMeter,
    onSongMode,
}: SongMenuProps) {
    const score = current?.schemaVersion === 2 ? current.chart.score : null;
    const settings = useModal(view === 'settings' && score !== null);
    const drafts = useModal(view === 'drafts');
    const shareLink = useModal(shareLinkFallback !== null);
    const close = () => onView(null);
    /** A choice that is the whole answer: the menu closes as it runs. */
    const done = (action: () => void) => () => {
        close();
        action();
    };
    const actions: MenuItem[] = [
        {
            id: 'share',
            label: 'Copy link',
            testId: 'song-menu-share',
            disabled: busy,
            onSelect: done(onShare),
        },
        {
            id: 'duplicate',
            label: 'Duplicate',
            testId: 'song-menu-duplicate',
            disabled: busy || !saved,
            onSelect: done(onDuplicate),
        },
        {
            id: 'export',
            label: 'Export…',
            testId: 'song-menu-export',
            disabled: busy,
            onSelect: done(onExport),
        },
        {
            id: 'more',
            label: 'More',
            hint: <span aria-hidden="true">▸</span>,
            testId: 'song-menu-more',
            onSelect: () => onView('more'),
        },
        {
            id: 'delete',
            label: 'Delete…',
            testId: 'song-menu-delete',
            danger: true,
            disabled: busy || !canDelete,
            onSelect: done(onDelete),
        },
    ];
    const more: MenuItem[] = [
        {
            id: 'revert',
            label: 'Revert to saved',
            testId: 'song-menu-revert',
            disabled: busy || !dirty || !saved,
            onSelect: done(onRevert),
        },
        ...(recoveryOptions.length > 0
            ? [
                  {
                      id: 'drafts',
                      label: `Preserved drafts (${recoveryOptions.length})…`,
                      testId: 'song-menu-drafts',
                      disabled: busy,
                      onSelect: () => onView('drafts'),
                  },
              ]
            : []),
        ...(score
            ? [
                  {
                      id: 'settings',
                      label: 'Song settings…',
                      testId: 'song-menu-settings',
                      disabled: busy,
                      onSelect: () => onView('settings'),
                  },
              ]
            : []),
    ];
    return (
        <>
            {current && (view === 'actions' || view === 'more') && (
                <Menu
                    // A new list is a new menu: its own focus on the first row.
                    key={view}
                    label={view === 'more' ? 'More song actions' : 'Song actions'}
                    title={view === 'more' ? `${current.title} · More` : current.title}
                    anchor={anchor}
                    align="end"
                    header={view === 'actions' ? syncStatus : undefined}
                    className="song-menu"
                    items={view === 'more' ? more : actions}
                    onClose={close}
                />
            )}
            {/* Song meter and Song mode until the transport's Key popover takes them (#1757).
                Each is one unsaved change, as a bar is. */}
            <dialog
                ref={settings}
                className="modal-box song-settings"
                aria-labelledby="song-settings-title"
                data-testid="song-settings"
                onCancel={close}
                onClose={whenClosed(close)}
                {...backdropDismiss}
            >
                <h2 id="song-settings-title">Song settings</h2>
                {score && (
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
                            A section or bar with its own meter or mode keeps it.
                        </p>
                    </div>
                )}
                <div className="dialog-actions">
                    <button className="btn" onClick={close}>
                        Close
                    </button>
                </div>
            </dialog>
            <dialog
                ref={drafts}
                className="modal-box"
                aria-labelledby="preserved-drafts-title"
                data-testid="preserved-drafts"
                onCancel={close}
                onClose={whenClosed(close)}
                {...backdropDismiss}
            >
                <h2 id="preserved-drafts-title">Preserved drafts</h2>
                <p>
                    Older or competing drafts are kept here even after a newer save. Open one as an
                    independent copy; the song you have open is unchanged.
                </p>
                <div className="recovery-list">
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
                </div>
                <div className="dialog-actions">
                    <button className="btn" onClick={close}>
                        Close
                    </button>
                </div>
            </dialog>
            {/* Copy link's fallback, where the clipboard is unavailable or refused (notably the
                WebKit test project, which grants no clipboard permission). */}
            <dialog
                ref={shareLink}
                className="modal-box"
                aria-labelledby="share-link-title"
                data-testid="share-link"
                onCancel={onCloseShareLink}
                onClose={whenClosed(onCloseShareLink)}
                {...backdropDismiss}
            >
                <h2 id="share-link-title">Copy this link</h2>
                {shareLinkFallback !== null && (
                    <p className="share-link-fallback">
                        <label htmlFor="share-link-url">
                            The clipboard isn’t available here. Copy the link yourself:
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
                <div className="dialog-actions">
                    <button className="btn" onClick={onCloseShareLink}>
                        Close
                    </button>
                </div>
            </dialog>
        </>
    );
}
