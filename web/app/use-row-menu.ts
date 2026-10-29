import { type Dispatch, type RefObject, type SetStateAction, useRef, useState } from 'react';
import type { SyncSnapshot } from '../lib/account/sync-loop';
import { exportDocument } from '../lib/download';
import * as repository from '../lib/repository';
import type { ChartDocument } from '../lib/runtime';
import type { SongRowMenuTarget } from './song-row-menu';

/** What the shell hands `useRowMenu`. */
interface RowMenuOptions {
    /** The shell is running an action: a row's ⋯ opens nothing meanwhile. */
    busy: boolean;
    /** The session is signed in: a rename is an account Save, else the guest songbook's. */
    signedIn: boolean;
    /** The loop's published snapshot: its `owner` is the account a rename's Save belongs to. */
    sync: Pick<SyncSnapshot, 'owner'>;
    /** The songbook's own status line (`homeNotice`). */
    setHomeNoticeState: Dispatch<SetStateAction<string>>;
    /** The stand's message toast (`useStandToast`). */
    setMessage: (text: string, options?: { tone?: 'info' | 'warning' }) => void;
    /** Asks the stand's title field for focus (the shell's `titleRequest`). */
    setTitleRequest: Dispatch<SetStateAction<number>>;
    /** Drafts kept in this tab only, by document id. */
    volatileDrafts: RefObject<Map<string, ChartDocument>>;
    /** One song from the live songbook, by id (`useSongbookLibrary`'s). */
    readLiveSong: (id: string) => Promise<ChartDocument | null>;
    /** Re-reads the songbook. */
    refreshSongs: () => Promise<void>;
    /** The shell's one-action lock. */
    run: (task: () => void | Promise<void>, quiet?: boolean) => Promise<void>;
    /** Puts a song on the stand: the ordinary path a song arrives by. */
    open: (document: ChartDocument) => Promise<{ current: ChartDocument; saved: ChartDocument }>;
    /** Puts an unsaved edit on the stand against `baseline`. */
    draft: (next: ChartDocument, baseline?: ChartDocument | null) => void;
    /** Opens the editor over the stand. */
    showEditor: () => void;
    /** Commits a version to the live songbook (`intent.owner`, #1311) and returns it. */
    storeSave: (
        document: ChartDocument,
        expected: number | null,
        intent: { owner: string | null; stand: boolean },
    ) => Promise<ChartDocument>;
    /** A song's live draft in either store, or `unreadable` when that read failed. */
    retainedDraftFor: (document: ChartDocument) => Promise<{
        recovery: { document: ChartDocument; conflict: boolean } | null;
        unreadable: boolean;
    }>;
}

/** What the row ⋯ menu (`SongRowMenu`), its triggers and the other row-action hooks read back. */
interface RowMenu {
    /** The row whose ⋯ menu is open, or null. */
    rowMenuFor: SongRowMenuTarget | null;
    /** The ⋯ the open menu is anchored at. */
    rowMenuTrigger: RefObject<HTMLElement | null>;
    /** Counts openings: the menu is keyed on it. */
    rowMenuOpening: number;
    /** A row's ⋯: opens the menu at it, or closes it when it is already open there. */
    openRowMenu: (id: string, title: string, trigger: HTMLElement) => void;
    /** Closes the row ⋯ menu. */
    closeRowMenu: () => void;
    /** The menu's Rename…: renames the row's song, or opens it when it has unsaved work. */
    renameRow: (title: string) => void;
    /** The menu's Duplicate: "<title> copy" under a fresh id. */
    duplicateRow: () => void;
    /** The menu's Export: writes the row's newest version. */
    exportRow: () => void;
    /** A row's newest version: its live draft, else the committed one (`useSongDeletes`'). */
    exportableRowDocument: (id: string) => Promise<ChartDocument | null>;
}

/**
 * The row ⋯ menu (#1930): which row it is open on, the ⋯ it is anchored at, and its three items
 * that are the shell's — Rename…, Duplicate and Export. Star and the collections are
 * `useCollectionActions`', Delete… is `useSongDeletes`'. The shell keeps the paths these reach
 * (`run`, `open`, `draft`, `showEditor`, `storeSave`, `retainedDraftFor`) and hands them in. Call
 * it after `useStandToast` (`renameRow` says its sentences through `setMessage`) and before
 * `useSongDeletes` and `useCollectionActions`, which read `rowMenuFor` and `closeRowMenu`.
 */
export function useRowMenu({
    busy,
    signedIn,
    sync,
    setHomeNoticeState,
    setMessage,
    setTitleRequest,
    volatileDrafts,
    readLiveSong,
    refreshSongs,
    run,
    open,
    draft,
    showEditor,
    storeSave,
    retainedDraftFor,
}: RowMenuOptions): RowMenu {
    // The row ⋯ menu (#1440), shared by the All songs page and the songbook home. One menu
    // instance for whichever row is targeted, per `SongRowMenu`'s own note on why; anchored at
    // that row's ⋯ (#1755).
    const [rowMenuFor, setRowMenuFor] = useState<SongRowMenuTarget | null>(null);
    const rowMenuTrigger = useRef<HTMLElement | null>(null);
    // Counts openings, so a ⋯ activated while another row's menu is open (a click with no
    // press before it: a screen reader, a script) mounts a fresh menu at the new ⋯.
    const [rowMenuOpening, setRowMenuOpening] = useState(0);
    function closeRowMenu() {
        setRowMenuFor(null);
    }
    /** A row's ⋯ (#1755): opens the menu at it, or closes it when it is already open there. */
    function openRowMenu(id: string, title: string, trigger: HTMLElement) {
        // The ⋯ is `aria-disabled` while busy rather than `disabled`, so the menu's focus can go
        // back to it during the action it started.
        if (busy) {
            return;
        }
        if (rowMenuFor?.id === id && rowMenuTrigger.current === trigger) {
            closeRowMenu();
            return;
        }
        rowMenuTrigger.current = trigger;
        setRowMenuOpening((n) => n + 1);
        // The next row action starting clears whatever the LAST one said (#1440 review P2) — an
        // Export or a Star from this new menu would otherwise leave an unrelated "Renamed to…"
        // sitting on screen indefinitely.
        setHomeNoticeState('');
        setRowMenuFor({ id, title });
    }
    /**
     * Renames a song by id (#1440) — never requires it to be the chart on the stand: row menus
     * render only while `current` is null, so there is no "already open" case here (review #1440
     * P5 — an earlier `isOpen`/`setCurrent` branch tested exactly that unreachable state).
     *
     * A live draft — this writer's or another's, OR this tab's own in-memory `volatileDrafts`
     * fallback (review #1440 P4 — the earlier version consulted only `retainedDraftFor`, missing
     * exactly the case `open()` itself also protects) — must never be silently destroyed by an
     * in-place rename (review #1440 P1): an account Save retires every writer's older drafts, and
     * a guest rename bumps `updatedAt`, which is what stops `recoveryFor` from ever offering that
     * slot again. `retainedDraftFor`'s `unreadable` flag fails CLOSED here too (review #1440 P4):
     * a draft read that FAILED is not evidence there is no draft, so it takes the same "open
     * instead" branch as finding one, rather than gambling on an in-place rename.
     *
     * The song opens instead — through the normal `open()` path, which recovers whichever draft
     * applies exactly as opening always does — and the title the musician just typed into the row
     * menu is carried forward as a fresh edit on top of it (review #1440 P4: discarding it was the
     * earlier version's other gap), focused in the stand's own title field, leaving the Save to
     * the musician. Only a song with nothing at all to lose renames in place.
     */
    function renameRow(title: string) {
        const target = rowMenuFor;
        if (!target) {
            return;
        }
        closeRowMenu();
        const trimmed = title.slice(0, 150);
        void run(async () => {
            const document = await readLiveSong(target.id);
            if (!document) {
                throw new Error('Song no longer exists.');
            }
            const { recovery, unreadable } = await retainedDraftFor(document);
            if (recovery || unreadable || volatileDrafts.current.has(document.id)) {
                const opened = await open(document);
                draft({ ...opened.current, title: trimmed }, opened.saved);
                showEditor();
                setTitleRequest((n) => n + 1);
                // Re-review P3 — BOTH branches are `warning`: touch has no hover to pause an
                // `info` message's ~4s clock, so a musician who tapped Rename and looked away for
                // a moment would otherwise lose an important "your title is queued, Save to keep
                // it" sentence with no way to have read it in time. `warning`-to-`warning` is
                // always allowed to replace (unlike `info`-over-`warning`, `setMessage`'s own
                // guard in `useStandToast`) — load-bearing here, since `open()` just above can
                // itself have set a `warning` ("Recovered draft is based on an older save…") that
                // this must win over, not silently lose to.
                if (unreadable && !recovery) {
                    setMessage(
                        'Couldn’t confirm whether this song has unsaved changes — opened it here instead of renaming in place. Your new title is filled in; Save to keep it.',
                        { tone: 'warning' },
                    );
                } else {
                    setMessage(
                        'This song has unsaved changes — opened it here so renaming won’t lose them. Your new title is filled in; Save to keep it.',
                        { tone: 'warning' },
                    );
                }
                return;
            }
            if (signedIn) {
                await storeSave({ ...document, title: trimmed }, document.revision, {
                    owner: sync.owner,
                    stand: false,
                });
            } else {
                // The guest songbook's own rename (#1440) — reuses `save`'s compare-and-swap
                // rather than a hand-rolled read-then-write here.
                await repository.rename(target.id, trimmed);
            }
            await refreshSongs();
            setHomeNoticeState(`Renamed to “${trimmed}”`);
        });
    }
    /**
     * Duplicates a song by id (#1440) — "<title> copy" under a fresh id, in whichever songbook
     * the original lives in. `owner: null` (never `sync.owner`), like a brand-new song or an
     * import: this mints an id nobody has claimed yet, and `storeSave`'s own note on `intent.owner`
     * is explicit that a fresh id belongs to whichever account is live, not to a stand binding.
     */
    function duplicateRow() {
        const target = rowMenuFor;
        if (!target) {
            return;
        }
        closeRowMenu();
        void run(async () => {
            const document = await readLiveSong(target.id);
            if (!document) {
                throw new Error('Song no longer exists.');
            }
            // `createdAt`/`updatedAt` reset to now, as `keepSharedCopy` does (review #1440 P3):
            // the guest `repository.save` honours a brand-new row's OWN `createdAt` (deliberately,
            // to keep an imported chart's original timestamp), so leaving the original's here would make a fresh copy
            // sort as if it were made back when the original was.
            const now = new Date().toISOString();
            const copyDocument = {
                ...document,
                id: crypto.randomUUID(),
                title: `${document.title.slice(0, 145)} copy`,
                revision: 0,
                createdAt: now,
                updatedAt: now,
            };
            await storeSave(copyDocument, null, { owner: null, stand: false });
            await refreshSongs();
            setHomeNoticeState('Duplicated');
        });
    }
    /**
     * What a row's Export should actually write (#1440 review P3) — the retained draft, if one
     * exists, the same as the stand's own Export always writes whatever is live on the stand
     * rather than silently falling back to the last committed version. The committed document
     * otherwise.
     */
    async function exportableRowDocument(id: string): Promise<ChartDocument | null> {
        const document = await readLiveSong(id);
        if (!document) {
            return null;
        }
        const { recovery } = await retainedDraftFor(document);
        return recovery?.document ?? document;
    }
    function exportRow() {
        const target = rowMenuFor;
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

    return {
        rowMenuFor,
        rowMenuTrigger,
        rowMenuOpening,
        openRowMenu,
        closeRowMenu,
        renameRow,
        duplicateRow,
        exportRow,
        exportableRowDocument,
    };
}
