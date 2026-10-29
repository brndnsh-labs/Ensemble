import type { Ref } from 'react';
import type { DeleteUndo } from './use-delete-undo';

/**
 * The stand's status strip (#1922): the message toast, the delete Undo, the sync-failure line and
 * the Resume-follow pill, stacked bottom-centre. Presentational: the session shell owns every
 * input (the toast hook, the delete-undo hook, the sync notice, the follow state) and the ref
 * that measures the stack's height.
 */
export function StandStack({
    stackRef,
    toastTone,
    toastText,
    messageToken,
    setToastHeld,
    dismissMessage,
    undoLive,
    deleteUndo,
    setUndoHeld,
    onUndo,
    syncFailure,
    dismissSyncFailure,
    showResume,
    onResumeFollow,
}: {
    stackRef: Ref<HTMLDivElement>;
    toastTone: 'busy' | 'warning' | 'info';
    toastText: string | null;
    messageToken: number;
    setToastHeld: (held: boolean) => void;
    dismissMessage: () => void;
    undoLive: boolean;
    deleteUndo: DeleteUndo | null;
    setUndoHeld: (held: boolean) => void;
    onUndo: () => void;
    /** The standing sync-failure line to show, or null (none, dismissed, or Song actions is open). */
    syncFailure: { text: string } | null;
    dismissSyncFailure: () => void;
    /** Playing, not following, and no neck up: there is something to resume TO. */
    showResume: boolean;
    onResumeFollow: () => void;
}) {
    /*
     * #1460 — one fixed, bottom-centred stack (review P2 #1/#4): the message
     * toast, the sync-failure notice and the Resume-follow pill each get their
     * own element in normal flex-column flow, so none can ever overlap or mask
     * another (the old single-slot toast let a standing sync failure hide every
     * later "Link copied"/"Saved" message; the pill and the toast could overlap
     * by a few px at some viewport sizes). Order top-to-bottom: message, failure,
     * pill — the pill stays the reachable-most control.
     */
    return (
        <div className="stand-stack" ref={stackRef}>
            {/*
             * The footer's single status line is now this toast: no longer able to
             * say "Band is playing" or the offline label at all. Always mounted with
             * an empty state (`data-empty`), same reasoning as `homeNotice`'s status
             * line (#1440): a freshly-inserted region is not reliably announced, but
             * a live region's TEXT CHANGE is.
             */}
            <div
                className="stand-toast"
                role="status"
                data-testid="stand-toast"
                data-tone={toastTone}
                data-empty={!toastText}
                onMouseEnter={() => setToastHeld(true)}
                onMouseLeave={() => setToastHeld(false)}
                onFocus={() => setToastHeld(true)}
                onBlur={() => setToastHeld(false)}
            >
                {/*
                 * Review re-review P2 #2 — a REPEAT of the exact same sentence (two
                 * Saves in a row) is otherwise invisible to assistive tech: React
                 * bails out of re-rendering a text node whose value hasn't changed, so
                 * nothing in the live region actually mutates. The previous fix (a
                 * hidden counter beside the text) didn't work either: the region isn't
                 * `aria-atomic`, so a mutation on a SIBLING node doesn't re-announce
                 * this one, and `aria-hidden` on the counter still let some
                 * screen readers read its bare number aloud. Keying the text node
                 * itself on `messageToken` is what actually fixes it: React UNMOUNTS
                 * and remounts the span on every `setMessage` call (even for identical
                 * text), which is a real node replacement inside the live region —
                 * genuinely announced, nothing extra ever read.
                 */}
                <span key={messageToken}>{toastText}</span>
                {toastTone === 'warning' && (
                    <button className="toast-close" aria-label="Dismiss" onClick={dismissMessage}>
                        ×
                    </button>
                )}
            </div>
            {/*
             * A delete's Undo (#1758): the toast's look, its own element so no other
             * message (a draft kept, a sound loading) can push it out while it holds.
             * Always mounted, as the toast is, so its text change is announced. Undo
             * keeps focus where it was on the way down: a bar's field stays open, and
             * on a phone its dock stays up rather than fold away under the tap.
             */}
            <div
                className="stand-toast stand-undo"
                role="status"
                data-testid="stand-undo"
                data-empty={!undoLive}
                // A real mouse only: an iOS tap on the text sends pointer events
                // too, and must not hold the offer open for good.
                onPointerEnter={(event) => event.pointerType === 'mouse' && setUndoHeld(true)}
                onPointerLeave={(event) => event.pointerType === 'mouse' && setUndoHeld(false)}
                onFocus={() => setUndoHeld(true)}
                onBlur={() => setUndoHeld(false)}
            >
                {undoLive && deleteUndo && (
                    <>
                        <span>{deleteUndo.text}</span>
                        <button
                            type="button"
                            className="toast-action"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={onUndo}
                        >
                            Undo
                        </button>
                    </>
                )}
            </div>
            {/*
             * Review P2 #1 — hidden while Song actions is open: it renders the SAME
             * fact in its own "Status" section (`sync-failure`), and both are
             * `role="status"` live regions, so leaving this one mounted too would
             * announce the one change twice.
             */}
            {syncFailure && (
                <div className="stand-sync-failure" role="status" data-testid="stand-sync-failure">
                    <span>{syncFailure.text}</span>
                    <button
                        className="toast-close"
                        aria-label="Dismiss"
                        onClick={dismissSyncFailure}
                    >
                        ×
                    </button>
                </div>
            )}
            {/*
             * The footer's toggle ("Following"/"Resume follow", either direction) is
             * gone. Wheel/touch/scroll-key already turn Following off (`chart-scroll`'s
             * own handlers, in the shell); the only control left is the way back, and only
             * while there is something to resume TO. `setFollowing(true)` alone is
             * enough to "re-apply the row scroll immediately" (acceptance): the effect
             * in `useFollowScroll` that resets its row/jump memory the instant
             * `following` turns true runs before the look-ahead scroll effect that
             * reads it, in the same pass. Focus moves to the chart itself on
             * activation (review P3) since this button unmounts the instant it fires
             * — `preventScroll` because the look-ahead scroll (`useFollowScroll`) is
             * already doing the ONE deliberate scroll this tap causes, and
             * `.chart-scroll`'s own `:focus-visible`-only outline (not plain
             * `:focus`) is what keeps a pointer tap from drawing a visible ring
             * around the whole chart.
             */}
            {showResume && (
                <button
                    className="resume-follow-pill"
                    data-testid="resume-follow"
                    onClick={onResumeFollow}
                >
                    <span aria-hidden="true">↓</span> Resume follow
                </button>
            )}
        </div>
    );
}
