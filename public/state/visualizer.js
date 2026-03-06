import { ACTIONS } from '../types.js';

/**
 * @typedef {Object} VisualizerState
 * @property {boolean} enabled - Whether the advanced visualizer is active.
 */
export const vizState = {
    enabled: false,
};

export function setVizParam(param, value) {
    switch (param) {
        case 'enabled':
            vizState.enabled = value;
            break;
        case 'theme':
            vizState.theme = value;
            break;
        case 'mode':
            vizState.mode = value;
            break;
        case 'fullscreen':
            vizState.fullscreen = value;
            break;
        case 'fps':
            vizState.fps = value;
            break;
        case 'showGrid':
            vizState.showGrid = value;
            break;
        case 'showNotes':
            vizState.showNotes = value;
            break;
        case 'showChords':
            vizState.showChords = value;
            break;
        default:
            console.warn(`[State] Unknown viz param: ${param}`);
            break;
    }
}

export function vizReducer(action, payload) {
    switch (action) {
        case ACTIONS.SET_VIZ_ENABLED:
            vizState.enabled = !!payload;
            return true;
        case ACTIONS.SET_PARAM:
            if (payload.module === 'vizState') {
                vizState[payload.param] = payload.value;
                return true;
            }
            break;
    }
    return false;
}
