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
            <div class="flex-between" style="padding: 0.25rem 0.25rem; margin-bottom: 0.5rem;">
                <label class="smart-tab-label" style="margin: 0;">
                    Seed
                </label>
                <div class="flex-row">
                    <input
                        type="text"
                        value={seed || ''}
                        placeholder="Random"
                        class="seed-input"
                        aria-label="Seed"
                        style={{
                            width: '80px',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            textTransform: 'uppercase',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface-sunken)',
                            color: 'var(--text-primary)',
                        }}
                        onInput={(/** @type {any} */ e) => updateSeed(e.target.value)}
                    />
                    <button
                        class="icon-btn"
                        title="Generate Random Seed"
                        aria-label="Generate Random Seed"
                        onClick={rollSeed}
                        style={{ fontSize: '0.9rem', padding: '2px 4px' }}
                    >
                        🎲
                    </button>
                </div>
            </div>

            {/* Trading Controls */}
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
