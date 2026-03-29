import { useEnsembleState } from '../ui-bridge.js';
import {
    VISUALIZER_CHORD_SWATCHES,
    VISUALIZER_TRACK_ORDER,
    VISUALIZER_TRACKS,
} from '../visualizer-events.js';
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

/**
 * @param {{ getVisualTime: () => number }} props
 */
export function VisualsWorkspace({ getVisualTime }) {
    const { enabled } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            enabled: s.vizState.enabled,
        }),
    );

    return (
        <section class="workspace-view workspace-view--visuals" data-workspace="visuals">
            <div class="workspace-grid workspace-grid--visuals">
                <div
                    class="panel dashboard-panel workspace-panel workspace-panel--hero"
                    id="panel-visualizer"
                    data-id="visualizer"
                >
                    <div class="panel-header">
                        <div>
                            <h2 class="panel-title">Visuals</h2>
                        </div>
                    </div>

                    <div class="viz-graph-area workspace-visualizer-area">
                        <Visualizer enabled={enabled} getVisualTime={getVisualTime} />
                    </div>

                    <VisualizerLegend />
                </div>
            </div>
        </section>
    );
}
