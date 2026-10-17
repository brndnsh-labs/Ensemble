'use client';

import { type RefObject, useLayoutEffect, useRef } from 'react';

/** Room kept between a placed menu and its anchor, and between it and the viewport's edges. */
const GAP = 6;
const MARGIN = 8;

interface Placement {
    /** False while the menu is a phone sheet, which the stylesheet places at the screen's foot. */
    enabled: boolean;
    /** Which of the anchor's edges the menu lines up with: its left (`start`) or right (`end`). */
    align: 'start' | 'end';
    /** The anchor has scrolled off the screen (or left the page): the menu closes rather than
     * follow it away. Without it the menu stays where it was last placed. */
    onGone?: () => void;
}

/**
 * Places a fixed popover at its anchor (#1755): under it, or above it where there is no room
 * below, and never off the screen. It follows the anchor through a scroll — the musician's, or
 * Following's own while the band plays — and through a resize or the menu itself growing (a
 * disclosure opening inside it), so it never floats over something else. Written straight to
 * the menu's own style, not to state: Following scrolls on the paint path, and a state write
 * would re-render whatever holds the menu on every frame of it.
 *
 * The one placement for every anchored menu: `<Menu>`, the bar menu and the section letter's
 * menu all read it.
 */
export function useAnchoredPlacement(
    node: RefObject<HTMLElement | null>,
    anchor: () => Element | null,
    { enabled, align, onGone }: Placement,
): void {
    // Read through a ref, so the listeners are added once per opening, not on every render.
    const latest = useRef({ anchor, onGone });
    latest.current = { anchor, onGone };
    useLayoutEffect(() => {
        if (!enabled) {
            return;
        }
        function place() {
            const menu = node.current;
            const rect = latest.current.anchor()?.getBoundingClientRect();
            if (!menu) {
                return;
            }
            if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
                latest.current.onGone?.();
                return;
            }
            const width = menu.offsetWidth;
            const height = menu.offsetHeight;
            const edge = align === 'end' ? rect.right - width : rect.left;
            const left = Math.max(MARGIN, Math.min(edge, window.innerWidth - width - MARGIN));
            const below = rect.bottom + GAP;
            const above = rect.top - GAP - height;
            const top =
                below + height > window.innerHeight - MARGIN && above >= MARGIN
                    ? above
                    : Math.max(MARGIN, Math.min(below, window.innerHeight - height - MARGIN));
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
        }
        place();
        const grown = new ResizeObserver(place);
        if (node.current) {
            grown.observe(node.current);
        }
        document.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            grown.disconnect();
            document.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [enabled, align, node]);
}
