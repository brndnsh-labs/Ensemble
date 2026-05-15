import { deepSignal } from 'deepsignal';
import { ACTIONS } from '../types.js';

export interface ConductorState {
    /** Target intensity level for auto-intensity drift. */
    targetIntensity: number;
    /** Internal step size for auto-intensity. */
    stepSize: number;
    /** Structural analysis of the song arrangement. */
    form: object | null;
    /** Number of times the current section has looped. */
    loopCount: number;
    /** Number of times the entire song has looped. */
    formIteration: number;
}

export const conductor = deepSignal<ConductorState>({
    targetIntensity: 0.35,
    stepSize: 0.0005,
    form: null,
    loopCount: 0,
    formIteration: 0,
});

export function conductorReducer(action: string, payload?: any): boolean {
    switch (action) {
        case ACTIONS.UPDATE_CONDUCTOR_STATE:
            if (payload.targetIntensity !== undefined) {
                conductor.targetIntensity = payload.targetIntensity;
            }
            if (payload.stepSize !== undefined) {
                conductor.stepSize = payload.stepSize;
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
            conductor.loopCount = 0;
            conductor.formIteration = 0;
            return true;
    }
    return false;
}
