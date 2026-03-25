import { deepSignal } from 'deepsignal';
import { ACTIONS } from '../types.js';

/**
 * @typedef {'arranger' | 'studio' | 'perform' | 'visuals'} WorkspaceId
 */

/**
 * @typedef {Object} UiState
 * @property {WorkspaceId} activeWorkspace - Currently active top-level workspace.
 */

export const WORKSPACES = /** @type {const} */ (['arranger', 'studio', 'perform', 'visuals']);

export const DEFAULT_WORKSPACE = 'arranger';

/**
 * @param {unknown} value
 * @returns {WorkspaceId}
 */
export function normalizeWorkspace(value) {
    if (typeof value === 'string' && WORKSPACES.includes(/** @type {WorkspaceId} */ (value))) {
        return /** @type {WorkspaceId} */ (value);
    }
    return DEFAULT_WORKSPACE;
}

/**
 * @type {import('deepsignal').DeepSignal<UiState>}
 */
export const ui = deepSignal({
    activeWorkspace: DEFAULT_WORKSPACE,
});

/**
 * @param {string} action
 * @param {any} payload
 */
export function uiReducer(action, payload) {
    switch (action) {
        case ACTIONS.SET_PARAM:
            if (payload.module === 'ui') {
                if (payload.param === 'activeWorkspace') {
                    ui.activeWorkspace = normalizeWorkspace(payload.value);
                    return true;
                }
                return false;
            }
            break;
        case ACTIONS.RESET_STATE:
            ui.activeWorkspace = DEFAULT_WORKSPACE;
            return true;
    }
    return false;
}
