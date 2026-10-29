'use client';

import type { ScoreSection, SemanticScore } from '@core/songbook/score-types';
import { type RefObject, useEffect, useEffectEvent, useRef } from 'react';
import type { SectionChange } from '../lib/documents';
import './bar-menu.css';
// The phone sheet's slide and backdrop are `<Menu>`'s (#1755), the one copy of that motion.
import './menu.css';
import { type SectionField, SectionNameFields, SectionSelects } from './section-settings';
import { useAnchoredPlacement } from './use-anchored-placement';

interface SectionMenuProps {
    score: SemanticScore;
    section: ScoreSection;
    busy: boolean;
    /** At phone width the menu is a sheet from the screen's foot, as the bar menu is (#1724). */
    sheet: boolean;
    /** The section letter the menu opened from, which it sits under on a laptop. */
    anchor: () => Element | null;
    /** Where the menu publishes its own `close`, for the letter's toggle. */
    closer: RefObject<((refocus: boolean) => void) | null>;
    /** Each action takes what a field still holds uncommitted (`pending`) with it. */
    onStartHere: (pending: SectionChange[]) => void;
    onChange: (changes: SectionChange[]) => void;
    onAddAfter: (pending: SectionChange[]) => void;
    onDelete: (pending: SectionChange[]) => void;
    /** The menu closes; `refocus` puts focus back on the section letter (Esc, Close). */
    onClose: (refocus: boolean) => void;
}

/**
 * The section letter's menu while editing a measure chart (#1726): what the edit panel's Section
 * settings, ＋ Section and − Section were — the section's name, how many times it plays, its own
 * key, mode, meter or beat grouping — beside "Start here", which the letter offers outside Edit
 * too. A popover under the letter on a laptop, a sheet on a phone, built as the bar menu is.
 *
 * Its fields commit as they always have (a text field on blur or Enter, a select on change), so
 * a press outside, Esc or the letter first lets the focused field go — its typing is committed,
 * never lost — and only then closes. An action in the menu takes a field's uncommitted typing
 * with it, as one change: on WebKit a press does not take focus, so the field is still focused
 * when the action runs, and its own commit then would turn the action away (#1726 review).
 *
 * Calm by default (#1758): Start here and the section actions are single rows, the settings are
 * two folded groups (name and plays; key, mode or meter), and Delete section is last, after a
 * divider. On a phone it slides up over a light backdrop, its Close in the heading row.
 */
export function SectionMenu({
    score,
    section,
    busy,
    sheet,
    anchor,
    closer,
    onStartHere,
    onChange,
    onAddAfter,
    onDelete,
    onClose,
}: SectionMenuProps) {
    const node = useRef<HTMLDivElement | null>(null);
    const closed = useRef(false);
    // What the name and plays fields hold uncommitted, and whether an action has taken it.
    const pending = useRef(new Map<SectionField, SectionChange>());
    const taken = useRef(false);
    /** The fields' uncommitted typing, for an action to carry; their own commits are now off. */
    function take(): SectionChange[] {
        taken.current = true;
        const changes = [...pending.current.values()];
        pending.current.clear();
        return changes;
    }
    // Where focus was in the menu, to put it back when a change's busy moment took it away.
    const lastFocus = useRef<HTMLElement | null>(null);
    // Read through a ref, so the listeners below are added once per opening.
    const latest = useRef({ onClose, anchor });
    latest.current = { onClose, anchor };

    function close(refocus: boolean) {
        if (closed.current) {
            return;
        }
        closed.current = true;
        // A field still focused commits on its blur (`CommitField`) before the menu goes.
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && node.current?.contains(focused)) {
            focused.blur();
        }
        latest.current.onClose(refocus);
    }
    // The latest render's `close`, for the outside-press listener added once below.
    const onOutsidePress = useEffectEvent(() => close(false));
    closer.current = close;
    useEffect(
        () => () => {
            closer.current = null;
        },
        [closer],
    );
    // A select is disabled while its change is made, which drops focus to the page — and Esc
    // with it. Back where it was (or on the menu) once the change is done (#1726 review).
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

    useEffect(() => {
        node.current
            ?.querySelector<HTMLElement>('button:not(.bar-menu-back), input, select, summary')
            ?.focus({ preventScroll: true });
        function outside(event: PointerEvent) {
            const target = event.target instanceof Element ? event.target : null;
            // The letter's own press toggles the menu (its click), so it is not "outside". Another
            // section's letter is: this menu closes (its field committed) and that one opens.
            const letter = latest.current.anchor();
            if (node.current?.contains(target) || letter?.contains(target)) {
                return;
            }
            onOutsidePress();
        }
        document.addEventListener('pointerdown', outside, true);
        return () => document.removeEventListener('pointerdown', outside, true);
    }, []);

    // Under the letter on a laptop, the shared anchored placement (#1755): followed through a
    // scroll, as the bar menu follows its bar, and closed once the letter has scrolled away.
    useAnchoredPlacement(node, anchor, {
        enabled: !sheet,
        align: 'start',
        onGone: () => close(false),
    });

    return (
        <>
            {/* The light backdrop of `<Menu>`'s sheet, drawn only: a press goes through it, so a
                press on another letter opens that section's menu (the outside press above). */}
            {sheet && <div className="menu-backdrop bar-menu-backdrop" aria-hidden="true" />}
            <div
                ref={node}
                className={`bar-menu section-edit-menu${sheet ? ' bar-menu-sheet' : ' popover'}`}
                role="dialog"
                aria-label={`Section ${section.label} menu`}
                tabIndex={-1}
                onFocus={(event) => {
                    lastFocus.current = event.target;
                }}
                onKeyDown={(event) => {
                    // The chart's keys (Space playing, an arrow browsing) are not the menu's.
                    event.stopPropagation();
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        close(true);
                    }
                }}
                onBlur={(event) => {
                    // Tabbing out of the menu leaves it; focus going nowhere (a control disabled
                    // while the change is made, the window losing focus) does not.
                    // Focus moving to this menu's own letter is its press, which toggles the menu
                    // shut itself (the letter's click).
                    const to = event.relatedTarget;
                    if (
                        to instanceof Element &&
                        !event.currentTarget.contains(to) &&
                        !latest.current.anchor()?.contains(to)
                    ) {
                        close(false);
                    }
                }}
            >
                <div className="bar-menu-top">
                    <p className="bar-menu-heading">Section {section.label}</p>
                    {sheet && (
                        <button type="button" className="bar-menu-back" onClick={() => close(true)}>
                            Close
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    className="bar-menu-item"
                    aria-disabled={busy || undefined}
                    onClick={() => {
                        if (!busy) {
                            const changes = take();
                            close(true);
                            onStartHere(changes);
                        }
                    }}
                >
                    Start here
                </button>
                <hr />
                <details className="bar-menu-details section-menu-names">
                    <summary className="bar-menu-item">
                        Name and plays
                        <span>
                            {section.repeat === 1 ? 'Plays once' : `Plays ${section.repeat}×`}
                        </span>
                    </summary>
                    <div className="bar-menu-fields">
                        <SectionNameFields
                            score={score}
                            section={section}
                            disabled={busy}
                            onChange={(change) => {
                                if (!taken.current) {
                                    onChange([change]);
                                }
                            }}
                            onPending={(field, change) => {
                                if (change) {
                                    pending.current.set(field, change);
                                } else {
                                    pending.current.delete(field);
                                }
                            }}
                        />
                    </div>
                </details>
                <details className="bar-menu-details section-menu-context">
                    <summary className="bar-menu-item">
                        Key, mode or meter
                        <span>
                            {section.key === undefined &&
                            section.isMinor === undefined &&
                            section.meter === undefined &&
                            section.grouping === undefined
                                ? 'Song’s'
                                : 'Its own'}
                        </span>
                    </summary>
                    <div className="bar-menu-fields">
                        <SectionSelects
                            score={score}
                            section={section}
                            disabled={busy}
                            onChange={(change) => onChange([change])}
                        />
                    </div>
                    <p className="bar-menu-caption">
                        A bar with its own key or meter keeps it. Changing the section's meter
                        re-fits bars of equal lengths and resets its beat grouping; chord names are
                        not transposed.
                    </p>
                </details>
                <button
                    type="button"
                    className="bar-menu-item"
                    aria-disabled={busy || undefined}
                    onClick={() => {
                        if (!busy) {
                            const changes = take();
                            close(false);
                            onAddAfter(changes);
                        }
                    }}
                >
                    Add section after
                </button>
                <hr />
                <button
                    type="button"
                    className="bar-menu-item bar-menu-danger"
                    aria-disabled={busy || undefined}
                    onClick={() => {
                        if (!busy) {
                            const changes = take();
                            close(true);
                            onDelete(changes);
                        }
                    }}
                >
                    Delete section
                </button>
            </div>
        </>
    );
}
