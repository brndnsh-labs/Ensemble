import { useEffect, useRef, useState } from 'preact/hooks';
import { dispatch, getState } from '../state.js';
import { useEnsembleState } from '../ui-bridge.js';
import { Arranger } from './Arranger.jsx';

const { arranger } = getState();

import {
    addSection,
    clearChordPresetHighlight,
    mutateProgression,
    refreshArrangerUI,
    saveProgression,
} from '../arranger-controller.js';
import { pushHistory, undo } from '../history.js';
import { ACTIONS } from '../types.js';
import { formatUnicodeSymbols, generateId } from '../utils.js';

export function EditorModal() {
    const { isOpen, currentKey, sectionCount, linkedCount, sectionKeyCount } = useEnsembleState(
        (s) => ({
            isOpen: s.playback.modals.editor,
            currentKey: s.arranger.key,
            sectionCount: (s.arranger.sections || []).length,
            linkedCount: (s.arranger.sections || []).filter((section) => section.seamless).length,
            sectionKeyCount: (s.arranger.sections || []).filter((section) => Boolean(section.key))
                .length,
        }),
    );
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showConfirmClear, setShowConfirmClear] = useState(false);
    const overlayRef = useRef<HTMLDivElement | null>(null);

    const closeEditor = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: false });
    };

    useEffect(() => {
        if (isOpen && overlayRef.current) {
            const focusable = overlayRef.current.querySelector<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            if (focusable) {
                setTimeout(() => focusable.focus(), 50);
            }
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            return;
        }

        setIsMenuOpen(false);
        setShowConfirmClear(false);
    }, [isOpen]);

    const handleAddSection = () => {
        setIsMenuOpen(false);
        addSection();
    };

    const handleInspirationHub = () => {
        setIsMenuOpen(false);
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: false });
        setTimeout(
            () => dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'generateSong', open: true }),
            10,
        );
    };

    const handleMutate = () => {
        setIsMenuOpen(false);
        const targetId = arranger.lastInteractedSectionId;
        const section = arranger.sections.find((s: any) => s.id === targetId);
        if (!section) {
            return;
        }
        pushHistory();
        const { value } = mutateProgression(section.value);
        section.value = value;

        dispatch(ACTIONS.SET_PARAM, {
            module: 'arranger',
            param: 'mutatedSectionId',
            value: targetId,
        });

        setTimeout(() => {
            dispatch(ACTIONS.SET_PARAM, {
                module: 'arranger',
                param: 'mutatedSectionId',
                value: null,
            });
        }, 1000);

        clearChordPresetHighlight();
        refreshArrangerUI();
    };

    const handleClear = () => {
        setShowConfirmClear(true);
    };

    const confirmClear = () => {
        setShowConfirmClear(false);
        setIsMenuOpen(false);
        pushHistory();
        arranger.sections = [{ id: generateId(), label: 'Intro', value: '' }];
        clearChordPresetHighlight();
        refreshArrangerUI();
    };

    const handleUndo = () => {
        setIsMenuOpen(false);
        undo(refreshArrangerUI);
        clearChordPresetHighlight();
    };

    const handleSave = () => {
        setIsMenuOpen(false);
        saveProgression();
    };

    const editorSummary =
        'Reorder sections, mark modulations, link transitions, and edit chords in one focused view.';
    const arrangementStats = [
        `${sectionCount} ${sectionCount === 1 ? 'section' : 'sections'}`,
        sectionKeyCount === 0
            ? `Global key ${formatUnicodeSymbols(currentKey || 'C')}`
            : `${sectionKeyCount} key change${sectionKeyCount === 1 ? '' : 's'}`,
        linkedCount === 0
            ? 'Independent transitions'
            : `${linkedCount} linked transition${linkedCount === 1 ? '' : 's'}`,
        'Drag to reorder',
    ];

    return (
        <div
            id="editorOverlay"
            ref={overlayRef}
            class={`settings-overlay ${isOpen ? 'active' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="editorModalTitle"
            aria-hidden={!isOpen ? 'true' : 'false'}
            onClick={(e: MouseEvent) => {
                const target = e.target as HTMLElement;
                if (target.id === 'editorOverlay') {
                    closeEditor();
                }
            }}
        >
            <div
                class="settings-content editor-modal"
                onClick={(e: MouseEvent) => e.stopPropagation()}
            >
                <div class="modal-header editor-modal-header">
                    <div class="editor-modal-header-copy">
                        <p class="editor-modal-kicker">Arranger</p>
                        <h2 id="editorModalTitle">Arrangement Editor</h2>
                        <p class="editor-modal-summary">{editorSummary}</p>
                    </div>
                    <div class="editor-modal-header-actions">
                        <button
                            id="addSectionBtn"
                            class="primary-btn editor-toolbar-btn editor-add-section-btn"
                            title="Add Section"
                            onClick={handleAddSection}
                        >
                            <span>➕ Add Section</span>
                        </button>
                        <div class="arranger-action-container editor-action-container">
                            {isMenuOpen && (
                                <div class="menu-click-away" onClick={() => setIsMenuOpen(false)} />
                            )}
                            <button
                                id="arrangerActionTrigger"
                                aria-label="Arrangement Tools Menu"
                                aria-haspopup="true"
                                aria-expanded={isMenuOpen}
                                class={`action-trigger-btn editor-action-trigger ${
                                    isMenuOpen ? 'active' : ''
                                }`}
                                title="Arrangement Tools"
                                onClick={(e: MouseEvent) => {
                                    e.stopPropagation();
                                    setIsMenuOpen(!isMenuOpen);
                                }}
                            >
                                <span class="editor-action-trigger-label">Tools</span>
                                <span class="editor-action-trigger-icon" aria-hidden="true">
                                    ⋮
                                </span>
                            </button>

                            <div
                                id="arrangerActionMenu"
                                class={`action-menu-content editor-action-menu ${
                                    isMenuOpen ? 'open' : ''
                                }`}
                            >
                                <div class="menu-section-header">Structure</div>
                                <button
                                    id="inspirationHubBtn"
                                    title="Inspiration Hub"
                                    aria-label="Inspiration Hub"
                                    onClick={handleInspirationHub}
                                >
                                    ✨ <span>Inspiration Hub</span>
                                </button>
                                {showConfirmClear ? (
                                    <div
                                        role="alert"
                                        aria-live="polite"
                                        class="editor-clear-confirm"
                                    >
                                        <div class="editor-clear-confirm-copy">
                                            Clear entire progression?
                                        </div>
                                        <div class="editor-clear-confirm-actions">
                                            <button
                                                class="editor-clear-confirm-btn editor-clear-confirm-btn--danger"
                                                onClick={confirmClear}
                                            >
                                                Yes
                                            </button>
                                            <button
                                                class="editor-clear-confirm-btn editor-clear-confirm-btn--secondary"
                                                onClick={() => setShowConfirmClear(false)}
                                            >
                                                No
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        id="clearProgBtn"
                                        title="Clear Progression"
                                        aria-label="Clear All (Progression)"
                                        onClick={handleClear}
                                    >
                                        🗑️ <span>Clear All</span>
                                    </button>
                                )}

                                <div class="menu-divider" />
                                <div class="menu-section-header">Melody & Intelligence</div>
                                <button
                                    id="mutateBtn"
                                    title="Mutate Progression"
                                    aria-label="Mutate (Progression)"
                                    onClick={handleMutate}
                                >
                                    ✨ <span>Mutate</span>
                                </button>

                                <div class="menu-divider" />
                                <div class="menu-section-header">Project</div>
                                <button
                                    id="undoBtn"
                                    title="Undo Last Change"
                                    aria-label="Undo (Last Change)"
                                    onClick={handleUndo}
                                >
                                    ↩️ <span>Undo</span>
                                </button>
                                <button
                                    id="saveBtn"
                                    title="Save to Library"
                                    aria-label="Save (to Library)"
                                    onClick={handleSave}
                                >
                                    💾 <span>Save</span>
                                </button>
                            </div>
                        </div>
                        <button
                            id="closeEditorBtn"
                            class="secondary-btn editor-toolbar-btn editor-done-btn"
                            onClick={closeEditor}
                        >
                            Done
                        </button>
                    </div>
                </div>

                <div class="editor-modal-toolbar">
                    <div class="editor-modal-stats" role="list" aria-label="Arrangement summary">
                        {arrangementStats.map((item) => (
                            <span key={item} role="listitem" class="editor-stat-chip">
                                {item}
                            </span>
                        ))}
                    </div>
                </div>

                <div class="editor-scroll-area">
                    <div id="sectionList" class="section-list">
                        <Arranger />
                    </div>
                </div>
            </div>
        </div>
    );
}
