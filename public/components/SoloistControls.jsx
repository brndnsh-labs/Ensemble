import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { ButtonGroup } from './UIControls.jsx';

export function SoloistControls() {
    const { tradeMode, seed, timbreX, timbreY } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            tradeMode: s.soloist.tradeMode,
            seed: s.soloist.seed,
            timbreX: s.soloist.timbreX,
            timbreY: s.soloist.timbreY,
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

    /**
     * @param {number} clientX
     * @param {number} clientY
     * @param {Element} pad
     */
    const calculateTimbre = (clientX, clientY, pad) => {
        const rect = pad.getBoundingClientRect();
        let x = (clientX - rect.left) / rect.width;
        // Invert Y so up is 1.0 (more open filter) and down is 0.0 (closed filter)
        let y = 1.0 - (clientY - rect.top) / rect.height;

        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));

        dispatch(ACTIONS.SET_SOLOIST_TIMBRE, { x, y });
    };

    /**
     * @param {PointerEvent} e
     */
    const handlePointerDown = (e) => {
        const pad = /** @type {HTMLElement} */ (e.currentTarget);
        pad.setPointerCapture(e.pointerId);
        calculateTimbre(e.clientX, e.clientY, pad);

        /**
         * @param {PointerEvent} moveEvent
         */
        const handlePointerMove = (moveEvent) => {
            calculateTimbre(moveEvent.clientX, moveEvent.clientY, pad);
        };

        /**
         * @param {PointerEvent} _upEvent
         */
        const handlePointerUp = (_upEvent) => {
            pad.releasePointerCapture(e.pointerId);
            pad.removeEventListener('pointermove', handlePointerMove);
            pad.removeEventListener('pointerup', handlePointerUp);
            saveCurrentState();
        };

        pad.addEventListener('pointermove', handlePointerMove);
        pad.addEventListener('pointerup', handlePointerUp);
    };

    // Calculate visual puck position (re-invert Y for rendering top-down)
    const puckX = `${(timbreX || 0) * 100}%`;
    const puckY = `${(1.0 - (timbreY || 0)) * 100}%`;

    return (
        <div class="smart-tab-layout">
            <div class="flex-between" style={{ padding: '0.25rem', marginBottom: '0.5rem' }}>
                <label class="smart-tab-label" style={{ margin: 0 }}>
                    Vector Synth (Timbre)
                </label>
                <div
                    class="xy-pad"
                    onPointerDown={handlePointerDown}
                    style={{
                        width: '100px',
                        height: '100px',
                        backgroundColor: 'var(--surface-sunken)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        position: 'relative',
                        touchAction: 'none',
                        cursor: 'crosshair',
                    }}
                    aria-label="Timbre XY Pad"
                    role="application"
                >
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: '50%',
                            bottom: 0,
                            borderLeft: '1px dashed var(--border)',
                            opacity: 0.5,
                            pointerEvents: 'none',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: '50%',
                            right: 0,
                            borderTop: '1px dashed var(--border)',
                            opacity: 0.5,
                            pointerEvents: 'none',
                        }}
                    />
                    <div
                        class="puck"
                        style={{
                            width: '16px',
                            height: '16px',
                            backgroundColor: 'var(--accent)',
                            borderRadius: '50%',
                            position: 'absolute',
                            left: puckX,
                            top: puckY,
                            transform: 'translate(-50%, -50%)',
                            pointerEvents: 'none',
                            boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                        }}
                    />
                </div>
            </div>

            {/* Quick Presets */}
            <div class="flex-between" style={{ padding: '0.25rem', marginBottom: '0.5rem' }}>
                <label class="smart-tab-label" style={{ margin: 0 }}>
                    Presets
                </label>
                <div class="flex-row">
                    <button
                        class="chip-btn"
                        onClick={() => dispatch(ACTIONS.SET_SOLOIST_TIMBRE, { x: 0, y: 0 })}
                    >
                        Trumpet
                    </button>
                    <button
                        class="chip-btn"
                        onClick={() => dispatch(ACTIONS.SET_SOLOIST_TIMBRE, { x: 1, y: 0 })}
                    >
                        Sax
                    </button>
                    <button
                        class="chip-btn"
                        onClick={() => dispatch(ACTIONS.SET_SOLOIST_TIMBRE, { x: 0, y: 1 })}
                    >
                        Neo
                    </button>
                    <button
                        class="chip-btn"
                        onClick={() => dispatch(ACTIONS.SET_SOLOIST_TIMBRE, { x: 1, y: 1 })}
                    >
                        Shred
                    </button>
                </div>
            </div>

            {/* Thematic Seed Control */}
            <div class="flex-between" style={{ padding: '0.25rem', marginBottom: '0.5rem' }}>
                <label class="smart-tab-label" style={{ margin: 0 }}>
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
            <div class="flex-between" style={{ padding: '0.25rem' }}>
                <label class="smart-tab-label" style={{ margin: 0 }}>
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
