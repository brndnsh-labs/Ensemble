import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

/**
 * @param {'performance' | 'drumPad'} modal
 */
function launchPerformanceModal(modal) {
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
    dispatch(ACTIONS.INIT_AUDIO);
    setTimeout(() => {
        dispatch(ACTIONS.SET_MODAL_OPEN, {
            modal,
            open: true,
        });
    }, 0);
}

/**
 * @typedef {Object} LaunchCardProps
 * @property {string} title
 * @property {string} actionLabel
 * @property {() => void} onClick
 * @property {string} accentClass
 */

/**
 * @param {LaunchCardProps} props
 */
function LaunchCard({ title, actionLabel, onClick, accentClass }) {
    return (
        <div class={`workspace-launch-card ${accentClass}`}>
            <h3 class="workspace-launch-title">{title}</h3>
            <button
                type="button"
                class="primary-btn workspace-launch-btn"
                aria-label={actionLabel}
                onClick={onClick}
            >
                {actionLabel}
            </button>
        </div>
    );
}

export function PerformWorkspace() {
    const { isPlaying, soloistEnabled, tradeMode, grooveEnabled, performanceOpen, drumPadOpen } =
        useEnsembleState((/** @type {import('../types.js').EnsembleState} */ s) => ({
            isPlaying: s.playback.isPlaying,
            soloistEnabled: s.soloist.enabled,
            tradeMode: s.soloist.tradeMode,
            grooveEnabled: s.groove.enabled,
            performanceOpen: s.playback.modals.performance,
            drumPadOpen: s.playback.modals.drumPad,
        }));

    return (
        <section class="workspace-view workspace-view--perform" data-workspace="perform">
            <div class="workspace-grid workspace-grid--perform">
                <div class="panel dashboard-panel workspace-panel workspace-panel--hero">
                    <div class="panel-header">
                        <div>
                            <p class="workspace-kicker">Live tools</p>
                            <h2 class="panel-title">Perform</h2>
                        </div>
                    </div>

                    <div class="workspace-launch-grid">
                        <LaunchCard
                            title="Soloist Performance"
                            actionLabel="Open Performance Mode"
                            accentClass="workspace-launch-card--soloist"
                            onClick={() => launchPerformanceModal('performance')}
                        />
                        <LaunchCard
                            title="Groove Drum Pad"
                            actionLabel="Open Drum Pad"
                            accentClass="workspace-launch-card--groove"
                            onClick={() => launchPerformanceModal('drumPad')}
                        />
                    </div>
                </div>

                <div class="panel dashboard-panel workspace-panel">
                    <div class="panel-header">
                        <div>
                            <p class="workspace-kicker">Readiness</p>
                            <h2 class="panel-title">Session status</h2>
                        </div>
                    </div>
                    <div class="workspace-status-grid">
                        <div class="workspace-status-item">
                            <span class="workspace-stat-label">Transport</span>
                            <strong class="workspace-stat-value">
                                {isPlaying ? 'Playing' : 'Stopped'}
                            </strong>
                        </div>
                        <div class="workspace-status-item">
                            <span class="workspace-stat-label">Soloist</span>
                            <strong class="workspace-stat-value">
                                {soloistEnabled ? 'Armed' : `Waiting (${tradeMode})`}
                            </strong>
                        </div>
                        <div class="workspace-status-item">
                            <span class="workspace-stat-label">Grooves</span>
                            <strong class="workspace-stat-value">
                                {grooveEnabled ? 'Active' : 'Muted'}
                            </strong>
                        </div>
                        <div class="workspace-status-item">
                            <span class="workspace-stat-label">Modal state</span>
                            <strong class="workspace-stat-value">
                                {performanceOpen
                                    ? 'Solo surface open'
                                    : drumPadOpen
                                      ? 'Drum pad open'
                                      : 'Ready'}
                            </strong>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
