import { deepSignal } from 'deepsignal';
import { ACTIONS } from '../types.js';

/**
 * @typedef {Object} VisualizerState
 * @property {boolean} enabled - Whether the advanced visualizer is active.
 */
/**
 * @type {import('deepsignal').DeepSignal<VisualizerState>}
 */
export const vizState = deepSignal({
    enabled: false,
});

/**
 * @param {string} action
 * @param {any} payload
 */
export function vizReducer(action, payload) {
    switch (action) {
        case ACTIONS.SET_PARAM:
            if (payload.module === 'viz' || payload.module === 'vizState') {
                /** @type {any} */ (vizState)[payload.param] = payload.value;
                return true;
            }
            break;
    }
    return false;
}
