import { h } from 'preact';
import { saveCurrentState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

export function SoloistSmartTab() {
    const { phraseContext, lastRenderedFreq } = useEnsembleState((s) => ({
        phraseContext: s.soloist.phraseContext,
        lastRenderedFreq: s.soloist.lastRenderedFreq,
    }));

    if (!phraseContext) {
        return (
            <div class="smart-tab-empty">
                <p>Play to see soloist intelligence...</p>
            </div>
        );
    }

    return (
        <div class="smart-tab-layout">
            <div class="smart-tab-header">
                <label class="smart-tab-label">Current Phrase</label>
                <span class="text-mini-muted">
                    {lastRenderedFreq ? `${Math.round(lastRenderedFreq)}Hz` : '--'}
                </span>
            </div>

            <div class="smart-tab-grid">
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
        </div>
    );
}
