import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';

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
 * @property {string} description
 * @property {string} actionLabel
 * @property {string} icon
 * @property {() => void} onClick
 * @property {string} accentClass
 */

/**
 * @param {LaunchCardProps} props
 */
function LaunchCard({ title, description, actionLabel, icon, onClick, accentClass }) {
    return (
        <div class={`workspace-launch-card ${accentClass}`}>
            <div class="workspace-launch-card-header">
                <span class="workspace-launch-icon" aria-hidden="true">
                    {icon}
                </span>
                <h3 class="workspace-launch-title">{title}</h3>
            </div>
            <p class="workspace-launch-copy">{description}</p>
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
    return (
        <section class="workspace-view workspace-view--perform" data-workspace="perform">
            <div class="workspace-grid workspace-grid--perform">
                <div class="panel dashboard-panel workspace-panel workspace-panel--hero">
                    <div class="panel-header">
                        <div>
                            <p class="workspace-kicker">Live tools</p>
                            <h2 class="panel-title">Perform</h2>
                            <p class="workspace-launch-copy">
                                Open a focused live surface and keep the rest of the workspace out
                                of the way.
                            </p>
                        </div>
                    </div>

                    <div class="workspace-launch-grid">
                        <LaunchCard
                            title="Soloist Performance"
                            description="Open the expressive solo ribbon surface for mobile-friendly live phrasing."
                            actionLabel="Open Performance Mode"
                            icon="🎺"
                            accentClass="workspace-launch-card--soloist"
                            onClick={() => launchPerformanceModal('performance')}
                        />
                        <LaunchCard
                            title="Groove Drum Pad"
                            description="Launch the touch drum pad for manual groove accents, fills, and performance hits."
                            actionLabel="Open Drum Pad"
                            icon="🥁"
                            accentClass="workspace-launch-card--groove"
                            onClick={() => launchPerformanceModal('drumPad')}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
