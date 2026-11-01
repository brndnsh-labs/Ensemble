import { type RefObject, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------- #1458 Following look-ahead
//
// Module-level and pure DOM math, not component state: the scroll position itself is the only
// thing that needs to change, and computing it fresh off `getBoundingClientRect()` each time
// means there is nothing to keep in sync with React's render — see `CLAUDE.md`'s "keep React
// re-renders cheap" note on this story.

/**
 * Instant under `prefers-reduced-motion: reduce` (Acceptance); smooth otherwise.
 *
 * `'instant'`, not `'auto'`: the `behavior` option's `'auto'` means "do whatever the element's
 * `scroll-behavior` CSS property says", and `.chart-scroll`'s own `scroll-behavior: smooth`
 * (`chart-sheet.css`) — a class selector — outranks `* { scroll-behavior: auto }`'s reduced-motion
 * override on specificity alone; the universal selector never wins that fight regardless of the
 * media query. `'instant'` is an explicit value the CSS property cannot override.
 */
function scrollBehavior(): ScrollBehavior {
    return typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth';
}

/** `el`'s top in `scrollEl`'s own scrollable content space — stable across a scroll in flight,
 * unlike `getBoundingClientRect()`'s viewport-relative top. */
function docTop(scrollEl: HTMLElement, el: HTMLElement): number {
    return (
        el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop
    );
}

function clampScrollTop(scrollEl: HTMLElement, top: number): number {
    return Math.max(0, Math.min(top, scrollEl.scrollHeight - scrollEl.clientHeight));
}

/**
 * The doc-space bottom edge of the first ROW strictly below `rowEl`'s own row — not the next
 * `.bar` in document order, which on a 4-per-row desktop layout is usually still a SIBLING in the
 * same row (patch review P3-3: adding its height to `rowEl`'s own double-counted one row as if it
 * were a second one, rather than measuring the next row at all). Naturally includes any
 * `.section-head` between the two rows, since it just reads whatever bar comes next at a lower
 * top, at its ACTUAL rendered position — a taller gap there simply pushes that bar further down.
 * Null past the last row.
 */
function nextRowBottom(scrollEl: HTMLElement, rowEl: HTMLElement): number | null {
    const bars = Array.from(scrollEl.querySelectorAll<HTMLElement>('.bar'));
    const rowTop = rowEl.getBoundingClientRect().top;
    const next = bars
        .slice(bars.indexOf(rowEl))
        .find((bar) => bar.getBoundingClientRect().top > rowTop + 1);
    return next ? docTop(scrollEl, next) + next.getBoundingClientRect().height : null;
}

/**
 * The playing row at the top third of the scroller (Touches #1) — the next two rows then sit
 * fully in the remaining two-thirds on both measured viewports (laptop 4-per-row, phone 2).
 *
 * On a short scroller (a landscape phone, ~250px) a flat 28% can push the playing row down far
 * enough that the next ROW (`nextBottom`, `nextRowBottom` above) no longer fits below it even
 * though the two would fit together at a smaller offset. Clamp the anchor so that, whenever they
 * DO fit together, the anchor never asks for more room than that: the offset only ever shrinks
 * from 28%, so the playing row is never pushed lower than the default position.
 */
function scrollRowIntoView(scrollEl: HTMLElement, rowEl: HTMLElement, nextBottom: number | null) {
    const viewHeight = scrollEl.clientHeight;
    const rowTop = docTop(scrollEl, rowEl);
    let anchor = viewHeight * 0.28;
    if (nextBottom !== null) {
        const combinedHeight = nextBottom - rowTop;
        if (combinedHeight <= viewHeight) {
            anchor = Math.max(0, Math.min(anchor, viewHeight - combinedHeight));
        }
    }
    const top = rowTop - anchor;
    scrollEl.scrollTo({ top: clampScrollTop(scrollEl, top), behavior: scrollBehavior() });
}

/**
 * The jump-ahead scroll (Touches #3): the next bar isn't the adjacent one and is out of view, so
 * put it on screen before its downbeat — anchored the same top-third as the normal row scroll —
 * while keeping the playing bar visible too if both fit in one screenful; if they can't, the
 * target wins outright (the spec's own tie-break).
 */
function scrollForJump(scrollEl: HTMLElement, activeEl: HTMLElement, targetEl: HTMLElement): void {
    const activeTop = docTop(scrollEl, activeEl);
    const activeBottom = activeTop + activeEl.getBoundingClientRect().height;
    const targetTop = docTop(scrollEl, targetEl);
    const targetBottom = targetTop + targetEl.getBoundingClientRect().height;
    const combinedTop = Math.min(activeTop, targetTop);
    const combinedHeight = Math.max(activeBottom, targetBottom) - combinedTop;
    const viewHeight = scrollEl.clientHeight;
    const top =
        combinedHeight <= viewHeight
            ? combinedTop - (viewHeight - combinedHeight) * 0.3
            : targetTop - viewHeight * 0.28;
    scrollEl.scrollTo({ top: clampScrollTop(scrollEl, top), behavior: scrollBehavior() });
}

/** Bar elements in document order, for an adjacency check DOM position alone can't give cleanly
 * (a repeat back or a loop wrap moves to an EARLIER bar, not just a distant later one). */
function barIndex(scrollEl: HTMLElement, el: HTMLElement): number {
    return Array.prototype.indexOf.call(scrollEl.querySelectorAll('.bar'), el);
}

/**
 * Following's look-ahead scroll (#1458), lifted out of the shell (#1893): the playing row kept at
 * the top third of `.chart-scroll`, and the jump-ahead that puts a non-adjacent next bar on screen
 * before its downbeat. It reads only what it is handed and writes nothing back but the scroll
 * position. `chartId` is the open chart's id (`current?.id`); `activeBar` is `useChartView`'s.
 */
export function useFollowScroll(
    scroll: RefObject<HTMLDivElement | null>,
    {
        following,
        active,
        chartId,
        nextSoon,
        activeBar,
    }: {
        following: boolean;
        active: number | null;
        chartId: string | undefined;
        nextSoon: boolean;
        activeBar: number | null;
    },
): void {
    // Following's look-ahead scroll (#1458): the active bar's document-space top the last time
    // it scrolled there, so a chord change WITHIN the same row (no vertical move) is a no-op —
    // null right after Following turns back on, forcing an immediate re-apply ("Resume follow").
    const followRowTop = useRef<number | null>(null);
    // The performed BAR the jump-ahead scroll last fired for (patch review P3-2 — not the
    // `active` slot: a chord landing exactly on the last felt pulse changes slot without
    // changing bar), so the last-beat window (several 60ms ticks) triggers it exactly once
    // rather than on every tick it stays true.
    const followJumpedFor = useRef<number | null>(null);
    // "Resume follow" re-applies the look-ahead immediately (Touches #4): forget the last row we
    // scrolled to and the slot we last jumped for, so the two effects below don't mistake picking
    // follow back up for "nothing moved" and sit still.
    useEffect(() => {
        if (following) {
            followRowTop.current = null;
            followJumpedFor.current = null;
        }
    }, [following]);
    // Stop, and opening a different chart, both retire whatever row/jump memory the last song's
    // playback left behind — otherwise a `Start here` that lands on the very row a scrollbar drag
    // last remembered would wrongly read as "nothing moved" and sit still.
    useEffect(() => {
        if (active === null) {
            followRowTop.current = null;
            followJumpedFor.current = null;
        }
    }, [active]);
    useEffect(() => {
        if (!chartId) {
            return;
        }
        followRowTop.current = null;
        followJumpedFor.current = null;
    }, [chartId]);
    // `followJumpedFor`'s de-dupe (below) is keyed on the PERFORMED BAR (`activeBar`), which is a
    // fixed array position the band re-walks every lap — so it recurs identically on lap 2, lap 3,
    // and so on. Retiring it the moment `nextSoon` goes false (the playing bar's last-beat window
    // closing) means the NEXT time any bar's last beat arrives — the very same bar index
    // included — the jump-ahead is live again, rather than permanently spent after its first fire.
    useEffect(() => {
        if (!nextSoon) {
            followJumpedFor.current = null;
        }
    }, [nextSoon]);
    // Following's look-ahead scroll (#1458, Touches #1): on each ROW change — not bar change — put
    // the playing row at the top third of `.chart-scroll`, so the next two rows stay fully visible.
    // Keyed on `active` (which changes at chord granularity, at least once per bar) rather than a
    // poll: `followRowTop` turns a same-row chord change into a no-op via the guard below.
    useEffect(() => {
        if (!following || active === null) {
            return;
        }
        const scrollEl = scroll.current;
        const activeEl = scrollEl?.querySelector<HTMLElement>('[data-active="true"]');
        if (!scrollEl || !activeEl) {
            return;
        }
        if (scrollEl.scrollHeight <= scrollEl.clientHeight + 1) {
            return; // Acceptance: a chart that already fits never scrolls.
        }
        const top = docTop(scrollEl, activeEl);
        if (followRowTop.current !== null && Math.abs(top - followRowTop.current) < 1) {
            return; // Same row as last time: a chord changed, not a row.
        }
        followRowTop.current = top;
        scrollRowIntoView(scrollEl, activeEl, nextRowBottom(scrollEl, activeEl));
    }, [scroll, active, following]);
    // The jump-ahead (#1458, Touches #3): fires once per bar, on `nextSoon`'s rising edge (the
    // playing bar's last beat), only when the next performed bar isn't document-adjacent to the
    // active one and isn't already on screen — a repeat back, an ending skip, or the form's loop
    // to bar 1. `followJumpedFor` is the de-dupe, keyed on the PERFORMED
    // BAR rather than `active`'s slot (patch review P3-2): a chord landing exactly on the last
    // felt pulse changes `active` without changing the bar, and a slot-keyed de-dupe would let
    // that re-fire the jump a second time inside the very same bar. `nextSoon` stays true for
    // several 60ms ticks, this must act on only the first one (and is retired above the moment
    // `nextSoon` next goes false, so lap 2's last beat can fire it again).
    useEffect(() => {
        if (
            !nextSoon ||
            !following ||
            activeBar === null ||
            followJumpedFor.current === activeBar
        ) {
            return;
        }
        const scrollEl = scroll.current;
        const activeEl = scrollEl?.querySelector<HTMLElement>('[data-active="true"]');
        const targetEl = scrollEl?.querySelector<HTMLElement>('[data-next]');
        if (!scrollEl || !activeEl || !targetEl) {
            return;
        }
        if (scrollEl.scrollHeight <= scrollEl.clientHeight + 1) {
            return;
        }
        if (barIndex(scrollEl, targetEl) === barIndex(scrollEl, activeEl) + 1) {
            return; // Adjacent — the row-scroll effect above already keeps it visible.
        }
        const scrollRect = scrollEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const inView = targetRect.top >= scrollRect.top && targetRect.bottom <= scrollRect.bottom;
        if (inView) {
            return;
        }
        followJumpedFor.current = activeBar;
        scrollForJump(scrollEl, activeEl, targetEl);
    }, [scroll, nextSoon, following, activeBar]);
}

/**
 * Whether the playing row is (even partly) out of `.chart-scroll`'s view (#1986): "Resume follow" has something
 * to resume TO only then. A chart that fits has nothing to scroll, so a wheel or PageDown over
 * it leaves the playing row on screen and no pill is owed. Measured on scroll and on every
 * active-bar change, and only while Following is off (while on, the look-ahead keeps it in view).
 */
export function usePlayingRowAway(
    scroll: RefObject<HTMLDivElement | null>,
    { following, active, remount }: { following: boolean; active: number | null; remount: boolean },
): boolean {
    const [away, setAway] = useState(false);
    // biome-ignore lint/correctness/useExhaustiveDependencies: `active` re-measures when the playing bar moves and `remount` when the neck swaps the scroller; the body reads the DOM, not the values.
    useEffect(() => {
        const scrollEl = scroll.current;
        if (following || !scrollEl) {
            setAway(false);
            return;
        }
        const measure = () => {
            const activeEl = scrollEl.querySelector<HTMLElement>('[data-active="true"]');
            if (!activeEl) {
                setAway(false);
                return;
            }
            const box = scrollEl.getBoundingClientRect();
            const row = activeEl.getBoundingClientRect();
            setAway(row.top < box.top - 1 || row.bottom > box.bottom + 1);
        };
        measure();
        scrollEl.addEventListener('scroll', measure, { passive: true });
        return () => scrollEl.removeEventListener('scroll', measure);
    }, [scroll, following, active, remount]);
    return away;
}
