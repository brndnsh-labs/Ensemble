import { h } from 'preact';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { ButtonGroup } from './UIControls.jsx';

export function SoloistSmartTab() {
    const { tradeMode } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            tradeMode: s.soloist.tradeMode,
        }),
    );

    const updateTradeMode = (/** @type {any} */ mode) => {
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'tradeMode', value: mode });
        saveCurrentState();
    };

    return (
        <div class="smart-tab-layout">
            <div class="flex-between" style="padding: 0.25rem 0.25rem;">
                <label class="smart-tab-label" style="margin: 0;">
                    Trading
                </label>
                <ButtonGroup
                    value={tradeMode}
                    onChange={updateTradeMode}
                    options={[
                        { value: 'manual', label: 'Manual' },
                        { value: 'sections', label: 'Sections' },
                        { value: 'loops', label: 'Loops' },
                    ]}
                />
            </div>
        </div>
    );
}
