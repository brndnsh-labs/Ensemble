import { h } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { SONG_TEMPLATES } from '../data/song-templates.js';
import { getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';

const { arranger } = getState();

import {
    clearChordPresetHighlight,
    refreshArrangerUI,
    validateAndAnalyze,
} from '../arranger-controller.js';
import { pushHistory } from '../history.js';
import { showToast } from '../ui.js';
import { formatUnicodeSymbols, generateId, normalizeKey } from '../utils.js';

export function TemplatesModal() {
    const dispatch = useDispatch();
    const isOpen = useEnsembleState((s) => s.playback.modals.templates);
    const overlayRef = useRef(null);

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

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'templates', open: false });
    };

    const applyTemplate = (template) => {
        pushHistory();

        const newSections = template.sections.map((s) => ({
            id: generateId(),
            label: s.label,
            value: s.value,
            repeat: s.repeat || 1,
            key: s.key || '',
            timeSignature: s.timeSignature || '',
            seamless: s.seamless || false,
        }));

        if (arranger.isDirty && arranger.sections.length > 1) {
            if (!confirm(`Replace current arrangement with "${template.name}"?`)) {
                return;
            }
        }

        arranger.sections = newSections;
        if (template.isMinor !== undefined) {
            arranger.isMinor = template.isMinor;
        }

        // Update global arranger state to match the template's first section details if specified
        const first = newSections[0];
        if (first.key) {
            arranger.key = first.key;
        }
        if (first.timeSignature) {
            arranger.timeSignature = first.timeSignature;
        }

        arranger.isDirty = true;
        clearChordPresetHighlight();
        refreshArrangerUI();
        validateAndAnalyze();

        close();
        showToast(`Applied template: ${template.name}`);
    };

    return (
        <div
            id="templatesOverlay"
            ref={overlayRef}
            class={`modal-overlay ${isOpen ? 'active' : ''}`}
            aria-hidden={!isOpen ? 'true' : 'false'}
            onClick={(e) => {
                if (e.target.id === 'templatesOverlay') {
                    close();
                }
            }}
        >
            <div class="settings-content" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header">
                    <h2>Song Templates</h2>
                    <button id="closeTemplatesBtn" class="primary-btn" onClick={close}>
                        Cancel
                    </button>
                </div>
                <div
                    class="templates-modal-label"
                    style="margin-bottom: 1.5rem; color: var(--text-muted);"
                >
                    Select a template to replace your current arrangement:
                </div>

                <div class="template-chips" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    {SONG_TEMPLATES.map((template, idx) => (
                        <button
                            key={idx}
                            class="preset-chip template-chip"
                            onClick={() => applyTemplate(template)}
                        >
                            {formatUnicodeSymbols(template.name)}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
