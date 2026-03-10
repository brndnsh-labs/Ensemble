import { h } from 'preact';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { ButtonGroup } from './UIControls.jsx';

export function SoloistSmartTab() {
    const { phraseContext, tradeMode, isResting, isWaitingForEntry } = useEnsembleState((s) => ({
        phraseContext: s.soloist.phraseContext,
        tradeMode: s.soloist.tradeMode,
        isResting: s.soloist.isResting,
        isWaitingForEntry: s.soloist.isWaitingForEntry,
    }));

    const updateTradeMode = (mode) => {
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'tradeMode', value: mode });
        saveCurrentState();
    };

    if (!phraseContext) {
        return (
            <div class="smart-tab-empty">
                <p>Play to see soloist intelligence...</p>
            </div>
        );
    }

    // Determine Status Text
    let statusText = isResting ? 'Resting' : 'Playing';
    let statusColor = isResting ? 'var(--text-muted)' : 'var(--soloist-color)';

    if (isWaitingForEntry) {
        statusText = `Waiting for ${tradeMode === 'sections' ? 'Section' : 'Loop'}`;
        statusColor = 'var(--accent-color)';
    }

    return (
        <div class="smart-tab-layout">
            <div
                class="smart-status"
                style="padding: 0.5rem; background: rgba(var(--soloist-color-rgb), 0.05); border-radius: 8px; border: 1px dashed rgba(var(--soloist-color-rgb), 0.2); text-align: center; margin-bottom: 0.75rem;"
            >
                <p style="font-size: 0.8rem; margin: 0;">
                    ✨ <strong>Smart Phrasing</strong>:{' '}
                    <span style={{ color: statusColor, fontWeight: 'bold' }}>{statusText}</span>
                </p>
            </div>

            <div class="flex-between" style="padding: 0 0.25rem;">
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
