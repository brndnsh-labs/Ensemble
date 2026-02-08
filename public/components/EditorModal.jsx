import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import React from 'preact/compat';
import { Arranger } from './Arranger.jsx';
import { useEnsembleState } from '../ui-bridge.js';
import { dispatch, getState } from '../state.js';
const { arranger } = getState();
import { ACTIONS } from '../types.js';
import { generateId } from '../utils.js';
import { mutateProgression } from '../chords.js';
import { addSection, refreshArrangerUI, clearChordPresetHighlight, validateAndAnalyze, saveProgression } from '../arranger-controller.js';
import { undo, pushHistory } from '../history.js';
import { shareProgression } from '../sharing.js';

export function EditorModal() {
    const isOpen = useEnsembleState(s => s.playback.modals.editor);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const overlayRef = useRef(null);

    const closeEditor = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: false });
    };

    useEffect(() => {
        if (isOpen && overlayRef.current) {
            const focusable = overlayRef.current.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable) setTimeout(() => focusable.focus(), 50);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isMenuOpen) return;
        
        const handleClickOutside = (e) => {
            const menu = document.getElementById('arrangerActionMenu');
            const trigger = document.getElementById('arrangerActionTrigger');
            if (menu && !menu.contains(e.target) && e.target !== trigger) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isMenuOpen]);

    const handleAction = (fn) => {
        setIsMenuOpen(false);
        fn();
    };

    const handleAddSection = () => {
        setIsMenuOpen(false);
        addSection();
    };

    const handleTemplates = () => {
        setIsMenuOpen(false);
        if (window.innerWidth < 900) {
            // Close editor on mobile to show templates? 
            // The legacy logic opened templatesOverlay on top.
        }
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: false });
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'templates', open: true });
        
        // Template rendering logic is still legacy for now in ui-controller.js or ui.js
        // We'll trigger the rendering if needed, but it usually happens on open.
    };

    const handleAnalyze = () => {
        setIsMenuOpen(false);
        if (window.resetAnalyzer) window.resetAnalyzer();
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: false });
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'analyzer', open: true });
    };

    const handleRandomize = () => {
        setIsMenuOpen(false);
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: false });
        setTimeout(() => dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'generateSong', open: true }), 10);
    };

    const handleMutate = () => {
        setIsMenuOpen(false);
        const targetId = arranger.lastInteractedSectionId;
        const section = arranger.sections.find(s => s.id === targetId);
        if (!section) return;
        pushHistory();
        section.value = mutateProgression(section.value);
        clearChordPresetHighlight();
        refreshArrangerUI();
    };

    const handleClear = () => {
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

    const handleShare = () => {
        setIsMenuOpen(false);
        shareProgression();
    };

    return (
        <div id="editorOverlay" ref={overlayRef} class={`settings-overlay ${isOpen ? 'active' : ''}`} aria-hidden={!isOpen ? 'true' : 'false'} onClick={(e) => {
            if (e.target.id === 'editorOverlay') closeEditor();
        }}>
            <div class="settings-content editor-modal" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header">
                    <h2>Arrangement Editor</h2>
                    <button id="closeEditorBtn" class="primary-btn" onClick={closeEditor}>Done</button>
                </div>
                
                <div class="editor-scroll-area">
                    <div id="sectionList" class="section-list">
                        <Arranger />
                    </div>
                </div>

                <div class="modal-footer">
                    <div class="footer-primary-actions">
                        <button id="addSectionBtn" class="primary-btn footer-main-btn" title="Add Section" onClick={handleAddSection}>
                            <span>➕ Add Section</span>
                        </button>
                        <button 
                            id="arrangerActionTrigger" 
                            aria-label="Arranger Actions Menu" 
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
                        <div id="arrangerActionMenu" class={`action-menu-content ${isMenuOpen ? 'open' : ''}`}>
                            <button id="templatesBtn" title="Song Templates" onClick={handleTemplates}>📋 <span>Templates</span></button>
                            <button id="analyzeAudioBtn" title="Analyze Audio / Harmonize Melody" onClick={handleAnalyze}>👂 <span>Analyze / Harmonize</span></button>
                            <button id="randomizeBtn" title="Randomize Progression" aria-label="Randomize Progression" onClick={handleRandomize}>🎲 <span>Random</span></button>
                            <button id="mutateBtn" title="Mutate Progression" aria-label="Mutate Progression" onClick={handleMutate}>✨ <span>Mutate</span></button>
                            <button id="undoBtn" title="Undo Last Change" aria-label="Undo Last Change" onClick={handleUndo}>↩️ <span>Undo</span></button>
                            <button id="saveBtn" title="Save to Library" aria-label="Save Progression" onClick={handleSave}>💾 <span>Save</span></button>
                            <button id="clearProgBtn" title="Clear Progression" aria-label="Clear Progression" onClick={handleClear}>🗑️ <span>Clear</span></button>
                            <button id="shareBtn" title="Share Progression" aria-label="Share Progression" onClick={handleShare}>🔗 <span>Share</span></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
