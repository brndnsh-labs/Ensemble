import { useEffect } from 'preact/hooks';
import { switchMeasure } from '../instrument-controller.js';
import { dispatch, getState } from '../state.js';
const { playback, groove } = getState();
import { ACTIONS } from '../types.js';

export function GlobalShortcuts() {
    useEffect(() => {
        const handleKeyDown = (e) => {
            const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;

            // Space: Toggle Play
            const anyModalOpen = Object.values(playback.modals).some(isOpen => isOpen);
            if (e.key === ' ' && !isTyping && !anyModalOpen) {
                e.preventDefault();
                dispatch(ACTIONS.TOGGLE_PLAY, { viz: playback.viz });
            }

            // 'E': Toggle Editor
            if (e.key.toLowerCase() === 'e' && !isTyping && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                const isOpen = playback.modals.editor;
                dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: !isOpen });
            }

            // 'S': Toggle Soloist (Trading Fours)
            if (e.key.toLowerCase() === 's' && !isTyping && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                if (soloist) {
                    soloist.enabled = !soloist.enabled;
                    if (soloist.enabled) {
                         soloist.isResting = true;
                         soloist.currentPhraseSteps = 0;
                         soloist.srdcState = 'Conclusion';
                    }
                    // Trigger UI update
                    dispatch(ACTIONS.SET_ACTIVE_TAB, { module: 'soloist', tab: soloist.activeTab });
                }
            }

            // 1-5: Switch Mobile Tabs
            if (['1', '2', '3', '4', '5'].includes(e.key) && !isTyping) {
                const btns = document.querySelectorAll('.mobile-tabs-nav .tab-btn');
                const btn = btns[parseInt(e.key) - 1];
                if (btn) btn.click();
            }

            // [ ]: Switch Measures
            if (e.key === '[' && !isTyping) switchMeasure((groove.currentMeasure - 1 + groove.measures) % groove.measures);
            if (e.key === ']' && !isTyping) switchMeasure((groove.currentMeasure + 1) % groove.measures);

            // Escape: Close Modal / Unmaximize
            if (e.key === 'Escape') {
                if (document.body.classList.contains('chord-maximized')) {
                    document.body.classList.remove('chord-maximized');
                    const btn = document.getElementById('maximizeChordBtn');
                    if (btn) btn.textContent = '⛶';
                }

                // Close any open modals
                Object.keys(playback.modals).forEach(key => {
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
