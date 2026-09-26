import { deepSignal } from 'deepsignal';
import type { Action, ConductorState, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';

export type { ConductorState };

export const conductor = deepSignal<ConductorState>({
    targetIntensity: 0.35,
    stepSize: 0.0005,
    form: null,
    formIteration: 0,
});

export function conductorReducer(action: Action): boolean {
    const c = conductor as Mutable<typeof conductor>;
    switch (action.type) {
        case ACTIONS.RESET_STATE:
            c.targetIntensity = 0.35;
            c.stepSize = 0.0005;
            c.formIteration = 0;
            return true;
    }
    return false;
}
