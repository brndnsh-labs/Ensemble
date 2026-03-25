import { togglePower } from '../instrument-controller.js';
import { useEnsembleState } from '../ui-bridge.js';
import { Visualizer } from './Visualizer.jsx';

/**
 * @param {{ getVisualTime: () => number }} props
 */
export function VisualsWorkspace({ getVisualTime }) {
    const { enabled, isPlaying, bpm, timeSignature } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            enabled: s.vizState.enabled,
            isPlaying: s.playback.isPlaying,
            bpm: s.playback.bpm,
            timeSignature: s.arranger.timeSignature,
        }),
    );

    return (
        <section class="workspace-view workspace-view--visuals" data-workspace="visuals">
            <div class="workspace-grid workspace-grid--visuals">
                <div
                    class={`panel dashboard-panel workspace-panel workspace-panel--hero ${
                        !enabled ? 'collapsed' : ''
                    }`}
                    id="panel-visualizer"
                    data-id="visualizer"
                >
                    <div class="panel-header">
                        <div class="panel-header-main">
                            <button
                                id="vizPowerBtn"
                                class={`power-btn ${enabled ? 'active' : ''}`}
                                aria-label="Toggle Visualizer"
                                onClick={() => togglePower('viz')}
                            >
                                ⏻
                            </button>
                            <div>
                                <h2 class="panel-title">Visuals</h2>
                            </div>
                        </div>
                    </div>

                    <div class="workspace-status-grid workspace-status-grid--tight">
                        <div class="workspace-status-item">
                            <span class="workspace-stat-label">Playback</span>
                            <strong class="workspace-stat-value">
                                {isPlaying ? 'Playing' : 'Idle'}
                            </strong>
                        </div>
                        <div class="workspace-status-item">
                            <span class="workspace-stat-label">Tempo</span>
                            <strong class="workspace-stat-value">{bpm} BPM</strong>
                        </div>
                        <div class="workspace-status-item">
                            <span class="workspace-stat-label">Meter</span>
                            <strong class="workspace-stat-value">{timeSignature}</strong>
                        </div>
                    </div>

                    <div class="viz-graph-area workspace-visualizer-area">
                        <Visualizer enabled={enabled} getVisualTime={getVisualTime} />
                    </div>
                </div>
            </div>
        </section>
    );
}
