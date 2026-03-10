import { h } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { SONG_TEMPLATES } from '../data/song-templates.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';

export function TemplatesModal() {
    const isOpen = useEnsembleState((s) => s.playback.modals.templates);
    const dispatch = useDispatch();
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

    const closeModal = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'templates', open: false });
    };

    const applyTemplate = (template) => {
        if (
            confirm(
                `Apply "${template.name}" template? This will replace your current arrangement.`,
            )
        ) {
            dispatch(ACTIONS.SET_ARRANGEMENT, {
                sections: template.sections.map((s, i) => ({
                    id: `section-${Date.now()}-${i}`,
                    label: s.label,
                    progression: s.value,
                    repeat: s.repeat || 1,
                })),
            });
            closeModal();
        }
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div
            id="templatesOverlay"
            ref={overlayRef}
            class={`modal-overlay ${isOpen ? 'active' : ''}`}
            onClick={(e) => {
                if (e.target.id === 'templatesOverlay') {
                    closeModal();
                }
            }}
        >
            <div class="modal-content" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header-shared">
                    <h2>Song Templates</h2>
                    <button class="close-btn" aria-label="Close" onClick={closeModal}>
                        &times;
                    </button>
                </div>

                <div class="modal-body">
                    <p class="templates-modal-label">
                        Replace your current arrangement with a professional song structure
                        template.
                    </p>
                    <div class="template-chips">
                        {SONG_TEMPLATES.map((template) => (
                            <button
                                key={template.name}
                                class="template-chip"
                                onClick={() => applyTemplate(template)}
                            >
                                {template.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
