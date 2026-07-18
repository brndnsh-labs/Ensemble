import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface OverlayEntry {
    onClose: () => void;
}

// Shared open-overlay stack. Every open overlay (modal or non-modal) registers
// here, and a SINGLE document keydown listener routes Escape to the TOPMOST
// overlay only. Before #1129 each hook instance attached its own document
// Escape listener and called e.stopPropagation() — which does not stop sibling
// listeners on the same node, so on mobile one Escape closed BOTH the Mix sheet
// and the instrument-settings sheet nested inside it. A single shared listener
// + a stack fixes that at the root: only stack-top closes.
const overlayStack: OverlayEntry[] = [];
let stackKeyListenerAttached = false;

function handleStackKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || overlayStack.length === 0) {
        return;
    }
    // stopPropagation matches the pre-#1129 behavior (keeps app-level Escape
    // handlers like GlobalShortcuts from also firing while an overlay is up).
    e.stopPropagation();
    overlayStack[overlayStack.length - 1].onClose();
}

function pushOverlay(entry: OverlayEntry): void {
    overlayStack.push(entry);
    if (!stackKeyListenerAttached) {
        document.addEventListener('keydown', handleStackKeydown);
        stackKeyListenerAttached = true;
    }
}

function popOverlay(entry: OverlayEntry): void {
    const i = overlayStack.indexOf(entry);
    if (i !== -1) {
        overlayStack.splice(i, 1);
    }
    if (overlayStack.length === 0 && stackKeyListenerAttached) {
        document.removeEventListener('keydown', handleStackKeydown);
        stackKeyListenerAttached = false;
    }
}

interface ModalA11yOptions {
    /**
     * `true` (default) — a true modal: sets `role="dialog"` + `aria-modal="true"`
     * and installs a Tab/Shift-Tab focus trap. `false` — a non-modal anchored
     * popover: keeps Escape (via the shared stack) + focus-on-open +
     * focus-restore, but drops `aria-modal` (which lies to AT that the rest of the
     * page is inert while the chart stays interactive), the Tab trap (which fights
     * a light-dismiss popover's own blur/pointer dismissal), and the forced
     * `role="dialog"` (the popover declares its own role if it wants one).
     */
    modal?: boolean;
}

/**
 * Wires Escape-to-close (routed through a shared overlay stack so only the
 * topmost open surface closes), focus-on-open, and focus-restoration-on-close
 * onto an overlay container. In modal mode (the default) it also sets
 * `role="dialog"` + `aria-modal="true"` and traps Tab focus. No-op when `isOpen`
 * is false.
 */
export function useModalA11y(
    ref: RefObject<HTMLElement>,
    isOpen: boolean,
    onClose: () => void,
    ariaLabel?: string,
    options?: ModalA11yOptions,
): void {
    const modal = options?.modal ?? true;

    // Hold onClose in a ref so the focus/trap effect can run *once per open*
    // (deps below) rather than on every render. Consumers pass an inline
    // closure for onClose, so depending on it directly re-ran this effect on
    // each re-render — which re-focused the modal's first element and scrolled
    // the panel back to the top whenever its contents updated (e.g. a stepper).
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!isOpen || !ref.current) {
            return;
        }
        const el = ref.current;
        const opener = document.activeElement as HTMLElement | null;

        if (modal) {
            el.setAttribute('role', 'dialog');
            // aria-modal is set only for true modals: concurrent modals do not
            // co-occur in this app (one modal slot), and the only real nesting —
            // the mobile Mix sheet + instrument-settings sheet — is non-modal, so
            // "only the topmost owns aria-modal" holds without extra bookkeeping.
            el.setAttribute('aria-modal', 'true');
        }
        if (ariaLabel) {
            el.setAttribute('aria-label', ariaLabel);
        }

        // Register in the shared stack; Escape is handled centrally (topmost-only).
        const entry: OverlayEntry = { onClose: () => onCloseRef.current() };
        pushOverlay(entry);

        // Modal-only Tab focus trap. Non-modal popovers rely on their own
        // blur/pointer dismissal instead of trapping the whole page.
        const handleTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') {
                return;
            }
            const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
                (n) => n.offsetParent !== null || n === document.activeElement,
            );
            if (nodes.length === 0) {
                return;
            }
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };
        if (modal) {
            document.addEventListener('keydown', handleTab);
        }

        // Focus into the overlay on open (both modes — this is what makes a
        // portaled popover keyboard-reachable), restore to the opener on close.
        const focusable = el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        const focusTimer = focusable ? setTimeout(() => focusable.focus(), 50) : undefined;

        return () => {
            if (focusTimer) {
                clearTimeout(focusTimer);
            }
            popOverlay(entry);
            if (modal) {
                document.removeEventListener('keydown', handleTab);
                el.removeAttribute('aria-modal');
            }
            if (opener && typeof opener.focus === 'function') {
                opener.focus();
            }
        };
    }, [isOpen, ref, ariaLabel, modal]);
}
