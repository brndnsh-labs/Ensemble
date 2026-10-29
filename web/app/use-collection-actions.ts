import { type Dispatch, type RefObject, type SetStateAction, useCallback, useState } from 'react';
import type { SyncSnapshot } from '../lib/account/sync-loop';
import { songsOnlyIn } from '../lib/collections';
import * as repository from '../lib/repository';
import { forgetOpened as forgetOpenedGuest } from '../lib/session';
import type { CollectionDeleteTarget, CollectionNameRequest } from './collection-dialogs';
import type { SongRowMenuTarget } from './song-row-menu';
import type { useCollections } from './use-collections';
import { useModalDialog } from './use-modal-dialog';
import type { SongDeletes } from './use-song-deletes';

/** What the shell hands `useCollectionActions`. */
interface CollectionActionsOptions {
    /** The live songbook's collections and their writes (`useCollections`). */
    collections: Pick<
        ReturnType<typeof useCollections>,
        | 'collections'
        | 'toggleStar'
        | 'addSong'
        | 'create'
        | 'rename'
        | 'remove'
        | 'fresh'
        | 'deleteRefusal'
    >;
    /** The star set every surface reads (Starred's songs). */
    starred: ReadonlySet<string>;
    /** The row whose ⋯ menu is open (#1440), or null. */
    rowMenuFor: SongRowMenuTarget | null;
    /** Closes the row ⋯ menu. */
    closeRowMenu: () => void;
    /** The session is signed in. */
    signedIn: boolean;
    /** The loop's published snapshot: its `owner` is the attached account, or null. */
    sync: Pick<SyncSnapshot, 'owner'>;
    /** The shell's one-action lock. */
    run: (task: () => void | Promise<void>, quiet?: boolean) => Promise<void>;
    /** Re-reads the songbook. */
    refreshSongs: () => Promise<void>;
    /** The one cloud delete commit (`useSongDeletes`'s), shared with the song deletes. */
    commitCloudDelete: SongDeletes['commitCloudDelete'];
    /** The songbook's own status line (`homeNotice`). */
    setHomeNoticeState: Dispatch<SetStateAction<string>>;
    /** When each song was last opened, by id. */
    setOpenedAtState: Dispatch<SetStateAction<Map<string, string>>>;
}

/** What the All songs page, the row ⋯ menu and the two collection dialogs read back. */
interface CollectionActions {
    /** The New/Rename dialog's request, or null when it is shut. */
    collectionNaming: CollectionNameRequest | null;
    /** Opens (New collection, the collection bar's Rename…) or shuts it. */
    setCollectionNaming: Dispatch<SetStateAction<CollectionNameRequest | null>>;
    collectionNameDialogRef: RefObject<HTMLDialogElement | null>;
    /** The delete confirm's collection, or null when it is shut. */
    collectionDeleteTarget: CollectionDeleteTarget | null;
    /** Shuts the delete confirm (its own close). */
    setCollectionDeleteTarget: Dispatch<SetStateAction<CollectionDeleteTarget | null>>;
    /** The sentence the last refused collection delete produced, or null. */
    collectionDeleteFailure: string | null;
    /** The collection THIS TAB's own delete just removed (#1477 review R5), or null. */
    deletedCollectionId: string | null;
    /** Clears `deletedCollectionId` once the page has acted on it; stable across renders. */
    collectionRemovalHandled: () => void;
    collectionDeleteDialogRef: RefObject<HTMLDialogElement | null>;
    toggleStar: (id: string) => void;
    addRowToCollection: (collectionId: string) => void;
    createCollectionWithRow: (name: string) => void;
    submitCollectionName: (name: string) => void;
    requestDeleteCollection: (collectionId: string) => void;
    deleteCollectionConfirmed: (alsoDeleteSongs: boolean) => void;
}

/**
 * The All songs page's collection actions (#1477): starring, the row ⋯ menu's "Add to
 * collection…", the New/Rename dialog and the delete confirm — each dialog's state, its
 * `<dialog>` and the handlers that open and answer it. The shell keeps the collection state
 * (`useCollections`), the dialogs' rendering and the paths these reach (`run`,
 * `useSongbookLibrary`'s `refreshSongs`, the row menu). Call it after `useSongDeletes`, for its `commitCloudDelete`.
 */
export function useCollectionActions({
    collections,
    starred,
    rowMenuFor,
    closeRowMenu,
    signedIn,
    sync,
    run,
    refreshSongs,
    commitCloudDelete,
    setHomeNoticeState,
    setOpenedAtState,
}: CollectionActionsOptions): CollectionActions {
    // #1477 — the collection dialogs of the All songs page: naming one (New, Rename) and deleting
    // one, each driven from this state like the row menu's own dialogs.
    const [collectionNaming, setCollectionNaming] = useState<CollectionNameRequest | null>(null);
    // #1477 — the collection dialogs, driven from their state like the delete dialog.
    const collectionNameDialogRef = useModalDialog(collectionNaming !== null);
    const [collectionDeleteTarget, setCollectionDeleteTarget] =
        useState<CollectionDeleteTarget | null>(null);
    const [collectionDeleteFailure, setCollectionDeleteFailure] = useState<string | null>(null);
    // The collection THIS TAB's own delete just removed (#1477 review R5) — `deletedRowId`'s rule.
    const [deletedCollectionId, setDeletedCollectionId] = useState<string | null>(null);
    const collectionRemovalHandled = useCallback(() => setDeletedCollectionId(null), []);
    const collectionDeleteDialogRef = useModalDialog(collectionDeleteTarget !== null);
    /**
     * Star or unstar one song — since #1477 a Save of the built-in Starred collection, which the
     * first star creates. Shown at once (`useCollections` applies it before the write lands); a
     * write that fails undoes it and says why on the songbook's own line — at the account's
     * document cap, the same remedy a song Save at the cap is given.
     */
    function toggleStar(id: string) {
        setHomeNoticeState('');
        collections.toggleStar(id, !starred.has(id)).catch((failure: unknown) => {
            setHomeNoticeState(failure instanceof Error ? failure.message : String(failure));
        });
    }
    /** Add the row menu's song to one of the songbook's collections (#1477). */
    function addRowToCollection(collectionId: string) {
        const target = rowMenuFor;
        if (!target) {
            return;
        }
        closeRowMenu();
        void run(async () => {
            const added = await collections.addSong(collectionId, target.id);
            const name =
                collections.collections?.find((entry) => entry.document.id === collectionId)
                    ?.document.name ?? 'the collection';
            setHomeNoticeState(
                added ? `Added “${target.title}” to “${name}”` : `Already in “${name}”`,
            );
        });
    }
    /** A new collection holding just the row menu's song (#1477's "Add to collection…"). */
    function createCollectionWithRow(name: string) {
        const target = rowMenuFor;
        if (!target) {
            return;
        }
        closeRowMenu();
        void run(async () => {
            await collections.create(name, [target.id]);
            setHomeNoticeState(`Added “${target.title}” to “${name}”`);
        });
    }
    /** New collection / Rename, answered by `CollectionNameDialog` (#1477). */
    function submitCollectionName(name: string) {
        const request = collectionNaming;
        if (!request) {
            return;
        }
        setCollectionNaming(null);
        void run(async () => {
            if (request.kind === 'new') {
                await collections.create(name);
                setHomeNoticeState(`Created “${name}”`);
            } else {
                await collections.rename(request.collectionId, name);
                setHomeNoticeState(`Renamed to “${name}”`);
            }
        });
    }
    /** Open the delete confirm for one user collection, counting what "also delete" would take. */
    function requestDeleteCollection(collectionId: string) {
        const entry = collections.collections?.find((item) => item.document.id === collectionId);
        if (!entry || entry.document.builtIn) {
            return;
        }
        setHomeNoticeState('');
        setCollectionDeleteFailure(null);
        setCollectionDeleteTarget({
            collectionId,
            name: entry.document.name,
            songCount: entry.resolvedSongIds.length,
            onlyHere: songsOnlyIn(collectionId, collections.collections ?? []),
        });
    }
    /**
     * Delete a collection (#1443 decision 3) — and, only when the box was checked, the songs in it
     * that are in no other collection, through the songbook's EXISTING delete paths: the guest
     * repository's own delete, or the account's online cloud delete (`commitCloudDelete`, the
     * tombstone route every account song delete takes). Songs FIRST, the collection LAST, so an
     * interruption — a refused cloud delete, a closed tab — leaves the collection standing with
     * the songs still to delete, never song deletes nobody can see a reason for. For a guest the
     * two halves are two databases, which is exactly why the order matters.
     */
    function deleteCollectionConfirmed(alsoDeleteSongs: boolean) {
        const target = collectionDeleteTarget;
        if (!target) {
            return;
        }
        const owner = sync.owner;
        void run(async () => {
            setCollectionDeleteFailure(null);
            let deletedSongs = 0;
            // Re-decided NOW (#1477 review R4), and only ever NARROWED (C3): a song another
            // collection gained meanwhile is no longer "in no other collection" and stays, while a
            // song that arrived in this collection meanwhile was never shown to the musician, so
            // it is never deleted either — the confirm-time read may only take songs OFF the list
            // the dialog showed.
            let onlyHere: string[] = [];
            if (alsoDeleteSongs) {
                // And the collection's own delete is asked first: one still uploading must stop
                // this before a single song is gone, not after.
                const refusal = await collections.deleteRefusal(target.collectionId);
                if (refusal !== null) {
                    setCollectionDeleteFailure(refusal);
                    return;
                }
                onlyHere = songsOnlyIn(target.collectionId, await collections.fresh()).filter(
                    (songId) => target.onlyHere.includes(songId),
                );
                for (const songId of onlyHere) {
                    if (signedIn) {
                        const done = deletedSongs;
                        const result = await commitCloudDelete(songId, owner, {
                            // Stopped part-way (#1477 review C4): the sentence says how far it
                            // got, and the dialog's counts move to what is actually left.
                            setFailure: (message) =>
                                setCollectionDeleteFailure(
                                    done === 0
                                        ? message
                                        : `${message} ${done} of ${onlyHere.length} songs were deleted; the collection and the rest are kept.`,
                                ),
                            dialogOpen: () => !!collectionDeleteDialogRef.current?.open,
                        });
                        if (result === null) {
                            const gone = new Set(onlyHere.slice(0, done));
                            if (done > 0) {
                                setCollectionDeleteTarget((current) =>
                                    current?.collectionId === target.collectionId
                                        ? {
                                              ...current,
                                              songCount: current.songCount - done,
                                              onlyHere: current.onlyHere.filter(
                                                  (id) => !gone.has(id),
                                              ),
                                          }
                                        : current,
                                );
                            }
                            await refreshSongs();
                            return;
                        }
                    } else {
                        try {
                            await repository.remove(songId);
                        } catch (failure) {
                            // Stopped part-way: the collection is kept (songs first, collection
                            // last), and the songs already gone leave the list now, not later.
                            if (deletedSongs > 0) {
                                await refreshSongs();
                            }
                            throw failure;
                        }
                        forgetOpenedGuest(songId);
                    }
                    deletedSongs += 1;
                }
                setOpenedAtState((previous) => {
                    const updated = new Map(previous);
                    for (const songId of onlyHere) {
                        updated.delete(songId);
                    }
                    return updated;
                });
            }
            let message: string;
            try {
                message = await collections.remove(target.collectionId);
            } catch (failure) {
                setCollectionDeleteFailure(
                    failure instanceof Error ? failure.message : String(failure),
                );
                if (deletedSongs > 0) {
                    await refreshSongs();
                }
                return;
            }
            // Closing the dialog and naming the removal in one render (R5): the page then moves
            // focus to the All songs filter, after the dialog has let go of it.
            setCollectionDeleteTarget(null);
            setDeletedCollectionId(target.collectionId);
            if (deletedSongs > 0) {
                await refreshSongs();
                message = `Collection deleted, with ${deletedSongs === 1 ? '1 song' : `${deletedSongs} songs`} that were in no other collection.`;
            }
            setHomeNoticeState(message);
        });
    }
    return {
        collectionNaming,
        setCollectionNaming,
        collectionNameDialogRef,
        collectionDeleteTarget,
        setCollectionDeleteTarget,
        collectionDeleteFailure,
        deletedCollectionId,
        collectionRemovalHandled,
        collectionDeleteDialogRef,
        toggleStar,
        addRowToCollection,
        createCollectionWithRow,
        submitCollectionName,
        requestDeleteCollection,
        deleteCollectionConfirmed,
    };
}
