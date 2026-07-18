import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { ButtonGroup } from './UIControls.jsx';

export function SoloistControls() {
    const { tradeMode } = useEnsembleState((s) => ({
        tradeMode: s.soloist.tradeMode,
    }));

    const updateTradeMode = (mode: string | number) => {
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'tradeMode', value: mode });
    };

    return (
        <div class="smart-tab-layout">
            <div class="flex-between">
                <label class="smart-tab-label panel-title">Trading</label>
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
