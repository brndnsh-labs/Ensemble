'use client';

import { KEY_ORDER, TIME_SIGNATURES } from '@core/config';
import type { ChartNotation } from '@core/songbook/types';
import { normalizeKey } from '@core/utils';
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ChartDocument } from '../lib/runtime';
import { usePhoneWidth } from './bar-dock';
import './menu.css';
import { useAnchoredDismiss } from './use-anchored-dismiss';
import { useAnchoredPlacement } from './use-anchored-placement';

const NOTATION_OPTIONS: { value: ChartNotation; label: string }[] = [
    { value: 'roman', label: 'Roman Numerals (I, vi, IV)' },
    { value: 'name', label: 'Chord Names (C, Am, F)' },
    { value: 'nns', label: 'Nashville Numbers (1, 6-, 4)' },
];

/** A key as a musician reads it: `Bb` is B♭. The picker lists flat spellings only. */
function keyLabel(key: string): string {
    return key.replace(/^([A-G])b/, '$1♭').replace(/^([A-G])#/, '$1♯');
}

/** The song's key as the transport shows it: B♭, or B♭m in a minor song. */
export function songKeyLabel(current: ChartDocument): string {
    const { key, isMinor } = current.chart.score;
    return `${keyLabel(normalizeKey(key))}${isMinor ? 'm' : ''}`;
}

/** Frames to wait for the selected bar's number to be enabled again once the change settles. */
const SETTLE_FRAMES = 30;

/**
 * Where focus goes when the shell closes the popover under it: the selected bar's number (a
 * refused change selects the bar to fix) once it is enabled again, else the Key button. Only
 * while focus is still nowhere: a bar field the refusal opened keeps it.
 */
function landFocus(anchor: () => Element | null): void {
    let frames = 0;
    const nowhere = () => !document.activeElement || document.activeElement === document.body;
    function attempt() {
        if (!nowhere()) {
            return;
        }
        const bar = document.querySelector<HTMLButtonElement>('.bar.selected .bar-number');
        if (bar instanceof HTMLButtonElement && !bar.disabled) {
            bar.focus({ preventScroll: true });
            return;
        }
        if (bar && frames < SETTLE_FRAMES) {
            frames += 1;
            requestAnimationFrame(attempt);
            return;
        }
        const trigger = anchor();
        if (trigger instanceof HTMLElement && trigger.isConnected) {
            trigger.focus({ preventScroll: true });
        }
    }
    requestAnimationFrame(attempt);
}

interface KeyPopoverProps {
    current: ChartDocument;
    busy: boolean;
    /** The transport's Key button, which the popover sits under and hands focus back to. */
    anchor: () => Element | null;
    onKey: (key: string) => void;
    /** The song's own major/minor (`score.isMinor`). Measure charts only. */
    onMode: (isMinor: boolean) => void;
    /** The song's own meter (`score.meter`). Measure charts only. */
    onMeter: (meter: string) => void;
    onNotation: (notation: ChartNotation) => void;
    /** Esc, a press outside, Tab out, Back or the Key button scrolling away. */
    onClose: () => void;
}

/**
 * The transport's Key popover (#1757): the song's Key, Mode, Meter and Chord notation, the one
 * place each is changed. A `role=dialog` (it holds selects, not menu items) placed under the Key
 * button on a laptop by `useAnchoredPlacement`, and at phone width the same sheet from the
 * screen's foot over the same light backdrop as `<Menu>` (`menu.css`). Dismissed as `<Menu>` is
 * (`useAnchoredDismiss`): Esc, a press outside or Back, focus back on the Key button.
 *
 * Each select changes the song live, as the transport's Key select did, committing pending bars
 * first (the shell's `change(…, true)`, `changeSongMeter`). A meter that a bar cannot follow is
 * refused, and the shell closes this onto that bar.
 */
export function KeyPopover({
    current,
    busy,
    anchor,
    onKey,
    onMode,
    onMeter,
    onNotation,
    onClose,
}: KeyPopoverProps) {
    const sheet = usePhoneWidth();
    const node = useRef<HTMLDivElement | null>(null);
    const backdrop = useRef<HTMLDivElement | null>(null);
    const closed = useRef(false);
    // Where focus was in the popover, to put it back when a change's busy moment took it away.
    const lastFocus = useRef<HTMLElement | null>(null);
    const latest = useRef({ anchor, onClose });
    latest.current = { anchor, onClose };

    function close(refocus: boolean) {
        if (closed.current) {
            return;
        }
        closed.current = true;
        if (refocus) {
            const trigger = latest.current.anchor();
            if (trigger instanceof HTMLElement && trigger.isConnected) {
                trigger.focus({ preventScroll: true });
            }
        }
        latest.current.onClose();
    }

    // Both hooks call the latest render's `close` from their effects and listeners.
    useAnchoredDismiss([node, backdrop], anchor, close);
    useAnchoredPlacement(node, anchor, {
        enabled: !sheet,
        align: 'start',
        onGone: () => close(false),
    });

    useEffect(() => {
        node.current?.querySelector<HTMLElement>('select')?.focus({ preventScroll: true });
        // Closed by the shell rather than by itself (a refused meter, a bar that won't apply), the
        // popover takes the focused select with it and focus falls to the page. It goes to the
        // bar the refusal selected, else back to the Key button.
        return () => {
            if (!closed.current) {
                landFocus(latest.current.anchor);
            }
        };
    }, []);
    // A select is disabled while its change is made, which drops focus to the page — and Esc
    // with it. Back where it was once the change is done, as the section menu does.
    useEffect(() => {
        if (busy) {
            return;
        }
        const active = document.activeElement;
        if (active && active !== document.body) {
            return;
        }
        const back = lastFocus.current;
        (back?.isConnected && node.current?.contains(back) ? back : node.current)?.focus({
            preventScroll: true,
        });
    }, [busy]);

    function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
        // The page's keys (Space playing, an arrow browsing the chart) are not the popover's.
        event.stopPropagation();
        if (event.key === 'Escape') {
            event.preventDefault();
            close(true);
            return;
        }
        if (event.key === 'Tab') {
            // Tab moves between the fields; past the last (or before the first) it leaves the
            // popover from the Key button, as a `<Menu>`'s Tab does.
            const fields = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>('select, button'),
            ).filter((field) => !field.hasAttribute('disabled'));
            const at = fields.indexOf(document.activeElement as HTMLElement);
            if (event.shiftKey ? at <= 0 : at === fields.length - 1) {
                close(true);
            }
        }
    }

    const score = current.chart.score;
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
            <div
                ref={node}
                role="dialog"
                aria-label="Key and meter"
                tabIndex={-1}
                className={`menu key-popover ${sheet ? 'menu-sheet' : 'menu-anchored'}`}
                data-testid="key-popover"
                onKeyDown={onKeyDown}
                onFocus={(event) => {
                    lastFocus.current = event.target;
                }}
                onBlur={(event) => {
                    // Focus moving somewhere else on the page (iOS's ‹ › field arrows, a Tab that
                    // skips buttons) leaves it. Focus going nowhere does not: WebKit blurs a field
                    // to null mid-tap, and a select disabled for its change drops focus too. The
                    // Key button's own press toggles it shut (its click).
                    const to = event.relatedTarget;
                    if (
                        to instanceof Node &&
                        !event.currentTarget.contains(to) &&
                        !latest.current.anchor()?.contains(to)
                    ) {
                        close(false);
                    }
                }}
            >
                {sheet && (
                    <p className="menu-title" aria-hidden="true">
                        Key and meter
                    </p>
                )}
                <div className="key-popover-fields">
                    <label htmlFor="song-key">Key</label>
                    <select
                        id="song-key"
                        disabled={busy}
                        value={normalizeKey(score.key)}
                        onChange={(event) => onKey(event.target.value)}
                    >
                        {KEY_ORDER.map((key) => (
                            <option key={key} value={key}>
                                {keyLabel(key)}
                            </option>
                        ))}
                    </select>
                    <label htmlFor="song-mode">Mode</label>
                    <select
                        id="song-mode"
                        disabled={busy}
                        value={score.isMinor ? 'minor' : 'major'}
                        onChange={(event) => onMode(event.target.value === 'minor')}
                    >
                        <option value="major">Major</option>
                        <option value="minor">Minor</option>
                    </select>
                    <label htmlFor="song-meter">Meter</label>
                    <select
                        id="song-meter"
                        disabled={busy}
                        value={score.meter}
                        onChange={(event) => onMeter(event.target.value)}
                    >
                        {[...new Set([...Object.keys(TIME_SIGNATURES), score.meter])].map(
                            (meter) => (
                                <option key={meter}>{meter}</option>
                            ),
                        )}
                    </select>
                    <label htmlFor="song-notation">Chord notation</label>
                    <select
                        id="song-notation"
                        disabled={busy}
                        value={score.notation}
                        onChange={(event) => onNotation(event.target.value as ChartNotation)}
                    >
                        {NOTATION_OPTIONS.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                                {entry.label}
                            </option>
                        ))}
                    </select>
                </div>
                <p className="menu-note">A section or bar with its own mode or meter keeps it.</p>
                {sheet && (
                    <button type="button" className="menu-item" onClick={() => close(true)}>
                        Done
                    </button>
                )}
            </div>
        </>,
        document.body,
    );
}
