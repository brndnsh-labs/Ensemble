import { deepSignal } from 'deepsignal';
import type { Action } from '../types.js';
import { ACTIONS } from '../types.js';

export interface VisualizerState {
    /** Whether the advanced visualizer is active. */
    enabled: boolean;
}

export const vizState = deepSignal<VisualizerState>({
    enabled: false,
});

export function vizReducer(action: Action): boolean {
    switch (action.type) {
        case ACTIONS.SET_PARAM:
            if (action.payload.module === 'viz' || action.payload.module === 'vizState') {
                (vizState as any)[action.payload.param] = action.payload.value;
                return true;
            }
            break;
    }
    return false;
}
