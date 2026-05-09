import React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { parseMusicXML, reharmonizeMelody } from '../musicxml-parser.js';
import { dispatch, getState } from '../state.js';
import { useEnsembleState } from '../ui-bridge.js';
import { syncWorker } from '../worker-client.js';
import { Arranger } from './Arranger.jsx';

const { arranger } = getState();

import {
    addSection,
    clearChordPresetHighlight,
    mutateProgression,
    refreshArrangerUI,
    saveProgression,
    transformRelativeProgression,
    validateProgression,
} from '../arranger-controller.js';
import { KEY_ORDER } from '../config.js';
import { pushHistory, undo } from '../history.js';
import { ACTIONS } from '../types.js';
import { showToast } from '../ui.js';
import { formatUnicodeSymbols, generateId } from '../utils.js';

/**
 * @typedef {import('../ui-types.js').ComponentChildren} ComponentChildren
 */

/**
 * @typedef {Object} EditorModalProps
 */

/** @param {EditorModalProps} _props */
export function EditorModal(_props) {
    const {
        isOpen,
        hasLeadSheet,
        leadSheetMelody,
        currentKey,
        totalSteps,
        sectionCount,
        linkedCount,
        sectionKeyCount,
    } = useEnsembleState((/** @type {import('../types.js').EnsembleState} */ s) => ({
        isOpen: s.playback.modals.editor,
        hasLeadSheet: s.soloist.leadSheetMelody && s.soloist.leadSheetMelody.length > 0,
        leadSheetMelody: s.soloist.leadSheetMelody,
        currentKey: s.arranger.key,
        totalSteps: s.arranger.totalSteps,
        sectionCount: (s.arranger.sections || []).length,
        linkedCount: (s.arranger.sections || []).filter((section) => section.seamless).length,
        sectionKeyCount: (s.arranger.sections || []).filter((section) => Boolean(section.key))
            .length,
    }));
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isImportMode, setIsImportMode] = useState(false);
    const [tabText, setTabText] = useState('');
    const [showConfirmClear, setShowConfirmClear] = useState(false);

    const handleImportTab = () => {
        setIsMenuOpen(false);
        setIsImportMode(true);
    };

    const handleConfirmImport = async () => {
        if (!tabText.trim()) {
            setIsImportMode(false);
            return;
        }

        try {
            const { parseTab, detectKey } = await import('../tab-parser.js');
            const parsed = /** @type {any} */ (parseTab(tabText));
            const parsedSections = parsed.sections;
            const capo = parsed.capo;

            if (parsedSections.length > 0) {
                pushHistory();

                let finalSections = parsedSections;
                let detected = /** @type {any} */ (detectKey(parsedSections));

                // Handle Capo Transposition
                if (capo > 0) {
                    finalSections = parsedSections.map((/** @type {any} */ s) => ({
                        ...s,
                        value: transformRelativeProgression(s.value, capo),
                    }));

                    if (detected && detected.confidence > 0.4) {
                        const oldIdx = KEY_ORDER.indexOf(detected.key);
                        const newIdx = (oldIdx + capo) % 12;
                        detected = { ...detected, key: KEY_ORDER[newIdx] };
                    }
                }

                // Smart Key Detection
                if (detected && detected.confidence > 0.4) {
                    arranger.key = detected.key;
                    arranger.isMinor = detected.isMinor;
                    showToast(
                        `Imported ${finalSections.length} sections.${
                            capo > 0 ? ` (Transposed Capo ${capo})` : ''
                        } Key: ${detected.key} ${detected.isMinor ? 'Minor' : 'Major'}`,
                    );
                } else {
                    showToast(
                        `Imported ${finalSections.length} sections.${
                            capo > 0 ? ` (Transposed Capo ${capo})` : ''
                        }`,
                    );
                }

                dispatch(ACTIONS.SET_ARRANGEMENT, finalSections);
                setIsImportMode(false);
                setTabText('');
                refreshArrangerUI();
            } else {
                showToast('No valid chords found in tab.');
            }
        } catch (err) {
            console.error('[Editor] Import Error:', err);
            showToast('Failed to parse tab.');
        }
    };
    /** @type {import('preact').RefObject<HTMLDivElement>} */
    const overlayRef = useRef(null);

    const closeEditor = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: false });
    };

    useEffect(() => {
        if (isOpen && overlayRef.current) {
            const focusable = /** @type {HTMLElement} */ (
                overlayRef.current.querySelector(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                )
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
        setIsImportMode(false);
        setTabText('');
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
        const section = arranger.sections.find((/** @type {any} */ s) => s.id === targetId);
        if (!section) {
            return;
        }
        pushHistory();
        const { value } = mutateProgression(section.value);
        section.value = value;

        // Visual feedback
        dispatch(ACTIONS.SET_PARAM, {
            module: 'arranger',
            param: 'mutatedSectionId',
            value: targetId,
        });

        // Clear highlight after animation duration
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

    const handleClearLeadSeed = () => {
        setIsMenuOpen(false);
        dispatch(ACTIONS.CLEAR_LEAD_SHEET);
        syncWorker();
    };

    const handleReharmonize = async () => {
        setIsMenuOpen(false);
        if (!hasLeadSheet) {
            return;
        }
        const newSections = reharmonizeMelody(leadSheetMelody, currentKey, totalSteps);
        if (newSections) {
            dispatch(ACTIONS.SET_ARRANGEMENT, newSections);
            // Re-validate to update the stepMap/progression
            validateProgression(getState());
            syncWorker();
        }
    };

    /** @param {Event} e */
    const handleFileUpload = (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        if (!target.files || target.files.length === 0) {
            return;
        }
        const file = target.files[0];

        const reader = new FileReader();
        /** @param {ProgressEvent<FileReader>} event */
        reader.onload = (event) => {
            try {
                const result = /** @type {string} */ (event.target?.result);
                const parsed = parseMusicXML(result);
                dispatch(ACTIONS.IMPORT_MUSICXML, parsed);
                // The reducer already sets the style to lead_sheet and enables it
            } catch (err) {
                console.error('Failed to parse MusicXML', err);
            }
        };
        reader.readAsText(file);
    };

    const editorSummary = isImportMode
        ? 'Paste a tab or text chart to build sections automatically.'
        : 'Reorder sections, mark modulations, link transitions, and edit chords in one focused view.';
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
            onClick={(/** @type {MouseEvent} */ e) => {
                const target = /** @type {HTMLElement} */ (e.target);
                if (target.id === 'editorOverlay') {
                    closeEditor();
                }
            }}
        >
            <div
                class="settings-content editor-modal"
                onClick={(/** @type {MouseEvent} */ e) => e.stopPropagation()}
            >
                <div class="modal-header editor-modal-header">
                    <div class="editor-modal-header-copy">
                        <p class="editor-modal-kicker">Arranger</p>
                        <h2 id="editorModalTitle">
                            {isImportMode ? 'Import Tab' : 'Arrangement Editor'}
                        </h2>
                        <p class="editor-modal-summary">{editorSummary}</p>
                    </div>
                    <div class="editor-modal-header-actions">
                        {!isImportMode && (
                            <button
                                id="addSectionBtn"
                                class="primary-btn editor-toolbar-btn editor-add-section-btn"
                                title="Add Section"
                                onClick={handleAddSection}
                            >
                                <span>➕ Add Section</span>
                            </button>
                        )}
                        {!isImportMode && (
                            <div class="arranger-action-container editor-action-container">
                                {isMenuOpen && (
                                    <div
                                        class="menu-click-away"
                                        onClick={() => setIsMenuOpen(false)}
                                    />
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
                                    onClick={(/** @type {MouseEvent} */ e) => {
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
                                        id="importTabBtn"
                                        title="Import from Text/Tab"
                                        aria-label="Import Tab (from Text)"
                                        onClick={handleImportTab}
                                    >
                                        📥 <span>Import Tab</span>
                                    </button>
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
                                        id="importLeadSeedBtn"
                                        title="Import Lead Seed (MusicXML)"
                                        aria-label="Import XML (Lead Seed from MusicXML)"
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            const input =
                                                document.getElementById('xml-upload-editor');
                                            if (input) {
                                                input.click();
                                            }
                                        }}
                                    >
                                        📥 <span>Import XML</span>
                                    </button>
                                    <button
                                        id="mutateBtn"
                                        title="Mutate Progression"
                                        aria-label="Mutate (Progression)"
                                        onClick={handleMutate}
                                    >
                                        ✨ <span>Mutate</span>
                                    </button>
                                    {hasLeadSheet && (
                                        <button
                                            id="reharmonizeMelodyBtn"
                                            title="Re-harmonize Lead Seed"
                                            aria-label="Re-harmonize (Lead Seed)"
                                            onClick={handleReharmonize}
                                        >
                                            🎹 <span>Re-harmonize</span>
                                        </button>
                                    )}
                                    {hasLeadSheet && (
                                        <button
                                            id="clearLeadSeedBtn"
                                            title="Clear Lead Seed"
                                            aria-label="Clear Lead Seed"
                                            onClick={handleClearLeadSeed}
                                        >
                                            🚫 <span>Clear Lead Seed</span>
                                        </button>
                                    )}

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
                        )}
                        <input
                            type="file"
                            id="xml-upload-editor"
                            accept=".xml,.mxl,.musicxml"
                            class="editor-upload-input"
                            onChange={handleFileUpload}
                        />
                        <button
                            id="closeEditorBtn"
                            class="secondary-btn editor-toolbar-btn editor-done-btn"
                            onClick={closeEditor}
                        >
                            Done
                        </button>
                    </div>
                </div>

                {!isImportMode && (
                    <div class="editor-modal-toolbar">
                        <div
                            class="editor-modal-stats"
                            role="list"
                            aria-label="Arrangement summary"
                        >
                            {arrangementStats.map((item) => (
                                <span key={item} role="listitem" class="editor-stat-chip">
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div class="editor-scroll-area">
                    <div id="sectionList" class="section-list">
                        {isImportMode ? (
                            <div class="import-tab-view">
                                <p class="import-help">
                                    Paste Ultimate Guitar tabs or text charts below. Chords and
                                    lyrics will be parsed into song sections.
                                </p>
                                <textarea
                                    id="tabPasteArea"
                                    placeholder="[Intro]
Em  C  G  D"
                                    value={tabText}
                                    onInput={(/** @type {Event} */ e) => {
                                        const target = /** @type {HTMLTextAreaElement} */ (
                                            e.target
                                        );
                                        setTabText(target.value);
                                    }}
                                    autoFocus
                                />
                                <div class="import-mode-actions">
                                    <button
                                        class="primary-btn import-confirm-btn"
                                        onClick={handleConfirmImport}
                                    >
                                        🚀 Parse & Import
                                    </button>
                                    <button
                                        class="secondary-btn"
                                        onClick={() => {
                                            setIsImportMode(false);
                                            setTabText('');
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <Arranger />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
