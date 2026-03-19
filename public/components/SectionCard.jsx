import { h } from 'preact';
import React, { forwardRef } from 'preact/compat';
import { useEffect, useImperativeHandle, useRef, useState } from 'preact/hooks';
import { onSectionDelete, onSectionDuplicate, onSectionUpdate } from '../arranger-controller.js';
import { KEY_ORDER, TIME_SIGNATURES } from '../config.js';
import { getState } from '../state.js';
import { useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';
import { SymbolMenu } from './SymbolMenu.jsx';

const { arranger } = getState();

/**
 * @typedef {import('preact').ComponentChildren} ComponentChildren
 */

/**
 * @typedef {Object} SectionCardProps
 * @property {import('../state/arranger.js').Section} section
 * @property {number} index
 * @property {number} totalSections
 * @property {any} [ref]
 * @property {string} [key]
 */
/**
 * @type {import('preact/compat').ForwardFn<SectionCardProps>}
 */
export const SectionCard = forwardRef(
    (/** @type {SectionCardProps} */ { section, index, totalSections }, ref) => {
        const [isMenuOpen, setIsMenuOpen] = useState(false);
        /** @type {import('preact/hooks').MutableRef<HTMLTextAreaElement|null>} */
        const textareaRef = useRef(null);
        /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
        const rootRef = useRef(null);
        /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
        const menuRef = useRef(null);

        useEffect(() => {
            if (!isMenuOpen) {
                return;
            }

            const handleClickOutside = (/** @type {MouseEvent} */ event) => {
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
            scrollIntoView: (/** @type {ScrollIntoViewOptions} */ options) => {
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

        const { isMinor, mutatedSectionId } = useEnsembleState(
            (/** @type {import('../types.js').EnsembleState} */ s) => ({
                isMinor: s.arranger.isMinor,
                mutatedSectionId: s.arranger.mutatedSectionId,
            }),
        );

        const isMutated = mutatedSectionId === section.id;

        const handleDragStart = (/** @type {DragEvent} */ e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', section.id);
            }
            if (e.currentTarget instanceof HTMLElement) {
                e.currentTarget.classList.add('dragging');
            }
        };

        const handleDragEnd = (/** @type {DragEvent} */ e) => {
            if (e.currentTarget instanceof HTMLElement) {
                e.currentTarget.classList.remove('dragging');
            }
            document
                .querySelectorAll('.section-card')
                .forEach((el) => el.classList.remove('drag-over'));
        };

        const handleDragEnter = (/** @type {DragEvent} */ e) => {
            e.preventDefault();
            if (e.dataTransfer) {
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId !== section.id && e.currentTarget instanceof HTMLElement) {
                    e.currentTarget.classList.add('drag-over');
                }
            }
        };

        const handleDragLeave = (/** @type {DragEvent} */ e) => {
            if (e.currentTarget instanceof HTMLElement) {
                e.currentTarget.classList.remove('drag-over');
            }
        };

        const handleDrop = (/** @type {DragEvent} */ e) => {
            e.preventDefault();
            if (e.currentTarget instanceof HTMLElement) {
                e.currentTarget.classList.remove('drag-over');
            }
            if (e.dataTransfer) {
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId && draggedId !== section.id) {
                    const event = new CustomEvent('reorder-sections', {
                        detail: { draggedId, targetId: section.id },
                    });
                    window.dispatchEvent(event);
                }
            }
        };

        const insertSymbol = (/** @type {any} */ sym) => {
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

        const handleViewTransition = (/** @type {any} */ fn) => {
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

        return (
            <div
                ref={rootRef}
                class={`section-card ${section.seamless ? 'linked' : ''} ${isMenuOpen ? 'menu-active' : ''}`}
                data-id={section.id}
                style={{ viewTransitionName: `editor-card-${section.id}` }}
                draggable={true}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
            >
                <div class="section-header">
                    <div class="section-title-row">
                        <input
                            class="section-label-input"
                            value={section.label}
                            aria-label="Section Name"
                            maxLength={100}
                            onChange={(/** @type {any} */ e) =>
                                onSectionUpdate(section.id, 'label', e.target.value)
                            }
                        />
                    </div>

                    <div class="section-controls-row">
                        <div class="section-settings-row">
                            {/* Repeat Control */}
                            <div class="section-setting-item">
                                <span class="setting-label">x</span>
                                <input
                                    type="number"
                                    class="section-repeat-input"
                                    value={section.repeat || 1}
                                    min="1"
                                    max="8"
                                    aria-label="Repeat Count"
                                    onChange={(/** @type {any} */ e) =>
                                        onSectionUpdate(
                                            section.id,
                                            'repeat',
                                            parseInt(e.target.value, 10),
                                        )
                                    }
                                />
                            </div>

                            {/* Key Control */}
                            <select
                                class="section-key-select"
                                value={section.key || ''}
                                aria-label="Section Key"
                                onChange={(/** @type {any} */ e) =>
                                    onSectionUpdate(section.id, 'key', e.target.value)
                                }
                            >
                                <option value="">Key: Auto</option>
                                {KEY_ORDER.map((k) => (
                                    <option key={k} value={k}>
                                        Key: {formatUnicodeSymbols(k)}
                                        {isMinor ? 'm' : ''}
                                    </option>
                                ))}
                            </select>

                            {/* Time Signature Control */}
                            <select
                                class="section-ts-select"
                                value={section.timeSignature || ''}
                                aria-label="Time Signature"
                                onChange={(/** @type {any} */ e) =>
                                    onSectionUpdate(section.id, 'timeSignature', e.target.value)
                                }
                            >
                                <option value="">TS: Auto</option>
                                {Object.keys(TIME_SIGNATURES).map((ts) => (
                                    <option key={ts} value={ts}>
                                        TS: {ts}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div class="section-actions">
                            <button
                                class={`section-link-btn ${section.seamless ? 'active' : ''}`}
                                title={
                                    section.seamless
                                        ? 'Unlink from previous (Enable Fills)'
                                        : 'Link to previous (Seamless Transition)'
                                }
                                aria-label={
                                    section.seamless
                                        ? 'Disable seamless transition'
                                        : 'Enable seamless transition'
                                }
                                onClick={() =>
                                    handleViewTransition(() =>
                                        onSectionUpdate(section.id, 'seamless', !section.seamless),
                                    )
                                }
                            >
                                🔗
                            </button>

                            <button
                                class="section-move-btn"
                                title="Move Up"
                                aria-label="Move Section Up"
                                onClick={() =>
                                    handleViewTransition(() =>
                                        onSectionUpdate(section.id, 'move', -1),
                                    )
                                }
                                disabled={index === 0}
                            >
                                ▴
                            </button>

                            <button
                                class="section-move-btn"
                                title="Move Down"
                                aria-label="Move Section Down"
                                onClick={() =>
                                    handleViewTransition(() =>
                                        onSectionUpdate(section.id, 'move', 1),
                                    )
                                }
                                disabled={index === totalSections - 1}
                            >
                                ▾
                            </button>

                            <button
                                class="section-duplicate-btn"
                                title="Duplicate"
                                aria-label="Duplicate Section"
                                onClick={() => onSectionDuplicate(section.id)}
                            >
                                ⎘
                            </button>

                            <div style="position: relative; display: inline-block;" ref={menuRef}>
                                <button
                                    class="section-kebab-btn"
                                    title="Insert Symbol"
                                    aria-label={`Actions for ${section.label || 'Section'}`}
                                    aria-expanded={isMenuOpen}
                                    aria-haspopup="true"
                                    onClick={(/** @type {any} */ e) => {
                                        e.stopPropagation();
                                        setIsMenuOpen(!isMenuOpen);
                                    }}
                                >
                                    ⋮
                                </button>
                                {isMenuOpen && (
                                    <SymbolMenu
                                        onSelect={insertSymbol}
                                        onClose={() => setIsMenuOpen(false)}
                                    />
                                )}
                            </div>

                            <button
                                class="section-delete-btn"
                                title="Delete"
                                aria-label="Delete Section"
                                onClick={() => onSectionDelete(section.id)}
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                </div>

                <textarea
                    ref={textareaRef}
                    class={`section-prog-input ${isMutated ? 'mutated' : ''}`}
                    value={section.value}
                    aria-label="Chord Progression"
                    maxLength={1000}
                    placeholder="Enter chords (e.g. C Am F G)"
                    onInput={(/** @type {any} */ e) =>
                        onSectionUpdate(section.id, 'value', e.target.value)
                    }
                    onFocus={() => {
                        // Update legacy state for mutation logic
                        arranger.lastInteractedSectionId = section.id;
                    }}
                />
            </div>
        );
    },
);
