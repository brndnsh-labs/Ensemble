import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { ButtonGroup } from './UIControls.jsx';

export function SoloistControls() {
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

export function SoloistSeedControl() {
    const { seed } = useEnsembleState((/** @type {import('../types.js').EnsembleState} */ s) => ({
        seed: s.soloist.seed,
    }));

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
        <div class="workspace-seed-control">
            <label class="workspace-seed-label" htmlFor="arrangerSoloistSeed">
                Soloist seed
            </label>
            <div class="workspace-seed-row">
                <input
                    id="arrangerSoloistSeed"
                    type="text"
                    value={seed || ''}
                    placeholder="Random"
                    class="seed-input"
                    aria-label="Soloist seed"
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
    );
}
