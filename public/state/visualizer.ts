import { deepSignal } from 'deepsignal';
import type { Action, VisualizerState } from '../types.js';
import { ACTIONS } from '../types.js';

export type { VisualizerState };

export const vizState = deepSignal<VisualizerState>({
    enabled: false,
});

export function vizReducer(action: Action): boolean {
    switch (action.type) {
        case ACTIONS.SET_PARAM:
            if (action.payload.module === 'vizState') {
                (vizState as any)[action.payload.param] = action.payload.value;
                return true;
            }
            break;
    }
    return false;
}
