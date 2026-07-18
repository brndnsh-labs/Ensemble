import { useRef, useState } from 'preact/hooks';
import {
    addSection,
    clearChordPresetHighlight,
    mutateProgression,
    refreshArrangerUI,
    saveProgression,
} from '../arranger-controller.js';
import { pushHistory, undo } from '../history.js';
import { arranger, dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { generateId } from '../utils.js';
import { Arranger } from './Arranger.jsx';
import { Icon } from './Icon.jsx';
import { useModalA11y } from './use-modal-a11y.js';

/**
 * Inline section-card editor mounted directly on `ChartSurface` when the
 * chart is unlocked. Hosts the Arranger plus a slim toolbar (Add Section
 * + Tools menu). The Inspiration / Library entry point lives on the topbar
 * as the consolidated 📚 Library button.
 */
export function InlineEditor() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showConfirmClear, setShowConfirmClear] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useModalA11y(menuRef, isMenuOpen, () => setIsMenuOpen(false), 'Arrangement tools', {
        modal: false,
    });

    const handleAddSection = () => {
        setIsMenuOpen(false);
        addSection();
    };

    const handleSurpriseMe = () => {
        setIsMenuOpen(false);
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'surpriseMe', open: true });
    };

    const handleMutate = () => {
        setIsMenuOpen(false);
        const targetId = arranger.lastInteractedSectionId;
        const sectionIndex = arranger.sections.findIndex((s: any) => s.id === targetId);
        if (sectionIndex === -1) {
            return;
        }
        pushHistory();
        const { value } = mutateProgression(arranger.sections[sectionIndex].value);
        // Rebuild the sections array immutably and dispatch through the reducer
        // (mirrors `replaceChordInSection` — keeps history/persistence/validation
        // in sync with the observable value).
        const newSections = [...arranger.sections];
        newSections[sectionIndex] = { ...newSections[sectionIndex], value };
        dispatch(ACTIONS.SET_PARAM, {
            module: 'arranger',
            param: 'sections',
            value: newSections,
        });

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
        dispatch(ACTIONS.SET_SECTIONS, [{ id: generateId(), label: 'Intro', value: '' }]);
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

    return (
        <div class="inline-editor">
            <div class="inline-editor__toolbar">
                <button
                    class="primary-btn editor-toolbar-btn editor-add-section-btn"
                    title="Add Section"
                    onClick={handleAddSection}
                >
                    <span>
                        <Icon name="plus" /> Add Section
                    </span>
                </button>
                <div class="arranger-action-container editor-action-container">
                    {isMenuOpen && (
                        <div class="menu-click-away" onClick={() => setIsMenuOpen(false)} />
                    )}
                    <button
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
                            <Icon name="more" />
                        </span>
                    </button>
                    <div
                        ref={menuRef}
                        // role="dialog" self-declared: #1129 made useModalA11y
                        // non-modal here, so the menu owns its own role (keeps the
                        // aria-label announced).
                        role="dialog"
                        class={`action-menu-content editor-action-menu ${isMenuOpen ? 'open' : ''}`}
                    >
                        <div class="menu-section-header">Structure</div>
                        <button title="Library" onClick={handleSurpriseMe}>
                            <Icon name="book" /> <span>Library</span>
                        </button>
                        {showConfirmClear ? (
                            <div role="alert" aria-live="polite" class="editor-clear-confirm">
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
                            <button title="Clear Progression" onClick={handleClear}>
                                <Icon name="trash" /> <span>Clear All</span>
                            </button>
                        )}
                        <div class="menu-divider" />
                        <div class="menu-section-header">Melody & Intelligence</div>
                        <button title="Mutate Progression" onClick={handleMutate}>
                            <Icon name="sparkle" /> <span>Mutate</span>
                        </button>
                        <div class="menu-divider" />
                        <div class="menu-section-header">Project</div>
                        <button title="Undo Last Change" onClick={handleUndo}>
                            <Icon name="undo" /> <span>Undo</span>
                        </button>
                        <button title="Save to Library" onClick={handleSave}>
                            <Icon name="save" /> <span>Save</span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="inline-editor__body">
                <div class="section-list">
                    <Arranger />
                </div>
            </div>
        </div>
    );
}
