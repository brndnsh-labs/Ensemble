import { deepSignal } from 'deepsignal';
import { ACTIONS } from '../types.js';

/**
 * @typedef {Object} ConductorState
 * @property {number} targetIntensity - Target intensity level for auto-intensity drift.
 * @property {number} stepSize - Internal step size for auto-intensity.
 * @property {number} larsBpmOffset - Current BPM offset applied by Lars Mode tempo drift.
 * @property {Object|null} form - Structural analysis of the song arrangement.
 * @property {number} loopCount - Number of times the current section has looped.
 * @property {number} formIteration - Number of times the entire song has looped.
 */
/**
 * @type {import('deepsignal').DeepSignal<ConductorState>}
 */
export const conductor = deepSignal({
    targetIntensity: 0.35,
    stepSize: 0.0005,
    larsBpmOffset: 0,
    form: null,
    loopCount: 0,
    formIteration: 0,
});

/**
 * @param {string} action
 * @param {any} payload
 */
export function conductorReducer(action, payload) {
    switch (action) {
        case ACTIONS.UPDATE_CONDUCTOR_STATE:
            if (payload.targetIntensity !== undefined) {
                conductor.targetIntensity = payload.targetIntensity;
            }
            if (payload.stepSize !== undefined) {
                conductor.stepSize = payload.stepSize;
            }
            if (payload.larsBpmOffset !== undefined) {
                conductor.larsBpmOffset = payload.larsBpmOffset;
            }
            if (payload.form !== undefined) {
                conductor.form = payload.form;
            }
            if (payload.loopCount !== undefined) {
                conductor.loopCount = payload.loopCount;
            }
            if (payload.formIteration !== undefined) {
                conductor.formIteration = payload.formIteration;
            }
            return true;
        case ACTIONS.RESET_STATE:
            conductor.targetIntensity = 0.35;
            conductor.stepSize = 0.0005;
            conductor.larsBpmOffset = 0;
            conductor.loopCount = 0;
            conductor.formIteration = 0;
            return true;
    }
    return false;
}
