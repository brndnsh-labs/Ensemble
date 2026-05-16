import { deepSignal } from 'deepsignal';
import type { Action } from '../types.js';
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

export function conductorReducer(action: Action): boolean {
    switch (action.type) {
        case ACTIONS.UPDATE_CONDUCTOR_STATE:
            if (action.payload.targetIntensity !== undefined) {
                conductor.targetIntensity = action.payload.targetIntensity;
            }
            if (action.payload.stepSize !== undefined) {
                conductor.stepSize = action.payload.stepSize;
            }
            if (action.payload.form !== undefined) {
                conductor.form = action.payload.form;
            }
            if (action.payload.loopCount !== undefined) {
                conductor.loopCount = action.payload.loopCount;
            }
            if (action.payload.formIteration !== undefined) {
                conductor.formIteration = action.payload.formIteration;
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
