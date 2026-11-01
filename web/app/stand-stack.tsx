import { useCallback, useRef } from 'react';
import type { StyleSoundsStatus } from '../lib/runtime';
import type { DeleteUndo } from './use-delete-undo';

/**
 * The stand's status strip (#1922): the message toast, the delete Undo, the sync-failure line and
 * the Resume-follow pill, stacked bottom-centre. The session shell owns every input (the toast
 * hook, the delete-undo hook, the sync notice, the follow state); the component owns the
 * observer that publishes the stack's height.
 */
export function StandStack({
    toastTone,
    toastText,
    messageToken,
    announcement,
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
    styleSounds,
    onGetStyleSounds,
    onDeclineStyleSounds,
}: {
    toastTone: 'busy' | 'warning' | 'info';
    toastText: string | null;
    messageToken: number;
    /** Screen-reader-only text for the toast's live region (`useStandToast`'s `announce`). */
    announcement: { text: string; token: number };
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
    /** The style's sounds being fetched behind the band, or offered under Save-Data (#1997). */
    styleSounds: StyleSoundsStatus;
    onGetStyleSounds: () => void;
    onDeclineStyleSounds: () => void;
}) {
    /**
     * Re-review P3 — measures `.stand-stack`'s ACTUAL rendered height (0 when nothing shows,
     * taller as the message toast/failure notice/pill stack up) into a CSS custom property, so
     * `.chart-scroll`'s bottom padding only grows past its normal floor while the stack genuinely
     * has something in it, instead of a fixed worst-case reservation eating chart space that used
     * to fit before any of this existed. A callback ref, not `useRef`+`useEffect`: the stack only
     * exists inside the conditionally-rendered stand, so an effect keyed on mount alone would run
     * once at the WHOLE APP's mount (before any chart is ever open) and never re-attach when the
     * stand's own JSX later mounts the node this actually needs to observe.
     */
    const standStackObserver = useRef<ResizeObserver | null>(null);
    const stackRef = useCallback((el: HTMLDivElement | null) => {
        standStackObserver.current?.disconnect();
        standStackObserver.current = null;
        if (!el) {
            document.documentElement.style.setProperty('--stand-stack-height', '0px');
            return;
        }
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                document.documentElement.style.setProperty(
                    '--stand-stack-height',
                    `${entry.contentRect.height}px`,
                );
            }
        });
        observer.observe(el);
        standStackObserver.current = observer;
    }, []);
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
                {/* #1985 — an opened song, said to a screen reader inside this same region. */}
                <span className="sr-only" key={`announce-${announcement.token}`}>
                    {announcement.text}
                </span>
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
             * The style's sounds (#1997): one quiet line while they download behind the band,
             * gone when they land, or under Save-Data a one-tap offer with their size. Always
             * mounted, as the toast is, so its text change is announced. A quiet failure says
             * nothing; one the musician asked for (the offer's button) says why, on the offer.
             */}
            <div
                className="stand-toast stand-sounds"
                role="status"
                data-testid="stand-sounds"
                data-empty={styleSounds.kind === 'idle'}
            >
                {styleSounds.kind === 'fetching' && (
                    <span>Getting the band's real instruments…</span>
                )}
                {styleSounds.kind === 'offer' && (
                    <>
                        <span>
                            {styleSounds.error ??
                                `The band's real instruments are about ${Math.max(1, Math.round(styleSounds.mb))} MB.`}
                        </span>
                        <button type="button" className="toast-action" onClick={onGetStyleSounds}>
                            {styleSounds.error ? 'Try again' : 'Get them'}
                        </button>
                        <button
                            type="button"
                            className="toast-close"
                            aria-label="Not now"
                            onClick={onDeclineStyleSounds}
                        >
                            ×
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
