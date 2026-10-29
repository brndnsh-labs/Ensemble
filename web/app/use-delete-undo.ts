import {
    type Dispatch,
    type RefObject,
    type SetStateAction,
    useEffect,
    useEffectEvent,
    useRef,
    useState,
} from 'react';
import type { ChartDocument } from '../lib/runtime';
import type { BarDraft } from './use-bar-drafts';

/** How long a delete's Undo is offered (#1758), unless the toast has the pointer or focus. */
export const DELETE_UNDO_MS = 6000;

/**
 * What a delete's Undo puts back (#1758): the chart and its pending bars just before the delete,
 * and where the musician was. Good only while the chart is still `after`, what the delete left.
 */
export interface DeleteUndo {
    /** What the toast says: "Bar 5 deleted". */
    text: string;
    before: ChartDocument;
    drafts: ReadonlyMap<string, BarDraft>;
    measureId: string;
    sectionId: string;
    /** The bar whose field was open when it was deleted, opened again. */
    reopen: string | null;
    after: ChartDocument;
    /** One per delete: the offer's few seconds are counted from it, not from a carry-forward. */
    token: number;
}

/** What the shell hands `useDeleteUndo`. */
interface DeleteUndoOptions {
    /** The chart on the stand. */
    current: ChartDocument | null;
    /** The shell is running an action; an Undo pressed meanwhile waits for it to settle. */
    busy: boolean;
    /** No bar is pending (`barDrafts.drafts`): a bar typed in retires the offer. */
    draftsEmpty: boolean;
    /** The chart as of now, the `after` a new offer is good for. */
    currentNow: RefObject<ChartDocument | null>;
    /** Whether `next` is `after` as a new song's first-change keep left it (#1707). */
    keptAs: (after: ChartDocument, next: ChartDocument) => boolean;
    /** The shell's Undo, which restores the chart; run here once a waiting Undo's turn comes. */
    undoDelete: () => void;
}

/** What the shell's toast and its `undoDelete` read back. */
interface DeleteUndoOffer {
    /** The offer, while there is one. */
    deleteUndo: DeleteUndo | null;
    /** The offer still holds: the toast shows it. */
    undoLive: boolean;
    /** Holds the offer's clock: the toast has a real mouse over it or focus in it. */
    setUndoHeld: Dispatch<SetStateAction<boolean>>;
    /** Offers Undo for the delete just made. */
    offerUndo: (undo: Omit<DeleteUndo, 'after' | 'token'>) => void;
    /** Takes the offer down. */
    retireUndo: () => void;
    /** The offer as of now, for an Undo that waited its turn. */
    deleteUndoNow: RefObject<DeleteUndo | null>;
    /** Set by `undoDelete` when it must wait for the action before it. */
    undoAfterWork: RefObject<boolean>;
    /** Set by `undoDelete` where no bar field reopens: what takes focus once it lands. */
    undoFocus: RefObject<{ sectionId: string } | { measureId: string } | null>;
}

/**
 * The delete toast's Undo offer (#1758): its lifetime, from `offerUndo` to the edit, the few
 * seconds or the Undo that retires it. The shell keeps the restore (`undoDelete`), which reads
 * its one-action lock and reloads the chart; this hook runs it for an Undo that waited for the
 * action before it, through the latest closure. Call it after the shell's `toastText` effects,
 * where these effects have always run.
 */
export function useDeleteUndo({
    current,
    busy,
    draftsEmpty,
    currentNow,
    keptAs,
    undoDelete,
}: DeleteUndoOptions): DeleteUndoOffer {
    // A delete's Undo (#1758): the chart and its pending bars as they were just before the
    // delete, offered for a few seconds. One snapshot, in memory, not a history: it is good only
    // while the chart is still exactly what the delete left (`after`, no bar pending since), so
    // any later edit — or Save, which writes a new revision — retires it.
    const [deleteUndo, setDeleteUndo] = useState<DeleteUndo | null>(null);
    // The offer as of now, for an Undo that waited its turn behind another action (`run`).
    const deleteUndoNow = useRef(deleteUndo);
    deleteUndoNow.current = deleteUndo;
    const undoToken = useRef(0);
    const [undoHeld, setUndoHeld] = useState(false);
    // Where focus goes once an Undo has landed (#1758 review): the restored section's letter,
    // or the restored bar's number where its field does not open, never the page.
    const undoFocus = useRef<{ sectionId: string } | { measureId: string } | null>(null);
    // An Undo pressed while another action ran, to run once it is done.
    const undoAfterWork = useRef(false);
    // The shell's restore as of the latest render, for the Undo that waited (`undoAfterWork`).
    const onUndoAfterWork = useEffectEvent(undoDelete);
    /** Offer Undo for the delete just made (#1758): the chart as it now stands is `after`. */
    function offerUndo(undo: Omit<DeleteUndo, 'after' | 'token'>) {
        const after = currentNow.current;
        if (after) {
            undoToken.current += 1;
            setDeleteUndo({ ...undo, after, token: undoToken.current });
            setUndoHeld(false);
        }
    }
    // A delete's Undo (#1758) holds while the chart is still what the delete left: any later
    // edit, a bar typed in, Save or another song retires it, and so do a few seconds untouched.
    // A new song's first-change keep (#1707) is not an edit: it stores the same chart at a new
    // revision, and the offer is carried forward onto it (#1758 review).
    const undoKept =
        deleteUndo !== null &&
        current !== null &&
        current !== deleteUndo.after &&
        keptAs(deleteUndo.after, current);
    const undoLive =
        deleteUndo !== null && (current === deleteUndo.after || undoKept) && draftsEmpty;
    useEffect(() => {
        if (!deleteUndo) {
            return;
        }
        if (!undoLive) {
            setDeleteUndo(null);
        } else if (undoKept && current) {
            setDeleteUndo({
                ...deleteUndo,
                before: {
                    ...deleteUndo.before,
                    revision: current.revision,
                    updatedAt: current.updatedAt,
                },
                after: current,
            });
        }
    }, [deleteUndo, undoLive, undoKept, current]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: counted per delete (`token`), not per carry-forward.
    useEffect(() => {
        if (!undoLive || undoHeld) {
            return;
        }
        const timer = window.setTimeout(() => setDeleteUndo(null), DELETE_UNDO_MS);
        return () => window.clearTimeout(timer);
    }, [deleteUndo?.token, undoLive, undoHeld]);
    // An Undo that waited for the action before it (`undoDelete`): the shell coming free is the
    // trigger, and `undoDelete` is the latest render's, read through `onUndoAfterWork`.
    useEffect(() => {
        if (!busy && undoAfterWork.current) {
            undoAfterWork.current = false;
            onUndoAfterWork();
        }
    }, [busy]);
    // Focus after an Undo whose bar does not open (a section's, or a bar's outside Edit): on
    // what came back, not the page (#1758 review).
    // biome-ignore lint/correctness/useExhaustiveDependencies: the restored chart is the trigger.
    useEffect(() => {
        const target = undoFocus.current;
        if (!target) {
            return;
        }
        undoFocus.current = null;
        const node =
            'sectionId' in target
                ? document.querySelector<HTMLElement>(
                      `.section-letter[data-section-id="${CSS.escape(target.sectionId)}"]`,
                  )
                : document.querySelector<HTMLElement>(
                      `[data-measure-id="${CSS.escape(target.measureId)}"] .bar-number`,
                  );
        node?.focus({ preventScroll: true });
    }, [current]);
    useEffect(() => {
        if (!undoLive) {
            setUndoHeld(false);
        }
    }, [undoLive]);

    return {
        deleteUndo,
        undoLive,
        setUndoHeld,
        offerUndo,
        retireUndo: () => setDeleteUndo(null),
        deleteUndoNow,
        undoAfterWork,
        undoFocus,
    };
}
