import { deepSignal } from 'deepsignal';
import type { Action, Mutable, VisualizerState } from '../types.js';
import { ACTIONS } from '../types.js';

export type { VisualizerState };

export const vizState = deepSignal<VisualizerState>({
    enabled: false,
});

export function vizReducer(action: Action): boolean {
    const v = vizState as Mutable<typeof vizState>;
    switch (action.type) {
        case ACTIONS.SET_PARAM:
            if (action.payload.module === 'vizState') {
                (vizState as any)[action.payload.param] = action.payload.value;
                return true;
            }
            break;
        // #1259 — this slice had no RESET_STATE case at all, which made `enabled` the
        // stickiest survivor of v1's corrupt-payload fallback (a reader deleted in #1424).
        case ACTIONS.RESET_STATE:
            v.enabled = false;
            return true;
    }
    return false;
}
