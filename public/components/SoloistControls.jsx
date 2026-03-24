import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { ButtonGroup } from './UIControls.jsx';

export function SoloistControls() {
    const { tradeMode, seed } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            tradeMode: s.soloist.tradeMode,
            seed: s.soloist.seed,
        }),
    );

    const updateTradeMode = (/** @type {any} */ mode) => {
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'tradeMode', value: mode });
        saveCurrentState();
    };

    const updateSeed = (/** @type {any} */ val) => {
        dispatch(ACTIONS.SET_SOLOIST_SEED, val);
        saveCurrentState();
    };

    const rollSeed = () => {
        const newSeed = Math.floor(Math.random() * 0xffffff)
            .toString(16)
            .padStart(6, '0')
            .toUpperCase();
        dispatch(ACTIONS.SET_SOLOIST_SEED, newSeed);
        saveCurrentState();
    };

    return (
        <div class="smart-tab-layout">
            {/* Thematic Seed Control */}
            <div class="flex-between smart-control-group--compact">
                <label class="smart-tab-label panel-title">Seed</label>
                <div class="flex-row">
                    <input
                        type="text"
                        value={seed || ''}
                        placeholder="Random"
                        class="seed-input"
                        aria-label="Seed"
                        onInput={(/** @type {any} */ e) => updateSeed(e.target.value)}
                    />
                    <button
                        class="icon-btn"
                        title="Generate Random Seed"
                        aria-label="Generate Random Seed"
                        onClick={rollSeed}
                    >
                        🎲
                    </button>
                </div>
            </div>

            {/* Trading Controls */}
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
