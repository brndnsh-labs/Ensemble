import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { MAX_COLLECTION_NAME } from '../lib/collections';
import { whenClosed } from './dialog-close';

/**
 * The two collection dialogs of the All songs page (#1477): naming one (New collection, Rename)
 * and deleting one. Both follow the row menu's pattern — the shell owns the `dialogRef` and drives
 * `showModal()`/`close()` from its own state, so Escape, the backdrop and focus restore are the
 * browser's own `<dialog>` behavior. Presentational: every write is the shell's.
 */

export type CollectionNameRequest =
    | { kind: 'new' }
    | { kind: 'rename'; collectionId: string; name: string };

interface CollectionNameDialogProps {
    dialogRef: RefObject<HTMLDialogElement | null>;
    /** What is being named, or null before the dialog has ever been opened. */
    request: CollectionNameRequest | null;
    busy: boolean;
    onSubmit: (name: string) => void;
    onClose: () => void;
}

export function CollectionNameDialog({
    dialogRef,
    request,
    busy,
    onSubmit,
    onClose,
}: CollectionNameDialogProps) {
    const [name, setName] = useState('');
    // Every opening starts from the collection's own name (Rename) or an empty field (New).
    useEffect(() => {
        setName(request?.kind === 'rename' ? request.name : '');
    }, [request]);
    const trimmed = name.trim();
    return (
        <dialog
            ref={dialogRef}
            className="modal-box"
            aria-labelledby="collection-name-title"
            onCancel={(event) => {
                if (busy) {
                    event.preventDefault();
                    return;
                }
                onClose();
            }}
            onClose={whenClosed(onClose)}
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (trimmed) {
                        onSubmit(trimmed);
                    }
                }}
            >
                <h2 id="collection-name-title">
                    {request?.kind === 'rename' ? `Rename “${request.name}”` : 'New collection'}
                </h2>
                <label>
                    <span className="sr">Collection name</span>
                    <input
                        autoFocus
                        value={name}
                        maxLength={MAX_COLLECTION_NAME}
                        placeholder="Gig: Friday, Practice…"
                        disabled={busy}
                        data-testid="collection-name-input"
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>
                <div className="dialog-actions">
                    <button
                        className="btn primary"
                        type="submit"
                        data-testid="collection-name-save"
                        disabled={busy || !trimmed}
                    >
                        {request?.kind === 'rename' ? 'Save' : 'Create'}
                    </button>
                    <button className="btn" type="button" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </form>
        </dialog>
    );
}

export interface CollectionDeleteTarget {
    collectionId: string;
    name: string;
    /** The songs in it that resolve here — what "the songs stay" is about. */
    songCount: number;
    /** Its songs that are in no OTHER collection (Starred counts as one) — `songsOnlyIn`. */
    onlyHere: string[];
}

interface DeleteCollectionDialogProps {
    dialogRef: RefObject<HTMLDialogElement | null>;
    target: CollectionDeleteTarget | null;
    /** An account songbook: a song delete is the online cloud delete, one song at a time. */
    accountLibrary: boolean;
    online: boolean;
    busy: boolean;
    failure: string | null;
    onConfirm: (alsoDeleteSongs: boolean) => void;
    onClose: () => void;
}

/**
 * Delete a collection (#1443 decision 3): it never deletes songs by itself, and says so. The one
 * way it does is an UNCHECKED box — "also delete the N songs that are in no other collection" —
 * which the shell carries out through the songbook's existing delete paths, songs first and the
 * collection last, so an interruption leaves a collection, never deletes nobody can see a reason
 * for. Starred never reaches this dialog: it has no delete affordance.
 */
export function DeleteCollectionDialog({
    dialogRef,
    target,
    accountLibrary,
    online,
    busy,
    failure,
    onConfirm,
    onClose,
}: DeleteCollectionDialogProps) {
    const [alsoSongs, setAlsoSongs] = useState(false);
    // Unchecked on every opening, whatever the last one chose.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `target` is the reset trigger.
    useEffect(() => {
        setAlsoSongs(false);
    }, [target]);
    const only = target?.onlyHere.length ?? 0;
    const songs = target?.songCount ?? 0;
    const blocked = accountLibrary && alsoSongs && !online;
    return (
        <dialog
            ref={dialogRef}
            className="modal-box"
            aria-labelledby="delete-collection-title"
            onCancel={(event) => {
                if (busy) {
                    event.preventDefault();
                    return;
                }
                onClose();
            }}
            onClose={whenClosed(onClose)}
        >
            <h2 id="delete-collection-title">Delete the collection “{target?.name}”?</h2>
            <p data-testid="delete-collection-songs-stay">
                {songs === 0
                    ? 'It holds no songs.'
                    : songs === 1
                      ? 'The song in it stays in your songbook.'
                      : `The ${songs} songs in it stay in your songbook.`}
            </p>
            {only > 0 && (
                <label className="collection-delete-also">
                    <input
                        type="checkbox"
                        checked={alsoSongs}
                        disabled={busy}
                        data-testid="delete-collection-also-songs"
                        onChange={(event) => setAlsoSongs(event.target.checked)}
                    />
                    <span>
                        {only === 1
                            ? 'Also delete the 1 song that is in no other collection'
                            : `Also delete the ${only} songs that are in no other collection`}
                    </span>
                </label>
            )}
            {alsoSongs && (
                <p className="status-detail" data-testid="delete-collection-songs-warning">
                    {accountLibrary
                        ? 'Those songs are deleted from your account. It can’t be undone, and other devices drop their copy on their next sync.'
                        : 'Those songs are removed from this device. It can’t be undone.'}
                </p>
            )}
            {blocked && (
                <p className="status-detail" data-testid="delete-collection-offline">
                    You’re offline. Deleting songs from your account needs a connection.
                </p>
            )}
            {failure !== null && (
                <p className="sync-failure" role="status" data-testid="delete-collection-failure">
                    {failure}
                </p>
            )}
            <div className="dialog-actions">
                <button
                    className="btn danger"
                    data-testid="delete-collection-confirm"
                    disabled={busy || blocked}
                    onClick={() => onConfirm(alsoSongs)}
                >
                    {alsoSongs ? 'Delete collection and songs' : 'Delete collection'}
                </button>
                <button
                    className="btn"
                    data-testid="delete-collection-cancel"
                    disabled={busy}
                    onClick={onClose}
                >
                    Cancel
                </button>
            </div>
        </dialog>
    );
}
