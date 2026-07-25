import { forwardRef } from 'preact/compat';
import { useEffect, useImperativeHandle, useRef, useState } from 'preact/hooks';
import { KEY_ORDER, TIME_SIGNATURES } from '../config.js';
import {
    onSectionDelete,
    onSectionDuplicate,
    onSectionUpdate,
} from '../controllers/arranger-controller.js';
import { formatUnicodeSymbols } from '../sanitize.js';
import type { Section } from '../state/arranger.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState, useMediaQuery } from '../ui-bridge.js';
import { SectionHeaderStrip } from './editor/SectionHeaderStrip.jsx';
import { Icon } from './Icon.jsx';
import { SymbolMenu } from './SymbolMenu.jsx';
import { useModalA11y } from './use-modal-a11y.js';

/**
 * Trigger-based autocomplete for chord-quality shorthand. Typing a `:` prefix
 * followed by a keyword and then a separator (space, `|`, `,` or end-of-text)
 * replaces the token in-place. Examples:
 *   `:maj7 ` → `maj7 `
 *   `:halfdim ` → `ø `
 *   `:flat`  → `♭` (when the user hits a separator next)
 * Returns the (possibly updated) value plus the new cursor position, or
 * `cursor: null` when no substitution happened.
 */
const AUTOCOMPLETE_TRIGGERS: Record<string, string> = {
    maj: 'Δ',
    maj7: 'Δ7',
    dim: '°',
    halfdim: 'ø',
    flat: '♭',
    sharp: '♯',
    bar: '|',
    repeat: '|: :|',
};

function applyAutocomplete(value: string, caret: number): { value: string; cursor: number | null } {
    if (caret <= 0) {
        return { value, cursor: null };
    }
    const lastChar = value[caret - 1];
    if (lastChar !== ' ' && lastChar !== '|' && lastChar !== ',') {
        return { value, cursor: null };
    }
    // Look back for a `:keyword` token immediately before the separator.
    const window = value.substring(0, caret - 1);
    const match = window.match(/(?:^|\s):([a-zA-Z0-9]+)$/);
    if (!match) {
        return { value, cursor: null };
    }
    const keyword = match[1].toLowerCase();
    const replacement = AUTOCOMPLETE_TRIGGERS[keyword];
    if (!replacement) {
        return { value, cursor: null };
    }
    const tokenStart = caret - 1 - match[1].length - 1; // -1 for the `:`
    const before = value.substring(0, tokenStart);
    const after = value.substring(caret - 1); // keep the separator
    const next = before + replacement + after;
    return { value: next, cursor: before.length + replacement.length };
}

interface SectionCardProps {
    section: Section;
    index: number;
    totalSections: number;
}

export interface SectionCardHandle {
    scrollIntoView: (options?: ScrollIntoViewOptions) => void;
    focusInput: () => void;
}

export const SectionCard = forwardRef<SectionCardHandle, SectionCardProps>(
    ({ section, index, totalSections }, ref) => {
        const dispatch = useDispatch();
        const [isMenuOpen, setIsMenuOpen] = useState(false);
        const [isFocused, setIsFocused] = useState(false);
        const isTouch = useMediaQuery('(pointer: coarse)');
        const textareaRef = useRef<HTMLTextAreaElement | null>(null);
        const rootRef = useRef<HTMLDivElement | null>(null);
        const menuRef = useRef<HTMLDivElement | null>(null);
        const settingsPanelRef = useRef<HTMLDivElement | null>(null);

        useModalA11y(settingsPanelRef, isMenuOpen, () => setIsMenuOpen(false), 'Section settings', {
            modal: false,
        });

        useEffect(() => {
            if (!isMenuOpen) {
                return;
            }

            const handleClickOutside = (event: MouseEvent) => {
                if (
                    menuRef.current &&
                    event.target instanceof Node &&
                    !menuRef.current.contains(event.target)
                ) {
                    setIsMenuOpen(false);
                }
            };

            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }, [isMenuOpen]);

        useImperativeHandle(ref, () => ({
            scrollIntoView: (options?: ScrollIntoViewOptions) => {
                if (rootRef.current) {
                    rootRef.current.scrollIntoView(options);
                }
            },
            focusInput: () => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                }
            },
        }));

        const { isMinor, mutatedSectionId } = useEnsembleState((s) => ({
            isMinor: s.arranger.isMinor,
            mutatedSectionId: s.arranger.mutatedSectionId,
        }));

        const isMutated = mutatedSectionId === section.id;

        // Drop-position semantics: cursor in the top half of a card → insert
        // before; bottom half → insert after. Computed at dragover time and
        // mirrored as a CSS class so the user sees a horizontal indicator line
        // exactly where the drop will land.
        const positionFromEvent = (e: DragEvent, target: HTMLElement): 'before' | 'after' => {
            const r = target.getBoundingClientRect();
            return e.clientY < r.top + r.height / 2 ? 'before' : 'after';
        };

        const clearDropTargets = () => {
            document
                .querySelectorAll('.section-card')
                .forEach((el) =>
                    el.classList.remove('drag-over', 'drag-over--before', 'drag-over--after'),
                );
        };

        const handleDragStart = (e: DragEvent) => {
            // The drag source is the handle, but the data references the card.
            if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', section.id);
                e.dataTransfer.effectAllowed = 'move';
                // Custom drag image: a small label chip so the user sees the
                // section name floating with the cursor, not the whole card.
                const chip = document.createElement('div');
                chip.textContent = section.label || 'Section';
                chip.className = 'section-drag-chip';
                document.body.appendChild(chip);
                e.dataTransfer.setDragImage(chip, 0, 0);
                // Remove after the browser has snapshotted it.
                setTimeout(() => chip.remove(), 0);
            }
            // Lift state lives on the card root, not the handle.
            rootRef.current?.classList.add('dragging');
        };

        const handleDragEnd = () => {
            rootRef.current?.classList.remove('dragging');
            clearDropTargets();
        };

        const handleDragEnter = (e: DragEvent) => {
            e.preventDefault();
            // DataTransfer.getData is empty during dragenter in most browsers
            // for privacy — use a side channel: skip self-target by id check
            // at drop time. Always show indicator on enter.
            if (e.currentTarget instanceof HTMLElement) {
                e.currentTarget.classList.add('drag-over');
            }
        };

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            if (!(e.currentTarget instanceof HTMLElement)) {
                return;
            }
            const pos = positionFromEvent(e, e.currentTarget);
            e.currentTarget.classList.toggle('drag-over--before', pos === 'before');
            e.currentTarget.classList.toggle('drag-over--after', pos === 'after');
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
        };

        const handleDragLeave = (e: DragEvent) => {
            // Only clear when we've actually left the card (not when entering
            // a child element). relatedTarget being inside the card means
            // we're still over it.
            if (e.currentTarget instanceof HTMLElement) {
                const card = e.currentTarget;
                const next = e.relatedTarget as Node | null;
                if (!next || !card.contains(next)) {
                    card.classList.remove('drag-over', 'drag-over--before', 'drag-over--after');
                }
            }
        };

        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            const targetEl = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
            const position = targetEl ? positionFromEvent(e, targetEl) : 'after';
            clearDropTargets();
            if (e.dataTransfer) {
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId && draggedId !== section.id) {
                    window.dispatchEvent(
                        new CustomEvent('reorder-sections', {
                            detail: { draggedId, targetId: section.id, position },
                        }),
                    );
                }
            }
        };

        const insertSymbol = (sym: string) => {
            const input = textareaRef.current;
            if (!input) {
                return;
            }

            const start = input.selectionStart || 0;
            const end = input.selectionEnd || 0;
            const text = input.value;
            const before = text.substring(0, start);
            const after = text.substring(end);

            const newValue = before + sym + after;
            onSectionUpdate(section.id, 'value', newValue);

            // Restore focus and cursor position after render
            setTimeout(() => {
                if (input) {
                    input.focus();
                    input.selectionStart = input.selectionEnd = start + sym.length;
                }
            }, 0);
        };

        const handleViewTransition = (fn: () => void) => {
            if (!document.startViewTransition) {
                fn();
                return;
            }
            document.startViewTransition(async () => {
                fn();
                // Allow Preact time to render the new state before the transition snapshot
                await new Promise((r) => setTimeout(r, 0));
            });
        };

        const canMoveUp = index > 0;
        const canMoveDown = index < totalSections - 1;

        return (
            <div
                ref={rootRef}
                class={`section-card ${section.seamless ? 'linked' : ''} ${
                    isMenuOpen ? 'menu-active' : ''
                } ${isFocused ? 'is-focused' : ''}`}
                data-id={section.id}
                style={{ viewTransitionName: `editor-card-${section.id}` }}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                <SectionHeaderStrip section={section} />

                <div class="section-title-row">
                    {!isTouch && (
                        <span
                            class="section-drag-handle"
                            draggable={true}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            title="Drag to reorder"
                            // Pointer-only affordance: keyboard/AT users reorder
                            // via the Move Up/Down buttons below, so the handle is
                            // out of the tab order and hidden from assistive tech
                            // (was a focus stop with no operable behavior, #811).
                            aria-hidden="true"
                        >
                            ⋮⋮
                        </span>
                    )}
                    <input
                        class="section-label-input"
                        value={section.label}
                        aria-label="Section Name"
                        maxLength={100}
                        onChange={(e) =>
                            onSectionUpdate(
                                section.id,
                                'label',
                                (e.target as HTMLInputElement).value,
                            )
                        }
                    />
                    {section.seamless && <span class="section-status-chip">Linked</span>}
                    <div class="section-title-actions">
                        <button
                            class="section-move-btn"
                            title="Move Up"
                            aria-label="Move Section Up"
                            onClick={() =>
                                handleViewTransition(() => onSectionUpdate(section.id, 'move', -1))
                            }
                            disabled={!canMoveUp}
                        >
                            ▴
                        </button>
                        <button
                            class="section-move-btn"
                            title="Move Down"
                            aria-label="Move Section Down"
                            onClick={() =>
                                handleViewTransition(() => onSectionUpdate(section.id, 'move', 1))
                            }
                            disabled={!canMoveDown}
                        >
                            ▾
                        </button>
                        <div class="section-kebab-wrap" ref={menuRef}>
                            <button
                                class="section-kebab-btn"
                                aria-label={`Actions for ${section.label || 'Section'}`}
                                aria-expanded={isMenuOpen}
                                aria-haspopup="true"
                                title="Section actions"
                                onClick={(e: MouseEvent) => {
                                    e.stopPropagation();
                                    setIsMenuOpen(!isMenuOpen);
                                }}
                            >
                                ⋮
                            </button>
                            {isMenuOpen && (
                                // role="dialog" self-declared: #1129 made the hook
                                // non-modal (no forced role / aria-modal / trap), so
                                // this dialog-like settings panel owns its own role.
                                <div
                                    class="section-actions-menu"
                                    ref={settingsPanelRef}
                                    role="dialog"
                                >
                                    <div class="section-actions-menu__row">
                                        <span class="section-actions-menu__label">Repeat</span>
                                        <input
                                            type="number"
                                            class="section-repeat-input"
                                            value={section.repeat || 1}
                                            min="1"
                                            max="8"
                                            aria-label="Repeat Count"
                                            onChange={(e) =>
                                                onSectionUpdate(
                                                    section.id,
                                                    'repeat',
                                                    parseInt(
                                                        (e.target as HTMLInputElement).value,
                                                        10,
                                                    ),
                                                )
                                            }
                                        />
                                    </div>
                                    <div class="section-actions-menu__row">
                                        <span class="section-actions-menu__label">Key</span>
                                        <select
                                            class="section-key-select"
                                            value={section.key || ''}
                                            aria-label="Section Key"
                                            onChange={(e) =>
                                                onSectionUpdate(
                                                    section.id,
                                                    'key',
                                                    (e.target as HTMLSelectElement).value,
                                                )
                                            }
                                        >
                                            <option value="">Auto</option>
                                            {/*
                                             * #1174 — the 'm' suffix must reflect THIS section's
                                             * minor override when it has one, not the global chart
                                             * flag. The engine honors `section.isMinor`
                                             * (chords-engine.ts) and share URLs serialize it
                                             * (utils.ts), so a chart arriving via a share link with
                                             * per-section overrides showed the wrong labels here.
                                             */}
                                            {KEY_ORDER.map((k) => (
                                                <option key={k} value={k}>
                                                    {formatUnicodeSymbols(k)}
                                                    {(section.isMinor ?? isMinor) ? 'm' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div class="section-actions-menu__row">
                                        <span class="section-actions-menu__label">Time</span>
                                        <select
                                            class="section-ts-select"
                                            value={section.timeSignature || ''}
                                            aria-label="Time Signature"
                                            onChange={(e) =>
                                                onSectionUpdate(
                                                    section.id,
                                                    'timeSignature',
                                                    (e.target as HTMLSelectElement).value,
                                                )
                                            }
                                        >
                                            <option value="">Auto</option>
                                            {Object.keys(TIME_SIGNATURES).map((ts) => (
                                                <option key={ts} value={ts}>
                                                    {ts}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div class="section-actions-menu__divider" />
                                    <button
                                        class="section-actions-menu__btn"
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            handleViewTransition(() =>
                                                onSectionUpdate(
                                                    section.id,
                                                    'seamless',
                                                    !section.seamless,
                                                ),
                                            );
                                        }}
                                    >
                                        <Icon name="link" />{' '}
                                        {section.seamless ? 'Unlink' : 'Link to previous'}
                                    </button>
                                    <button
                                        class="section-actions-menu__btn"
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            onSectionDuplicate(section.id);
                                        }}
                                    >
                                        <Icon name="duplicate" /> Duplicate
                                    </button>
                                    <button
                                        class="section-actions-menu__btn section-actions-menu__btn--danger"
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            onSectionDelete(section.id);
                                        }}
                                    >
                                        <Icon name="trash" /> Delete
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {isFocused && <SymbolMenu onSelect={insertSymbol} />}

                <textarea
                    ref={textareaRef}
                    class={`section-prog-input ${isMutated ? 'mutated' : ''}`}
                    value={section.value}
                    aria-label="Chord Progression"
                    maxLength={1000}
                    placeholder="Enter chords (e.g. C Am F G)"
                    onInput={(e) => {
                        const ta = e.target as HTMLTextAreaElement;
                        const result = applyAutocomplete(ta.value, ta.selectionStart || 0);
                        onSectionUpdate(section.id, 'value', result.value);
                        if (result.cursor !== null) {
                            const pos = result.cursor;
                            setTimeout(() => {
                                ta.selectionStart = ta.selectionEnd = pos;
                            }, 0);
                        }
                    }}
                    onFocus={() => {
                        setIsFocused(true);
                        dispatch(ACTIONS.SET_PARAM, {
                            module: 'arranger',
                            param: 'lastInteractedSectionId',
                            value: section.id,
                        });
                    }}
                    onBlur={() => setIsFocused(false)}
                />
            </div>
        );
    },
);
