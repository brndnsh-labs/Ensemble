import { h } from 'preact';
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
    refreshArrangerUI,
    saveProgression,
    validateAndAnalyze,
} from '../arranger-controller.js';
import { mutateProgression, transformRelativeProgression } from '../chords-engine.js';
import { KEY_ORDER } from '../config.js';
import { pushHistory, undo } from '../history.js';
import { shareProgression } from '../sharing.js';
import { ACTIONS } from '../types.js';
import { showToast } from '../ui.js';
import { generateId } from '../utils.js';

export function EditorModal() {
    const { isOpen, hasLeadSheet, leadSheetMelody, currentKey, totalSteps } = useEnsembleState(
        (s) => ({
            isOpen: s.playback.modals.editor,
            hasLeadSheet: s.soloist.leadSheetMelody && s.soloist.leadSheetMelody.length > 0,
            leadSheetMelody: s.soloist.leadSheetMelody,
            currentKey: s.arranger.key,
            totalSteps: s.arranger.totalSteps,
        }),
    );
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
            const { sections: parsedSections, capo } = parseTab(tabText);

            if (parsedSections.length > 0) {
                pushHistory();

                let finalSections = parsedSections;
                let detected = detectKey(parsedSections);

                // Handle Capo Transposition
                if (capo > 0) {
                    finalSections = parsedSections.map((s) => ({
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
    const overlayRef = useRef(null);

    const closeEditor = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: false });
    };

    useEffect(() => {
        if (isOpen && overlayRef.current) {
            const focusable = overlayRef.current.querySelector(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            if (focusable) {
                setTimeout(() => focusable.focus(), 50);
            }
        }
    }, [isOpen]);

    const _handleAction = (fn) => {
        setIsMenuOpen(false);
        fn();
    };

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

    const handleAnalyze = () => {
        setIsMenuOpen(false);
        if (window.resetAnalyzer) {
            window.resetAnalyzer();
        }
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: false });
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'analyzer', open: true });
    };

    const handleMutate = () => {
        setIsMenuOpen(false);
        const targetId = arranger.lastInteractedSectionId;
        const section = arranger.sections.find((s) => s.id === targetId);
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
            const { validateProgression } = await import('../chords.js');
            validateProgression(getState());
            syncWorker();
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = parseMusicXML(event.target.result);
                dispatch(ACTIONS.IMPORT_MUSICXML, parsed);
                // The reducer already sets the style to lead_sheet and enables it
            } catch (err) {
                console.error('Failed to parse MusicXML', err);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div
            id="editorOverlay"
            ref={overlayRef}
            class={`settings-overlay ${isOpen ? 'active' : ''}`}
            aria-hidden={!isOpen ? 'true' : 'false'}
            onClick={(e) => {
                if (e.target.id === 'editorOverlay') {
                    closeEditor();
                }
            }}
        >
            <div class="settings-content editor-modal" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header">
                    <h2>{isImportMode ? 'Import Tab' : 'Arrangement Editor'}</h2>
                    <input
                        type="file"
                        id="xml-upload-editor"
                        accept=".xml,.mxl,.musicxml"
                        style="display:none;"
                        onChange={handleFileUpload}
                    />
                    <button id="closeEditorBtn" class="primary-btn" onClick={closeEditor}>
                        Done
                    </button>
                </div>

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
                                    onInput={(e) => setTabText(e.target.value)}
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

                <div class="modal-footer">
                    <div class="footer-primary-actions">
                        <button
                            id="addSectionBtn"
                            class="primary-btn footer-main-btn"
                            title="Add Section"
                            onClick={handleAddSection}
                        >
                            <span>➕ Add Section</span>
                        </button>
                        <button
                            id="arrangerActionTrigger"
                            aria-label="Arranger Actions Menu"
                            aria-haspopup="true"
                            aria-expanded={isMenuOpen}
                            class={`action-trigger-btn ${isMenuOpen ? 'active' : ''}`}
                            title="Arranger Actions"
                            style="justify-content: center; padding: 0.75rem 1rem;"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsMenuOpen(!isMenuOpen);
                            }}
                        >
                            <span style="font-size: 1.2rem;">⋮</span>
                        </button>
                    </div>

                    <div class="arranger-action-container">
                        {isMenuOpen && (
                            <div class="menu-click-away" onClick={() => setIsMenuOpen(false)} />
                        )}
                        <div
                            id="arrangerActionMenu"
                            class={`action-menu-content ${isMenuOpen ? 'open' : ''}`}
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
                                    style="padding: 0.5rem; background: rgba(255, 0, 0, 0.1); border-radius: 4px; margin: 0 0.5rem;"
                                >
                                    <div style="font-size: 0.8rem; color: var(--text-color); margin-bottom: 0.5rem; text-align: center;">
                                        Clear entire progression?
                                    </div>
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button
                                            style="flex: 1; padding: 0.3rem; font-size: 0.8rem; background: var(--red); color: white; border: none; border-radius: 4px; cursor: pointer;"
                                            onClick={confirmClear}
                                        >
                                            Yes
                                        </button>
                                        <button
                                            style="flex: 1; padding: 0.3rem; font-size: 0.8rem; background: transparent; color: var(--text-color); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;"
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
                                    document.getElementById('xml-upload-editor').click();
                                }}
                            >
                                📥 <span>Import XML</span>
                            </button>
                            <button
                                id="analyzeAudioBtn"
                                title="Analyze Audio / Harmonize Melody"
                                aria-label="Analyze (Audio / Harmonize Melody)"
                                onClick={handleAnalyze}
                            >
                                👂 <span>Analyze</span>
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
                </div>
            </div>
        </div>
    );
}
