import { type Dispatch, type RefObject, type SetStateAction, useEffect, useState } from 'react';
import {
    PURGE_MESSAGES,
    REMOVE_UNREADABLE_MESSAGES,
    removeUnreadableOutcome,
} from '../lib/account/messages';
import {
    accountSync,
    type CloudDeleteResult,
    OWNER_MESSAGES,
    type SyncSnapshot,
} from '../lib/account/sync-loop';
import { exportDocument, exportUnreadable } from '../lib/download';
import * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';
import { forgetOpened as forgetOpenedGuest } from '../lib/session';
import type { SongRowMenuTarget } from './song-row-menu';
import { useModalDialog } from './use-modal-dialog';

/** The guest-only delete confirm's song (#1440). */
interface GuestDeleteTarget {
    id: string;
    title: string;
    hasRecovery: boolean;
    /** Asked from the Song menu (#1756): the song is the one on the stand. */
    onStand?: boolean;
}

/** The row menu's account delete confirm's song (#1440 review P2). */
interface RowDeleteTarget {
    id: string;
    title: string;
}

/** What delete-from-this-device is asked about (#1754), per `purgeTarget`'s own note. */
interface PurgeTarget {
    ids: string[];
    title: string | null;
    unconfirmed?: boolean;
    onStand?: boolean;
}

/** What the "couldn't be read" notices' Remove would do (#1805), per `unreadableRemoval`'s note. */
interface UnreadableRemoval {
    ids: string[];
    kept: number;
}

/** What the shell hands `useSongDeletes`. */
interface SongDeletesOptions {
    /** The chart on the stand, as this render saw it. */
    current: ChartDocument | null;
    /** The stand has unsaved work (the shell's one `dirty` derivation). */
    dirty: boolean;
    /** Which songbook the chart on the stand came from (the shell's `StandStore`), or null. */
    standStore: { store: 'account' | 'guest' } | null;
    /** The Song menu offers Delete…: the chart on the stand is a saved song (#1756). */
    standDeletable: boolean;
    /** The session is signed in. */
    signedIn: boolean;
    /** The chart on the stand can take the cloud delete (#1270): its confirm step's guard. */
    inAccount: boolean;
    /** The row the watch points at is in the account (#1440 review P2): its confirm's guard. */
    rowInAccount: boolean;
    /** The row whose ⋯ menu is open (#1440), or null. */
    rowMenuFor: SongRowMenuTarget | null;
    /** The signed-in session's owner, or null. */
    sessionOwner: string | null;
    /** The loop's published snapshot: the attached `owner` and the marked rows' `candidates`. */
    sync: Pick<SyncSnapshot, 'owner' | 'candidates'>;
    setCurrent: Dispatch<SetStateAction<ChartDocument | null>>;
    setSaved: Dispatch<SetStateAction<ChartDocument | null>>;
    /** The shell's error line. */
    setError: Dispatch<SetStateAction<string>>;
    /** The songbook's own status line (`homeNotice`). */
    setHomeNoticeState: Dispatch<SetStateAction<string>>;
    /** The row THIS TAB's own delete just removed (#1440 review P5); render reads it. */
    setDeletedRowId: Dispatch<SetStateAction<string | null>>;
    /** When each song was last opened, by id. */
    setOpenedAtState: Dispatch<SetStateAction<Map<string, string>>>;
    /** The chart on the stand right now, ahead of the render. */
    currentNow: RefObject<ChartDocument | null>;
    /** Drafts kept in this tab only, by document id. */
    volatileDrafts: RefObject<Map<string, ChartDocument>>;
    /** Drafts the account store holds, as this tab believes, by document id. */
    accountDrafts: RefObject<Map<string, ChartDocument>>;
    /** The shell's one-action lock. */
    run: (task: () => void | Promise<void>, quiet?: boolean) => Promise<void>;
    /** Re-reads the songbook. */
    refreshSongs: () => Promise<void>;
    /** Writes the chart on the stand as it stands, pending bars included (the stand's Export). */
    exportSong: () => void;
    /** A row's newest version, its live draft else the committed one (`exportRow` reads it too). */
    exportableRowDocument: (id: string) => Promise<ChartDocument | null>;
    /** Closes the row ⋯ menu. */
    closeRowMenu: () => void;
    /** The account the stand's chart belongs to, or null. */
    standOwner: () => string | null;
    /** The stand's chart is another account's than the one attached (#1311). */
    standBelongsElsewhere: () => boolean;
    /** Unbinds the stand: the only binding these paths write is none. */
    bindStand: (next: null) => void;
    /** Drops every pending bar and the editor's buffers. */
    clearBuffers: () => void;
}

/** What the five delete dialogs, the menus' Delete… and the songbook's notices read back. */
export interface SongDeletes {
    /** The guest delete confirm's song, or null when it is shut. */
    guestDeleteTarget: GuestDeleteTarget | null;
    /** Delete-from-this-device's songs, or null when it is shut. */
    purgeTarget: PurgeTarget | null;
    /** The unreadable removal's confirm, or null when it is shut. */
    unreadableRemoval: UnreadableRemoval | null;
    /** The row's account delete confirm's song, or null when it is shut. */
    rowDeleteTarget: RowDeleteTarget | null;
    /** The sentence the stand's last refused cloud delete produced (#1270), or null. */
    deleteFailure: string | null;
    /** The sentence the row's last refused cloud delete produced, or null. */
    rowDeleteFailure: string | null;
    guestDeleteDialogRef: RefObject<HTMLDialogElement | null>;
    purgeDialogRef: RefObject<HTMLDialogElement | null>;
    unreadableRemovalRef: RefObject<HTMLDialogElement | null>;
    /** The stand's cloud delete confirm step (#1270). */
    deleteDialogRef: RefObject<HTMLDialogElement | null>;
    /** The row's cloud delete confirm step (#1440 review P2). */
    rowDeleteDialogRef: RefObject<HTMLDialogElement | null>;
    /** The row ⋯ menu's Delete… (#1440). */
    requestDeleteRow: () => void;
    exportGuestDeleteTarget: () => void;
    closeGuestDelete: () => void;
    deleteGuestSong: () => void;
    exportPurgeTarget: () => void;
    /** All songs' "Remove N songs no longer in your account" (#1754). */
    requestPurgeGone: (ids: string[]) => void;
    closePurge: () => void;
    purgeConfirmed: () => void;
    closeRowDeleteConfirm: () => void;
    exportRowDeleteTarget: () => void;
    deleteRowFromAccount: () => void;
    /** The one cloud delete commit, shared with the collection delete's "also delete" songs. */
    commitCloudDelete: (
        documentId: string,
        owner: string | null,
        options: { setFailure: (message: string) => void; dialogOpen: () => boolean },
    ) => Promise<CloudDeleteResult | null>;
    /** The Song menu's Delete… (#1756). */
    requestDeleteStand: () => void;
    closeDeleteConfirm: () => void;
    deleteFromAccount: () => void;
    /** The "couldn't be read" notices' Export (#1782). */
    exportUnreadableSongs: () => void;
    /** The "couldn't be read" notices' Remove (#1805). */
    requestRemoveUnreadable: () => void;
    closeUnreadableRemoval: () => void;
    removeUnreadableConfirmed: () => void;
}

/**
 * Deleting songs (#1270, #1440, #1754, #1756, #1805): the guest delete, the cloud delete from the
 * stand and from a row, delete-from-this-device, and removing the songs this build cannot read —
 * each confirm's state, its `<dialog>`, its guard and the handlers that open and answer it. The
 * shell keeps the dialogs' rendering, the controls that open them (the row ⋯ menu, the Song menu,
 * the songbook's notices) and the paths these reach (`run`, `useSongbookLibrary`'s
 * `refreshSongs`, `exportSong`, the stand binding). Call it where the two cloud-delete confirms' guard effects always ran, after
 * `dirty`; its `useModalDialog` order (guest, purge, unreadable, stand, row) is theirs before
 * the move: `deleteFromAccount` closes one confirm and then opens delete-from-this-device.
 */
export function useSongDeletes({
    current,
    dirty,
    standStore,
    standDeletable,
    signedIn,
    inAccount,
    rowInAccount,
    rowMenuFor,
    sessionOwner,
    sync,
    setCurrent,
    setSaved,
    setError,
    setHomeNoticeState,
    setDeletedRowId,
    setOpenedAtState,
    currentNow,
    volatileDrafts,
    accountDrafts,
    run,
    refreshSongs,
    exportSong,
    exportableRowDocument,
    closeRowMenu,
    standOwner,
    standBelongsElsewhere,
    bindStand,
    clearBuffers,
}: SongDeletesOptions): SongDeletes {
    // The guest-only delete confirm (#1440).
    const [guestDeleteTarget, setGuestDeleteTarget] = useState<GuestDeleteTarget | null>(null);
    const guestDeleteDialogRef = useModalDialog(guestDeleteTarget !== null);
    // The row menu's account delete confirm (#1440 review P2) — reuses `DeleteSongDialog`, the
    // same tombstone route the stand's own "Song actions" uses (`deleteOpen` below), but bound to
    // a row target instead of `current`: this one must never navigate to open the song, since the
    // musician may only be asking to delete it, not to visit it.
    const [rowDeleteTarget, setRowDeleteTarget] = useState<RowDeleteTarget | null>(null);
    const [rowDeleteFailure, setRowDeleteFailure] = useState<string | null>(null);
    // Delete from this device for good (#1754): one song the account no longer holds or never
    // received (`title` set), or every "No longer in your account" row at once (`title` null).
    // `unconfirmed`: the cloud never confirmed the one song, so no cloud delete came first and
    // this copy is the only one; `onStand`: asked from the Song menu, about the chart on the stand
    // (#1756).
    const [purgeTarget, setPurgeTarget] = useState<PurgeTarget | null>(null);
    const purgeDialogRef = useModalDialog(purgeTarget !== null);
    // The "couldn't be read" notices' Remove (#1805): the songs this build cannot read that would
    // go, and how many something keeps, read fresh when the musician asked, so the confirm counts
    // what it will act on and says first what it will keep.
    const [unreadableRemoval, setUnreadableRemoval] = useState<UnreadableRemoval | null>(null);
    const unreadableRemovalRef = useModalDialog(unreadableRemoval !== null);
    // #1270 — the cloud-delete confirm step, and the sentence the last refused attempt produced.
    // Both live here with the handlers that set them; the shell renders the step.
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteFailure, setDeleteFailure] = useState<string | null>(null);
    // A guarded dialog's guard is its own effect below, beside its comment.
    const deleteDialogRef = useModalDialog(deleteOpen && inAccount);
    const rowDeleteDialogRef = useModalDialog(rowDeleteTarget !== null && rowInAccount);
    // `inAccount` is a dependency, not just a guard: the confirm step unmounts when the answer
    // turns false (a session expiring under an account chart is the realistic way), and a flag
    // left true would spring the dialog open again on the next chart that qualifies.
    useEffect(() => {
        if (deleteOpen && !inAccount) {
            setDeleteOpen(false);
        }
    }, [deleteOpen, inAccount]);
    // Closes itself if `rowInAccount` goes false while open (the same posture the stand's own
    // `deleteOpen` effect takes) — a queued Save landing mid-confirm, or the account detaching,
    // must not leave a confirm button pointed at a state that no longer supports it. Releases the
    // watch/claim on the way out like every other exit (#1440 review P2) — without it, this path
    // left `activeDocumentId`/the watch pointed at the row forever, so a later download pass kept
    // flagging it as a candidate long after the confirm step itself was gone. Inlined rather than
    // calling `closeRowDeleteConfirm` so this effect's dependency list stays exhaustive without
    // naming a plain function that is recreated every render.
    useEffect(() => {
        if (!rowInAccount && rowDeleteTarget) {
            setRowDeleteTarget(null);
            accountSync.setActiveDocument(null);
            void accountSync.watch(null);
        }
    }, [rowDeleteTarget, rowInAccount]);
    /**
     * Delete… from the row menu (#1440). An account song ALWAYS goes through the existing
     * tombstone route (`accountSync.deleteFromCloud`, the same call `deleteFromAccount` makes) —
     * never a local-only delete. A guest song deletes locally through its own confirm step below.
     *
     * Unlike the stand's own "Song actions → Delete from my account", this must NEVER navigate
     * (review #1440 P2): the musician asked to delete a row, not to visit it, and opening it first
     * — the earlier approach — loaded the chart, wrote the Continue pointer and an opened-at
     * timestamp, and stranded the musician on the stand if they cancelled. `setActiveDocument`/
     * `watch` gets the same `sync.observation` the confirm step needs without any of that; it is
     * released again in `closeRowDeleteConfirm` below.
     *
     * Two account songs have nothing in the account to delete, and both go straight to the
     * delete-from-this-device step instead (#1754): one marked "No longer in your account" (the
     * account tombstoned it while this device kept it — a cloud delete would only answer
     * `retained` again), and one the cloud never acknowledged (`remoteRevision` still null — a
     * Save never sent, or one still queued). That used to be a "nothing to delete" dead end.
     */
    function requestDeleteRow() {
        const target = rowMenuFor;
        if (!target) {
            return;
        }
        closeRowMenu();
        if (signedIn) {
            if (
                sync.candidates.some(
                    (row) => row.documentId === target.id && row.kind === 'deleted',
                )
            ) {
                setPurgeTarget({ ids: [target.id], title: target.title });
                return;
            }
            void run(async () => {
                accountSync.setActiveDocument(target.id);
                await accountSync.watch(target.id);
                if (accountSync.getSnapshot().observation?.remoteRevision == null) {
                    releaseRowDeleteClaim();
                    setPurgeTarget({ ids: [target.id], title: target.title, unconfirmed: true });
                    return;
                }
                setRowDeleteFailure(null);
                setRowDeleteTarget({ id: target.id, title: target.title });
            });
        } else {
            setGuestDeleteTarget({
                id: target.id,
                title: target.title,
                hasRecovery: repository.recoverySlotCount(target.id) > 0,
            });
        }
    }
    function exportGuestDeleteTarget() {
        const target = guestDeleteTarget;
        if (!target) {
            return;
        }
        if (target.onStand) {
            // The chart as it stands, pending bars included, as the stand's own Export writes it.
            void run(exportSong);
            return;
        }
        void run(async () => {
            const document = await exportableRowDocument(target.id);
            if (document) {
                exportDocument(document);
            }
        });
    }
    /**
     * The delete-from-this-device step's Export (#1756): for a song the cloud never confirmed it
     * is the only way to keep a copy. The stand's chart as it stands, or the row's newest version.
     */
    function exportPurgeTarget() {
        const target = purgeTarget;
        if (!target || target.title === null) {
            return;
        }
        if (target.onStand) {
            void run(exportSong);
            return;
        }
        void run(async () => {
            const document = await exportableRowDocument(target.ids[0]);
            if (document) {
                exportDocument(document);
            }
        });
    }
    /**
     * Drops the active claim/watch `requestDeleteRow` set up (#1440 review P2/P3) — never the
     * dialog state, so both the confirm step's own Cancel AND the effect that un-eligibility
     * closes it from can call this without fighting over who clears `rowDeleteTarget`.
     */
    function releaseRowDeleteClaim() {
        accountSync.setActiveDocument(null);
        void accountSync.watch(null);
    }
    /**
     * Cancel — the confirm step's own close, routed through the one release function
     * (#1440 P2).
     */
    function closeRowDeleteConfirm() {
        setRowDeleteTarget(null);
        releaseRowDeleteClaim();
    }
    function exportRowDeleteTarget() {
        const target = rowDeleteTarget;
        if (!target) {
            return;
        }
        void run(async () => {
            const document = await exportableRowDocument(target.id);
            if (document) {
                exportDocument(document);
            }
        });
    }
    /**
     * The row menu's account delete (#1440 review P2) — the same `commitCloudDelete` commit
     * `deleteFromAccount` shares, reached without ever putting this song on the stand.
     */
    function deleteRowFromAccount() {
        const target = rowDeleteTarget;
        if (!target) {
            return;
        }
        const owner = sync.owner;
        void run(async () => {
            const result = await commitCloudDelete(target.id, owner, {
                setFailure: setRowDeleteFailure,
                dialogOpen: () => !!rowDeleteDialogRef.current?.open,
            });
            if (result === null) {
                return;
            }
            closeRowDeleteConfirm();
            if (result.kind === 'deleted' && result.retained) {
                // Gone from the account, but this device kept its copy (a draft, a queued Save):
                // one press of Delete means the song is gone, so the delete-from-this-device step
                // follows straight on (#1754). Cancelled, the row stays, marked.
                await refreshSongs();
                setHomeNoticeState(result.message);
                setPurgeTarget({ ids: [target.id], title: target.title });
                return;
            }
            setDeletedRowId(target.id);
            await refreshSongs();
            setHomeNoticeState(result.message);
        });
    }
    /**
     * "Remove N songs no longer in your account" on All songs (#1754): every listed song the
     * account tombstoned while this device kept it, behind one confirm.
     */
    function requestPurgeGone(ids: string[]) {
        if (ids.length > 0) {
            setPurgeTarget({ ids, title: null });
        }
    }
    /**
     * What this tab holds for songs just removed from this device's account store (#1915), shared
     * by `purgeConfirmed` and `removeUnreadableConfirmed`: its in-memory drafts, the guest-namespace
     * recovery slot an older build may have left under the id (`clearOwnRecovery`), and its
     * opened-at entries.
     */
    function forgetRemovedLocally(ids: ReadonlySet<string>) {
        for (const id of ids) {
            volatileDrafts.current.delete(id);
            accountDrafts.current.delete(id);
            try {
                repository.clearOwnRecovery(id);
            } catch {
                /* Recovery is a convenience; a stale slot is not worth failing a removal. */
            }
        }
        setOpenedAtState((previous) => {
            if (![...ids].some((id) => previous.has(id))) {
                return previous;
            }
            const updated = new Map(previous);
            for (const id of ids) {
                updated.delete(id);
            }
            return updated;
        });
    }
    /**
     * Delete songs from this device for good (#1754) — `accountSync.purgeLocal`, one transaction,
     * nothing queued or sent. What this tab holds for them goes too: its in-memory drafts, its
     * opened-at entries, and the guest-namespace recovery slot an older build may have left under
     * the id (`clearOwnRecovery`, as a clean cloud delete prunes it).
     */
    function purgeConfirmed() {
        const target = purgeTarget;
        if (!target) {
            return;
        }
        const owner = sync.owner;
        void run(async () => {
            const result = await accountSync.purgeLocal(target.ids, owner);
            const purged = new Set(result.purged);
            forgetRemovedLocally(purged);
            if (target.title !== null && purged.size === 1) {
                setDeletedRowId(target.ids[0]);
            }
            // Asked from the Song menu (#1756): the purged song is the one on the stand.
            const onStand = currentNow.current;
            if (onStand && purged.has(onStand.id)) {
                leaveDeletedSong();
            } else if (target.onStand && result.held.length > 0) {
                // The account holds it after all (a Save landed meanwhile): it stays on the stand,
                // and the reason is said there, not on a songbook nobody is looking at.
                setPurgeTarget(null);
                setError(PURGE_MESSAGES.held);
                return;
            }
            setPurgeTarget(null);
            await refreshSongs();
            setHomeNoticeState(
                result.held.length > 0 && target.title !== null
                    ? PURGE_MESSAGES.held
                    : target.title !== null
                      ? PURGE_MESSAGES.deleted
                      : PURGE_MESSAGES.removed(purged.size),
            );
        });
    }
    /**
     * The guest songbook's own delete (#1440) — local-only, never used for an account song.
     *
     * From a row menu the target is never the open chart (row menus render only while `current`
     * is null); from the Song menu (#1756) it is, and the stand goes back to the songbook once the
     * song is gone. Deleting the Continue song or a song with a live draft both resolve by
     * inertness instead: `lastOpenedSong`'s stale pointer (like the account's own `lastOpenedKey`)
     * is never read as proof a song still exists — `continuedSave`'s `.find` against the freshly
     * re-read `songs` list is, so a pointer left behind after this runs is simply never matched.
     */
    function deleteGuestSong() {
        const target = guestDeleteTarget;
        if (!target) {
            return;
        }
        void run(async () => {
            await repository.remove(target.id);
            if (target.onStand) {
                volatileDrafts.current.delete(target.id);
                leaveDeletedSong();
            }
            forgetOpenedGuest(target.id);
            // Starred and every other collection keep the id (#1474: a song delete never rewrites
            // a collection); it no longer resolves, so it is simply not shown.
            setOpenedAtState((previous) => {
                if (!previous.has(target.id)) {
                    return previous;
                }
                const updated = new Map(previous);
                updated.delete(target.id);
                return updated;
            });
            setDeletedRowId(target.id);
            setGuestDeleteTarget(null);
            await refreshSongs();
            setHomeNoticeState('Deleted');
        });
    }
    /**
     * The one place `accountSync.deleteFromCloud` is called (#1440 review P3) — shared by the
     * stand's own route (`deleteFromAccount`) and the row menu's (`deleteRowFromAccount`), so the
     * two cannot drift on what a refusal means or on pruning this device's own guest-namespace
     * recovery slot for the id on a genuinely clean delete (an earlier version of the row route
     * dropped that half entirely).
     *
     * The active claim is dropped BEFORE the request goes out — `reconcile`'s preservation rule
     * retains anything "active", so deleting with the song still claimed would retain the very
     * copy the musician just asked to remove — and restored to `documentId` on a failure or
     * refusal, since both callers want the same thing then: a retry, or the confirm step if still
     * open, keeps reading THIS song's own observation rather than whatever the watch fell back to.
     * `setFailure`/`dialogOpen` are the one caller-specific part — which failure state to set, and
     * which dialog's open-ness decides whether `setError` also has to carry the refusal, since a
     * step already dismissed while the request was in flight has nowhere else to show it.
     *
     * Returns `null` on both a refusal and a rethrown exception (`run()`'s own catch turns the
     * exception into the shell's error line, same as before this was extracted) — a caller only
     * has more to do when this resolves to an actual `'deleted'` result.
     */
    async function commitCloudDelete(
        documentId: string,
        owner: string | null,
        options: { setFailure: (message: string) => void; dialogOpen: () => boolean },
    ): Promise<CloudDeleteResult | null> {
        accountSync.setActiveDocument(null);
        let result: CloudDeleteResult;
        try {
            result = await accountSync.deleteFromCloud(documentId, owner);
        } catch (failure) {
            accountSync.setActiveDocument(documentId);
            options.setFailure(failure instanceof Error ? failure.message : String(failure));
            throw failure;
        }
        if (result.kind === 'refused') {
            accountSync.setActiveDocument(documentId);
            options.setFailure(result.message);
            if (!options.dialogOpen()) {
                setError(result.message);
            }
            return null;
        }
        if (!result.retained) {
            // The account copy is gone and this device kept nothing — a retained draft is one of
            // the things that would have made it `retained`, so since #1299 the only thing left to
            // drop is this writer's guest-namespace recovery slot from before it. Otherwise the
            // deleted song reappears as a recovery offer on the next visit.
            try {
                repository.clearOwnRecovery(documentId);
            } catch {
                /* Recovery is a convenience; a stale entry is not worth failing the delete. */
            }
        }
        return result;
    }
    /**
     * Delete… from the Song menu (#1756), for any saved song on the stand, routed as the row
     * menu's `requestDeleteRow` routes a row: an account song the cloud holds goes through the
     * cloud delete (`deleteFromAccount`); one the account no longer holds ("No longer in your
     * account") or never confirmed goes through delete-from-this-device (`purgeConfirmed`); a
     * guest song through the guest confirm (`deleteGuestSong`). Each confirm takes the song off
     * the stand once it is gone (`leaveDeletedSong`).
     */
    function requestDeleteStand() {
        if (!current || !standDeletable) {
            return;
        }
        if (standStore?.store === 'account') {
            const target = { id: current.id, title: current.title };
            // Asked of the candidates directly, as `requestDeleteRow` does: `standCandidate` is
            // null while a Save is queued, and a song the account deleted under a queued Save
            // must still go to this device's delete, not a cloud delete that only answers
            // `retained`.
            if (
                sync.candidates.some(
                    (row) => row.documentId === target.id && row.kind === 'deleted',
                )
            ) {
                setPurgeTarget({ ids: [target.id], title: target.title, onStand: true });
                return;
            }
            void run(async () => {
                // This song's own observation, read now, not whatever the watch last held.
                await accountSync.watch(target.id);
                if (accountSync.getSnapshot().observation?.remoteRevision == null) {
                    setPurgeTarget({
                        ids: [target.id],
                        title: target.title,
                        unconfirmed: true,
                        onStand: true,
                    });
                    return;
                }
                setDeleteFailure(null);
                setDeleteOpen(true);
            });
            return;
        }
        setGuestDeleteTarget({
            id: current.id,
            title: current.title,
            // The stand's unsaved changes are a draft too, and the delete takes them with it.
            hasRecovery: dirty || repository.recoverySlotCount(current.id) > 0,
            onStand: true,
        });
    }
    /** A song just deleted leaves the stand for the songbook (#1270, #1756). */
    function leaveDeletedSong() {
        runtime.stop();
        setCurrent(null);
        setSaved(null);
        bindStand(null);
        clearBuffers();
    }
    /**
     * Delete the open chart from the cloud (#1270) — the one destructive account operation in the
     * product, and deliberately not a side effect of anything else.
     *
     * The claim is dropped through `setActiveDocument` rather than by unmounting the chart, so a
     * refused delete leaves the musician exactly where they were. It is called explicitly rather
     * than left to the `useAccountLibrary` effect that normally mirrors `current?.id`: effects run
     * after the render that follows a state change, and the loop reads `activeDocumentId` at the
     * moment it commits.
     */
    function deleteFromAccount() {
        if (!current) {
            return;
        }
        const documentId = current.id;
        const title = current.title;
        const owner = standOwner();
        void run(async () => {
            if (standBelongsElsewhere()) {
                // #1311, and asked BEFORE the active claim is dropped: this device is attached to
                // another account, so the revision it would name is a fact about a library it is
                // not reading. `inAccount` already hides the action, so this is the second layer;
                // the loop's own check is the third. Written to the shell's error line as well as
                // the confirm step, because `inAccount` going false is what UNMOUNTS that step —
                // a reason rendered only there would be a refusal nobody could read.
                setDeleteFailure(OWNER_MESSAGES.mismatch);
                setError(OWNER_MESSAGES.mismatch);
                return;
            }
            const result = await commitCloudDelete(documentId, owner, {
                setFailure: setDeleteFailure,
                dialogOpen: () => !!deleteDialogRef.current?.open,
            });
            if (result === null) {
                // Nothing was deleted, so nothing about this session changes: the chart keeps its
                // claim and the dialog stays open carrying the reason. Closing it and dropping a
                // toast would leave the musician guessing whether it worked.
                return;
            }
            setDeleteOpen(false);
            leaveDeletedSong();
            setDeletedRowId(documentId);
            await refreshSongs();
            // The songbook's own line (#1440 review P2), not the stand's `message`: this delete
            // just closed the chart and landed back on the songbook, and `message` has no
            // audience there — see `homeNotice`'s own doc comment.
            setHomeNoticeState(result.message);
            if (result.kind === 'deleted' && result.retained) {
                // The copy this device kept goes too, once asked (#1754): one Delete, song gone.
                setPurgeTarget({ ids: [documentId], title });
            }
        });
    }
    /**
     * The home's and All songs' "couldn't be read" notices' Export (#1782): every account row this
     * build cannot read, read fresh and written out as stored, the file the sign-out step offers.
     */
    function exportUnreadableSongs() {
        const owner = sessionOwner;
        if (owner === null) {
            return;
        }
        void run(async () => {
            for (const row of await accountSync.unreadableSongs(owner)) {
                exportUnreadable(row);
            }
        });
    }
    /**
     * The notices' Remove (#1805): what the removal would do now (`unreadableRemoval`, the same
     * check it makes), read fresh so the confirm counts exactly the songs that will go and says
     * first which are kept. When every song is kept there is no confirm, only the reason, in the
     * songbook's status line. Nothing unreadable at all (another tab got there first) only
     * refreshes the notice.
     */
    function requestRemoveUnreadable() {
        const owner = sessionOwner;
        if (owner === null) {
            return;
        }
        void run(async () => {
            const { removable, waiting } = await accountSync.unreadableRemoval(owner);
            if (removable.length === 0) {
                await refreshSongs();
                if (waiting.length > 0) {
                    setHomeNoticeState(REMOVE_UNREADABLE_MESSAGES.allKept(waiting.length));
                }
                return;
            }
            setUnreadableRemoval({ ids: removable, kept: waiting.length });
        });
    }
    /**
     * Remove them from this device (#1805) — `accountSync.removeUnreadable`, one transaction,
     * local only, checking again what holds each song (a queued Save, or a draft that may be the
     * only copy of its music): one held since the confirm opened is kept, and the songbook's status
     * line says why. This tab's in-memory drafts, its recovery slot and opened-at entries for the
     * removed ids go too, as `purgeConfirmed` clears them: the song may have been openable here
     * before a newer build overwrote its row.
     */
    function removeUnreadableConfirmed() {
        const ids = unreadableRemoval?.ids;
        if (ids === undefined) {
            return;
        }
        const owner = sync.owner;
        void run(async () => {
            const result = await accountSync.removeUnreadable(ids, owner);
            const removed = new Set(result.removed);
            forgetRemovedLocally(removed);
            setUnreadableRemoval(null);
            await refreshSongs();
            setHomeNoticeState(removeUnreadableOutcome(removed.size, result.waiting.length));
        });
    }
    /** The guest confirm's Cancel. */
    function closeGuestDelete() {
        setGuestDeleteTarget(null);
    }
    /** Delete-from-this-device's Cancel. */
    function closePurge() {
        setPurgeTarget(null);
    }
    /** The unreadable removal's Cancel. */
    function closeUnreadableRemoval() {
        setUnreadableRemoval(null);
    }
    /** The stand's cloud delete confirm's Cancel. */
    function closeDeleteConfirm() {
        setDeleteOpen(false);
    }
    return {
        guestDeleteTarget,
        purgeTarget,
        unreadableRemoval,
        rowDeleteTarget,
        deleteFailure,
        rowDeleteFailure,
        guestDeleteDialogRef,
        purgeDialogRef,
        unreadableRemovalRef,
        deleteDialogRef,
        rowDeleteDialogRef,
        requestDeleteRow,
        exportGuestDeleteTarget,
        closeGuestDelete,
        deleteGuestSong,
        exportPurgeTarget,
        requestPurgeGone,
        closePurge,
        purgeConfirmed,
        closeRowDeleteConfirm,
        exportRowDeleteTarget,
        deleteRowFromAccount,
        commitCloudDelete,
        requestDeleteStand,
        closeDeleteConfirm,
        deleteFromAccount,
        exportUnreadableSongs,
        requestRemoveUnreadable,
        closeUnreadableRemoval,
        removeUnreadableConfirmed,
    };
}
