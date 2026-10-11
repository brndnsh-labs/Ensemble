import { arranger, arrangerReducer } from './state/arranger.js';
import { groove, grooveReducer } from './state/groove.js';
import { bass, chords, instrumentReducer, soloist } from './state/instruments.js';
// Import Modular State Slices
import { playback, playbackReducer } from './state/playback.js';
import type { Action, ActionPayloadMap, Dispatch, EnsembleState } from './types.js';

export const stateMap: EnsembleState = {
    playback,
    chords,
    bass,
    soloist,
    groove,
    arranger,
};

/**
 * Unified getter for global state.
 * Use this instead of importing individual state slices to ensure
 * easier refactoring and better type safety in the future.
 */
export function getState(): EnsembleState {
    return stateMap;
}

// --- Event Bus / State Manager ---

type StateListener = (
    action: Action,
    state: EnsembleState,
    meta: { dispatch: typeof dispatch },
) => void;

const listeners = new Set<StateListener>();

export const dispatch: Dispatch = (action, ...args) => {
    const payload = args[0] as ActionPayloadMap[typeof action];

    // Bundle into a discriminated Action; reducers switch on action.type.
    const a = { type: action, payload } as Action;

    // Delegate to Reducers
    playbackReducer(a);
    arrangerReducer(a);
    instrumentReducer(a);
    grooveReducer(a, playback);

    // Notify listeners with the same discriminated Action reducers already switch on.
    listeners.forEach((listener) => listener(a, stateMap, { dispatch }));
};

/**
 * Subscribe to state changes.
 * @returns Unsubscribe function.
 */
export function subscribe(listener: StateListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
