import { deepSignal } from 'deepsignal';
import type { Action, ConductorState, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';

export type { ConductorState };

export const conductor = deepSignal<ConductorState>({
    targetIntensity: 0.35,
    stepSize: 0.0005,
    form: null,
    loopCount: 0,
    formIteration: 0,
});

export function conductorReducer(action: Action): boolean {
    const c = conductor as Mutable<typeof conductor>;
    switch (action.type) {
        case ACTIONS.UPDATE_CONDUCTOR_STATE:
            if (action.payload.targetIntensity !== undefined) {
                c.targetIntensity = action.payload.targetIntensity;
            }
            if (action.payload.stepSize !== undefined) {
                c.stepSize = action.payload.stepSize;
            }
            if (action.payload.form !== undefined) {
                c.form = action.payload.form;
            }
            if (action.payload.loopCount !== undefined) {
                c.loopCount = action.payload.loopCount;
            }
            if (action.payload.formIteration !== undefined) {
                c.formIteration = action.payload.formIteration;
            }
            return true;
        case ACTIONS.RESET_STATE:
            c.targetIntensity = 0.35;
            c.stepSize = 0.0005;
            c.loopCount = 0;
            c.formIteration = 0;
            return true;
    }
    return false;
}
