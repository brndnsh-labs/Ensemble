'use client';

import type { resolveScoreContext } from '@engine/songbook/score-context';
import { parseChordBar } from '@engine/songbook/score-text';
import {
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    type Ref,
    useEffect,
    useId,
    useRef,
} from 'react';
import { BarContextFields } from './bar-context-fields';
import './bar-menu.css';
import {
    countsLabel,
    movedSplit,
    type Ruler,
    readRuler,
    rulerText,
    snapSplit,
    splitAt,
    splitRange,
    stepSplit,
} from './bar-ruler';
import { FormControls } from './form-controls';
import { useAnchoredPlacement } from './use-anchored-placement';
import type { BarDraft } from './use-bar-drafts';

type EffectiveContext = ReturnType<typeof resolveScoreContext>;

/** What the bar menu shows of one bar (#1725): its draft, and the context it reads in. */
export interface BarMenuBar {
    draft: BarDraft;
    inherited: EffectiveContext;
    effective: EffectiveContext;
    /** The section's only bar: deleting it deletes the section, and the item says so. */
    wholeSection: boolean;
}

interface BarMenuProps {
    /** The bar's number on the chart, for "Bar N". */
    bar: number;
    view: BarMenuBar;
    busy: boolean;
    /** At phone width the menu is a sheet from the screen's foot, over the bar dock (#1724). */
    sheet: boolean;
    /** The bar the menu belongs to, which it opens beside on a laptop. */
    anchor: () => Element | null;
    menuRef: Ref<HTMLDivElement>;
    onDraft: (next: BarDraft) => void;
    /** Esc, or "Back to typing": the menu closes and the bar's field has focus again. */
    onClose: () => void;
    /** A press outside the menu on `target`, or focus moving to it (`byFocus`): the menu
     * closes, and the chart decides from `target` whether that is leaving the bar. */
    onDismiss: (target: Element | null, byFocus: boolean) => void;
    onRepeats: () => void;
    onInsertAfter: () => void;
    onDelete: () => void;
}

function unitWord(meter: string, halves: number): string {
    const beats = meter.endsWith('/4');
    return halves === 2 ? (beats ? 'beat' : 'count') : beats ? 'beats' : 'counts';
}

/**
 * A bar's chords as spans of its counts (#1725), with a slider on each split between two chords:
 * drag it (a mouse or a finger), or the arrow keys, and the two chords trade length — a whole
 * count at a time, half a count with Shift. It writes the bar's text in the form `parseChordBar`
 * reads (`rulerText`), so it is typing by other means: the field and the ruler are one draft.
 */
function BarRuler({
    text,
    meter,
    fermata,
    busy,
    onText,
}: {
    text: string;
    meter: string;
    /** "Hold last chord" is on: the holds that end the bar keep a span of their own. */
    fermata: boolean;
    busy: boolean;
    onText: (text: string) => void;
}) {
    const track = useRef<HTMLDivElement>(null);
    const dragging = useRef<number | null>(null);
    const ruler = readRuler(text, meter, fermata);
    if (!ruler) {
        // Chords that read but share the bar more finely than the ruler draws (C D E in 4/4)
        // are still typed; anything else is mid-edit.
        return (
            <p className="bar-menu-caption">
                {parseChordBar(text, meter).kind === 'ok' ? (
                    <>
                        These lengths are finer than half a {unitWord(meter, 2)}: type them, like{' '}
                        <code>C:2 D:1 E:1</code>
                    </>
                ) : (
                    'Type chords that fill the bar, and their lengths show here.'
                )}
            </p>
        );
    }
    function move(current: Ruler, index: number, at: number) {
        if (!busy && at !== splitAt(current, index)) {
            onText(rulerText(movedSplit(current, index, at)));
        }
    }
    function pointerAt(event: ReactPointerEvent, current: Ruler, index: number) {
        const box = track.current?.getBoundingClientRect();
        if (!box || box.width === 0) {
            return;
        }
        const raw = ((event.clientX - box.left) / box.width) * current.total;
        move(current, index, snapSplit(current, index, raw, event.shiftKey));
    }
    function onKey(event: ReactKeyboardEvent, current: Ruler, index: number) {
        const moves: Record<string, -1 | 1 | 'start' | 'end'> = {
            ArrowLeft: -1,
            ArrowDown: -1,
            ArrowRight: 1,
            ArrowUp: 1,
            Home: 'start',
            End: 'end',
        };
        const step = moves[event.key];
        if (step === undefined) {
            return;
        }
        event.preventDefault();
        move(current, index, stepSplit(current, index, step, event.shiftKey));
    }
    const word = (halves: number) => `${countsLabel(halves)} ${unitWord(meter, halves)}`;
    return (
        <>
            <div
                className="bar-ruler"
                ref={track}
                style={{ '--counts': ruler.counts } as CSSProperties}
            >
                {ruler.spans.map((span, index) => (
                    <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: a span is its place in the bar; it holds no state of its own.
                        key={index}
                        className="bar-ruler-span"
                        style={{ flexGrow: span.halves }}
                    >
                        <span className="bar-ruler-chord">{span.text}</span>
                        <small>{countsLabel(span.halves)}</small>
                    </div>
                ))}
                {ruler.spans.slice(1).map((after, at) => {
                    const before = ruler.spans[at];
                    const { min, max } = splitRange(ruler, at);
                    const place = splitAt(ruler, at);
                    return (
                        <div
                            // biome-ignore lint/suspicious/noArrayIndexKey: a split is its place in the bar; a drag follows the index, not a chord.
                            key={at}
                            role="slider"
                            tabIndex={0}
                            className="bar-ruler-split"
                            style={{ left: `${(place / ruler.total) * 100}%` }}
                            aria-label={`Split between ${before.text} and ${after.text}`}
                            aria-valuemin={min / 2}
                            aria-valuemax={max / 2}
                            aria-valuenow={place / 2}
                            aria-valuetext={`${before.text} ${word(before.halves)}, ${after.text} ${word(after.halves)}`}
                            aria-disabled={busy || undefined}
                            onPointerDown={(event) => {
                                if (busy || event.button !== 0) {
                                    return;
                                }
                                // Captured, so the drag keeps this split wherever the pointer
                                // goes; its focus is the slider's, for the arrow keys after.
                                event.preventDefault();
                                event.currentTarget.setPointerCapture(event.pointerId);
                                event.currentTarget.focus();
                                dragging.current = at;
                            }}
                            onPointerMove={(event) => {
                                if (dragging.current === at) {
                                    pointerAt(event, ruler, at);
                                }
                            }}
                            onPointerUp={() => {
                                dragging.current = null;
                            }}
                            onPointerCancel={() => {
                                dragging.current = null;
                            }}
                            onKeyDown={(event) => onKey(event, ruler, at)}
                        />
                    );
                })}
            </div>
            <p className="bar-menu-caption">
                {ruler.spans.length > 1 ? (
                    <>
                        Drag a split, or type <code>Gm7 / / C7</code>
                    </>
                ) : (
                    'Type a second chord to split the bar.'
                )}
            </p>
        </>
    );
}

/**
 * The bar menu (#1725): a bar's structure, on the bar being typed rather than in a panel — chord
 * lengths, key or meter from here, repeats and endings (the guide, and the per-bar markers under
 * Advanced), the fermata, and adding or removing a bar. Everything in it edits the bar's draft as
 * typing does (unsaved; applied on leaving the bar, kept by Save), except the bar actions, which
 * commit pending bars first as every chart edit does. A popover beside the bar on a laptop, a sheet
 * on a phone.
 */
export function BarMenu({
    bar,
    view,
    busy,
    sheet,
    anchor,
    menuRef,
    onDraft,
    onClose,
    onDismiss,
    onRepeats,
    onInsertAfter,
    onDelete,
}: BarMenuProps) {
    const node = useRef<HTMLDivElement | null>(null);
    const dismissed = useRef(false);
    const id = useId();
    const { draft, inherited, effective } = view;

    // Focus into the menu once per opening, so the keyboard reaches its controls and Esc is ours.
    useEffect(() => {
        node.current
            ?.querySelector<HTMLElement>('[role="slider"], button, select, input, summary')
            ?.focus({ preventScroll: true });
    }, []);

    // Read through refs, so the listeners below are added once per opening, not on every render
    // (a drag renders on each step).
    const latest = useRef({ onDismiss });
    latest.current = { onDismiss };

    // A press anywhere outside closes it — the trigger's own press excepted, which toggles it.
    useEffect(() => {
        function outside(event: PointerEvent) {
            const target = event.target instanceof Element ? event.target : null;
            if (node.current?.contains(target) || target?.closest('[data-bar-menu-trigger]')) {
                return;
            }
            if (!dismissed.current) {
                dismissed.current = true;
                latest.current.onDismiss(target, false);
            }
        }
        document.addEventListener('pointerdown', outside, true);
        return () => document.removeEventListener('pointerdown', outside, true);
    }, []);

    // Beside the bar on a laptop: under it and aligned to its right edge (where ⋯ sits), the
    // shared anchored placement (#1755) — followed through a scroll, and placed again as
    // "Key or meter from here" grows it.
    useAnchoredPlacement(node, anchor, { enabled: !sheet, align: 'end' });

    function dismiss(target: Element | null, byFocus: boolean) {
        if (!dismissed.current) {
            dismissed.current = true;
            latest.current.onDismiss(target, byFocus);
        }
    }
    function setRefs(element: HTMLDivElement | null) {
        node.current = element;
        if (typeof menuRef === 'function') {
            menuRef(element);
        } else if (menuRef) {
            menuRef.current = element;
        }
    }
    const meter = effective.meter;
    return (
        <div
            ref={setRefs}
            className={`bar-menu${sheet ? ' bar-menu-sheet' : ' popover'}`}
            role="dialog"
            aria-label={`Bar ${bar} menu`}
            data-bar-menu=""
            onKeyDown={(event) => {
                // The chart's keys (an arrow browsing away from Following, Space playing) are
                // not the menu's controls'.
                event.stopPropagation();
                if (event.key === 'Escape') {
                    event.preventDefault();
                    onClose();
                }
            }}
            onBlur={(event) => {
                // Tabbing out of the menu leaves it; focus going nowhere (the window losing it,
                // a control unmounting) does not.
                const to = event.relatedTarget;
                if (to instanceof Element && !event.currentTarget.contains(to)) {
                    dismiss(to, true);
                }
            }}
            // A swipe on the ruler is the ruler's, not the chart's (`.chart-scroll` takes a touch
            // move as browsing away from Following).
            onTouchMove={(event) => event.stopPropagation()}
        >
            <p className="bar-menu-heading">Bar {bar}</p>
            <section className="bar-menu-group" aria-labelledby={`${id}-lengths`}>
                <p className="bar-menu-heading" id={`${id}-lengths`}>
                    Chord lengths
                </p>
                <BarRuler
                    text={draft.text}
                    fermata={draft.fermata}
                    meter={meter}
                    busy={busy}
                    onText={(text) => onDraft({ ...draft, text })}
                />
            </section>
            <hr />
            <details className="bar-menu-details">
                <summary className="bar-menu-item">
                    Key or meter from here
                    <span>
                        {effective.key}
                        {effective.isMinor ? 'm' : ''} · {meter}
                    </span>
                </summary>
                <BarContextFields
                    className="bar-menu-fields"
                    context={draft.context}
                    inherited={inherited}
                    meter={meter}
                    disabled={busy}
                    onChange={(context) => onDraft({ ...draft, context })}
                />
                <p className="bar-menu-caption">
                    From this bar to the end of its section. Chord names are not transposed.
                </p>
            </details>
            <button
                type="button"
                className="bar-menu-item"
                aria-disabled={busy || undefined}
                onClick={() => !busy && onRepeats()}
            >
                Repeat or ending… <span aria-hidden="true">›</span>
            </button>
            {/* The low-level markers for a form the guide cannot edit (#1726, from the old edit
                panel): a draft change like the rest of the menu. */}
            <div className="bar-menu-advanced">
                {draft.form ? (
                    <FormControls
                        value={draft.form}
                        disabled={busy}
                        onChange={(form) => onDraft({ ...draft, form })}
                    />
                ) : (
                    <p className="bar-menu-caption">
                        This bar has repeat boundaries these controls cannot edit. Its notation is
                        preserved.
                    </p>
                )}
            </div>
            {/* The band holds a fermata's chord through a stretched span with the drums
                crashing (docs/design/band-engine.md). */}
            <label className="bar-menu-item bar-menu-toggle">
                Hold last chord
                <input
                    type="checkbox"
                    checked={draft.fermata}
                    disabled={busy}
                    onChange={(event) => onDraft({ ...draft, fermata: event.target.checked })}
                />
            </label>
            <hr />
            <button
                type="button"
                className="bar-menu-item"
                aria-disabled={busy || undefined}
                onClick={() => !busy && onInsertAfter()}
            >
                Insert bar after
            </button>
            <button
                type="button"
                className="bar-menu-item bar-menu-danger"
                aria-disabled={busy || undefined}
                onClick={() => !busy && onDelete()}
            >
                {view.wholeSection ? 'Delete section' : 'Delete bar'}
            </button>
            {sheet && (
                <>
                    <hr />
                    <button type="button" className="bar-menu-item bar-menu-back" onClick={onClose}>
                        Back to typing
                    </button>
                </>
            )}
        </div>
    );
}
