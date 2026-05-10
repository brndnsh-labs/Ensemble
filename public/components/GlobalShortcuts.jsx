import { useEffect } from 'preact/hooks';
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
        const handleKeyDown = (/** @type {any} */ e) => {
            const { playback } = getState();
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
                dispatch(ACTIONS.TOGGLE_PLAY);
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

            // Escape: Close Modal
            if (e.key === 'Escape') {
                e.preventDefault();
                Object.keys(playback.modals).forEach((/** @type {any} */ key) => {
                    if (/** @type {any} */ (playback.modals)[key]) {
                        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: key, open: false });
                    }
                });
            }
        };

        const handleOpenEditor = (/** @type {any} */ e) => {
            const { sectionId } = e.detail || {};
            if (sectionId) {
                import('../state.js').then(() => {
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'arranger',
                        param: 'lastInteractedSectionId',
                        value: sectionId,
                    });
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
