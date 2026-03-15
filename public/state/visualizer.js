import { ACTIONS } from '../types.js';

/**
 * @typedef {Object} VisualizerState
 * @property {boolean} enabled - Whether the advanced visualizer is active.
 */
export const vizState = {
    enabled: false,
};

export function vizReducer(action, payload) {
    switch (action) {
        case ACTIONS.SET_VIZ_ENABLED:
            vizState.enabled = !!payload;
            return true;
        case ACTIONS.SET_PARAM:
            if (payload.module === 'viz' || payload.module === 'vizState') {
                vizState[payload.param] = payload.value;
                return true;
            }
            break;
    }
    return false;
}
