import { type ReactNode, useEffect, useRef } from 'react';
import type { ChartDocument } from '../lib/runtime';
import { closeDialog, dialogRule } from './dialog-close';
import { Menu, type MenuItem } from './menu';

/** One preserved draft the menu can offer: a chart the app opens, with when it was captured. */
type Recovery = { document: ChartDocument; capturedAt: string };

/**
 * Which part of the Song menu is showing (#1756): its five actions, the More list, or one of the
 * small dialogs a More item opens. The shell holds it, so an action that fails (a bar that will
 * not fit a new meter) can close whatever is open.
 */
export type SongMenuView = 'actions' | 'more' | 'drafts';

interface SongMenuProps {
    view: SongMenuView | null;
    /** The header's •••, which the menu opens at and hands focus back to. */
    anchor: () => Element | null;
    current: ChartDocument | null;
    saved: ChartDocument | null;
    busy: boolean;
    dirty: boolean;
    /**
     * What Revert goes back to: the saved song, a changed standard's or shared link's chart as it
     * came (#1979), or nothing to revert to.
     */
    revertTo: 'saved' | 'original' | null;
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
            closeDialog(ref.current);
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
 * More opens a second `<Menu>` in place of the first, at the same •••: Revert to saved (to
 * original, on a changed standard or shared link) and
 * Older drafts… (when this device holds any). A submenu beside the first would be a second
 * list to aim at on a laptop and makes no sense in a phone's sheet; swapping the list keeps one
 * menu on screen, and Esc still lands back on the •••.
 *
 * The song's key, mode, meter and chord notation are the transport's Key popover's (#1757);
 * Choruses lives only on the chart footer's form-length menu.
 */
export function SongMenu({
    view,
    anchor,
    current,
    saved,
    busy,
    dirty,
    revertTo,
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
}: SongMenuProps) {
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
        ...(recoveryOptions.length > 0
            ? [
                  {
                      id: 'drafts',
                      label: `Older drafts (${recoveryOptions.length})…`,
                      testId: 'song-menu-drafts',
                      disabled: busy,
                      onSelect: () => onView('drafts'),
                  },
              ]
            : []),
        {
            id: 'revert',
            label: revertTo === 'original' ? 'Revert to original' : 'Revert to saved',
            testId: 'song-menu-revert',
            disabled: busy || !dirty || revertTo === null,
            onSelect: done(onRevert),
        },
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
            <dialog
                ref={drafts}
                className="modal-box"
                aria-labelledby="preserved-drafts-title"
                data-testid="preserved-drafts"
                {...dialogRule({ onClose: close })}
            >
                <h2 id="preserved-drafts-title">Older drafts</h2>
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
                {...dialogRule({ onClose: onCloseShareLink })}
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
