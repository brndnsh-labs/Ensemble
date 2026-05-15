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
        const handleKeyDown = (e: KeyboardEvent) => {
            const { playback } = getState();
            const target = e.target as HTMLElement;
            const isTyping =
                ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) ||
                target.isContentEditable;

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
                Object.keys(playback.modals).forEach((key) => {
                    if ((playback.modals as any)[key]) {
                        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: key, open: false });
                    }
                });
            }
        };

        const handleOpenEditor = (e: Event) => {
            const { sectionId } = (e as CustomEvent).detail || {};
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
