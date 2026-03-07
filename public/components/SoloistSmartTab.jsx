import { h } from 'preact';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

export function SoloistSmartTab() {
    const { tradeMode, phrasingIntensity, motifTracking } = useEnsembleState((s) => ({
        tradeMode: s.soloist.tradeMode,
        phrasingIntensity: s.soloist.phrasingIntensity ?? 0.5,
        motifTracking: s.soloist.motifTracking ?? false,
    }));

    const setTradeMode = (mode) => {
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'tradeMode', value: mode });
        saveCurrentState();
    };

    const handleIntensityChange = (e) => {
        dispatch(ACTIONS.SET_PARAM, {
            module: 'soloist',
            param: 'phrasingIntensity',
            value: parseFloat(e.target.value),
        });
        saveCurrentState();
    };

    const toggleMotifTracking = () => {
        dispatch(ACTIONS.SET_PARAM, {
            module: 'soloist',
            param: 'motifTracking',
            value: !motifTracking,
        });
        saveCurrentState();
    };

    return (
        <div
            class="soloist-smart-controls"
            style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.25rem 0;"
        >
            <div class="slider-group">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem;">
                    <label style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
                        Soloist Articulation
                    </label>
                    <span style="font-size: 0.75rem; color: #94a3b8; font-variant-numeric: tabular-nums;">
                        {Math.round(phrasingIntensity * 100)}%
                    </span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={phrasingIntensity}
                    onInput={handleIntensityChange}
                    style="width: 100%; margin: 0; cursor: pointer;"
                />
            </div>
            <div
                class="toggle-group"
                style="display: flex; justify-content: space-between; align-items: center;"
            >
                <label
                    style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer;"
                    onClick={toggleMotifTracking}
                >
                    Rhythmic Motif Tracking
                </label>
                <button
                    class={`mini-toggle-btn ${motifTracking ? 'active' : ''}`}
                    onClick={toggleMotifTracking}
                    style="min-width: 3rem;"
                >
                    {motifTracking ? 'On' : 'Off'}
                </button>
            </div>

            <div class="trade-mode-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                    <label style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
                        Trade Mode
                    </label>
                    <span style="font-size: 0.7rem; opacity: 0.5; font-style: italic;">
                        {tradeMode === 'manual' ? 'Manual Control' : `Autoswitch: ${tradeMode}`}
                    </span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem;">
                    {['manual', 'sections', 'loops'].map((mode) => (
                        <button
                            class={`mini-toggle-btn ${tradeMode === mode ? 'active' : ''}`}
                            style="text-transform: capitalize;"
                            onClick={() => setTradeMode(mode)}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
