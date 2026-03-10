import { h } from 'preact';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { ButtonGroup, SettingRow } from './UIControls.jsx';

export function SoloistSmartTab() {
    const { phraseContext, lastRenderedFreq, tradeMode, isResting, isWaitingForEntry } =
        useEnsembleState((s) => ({
            phraseContext: s.soloist.phraseContext,
            lastRenderedFreq: s.soloist.lastRenderedFreq,
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
            <div class="smart-tab-header">
                <label class="smart-tab-label">Soloist Intelligence</label>
                <span class="text-mini-muted" style={{ color: statusColor, fontWeight: 'bold' }}>
                    {statusText}
                </span>
            </div>

            <div class="smart-tab-grid" style="margin-bottom: 1rem;">
                <div class="form-control-compact">
                    <label>Profile</label>
                    <span class="text-capitalize">{phraseContext.profile || 'none'}</span>
                </div>
                <div class="form-control-compact">
                    <label>Intensity</label>
                    <span>{Math.round(phraseContext.intensity * 100)}%</span>
                </div>
                <div class="form-control-compact">
                    <label>Device</label>
                    <span class="text-capitalize">{phraseContext.device || 'none'}</span>
                </div>
            </div>

            <SettingRow
                label="Trading"
                description="Auto-enable soloist during specific structural events."
            >
                <ButtonGroup
                    value={tradeMode}
                    onChange={updateTradeMode}
                    options={[
                        { value: 'manual', label: 'Manual' },
                        { value: 'sections', label: 'Sections' },
                        { value: 'loops', label: 'Loops' },
                    ]}
                />
            </SettingRow>
        </div>
    );
}
