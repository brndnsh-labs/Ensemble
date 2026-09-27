import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { whenClosed } from './dialog-close';

export interface SongRowMenuTarget {
    id: string;
    title: string;
}

interface SongRowMenuProps {
    /** Owned by the shell, which drives `showModal()`/`close()` from its own `rowMenu` state. */
    dialogRef: RefObject<HTMLDialogElement | null>;
    /** The song this menu is currently about, or null before it has ever been opened. */
    song: SongRowMenuTarget | null;
    starred: boolean;
    busy: boolean;
    onClose: () => void;
    onToggleStar: () => void;
    onRename: (title: string) => void;
    onDuplicate: () => void;
    onExport: () => void;
    onDelete: () => void;
}

/**
 * The row ⋯ menu (#1440), shared by the All songs page and the songbook home rows: Star/Unstar,
 * Rename, Duplicate, Export file, a divider, then Delete… — the mockup's exact order.
 *
 * One dialog instance driven by the shell's `song` state, rather than one per row: the All songs
 * page can hold thousands of rows, and a `<dialog>` per row would mean thousands of idle DOM
 * nodes for a menu only one of them is ever showing.
 *
 * Rename is answered IN PLACE — a text field replaces the action list inside this same dialog —
 * rather than a second dialog, so Escape/backdrop-click/focus-trap keep working through the
 * browser's own `<dialog>` behavior without a second layer of modal plumbing.
 */
export function SongRowMenu({
    dialogRef,
    song,
    starred,
    busy,
    onClose,
    onToggleStar,
    onRename,
    onDuplicate,
    onExport,
    onDelete,
}: SongRowMenuProps) {
    const [renaming, setRenaming] = useState(false);
    const [title, setTitle] = useState('');
    // Reset the rename sub-view every time the menu points at a different song (including
    // "no song yet", before it has been opened at all).
    useEffect(() => {
        setRenaming(false);
        setTitle(song?.title ?? '');
    }, [song?.title]);
    return (
        <dialog
            ref={dialogRef}
            className="modal-box row-menu"
            aria-labelledby="row-menu-heading"
            onCancel={onClose}
            onClose={whenClosed(onClose)}
        >
            {song && renaming ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        const trimmed = title.trim();
                        if (trimmed) {
                            onRename(trimmed);
                        }
                    }}
                >
                    <h2 id="row-menu-heading">Rename “{song.title}”</h2>
                    <label>
                        <span className="sr">New title</span>
                        <input
                            autoFocus
                            value={title}
                            maxLength={150}
                            disabled={busy}
                            data-testid="row-menu-rename-input"
                            onChange={(event) => setTitle(event.target.value)}
                        />
                    </label>
                    <div className="dialog-actions">
                        <button
                            className="btn primary"
                            type="submit"
                            data-testid="row-menu-rename-save"
                            disabled={busy || !title.trim()}
                        >
                            Save
                        </button>
                        <button
                            className="btn"
                            type="button"
                            data-testid="row-menu-rename-cancel"
                            disabled={busy}
                            onClick={() => setRenaming(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <>
                    <h2 id="row-menu-heading" className="sr">
                        {song ? `Actions for ${song.title}` : 'Song actions'}
                    </h2>
                    <div className="dialog-actions row-menu-actions">
                        <button
                            className="btn"
                            data-testid="row-menu-star"
                            disabled={busy}
                            onClick={onToggleStar}
                        >
                            {starred ? '☆ Unstar' : '★ Star'}
                        </button>
                        <button
                            className="btn"
                            data-testid="row-menu-rename"
                            disabled={busy}
                            onClick={() => setRenaming(true)}
                        >
                            Rename
                        </button>
                        <button
                            className="btn"
                            data-testid="row-menu-duplicate"
                            disabled={busy}
                            onClick={onDuplicate}
                        >
                            Duplicate
                        </button>
                        <button
                            className="btn"
                            data-testid="row-menu-export"
                            disabled={busy}
                            onClick={onExport}
                        >
                            Export file
                        </button>
                        <hr className="row-menu-divider" />
                        <button
                            className="btn danger"
                            data-testid="row-menu-delete"
                            disabled={busy}
                            onClick={onDelete}
                        >
                            Delete…
                        </button>
                    </div>
                    <div className="dialog-actions">
                        <button className="btn" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </>
            )}
        </dialog>
    );
}
