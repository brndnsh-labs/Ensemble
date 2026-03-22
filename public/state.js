import { MODULES } from './constants.js';
import { arranger, arrangerReducer } from './state/arranger.js';
import { conductor, conductorReducer } from './state/conductor.js';
import { groove, grooveReducer } from './state/groove.js';
import { bass, chords, harmony, instrumentReducer, soloist } from './state/instruments.js';
import { midi, midiReducer } from './state/midi.js';
// Import Modular State Slices
import { playback, playbackReducer } from './state/playback.js';
import { vizReducer, vizState } from './state/visualizer.js';
import { ACTIONS } from './types.js';

// --- Global Export for E2E ---
if (typeof window !== 'undefined') {
    import('./engine/chords-engine.js').then(({ validateProgression }) => {
        /** @type {any} */ (window).ensemble = {
            dispatch,
            getState,
            ACTIONS,
            validateProgression,
        };
    });
}

// Central State Map for Generic PARAM Updates
/**
 * @typedef {import('./types.js').EnsembleState} StateMap
 */

/**
 * @type {StateMap}
 */
export const stateMap = {
    playback,
    chords,
    bass,
    soloist,
    groove,
    harmony,
    arranger,
    vizState,
    midi,
    conductor,
};

/**
 * Unified getter for global state.
 * Use this instead of importing individual state slices to ensure
 * easier refactoring and better type safety in the future.
 * @returns {import('./types.js').EnsembleState}
 */
export function getState() {
    return stateMap;
}

// Export individual state slices for dynamic imports
export {
    arranger,
    arrangerReducer,
    bass,
    chords,
    conductor,
    conductorReducer,
    groove,
    grooveReducer,
    harmony,
    instrumentReducer,
    midi,
    midiReducer,
    playback,
    playbackReducer,
    soloist,
    vizReducer,
    vizState,
};

// Persistence Helpers
export const storage = {
    /**
     * @param {string} key
     * @returns {any}
     */
    get: (key) => {
        if (typeof localStorage === 'undefined' || !localStorage?.getItem) {
            return [];
        }
        try {
            return JSON.parse(localStorage.getItem(`ensemble_${key}`) || '[]');
        } catch (e) {
            console.error(`[State] Failed to load ${key} from storage:`, e);
            return [];
        }
    },
    /**
     * @param {string} key
     * @param {any} val
     */
    save: (key, val) => {
        if (typeof localStorage === 'undefined' || !localStorage?.setItem) {
            return;
        }
        try {
            localStorage.setItem(`ensemble_${key}`, JSON.stringify(val));
        } catch (e) {
            console.warn(`[State] Failed to save ${key} to storage:`, e);
        }
    },
};

// --- Event Bus / State Manager ---

/** @type {Set<Function>} */
const listeners = new Set();

/**
 * Dispatch a state change action.
 * @template {keyof import('./types.js').ActionPayloadMap | string} T
 * @param {T} action - The action type (e.g., ACTIONS.SET_BAND_INTENSITY).
 * @param {T extends keyof import('./types.js').ActionPayloadMap ? import('./types.js').ActionPayloadMap[T] : any} [payload] - The data associated with the action.
 */
export function dispatch(action, payload) {
    // Accessing deepSignal property directly works like a getter
    const oldBpm = playback.bpm;

    // Delegate to Reducers
    playbackReducer(action, payload);
    arrangerReducer(action, payload);
    conductorReducer(action, payload);
    instrumentReducer(action, payload);
    grooveReducer(action, payload, playback);
    midiReducer(action, payload);
    vizReducer(action, payload);

    // Notify listeners
    listeners.forEach((listener) => listener(action, payload, stateMap, { oldBpm, dispatch }));
}

/**
 * Subscribe to state changes.
 * @param {Function} listener - Callback function receiving (action, payload, state).
 * @returns {Function} Unsubscribe function.
 */
export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
