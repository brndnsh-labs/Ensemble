import { deepSignal } from 'deepsignal';
import { ACTIONS } from '../types.js';

export interface VisualizerState {
    /** Whether the advanced visualizer is active. */
    enabled: boolean;
}

export const vizState = deepSignal<VisualizerState>({
    enabled: false,
});

export function vizReducer(action: string, payload?: any): boolean {
    switch (action) {
        case ACTIONS.SET_PARAM:
            if (payload.module === 'viz' || payload.module === 'vizState') {
                (vizState as any)[payload.param] = payload.value;
                return true;
            }
            break;
    }
    return false;
}
