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
        // stickiest survivor of the corrupt-payload fallback: it is written very early
        // in `hydrateSavedState()`, so it survives every plausible throw point, and the
        // next `saveCurrentState()` writes it straight back out. A garbage-truthy value
        // therefore outlived the very reload meant to clear it, while making the
        // scheduler emit visualizer events on every step.
        case ACTIONS.RESET_STATE:
            v.enabled = false;
            return true;
    }
    return false;
}
