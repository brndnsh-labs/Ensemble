import { ACTIONS } from './types.js';

// Import Modular State Slices
import { playback, playbackReducer } from './state/playback.js';
import { arranger, arrangerReducer } from './state/arranger.js';
import { chords, bass, soloist, harmony, instrumentReducer } from './state/instruments.js';
import { groove, grooveReducer } from './state/groove.js';
import { midi, midiReducer } from './state/midi.js';
import { vizState, vizReducer } from './state/visualizer.js';

// Central State Map for Generic PARAM Updates
const stateMap = { 
    playback,
    chords,
    bass,
    soloist,
    groove,
    harmony,
    arranger,
    vizState,
    midi 
};

/**
 * Unified getter for global state.
 * Use this instead of importing individual state slices to ensure
 * easier refactoring and better type safety in the future.
 * @returns {typeof stateMap}
 */
export function getState() {
    return stateMap;
}

// Export individual state slices for dynamic imports
export {
    playback,
    arranger,
    chords,
    bass,
    soloist,
    harmony,
    groove,
    midi,
    vizState
};

// Persistence Helpers
export const storage = {
    get: (key) => {
        if (typeof localStorage === 'undefined') return [];
        try {
            return JSON.parse(localStorage.getItem(`ensemble_${key}`) || '[]');
        } catch (e) {
            console.error(`[State] Failed to load ${key} from storage:`, e);
            return [];
        }
    },
    save: (key, val) => {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(`ensemble_${key}`, JSON.stringify(val));
    }
};

// --- Event Bus / State Manager ---

const listeners = new Set();

/**
 * Dispatch a state change action.
 * @param {string} action - The action type (e.g., ACTIONS.SET_INTENSITY).
 * @param {*} [payload] - The data associated with the action.
 */
export function dispatch(action, payload) {
    let handled = false;
    const oldBpm = playback.bpm;

    // 1. Generic Param Handling (Legacy/Dynamic)
    if (action === ACTIONS.SET_PARAM) {
        if (stateMap[payload.module]) {
            stateMap[payload.module][payload.param] = payload.value;
            handled = true;
        }
    }

    // 2. Delegate to Reducers
    if (!handled) {
        if (playbackReducer(action, payload)) handled = true;
        if (arrangerReducer(action, payload)) handled = true;
        if (instrumentReducer(action, payload)) handled = true;
        if (grooveReducer(action, payload, playback)) handled = true;
        if (midiReducer(action, payload)) handled = true;
        if (vizReducer(action, payload)) handled = true;
    }

    // Notify listeners
    listeners.forEach(listener => listener(action, payload, stateMap));

    // 3. Side Effects (Middleware)
    handleEffects(action, payload, { oldBpm });
}

/**
 * Handle side effects for specific actions.
 */
async function handleEffects(action, payload, context = {}) {
    switch (action) {
        case ACTIONS.TOGGLE_PLAY: {
            const { togglePlay } = await import('./scheduler-core.js');
            togglePlay(payload?.viz, true); 
            break;
        }
        case ACTIONS.SET_BPM: {
            const { setBpm } = await import('./app-controller.js');
            setBpm(payload, payload?.viz, true, context.oldBpm);
            break;
        }
    }
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