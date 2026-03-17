import { ACTIONS } from '../types.js';

/**
 * @typedef {Object} ConductorState
 * @property {number} targetIntensity - Target intensity level for auto-intensity drift.
 * @property {number} larsBpmOffset - Current BPM offset applied by Lars Mode tempo drift.
 * @property {Object|null} form - Structural analysis of the song arrangement.
 * @property {number} loopCount - Number of times the current section has looped.
 * @property {number} formIteration - Number of times the entire song has looped.
 */
export const conductor = {
    targetIntensity: 0.35,
    stepSize: 0.0005,
    larsBpmOffset: 0,
    form: null,
    loopCount: 0,
    formIteration: 0,
};

export function conductorReducer(action, payload) {
    switch (action) {
        case ACTIONS.UPDATE_CONDUCTOR_STATE:
            Object.assign(conductor, payload);
            return true;
        case ACTIONS.RESET_STATE:
            Object.assign(conductor, {
                targetIntensity: 0.35,
                stepSize: 0.0005,
                larsBpmOffset: 0,
                loopCount: 0,
                formIteration: 0,
            });
            return true;
    }
    return false;
}
