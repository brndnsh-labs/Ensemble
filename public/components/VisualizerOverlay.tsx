import { createPortal } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import {
    VISUALIZER_CHORD_SWATCHES,
    VISUALIZER_TRACK_ORDER,
    VISUALIZER_TRACKS,
} from '../visualizer-events.js';
import { useModalA11y } from './use-modal-a11y.js';
import { Visualizer } from './Visualizer.jsx';

function VisualizerLegend() {
    return (
        <div class="viz-legend" data-testid="visualizer-legend" aria-label="Visualizer legend">
            <div class="legend-group">
                <span class="legend-label">Instruments</span>
                {VISUALIZER_TRACK_ORDER.map((trackId) => {
                    const track = VISUALIZER_TRACKS[trackId];
                    return (
                        <span class="legend-item" key={track.id}>
                            <span class={`legend-swatch ${track.legendClass}`} aria-hidden="true" />
                            <span>{track.label}</span>
                        </span>
                    );
                })}
            </div>

            <div class="legend-group">
                <span class="legend-label">Chord tones</span>
                {VISUALIZER_CHORD_SWATCHES.map((swatch) => (
                    <span class="legend-item" key={swatch.id}>
                        <span class={`legend-swatch ${swatch.legendClass}`} aria-hidden="true" />
                        <span>{swatch.label}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

interface VisualizerOverlayProps {
    getVisualTime: () => number;
    onClose: () => void;
}

export function VisualizerOverlay({ getVisualTime, onClose }: VisualizerOverlayProps) {
    const overlayRef = useRef<HTMLDivElement | null>(null);
    useModalA11y(overlayRef, true, onClose, 'Full-screen visualizer');

    useEffect(() => {
        dispatch(ACTIONS.SET_PARAM, { module: 'vizState', param: 'enabled', value: true });
        return () => {
            dispatch(ACTIONS.SET_PARAM, { module: 'vizState', param: 'enabled', value: false });
        };
    }, []);

    const overlay = (
        <div class="viz-overlay" ref={overlayRef} onClick={onClose}>
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
