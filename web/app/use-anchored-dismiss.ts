'use client';

import { type RefObject, useEffect, useEffectEvent } from 'react';
import { afterPress } from './after-press';

/** Puts focus back on the button an anchored menu or popover opened from, if it is still there. */
export function focusAnchor(anchor: () => Element | null): void {
    const target = anchor();
    if (target instanceof HTMLElement && target.isConnected) {
        target.focus({ preventScroll: true });
    }
}

/**
 * How an anchored menu or popover is dismissed (#1755, #1757), shared by `<Menu>` and the
 * transport's Key popover: while it is mounted its trigger says `aria-expanded="true"`, a press
 * outside it closes it (focus back on the trigger once the press has landed, unless the press
 * gave focus to something else), and Esc anywhere closes it with focus back on the trigger. The
 * shell's `popstate` sends that Escape too, so the browser's Back closes it and keeps the page.
 *
 * `inside` are the boxes a press may land in without closing (the list, a phone's backdrop,
 * whose own click closes it). The trigger's own press is not outside either: its click toggles.
 * The press listener never cancels the press (WebKit then drops the tap's click).
 */
export function useAnchoredDismiss(
    inside: readonly RefObject<Element | null>[],
    anchor: () => Element | null,
    close: (refocus: boolean) => void,
): void {
    // Effect events, so the document listeners are added once per opening and still read the
    // latest `inside`, `anchor` and `close` when a press or a key arrives.
    const currentAnchor = useEffectEvent(anchor);
    const onOutside = useEffectEvent((target: Node | null) => {
        if (inside.some((box) => box.current?.contains(target)) || anchor()?.contains(target)) {
            return;
        }
        close(false);
        afterPress(() => {
            const active = document.activeElement;
            if (!active || active === document.body) {
                focusAnchor(anchor);
            }
        });
    });
    const onEscape = useEffectEvent(() => close(true));
    useEffect(() => {
        const trigger = currentAnchor();
        trigger?.setAttribute('aria-expanded', 'true');
        function outside(event: PointerEvent) {
            onOutside(event.target instanceof Node ? event.target : null);
        }
        // Esc with focus somewhere outside the box (inside it, the box's own keys answer first).
        function escape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault();
                onEscape();
            }
        }
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('keydown', escape);
            if (trigger?.isConnected) {
                trigger.setAttribute('aria-expanded', 'false');
            }
        };
    }, []);
}
