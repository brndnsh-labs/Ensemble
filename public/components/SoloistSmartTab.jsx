import { h } from 'preact';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

export function SoloistSmartTab() {
    const { tradeMode } = useEnsembleState((s) => ({
        tradeMode: s.soloist.tradeMode,
    }));

    const setTradeMode = (mode) => {
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'tradeMode', value: mode });
        saveCurrentState();
    };

    return (
        <div
            class="soloist-smart-controls"
            style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.25rem 0;"
        >
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
