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

            // 'E': Toggle chart lock (unlock pauses; lock-on-play is enforced
            // by the TOGGLE_PLAY effect).
            if (
                e.key.toLowerCase() === 'e' &&
                !isTyping &&
                !anyModalOpen &&
                !e.metaKey &&
                !e.ctrlKey
            ) {
                e.preventDefault();
                if (!playback.chartLocked) {
                    dispatch(ACTIONS.SET_CHART_LOCKED, true);
                } else {
                    if (playback.isPlaying) {
                        dispatch(ACTIONS.TOGGLE_PLAY, undefined);
                    }
                    dispatch(ACTIONS.SET_CHART_LOCKED, false);
                }
            }

            // Escape: Close Modal, then re-lock the chart if it's unlocked.
            if (e.key === 'Escape') {
                e.preventDefault();
                let closedAny = false;
                Object.keys(playback.modals).forEach((key) => {
                    if ((playback.modals as any)[key]) {
                        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: key, open: false });
                        closedAny = true;
                    }
                });
                if (!closedAny && !playback.chartLocked) {
                    dispatch(ACTIONS.SET_CHART_LOCKED, true);
                }
            }
        };

        const handleOpenEditor = (e: Event) => {
            const { sectionId } = (e as CustomEvent).detail || {};
            const { playback } = getState();
            if (sectionId) {
                dispatch(ACTIONS.SET_PARAM, {
                    module: 'arranger',
                    param: 'lastInteractedSectionId',
                    value: sectionId,
                });
            }
            if (playback.isPlaying) {
                dispatch(ACTIONS.TOGGLE_PLAY, undefined);
            }
            dispatch(ACTIONS.SET_CHART_LOCKED, false);
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
