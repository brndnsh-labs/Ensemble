import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';

const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Wires `role="dialog"` + `aria-modal`, Escape-to-close, focus-on-open,
 * focus-restoration-on-close, and a Tab/Shift-Tab focus trap onto a modal
 * container. No-op when `isOpen` is false.
 */
export function useModalA11y(
    ref: RefObject<HTMLElement>,
    isOpen: boolean,
    onClose: () => void,
    ariaLabel?: string,
): void {
    useEffect(() => {
        if (!isOpen || !ref.current) {
            return;
        }
        const el = ref.current;
        const opener = document.activeElement as HTMLElement | null;

        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        if (ariaLabel) {
            el.setAttribute('aria-label', ariaLabel);
        }

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
                return;
            }
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
        document.addEventListener('keydown', handleKey);

        const focusable = el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable) {
            const t = setTimeout(() => focusable.focus(), 50);
            return () => {
                clearTimeout(t);
                document.removeEventListener('keydown', handleKey);
                if (opener && typeof opener.focus === 'function') {
                    opener.focus();
                }
            };
        }

        return () => {
            document.removeEventListener('keydown', handleKey);
            if (opener && typeof opener.focus === 'function') {
                opener.focus();
            }
        };
    }, [isOpen, ref, onClose, ariaLabel]);
}
