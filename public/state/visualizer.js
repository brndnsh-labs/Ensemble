import { deepSignal } from 'deepsignal';
import { ACTIONS } from '../types.js';

/**
 * @typedef {Object} VisualizerState
 * @property {boolean} enabled - Whether the advanced visualizer is active.
 * @property {boolean} isMaximized - Whether the chord visualizer is maximized.
 */
/**
 * @type {import('deepsignal').DeepSignal<VisualizerState>}
 */
export const vizState = deepSignal({
    enabled: false,
    isMaximized: false,
});

/**
 * @param {string} action
 * @param {any} payload
 */
export function vizReducer(action, payload) {
    switch (action) {
        case ACTIONS.SET_VIZ_ENABLED:
            vizState.enabled = !!payload;
            return true;
        case ACTIONS.TOGGLE_MAXIMIZED_CHORDS:
            vizState.isMaximized = payload !== undefined ? !!payload : !vizState.isMaximized;
            return true;
        case ACTIONS.SET_PARAM:
            if (payload.module === 'viz' || payload.module === 'vizState') {
                /** @type {any} */ (vizState)[payload.param] = payload.value;
                return true;
            }
            break;
    }
    return false;
}
