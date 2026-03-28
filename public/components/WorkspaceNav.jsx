import { debounceSaveState } from '../persistence.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

export const WORKSPACE_META = {
    arranger: {
        id: 'arranger',
        icon: '🎼',
        label: 'Arranger',
        description: '',
    },
    studio: {
        id: 'studio',
        icon: '🎛️',
        label: 'Studio',
        description: '',
    },
    perform: {
        id: 'perform',
        icon: '🎹',
        label: 'Perform',
        description: '',
    },
    visuals: {
        id: 'visuals',
        icon: '🌈',
        label: 'Visuals',
        description: 'Give the visualizer room to breathe.',
    },
};

/** @type {import('../state/ui.js').WorkspaceId[]} */
const WORKSPACE_ORDER = ['arranger', 'studio', 'perform', 'visuals'];

/**
 * @param {import('../state/ui.js').WorkspaceId} workspace
 */
export function switchWorkspace(workspace) {
    dispatch(ACTIONS.SET_PARAM, {
        module: 'ui',
        param: 'activeWorkspace',
        value: workspace,
    });
    debounceSaveState();
}

export function WorkspaceNav() {
    const { activeWorkspace, isPlaying } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            activeWorkspace: s.ui.activeWorkspace,
            isPlaying: s.playback.isPlaying,
        }),
    );

    return (
        <nav class="workspace-nav" aria-label="Workspace Navigation">
            <div class="workspace-nav-header">
                <div>
                    <h2 class="workspace-nav-title">{WORKSPACE_META[activeWorkspace].label}</h2>
                </div>
                {isPlaying && <span class="workspace-nav-live-pill">Live</span>}
            </div>

            <div class="workspace-nav-list" aria-label="Top-level workspaces">
                {WORKSPACE_ORDER.map((workspaceId) => {
                    const workspace = WORKSPACE_META[workspaceId];
                    const isActive = activeWorkspace === workspaceId;

                    return (
                        <button
                            key={workspace.id}
                            type="button"
                            class={`workspace-nav-btn ${isActive ? 'active' : ''}`}
                            data-workspace-nav={workspace.id}
                            aria-pressed={isActive}
                            onClick={() => switchWorkspace(workspaceId)}
                        >
                            <span class="workspace-nav-icon" aria-hidden="true">
                                {workspace.icon}
                            </span>
                            <span class="workspace-nav-label">{workspace.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
