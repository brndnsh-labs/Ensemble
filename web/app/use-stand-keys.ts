import { type RefObject, useEffect, useRef } from 'react';
import type { ChartDocument } from '../lib/runtime';

/** What the shell hands `useStandKeys`: exactly what the key handler reads. */
interface StandKeysOptions {
    /** The open chart; the keys act only on the stand's chart. */
    current: ChartDocument | null;
    /** A one-action run is in flight (open, save, import): Space waits unless the band is playing. */
    busy: boolean;
    /** The band is playing or about to be. */
    playbackActive: boolean;
    /** A bar's field is open: paging is left to the editor. */
    editing: boolean;
    /** The neck view is up: paging is left to it. */
    neckShowing: boolean;
    /** The chart's scroller, which the page keys turn. */
    scroll: RefObject<HTMLDivElement | null>;
    /** The Play/Stop button's own action, which Space repeats. */
    togglePlayback: () => void;
    /** A page turn is the musician leaving the Following look-ahead. */
    setFollowing: (following: boolean) => void;
}

/** The stand's keyboard: Space plays and stops, PageDown/PageUp turn the page (#1932). */
export function useStandKeys({
    current,
    busy,
    playbackActive,
    editing,
    neckShowing,
    scroll,
    togglePlayback,
    setFollowing,
}: StandKeysOptions) {
    const standKeys = useRef<((event: KeyboardEvent) => void) | null>(null);
    // Keys on the stand (UI audit): Space plays and stops, and PageDown/PageUp step through the
    // chart a section at a time — what a page-turn pedal sends. Only on the stand's chart, with no
    // sheet or dialog open, and never while typing: Space on a focused button or control is that
    // control's own, so it is left alone. Read through a ref so the listener, added once, always
    // sees this render's state.
    standKeys.current = (event: KeyboardEvent) => {
        if (!current || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        if (document.querySelector('dialog[open]')) {
            return;
        }
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
            return;
        }
        if (event.key === ' ') {
            if (target?.closest('button, a, [role="button"], [role="tab"], [role="menuitem"]')) {
                return;
            }
            event.preventDefault();
            if (!busy || playbackActive) {
                togglePlayback();
            }
            return;
        }
        if ((event.key === 'PageDown' || event.key === 'PageUp') && !editing && !neckShowing) {
            const box = scroll.current;
            if (!box) {
                return;
            }
            const sections = [...box.querySelectorAll<HTMLElement>('.section')].map(
                (section) =>
                    section.getBoundingClientRect().top -
                    box.getBoundingClientRect().top +
                    box.scrollTop -
                    8,
            );
            // The next section's top, or one screen on when that is nearer: a page turn that
            // never skips bars, in a long section as much as between short ones. A section
            // within a row's height of the view's top is the one being read: the chart's own
            // padding puts the first one a few pixels down.
            const at = box.scrollTop;
            const near = 24;
            const page = box.clientHeight * 0.85;
            const down = event.key === 'PageDown';
            const section = down
                ? sections.find((top) => top > at + near)
                : sections.filter((top) => top < at - near).at(-1);
            const to = down
                ? Math.min(section ?? Infinity, at + page)
                : Math.max(section ?? -Infinity, at - page);
            const max = box.scrollHeight - box.clientHeight;
            if ((down && at >= max - 1) || (!down && at <= 0)) {
                return;
            }
            event.preventDefault();
            setFollowing(false);
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            box.scrollTo({
                top: Math.max(0, Math.min(max, to)),
                behavior: reduce ? 'instant' : 'smooth',
            });
        }
    };
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => standKeys.current?.(event);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
}
