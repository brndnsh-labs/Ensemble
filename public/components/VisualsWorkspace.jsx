import { useEnsembleState } from '../ui-bridge.js';
import { Visualizer } from './Visualizer.jsx';

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
                </div>
            </div>
        </section>
    );
}
