import { createPortal } from 'preact/compat';
import { useEffect } from 'preact/hooks';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { Visualizer } from './Visualizer.jsx';
import { VisualizerLegend } from './VisualsWorkspace.jsx';

/**
 * @param {{ getVisualTime: () => number, onClose: () => void }} props
 */
export function VisualizerOverlay({ getVisualTime, onClose }) {
    useEffect(() => {
        dispatch(ACTIONS.SET_PARAM, { module: 'vizState', param: 'enabled', value: true });

        const handleKeyDown = (/** @type {KeyboardEvent} */ e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            dispatch(ACTIONS.SET_PARAM, { module: 'vizState', param: 'enabled', value: false });
        };
    }, [onClose]);

    const overlay = (
        <div class="viz-overlay" onClick={onClose}>
            <div class="viz-overlay__header">
                <button
                    type="button"
                    class="header-btn"
                    aria-label="Close visualizer"
                    onClick={onClose}
                >
                    ×
                </button>
            </div>
            <div class="viz-overlay__body" onClick={(e) => e.stopPropagation()}>
                <div class="viz-graph-area">
                    <Visualizer enabled={true} getVisualTime={getVisualTime} />
                </div>
                <VisualizerLegend />
            </div>
        </div>
    );

    return createPortal(overlay, document.body);
}
