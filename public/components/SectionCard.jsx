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
 * @param {Object} props
 * @param {any} props.section
 * @param {any} props.index
 * @param {any} props.totalSections
 */
export const SectionCard = forwardRef(({ section, index, totalSections }, ref) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const textareaRef = useRef(null);
    const rootRef = useRef(null);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!isMenuOpen) {
            return;
        }

        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen]);

    useImperativeHandle(ref, () => ({
        scrollIntoView: (options) => {
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

    const handleDragStart = (e) => {
        e.dataTransfer.setData('text/plain', section.id);
        e.currentTarget.classList.add('dragging');
    };

    const handleDragEnd = (e) => {
        e.currentTarget.classList.remove('dragging');
        document
            .querySelectorAll('.section-card')
            .forEach((el) => el.classList.remove('drag-over'));
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId !== section.id) {
            e.currentTarget.classList.add('drag-over');
        }
    };

    const handleDragLeave = (e) => {
        e.currentTarget.classList.remove('drag-over');
    };

    const handleDrop = (/** @type {Event} */ e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== section.id) {
            const event = new CustomEvent('reorder-sections', {
                detail: { draggedId, targetId: section.id },
            });
            window.dispatchEvent(event);
        }
    };

    const insertSymbol = (sym) => {
        const input = textareaRef.current;
        if (!input) {
            return;
        }

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        const before = text.substring(0, start);
        const after = text.substring(end);

        const newValue = before + sym + after;
        onSectionUpdate(section.id, 'value', newValue);

        // Restore focus and cursor position after render
        setTimeout(() => {
            input.focus();
            input.selectionStart = input.selectionEnd = start + sym.length;
        }, 0);
    };

    const handleViewTransition = (fn) => {
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
                        onChange={(e) => onSectionUpdate(section.id, 'label', e.target.value)}
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
                                onChange={(e) =>
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
                            onChange={(e) => onSectionUpdate(section.id, 'key', e.target.value)}
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
                            onChange={(e) =>
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
                                handleViewTransition(() => onSectionUpdate(section.id, 'move', -1))
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
                                handleViewTransition(() => onSectionUpdate(section.id, 'move', 1))
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
                                onClick={(e) => {
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
                onInput={(e) => onSectionUpdate(section.id, 'value', e.target.value)}
                onFocus={() => {
                    // Update legacy state for mutation logic
                    arranger.lastInteractedSectionId = section.id;
                }}
            />
        </div>
    );
});
