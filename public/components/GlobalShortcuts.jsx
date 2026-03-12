import { useEffect } from 'preact/hooks';
import { SHORTCUT_CONFIG } from '../data/shortcut-config.js';
import { initAudio } from '../engine/engine.js';
import { switchMeasure } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';

/**
 * Global Keyboard Shortcut Listener
 *
 * Logic is kept direct and low-overhead for performance.
 * For a description of these shortcuts, see public/data/shortcut-config.js.
 */
export function GlobalShortcuts() {
    useEffect(() => {
        const handleKeyDown = (e) => {
            const { playback, groove } = getState();
            const isTyping =
                ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) ||
                e.target.isContentEditable;

            // Space: Toggle Play
            const anyModalOpen =
                Object.values(playback.modals).some((isOpen) => isOpen) ||
                document.querySelector('.modal-overlay.closing') !== null ||
                document.querySelector('.settings-overlay.closing') !== null;

            if (e.key === ' ' && !isTyping && !anyModalOpen) {
                e.preventDefault();
                dispatch(ACTIONS.TOGGLE_PLAY, { viz: playback.viz });
            }

            // 'E': Toggle Editor
            if (
                e.key.toLowerCase() === 'e' &&
                !isTyping &&
                !anyModalOpen &&
                !e.metaKey &&
                !e.ctrlKey
            ) {
                e.preventDefault();
                const isOpen = playback.modals.editor;
                dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: !isOpen });
            }

            // 'S': Open Soloist Performance Mode
            if (
                e.key.toLowerCase() === 's' &&
                !isTyping &&
                !anyModalOpen &&
                !e.metaKey &&
                !e.ctrlKey
            ) {
                e.preventDefault();
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                initAudio();
                setTimeout(() => {
                    dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'performance', open: true });
                }, 0);
            }

            // 1-5: Switch Mobile Tabs
            if (['1', '2', '3', '4', '5'].includes(e.key) && !isTyping && !anyModalOpen) {
                const btns = document.querySelectorAll('.mobile-tabs-nav .tab-btn');
                const btn = btns[parseInt(e.key, 10) - 1];
                if (btn) {
                    btn.click();
                }
            }

            // [ ]: Switch Measures
            if (e.key === '[' && !isTyping) {
                switchMeasure((groove.currentMeasure - 1 + groove.measures) % groove.measures);
            }
            if (e.key === ']' && !isTyping) {
                switchMeasure((groove.currentMeasure + 1) % groove.measures);
            }

            // Escape: Close Modal / Unmaximize
            if (e.key === 'Escape') {
                e.preventDefault();
                if (document.body.classList.contains('chord-maximized')) {
                    document.body.classList.remove('chord-maximized');
                    const btn = document.getElementById('maximizeChordBtn');
                    if (btn) {
                        btn.textContent = '⛶';
                    }
                }

                // Close any open modals
                Object.keys(playback.modals).forEach((key) => {
                    if (playback.modals[key]) {
                        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: key, open: false });
                    }
                });
            }
        };

        const handleOpenEditor = (e) => {
            const { sectionId } = e.detail || {};
            if (sectionId) {
                import('../state.js').then(({ arranger }) => {
                    arranger.lastInteractedSectionId = sectionId;
                });
            }
            dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: true });
        };

        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('open-editor', handleOpenEditor);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('open-editor', handleOpenEditor);
        };
    }, []);

    return null;
}
