import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { MAX_COLLECTION_NAME } from '../lib/collections';
import { whenClosed } from './dialog-close';

export interface SongRowMenuTarget {
    id: string;
    title: string;
}

/** One user collection as "Add to collection…" lists it (#1477). Starred is never listed. */
export interface RowMenuCollection {
    id: string;
    name: string;
    /** This song is already in it. */
    contains: boolean;
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
    /** The songbook's user collections, or null while they are still being read (#1477). */
    collections: readonly RowMenuCollection[] | null;
    onAddToCollection: (collectionId: string) => void;
    /** Make a new collection holding just this song. */
    onCreateCollection: (name: string) => void;
}

/**
 * The row ⋯ menu (#1440), shared by the All songs page and the songbook home rows: Star/Unstar,
 * Add to collection… (#1477), Rename, Duplicate, Export file, a divider, then Delete….
 *
 * One dialog instance driven by the shell's `song` state, rather than one per row: the All songs
 * page can hold thousands of rows, and a `<dialog>` per row would mean thousands of idle DOM
 * nodes for a menu only one of them is ever showing.
 *
 * Rename is answered IN PLACE — a text field replaces the action list inside this same dialog —
 * rather than a second dialog, so Escape/backdrop-click/focus-trap keep working through the
 * browser's own `<dialog>` behavior without a second layer of modal plumbing. "Add to
 * collection…" (#1477) is answered in place the same way: the user collections, each a button
 * (one the song is already in says so and is disabled), and a name field for a new one.
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
    collections,
    onAddToCollection,
    onCreateCollection,
}: SongRowMenuProps) {
    const [view, setView] = useState<'actions' | 'rename' | 'collections'>('actions');
    const [title, setTitle] = useState('');
    const [newName, setNewName] = useState('');
    // Reset to the action list every time the menu points at a different song (including
    // "no song yet", before it has been opened at all). The id as well as the title: two songs
    // can share a title, and the menu moving between them must still start over.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `song?.id` is a reset trigger.
    useEffect(() => {
        setView('actions');
        setTitle(song?.title ?? '');
        setNewName('');
    }, [song?.id, song?.title]);
    const renaming = view === 'rename';
    // Entering "Add to collection…" moves focus INTO it (#1477 review R5), as Rename's autofocus
    // does: to the first collection the song can join, else the new-collection name field. The
    // button that opened it is gone with the action list, so focus would otherwise fall to the
    // dialog itself.
    const collectionsView = useRef<HTMLFormElement>(null);
    useEffect(() => {
        if (view !== 'collections') {
            return;
        }
        const form = collectionsView.current;
        const target =
            form?.querySelector<HTMLButtonElement>(
                '[data-testid="row-menu-collection"]:not(:disabled)',
            ) ?? form?.querySelector<HTMLInputElement>('input');
        target?.focus();
    }, [view]);
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
                            onClick={() => setView('actions')}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : song && view === 'collections' ? (
                <form
                    ref={collectionsView}
                    onSubmit={(event) => {
                        event.preventDefault();
                        const trimmed = newName.trim();
                        if (trimmed) {
                            onCreateCollection(trimmed);
                        }
                    }}
                >
                    <h2 id="row-menu-heading">Add “{song.title}” to a collection</h2>
                    <div
                        className="dialog-actions row-menu-actions"
                        data-testid="row-menu-collections"
                    >
                        {collections === null ? (
                            <p className="status-detail">Reading your collections…</p>
                        ) : collections.length === 0 ? (
                            <p className="status-detail">No collections yet — name one below.</p>
                        ) : (
                            collections.map((collection) => (
                                <button
                                    key={collection.id}
                                    type="button"
                                    className="btn"
                                    data-testid="row-menu-collection"
                                    disabled={busy || collection.contains}
                                    onClick={() => onAddToCollection(collection.id)}
                                >
                                    {collection.name}
                                    {collection.contains ? ' · already in it' : ''}
                                </button>
                            ))
                        )}
                    </div>
                    <label>
                        <span className="sr">New collection name</span>
                        <input
                            value={newName}
                            maxLength={MAX_COLLECTION_NAME}
                            placeholder="New collection…"
                            disabled={busy}
                            data-testid="row-menu-new-collection-input"
                            onChange={(event) => setNewName(event.target.value)}
                        />
                    </label>
                    <div className="dialog-actions">
                        <button
                            className="btn primary"
                            type="submit"
                            data-testid="row-menu-new-collection-save"
                            disabled={busy || !newName.trim()}
                        >
                            Create and add
                        </button>
                        <button
                            className="btn"
                            type="button"
                            disabled={busy}
                            onClick={() => setView('actions')}
                        >
                            Back
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
                            data-testid="row-menu-add-to-collection"
                            disabled={busy}
                            onClick={() => setView('collections')}
                        >
                            Add to collection…
                        </button>
                        <button
                            className="btn"
                            data-testid="row-menu-rename"
                            disabled={busy}
                            onClick={() => setView('rename')}
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
