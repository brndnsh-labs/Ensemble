import { useEffect, useRef, useState } from 'react';
import { MAX_COLLECTION_NAME } from '../lib/collections';
import { backdropDismiss, whenClosed } from './dialog-close';
import { Menu } from './menu';

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
    /** The song this menu is about while the shell has it open, else null. */
    song: SongRowMenuTarget | null;
    /** The row's ⋯, which the menu opens at and hands focus back to. */
    anchor: () => Element | null;
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
 * Add to collection… (#1477), Rename…, Duplicate, Export file, then Delete… after a divider. An
 * anchored `<Menu>` at the row's ⋯ (#1755), not a modal; every choice closes it.
 *
 * One instance driven by the shell's `song` state, rather than one per row: the All songs page
 * can hold thousands of rows, and a menu per row would mean thousands of idle DOM nodes for a
 * menu only one of them is ever showing.
 *
 * Rename… and "Add to collection…" ask for more than a pick, so each opens a small dialog in
 * place of the list: a text field for the new title; the user collections, each a button (one
 * the song is already in says so and is disabled), and a name field for a new one. Escape, a
 * backdrop tap and Cancel close it, and the browser hands focus back to the ⋯ the menu left it on.
 */
export function SongRowMenu({
    song,
    anchor,
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
    // "no song", once it has closed). The id as well as the title: two songs can share a title,
    // and the menu moving between them must still start over.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `song?.id` is a reset trigger.
    useEffect(() => {
        setView('actions');
        setTitle(song?.title ?? '');
        setNewName('');
    }, [song?.id, song?.title]);
    const asking = song !== null && view !== 'actions';
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (asking) {
            dialog.current?.showModal();
        } else {
            dialog.current?.close();
        }
    }, [asking]);
    // Entering "Add to collection…" moves focus INTO it (#1477 review R5), as Rename's autofocus
    // does: to the first collection the song can join, else the new-collection name field.
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
    /** A choice that is the whole answer: the menu closes as it runs. */
    const done = (action: () => void) => () => {
        onClose();
        action();
    };
    return (
        <>
            {song && view === 'actions' && (
                <Menu
                    label={`Actions for ${song.title}`}
                    title={song.title}
                    anchor={anchor}
                    align="end"
                    onClose={onClose}
                    items={[
                        {
                            id: 'star',
                            label: starred ? '☆ Unstar' : '★ Star',
                            testId: 'row-menu-star',
                            disabled: busy,
                            onSelect: done(onToggleStar),
                        },
                        {
                            id: 'collections',
                            label: 'Add to collection…',
                            testId: 'row-menu-add-to-collection',
                            disabled: busy,
                            onSelect: () => setView('collections'),
                        },
                        {
                            id: 'rename',
                            label: 'Rename…',
                            testId: 'row-menu-rename',
                            disabled: busy,
                            onSelect: () => setView('rename'),
                        },
                        {
                            id: 'duplicate',
                            label: 'Duplicate',
                            testId: 'row-menu-duplicate',
                            disabled: busy,
                            onSelect: done(onDuplicate),
                        },
                        {
                            id: 'export',
                            label: 'Export file',
                            testId: 'row-menu-export',
                            disabled: busy,
                            onSelect: done(onExport),
                        },
                        {
                            id: 'delete',
                            label: 'Delete…',
                            testId: 'row-menu-delete',
                            danger: true,
                            disabled: busy,
                            onSelect: done(onDelete),
                        },
                    ]}
                />
            )}
            <dialog
                ref={dialog}
                className="modal-box row-menu"
                aria-labelledby="row-menu-heading"
                onCancel={onClose}
                onClose={whenClosed(onClose)}
                {...backdropDismiss}
            >
                {song && view === 'rename' ? (
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
                                onClick={onClose}
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
                            className="dialog-actions row-menu-collections"
                            data-testid="row-menu-collections"
                        >
                            {collections === null ? (
                                <p className="status-detail">Reading your collections…</p>
                            ) : collections.length === 0 ? (
                                <p className="status-detail">
                                    No collections yet — name one below.
                                </p>
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
                            <button className="btn" type="button" disabled={busy} onClick={onClose}>
                                Cancel
                            </button>
                        </div>
                    </form>
                ) : null}
            </dialog>
        </>
    );
}
