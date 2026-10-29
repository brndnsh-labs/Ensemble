'use client';

import {
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
    useEffect,
    useId,
    useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { usePhoneWidth } from './bar-dock';
import './menu.css';
import { focusAnchor, useAnchoredDismiss } from './use-anchored-dismiss';
import { useAnchoredPlacement } from './use-anchored-placement';

/** One row of a `<Menu>` (#1755). */
export interface MenuItem {
    /** Stable within the menu: the row's React key. */
    id: string;
    label: ReactNode;
    /** Muted text at the row's end ("already in it", a current value). */
    hint?: ReactNode;
    /** Runs once the menu has handed focus back to its trigger. The caller closes the menu. */
    onSelect: () => void;
    /** A destructive action: always drawn last, after a divider, in the danger colour. */
    danger?: boolean;
    /** Set for a choice among several (`menuitemradio`): whether this one is the current one. */
    checked?: boolean;
    /** Seen and focusable but not chosen (`aria-disabled`, never `disabled`: see `Menu`). */
    disabled?: boolean;
    testId?: string;
}

interface MenuProps {
    /** The menu's accessible name. */
    label: string;
    /** The sheet's visible heading on a phone, where the menu is away from its trigger. */
    title?: string;
    /** The button the menu opened from. It is placed at it, and focus goes back to it. */
    anchor: () => Element | null;
    /** Which of the trigger's edges the menu lines up with. */
    align?: 'start' | 'end';
    items: readonly MenuItem[];
    /** One quiet line above the items, read as the menu's description. */
    note?: ReactNode;
    /**
     * A block of facts above the items that is not a line of text (the Song menu's sync status,
     * #1756). Shown, never read as the menu's name or description, and never focused.
     */
    header?: ReactNode;
    className?: string;
    /** Esc, a press outside, Tab, or the trigger scrolling away: the menu should close. */
    onClose: () => void;
}

/**
 * The anchored menu (#1755): a short list of actions at the button that opened it, instead of
 * a modal. On a laptop a compact list under (or over) the trigger, placed by
 * `useAnchoredPlacement`; below 760px a sheet that slides up from the screen's foot over a light
 * backdrop, because a list at a fingertip-sized button is a hard target on a phone.
 *
 * The caller mounts it to open it and unmounts it to close it; `onClose` asks for that. Focus
 * moves to the checked item (else the first) as it opens, and back to the trigger whenever it
 * closes — Esc, a choice, a press outside, Tab (which then goes on from the trigger). The arrow
 * keys, Home and End move between items. The trigger's `aria-expanded` is the menu's to keep, so
 * a list of a thousand rows needs no per-row state for it; give the trigger `aria-haspopup`.
 *
 * Rendered into `document.body`, so no ancestor's `transform`, `overflow` or stacking context
 * can trap a `position: fixed` list. React events still bubble through the tree that holds it,
 * so its keys are stopped here: the chart reads an arrow as browsing and Space as play.
 *
 * WebKit rules (web/CLAUDE.md): no `pointerdown` handler on the items (WebKit then
 * drops the tap's click) and `aria-disabled` rather than `disabled` (a press on a disabled button
 * drops focus). The outside press is a document listener that never cancels the press, and the
 * phone's backdrop closes on its own `click` — closing on the way down would remove it and hand
 * the tap's click to whatever lay underneath.
 */
export function Menu({
    label,
    title,
    anchor,
    align = 'start',
    items,
    note,
    header,
    className,
    onClose,
}: MenuProps) {
    const sheet = usePhoneWidth();
    const node = useRef<HTMLDivElement | null>(null);
    const backdrop = useRef<HTMLDivElement | null>(null);
    const noteId = useId();
    const closed = useRef(false);
    // Read through a ref, so a close reached from a listener calls this render's `onClose`.
    const latest = useRef({ anchor, onClose });
    latest.current = { anchor, onClose };

    function close(refocus: boolean) {
        if (closed.current) {
            return;
        }
        closed.current = true;
        if (refocus) {
            focusAnchor(latest.current.anchor);
        }
        latest.current.onClose();
    }

    // Both hooks call the latest render's `close` from their effects and listeners.
    useAnchoredPlacement(node, anchor, {
        enabled: !sheet,
        align,
        onGone: () => close(false),
    });

    // Its trigger's `aria-expanded`, a press outside and Esc anywhere: shared with the Key popover.
    useAnchoredDismiss([node, backdrop], anchor, close);

    useEffect(() => {
        const rows = Array.from(
            node.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
        );
        (rows.find((row) => row.getAttribute('aria-checked') === 'true') ?? rows[0])?.focus({
            preventScroll: true,
        });
    }, []);

    function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
        // The page's keys (Space playing, an arrow browsing the chart) are not the menu's.
        event.stopPropagation();
        const rows = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
        );
        const at = rows.indexOf(document.activeElement as HTMLElement);
        const moves: Record<string, number> = {
            ArrowDown: at + 1,
            ArrowUp: at < 0 ? rows.length - 1 : at - 1,
            Home: 0,
            End: rows.length - 1,
        };
        if (event.key === 'Escape') {
            event.preventDefault();
            close(true);
        } else if (event.key === 'Tab') {
            // Focus goes back to the trigger and the Tab carries on from it.
            close(true);
        } else if (Object.hasOwn(moves, event.key)) {
            event.preventDefault();
            rows[(moves[event.key] + rows.length) % rows.length]?.focus();
        }
    }

    const plain = items.filter((item) => !item.danger);
    const danger = items.filter((item) => item.danger);
    function row(item: MenuItem) {
        const radio = item.checked !== undefined;
        return (
            <button
                key={item.id}
                type="button"
                role={radio ? 'menuitemradio' : 'menuitem'}
                aria-checked={radio ? item.checked : undefined}
                aria-disabled={item.disabled || undefined}
                tabIndex={-1}
                className={`menu-item${item.danger ? ' menu-danger' : ''}`}
                data-testid={item.testId}
                onClick={() => {
                    if (item.disabled || closed.current) {
                        return;
                    }
                    closed.current = true;
                    focusAnchor(latest.current.anchor);
                    item.onSelect();
                }}
            >
                <span>{item.label}</span>
                {item.hint && <span className="menu-hint">{item.hint}</span>}
            </button>
        );
    }
    return createPortal(
        <>
            {sheet && (
                <div
                    ref={backdrop}
                    className="menu-backdrop"
                    aria-hidden="true"
                    onClick={() => close(true)}
                />
            )}
            {/* The box holds the heading and note; only the rows and their divider are the
                `role=menu`, which may hold nothing else. */}
            <div
                ref={node}
                className={`menu ${sheet ? 'menu-sheet' : 'menu-anchored'}${className ? ` ${className}` : ''}`}
                onKeyDown={onKeyDown}
            >
                {sheet && title && (
                    <p className="menu-title" aria-hidden="true">
                        {title}
                    </p>
                )}
                {header && <div className="menu-header">{header}</div>}
                {note && (
                    <p className="menu-note" id={noteId}>
                        {note}
                    </p>
                )}
                <div
                    className="menu-list"
                    role="menu"
                    aria-label={label}
                    aria-describedby={note ? noteId : undefined}
                >
                    {plain.map(row)}
                    {plain.length > 0 && danger.length > 0 && (
                        <div role="separator" className="menu-divider" />
                    )}
                    {danger.map(row)}
                </div>
            </div>
        </>,
        document.body,
    );
}
