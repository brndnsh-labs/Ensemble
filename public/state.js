import { MODULES } from './constants.js';
import { arranger, arrangerReducer, setArrangerParam } from './state/arranger.js';
import { groove, grooveReducer, setGrooveParam } from './state/groove.js';
import {
    bass,
    chords,
    harmony,
    instrumentReducer,
    setBassParam,
    setChordsParam,
    setHarmonyParam,
    setSoloistParam,
    soloist,
} from './state/instruments.js';
import { midi, midiReducer, setMidiParam } from './state/midi.js';
// Import Modular State Slices
import { playback, playbackReducer, setPlaybackParam } from './state/playback.js';
import { setVizParam, vizReducer, vizState } from './state/visualizer.js';
import { ACTIONS } from './types.js';

// --- Global Export for E2E ---
if (typeof window !== 'undefined') {
    import('./chords.js').then(({ validateProgression }) => {
        window.ensemble = {
            dispatch,
            getState,
            ACTIONS,
            validateProgression,
        };
    });
}

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
    midi,
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
    vizState,
    playbackReducer,
    arrangerReducer,
    instrumentReducer,
    grooveReducer,
    midiReducer,
    vizReducer,
};

// Persistence Helpers
export const storage = {
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
        switch (payload.module) {
            case MODULES.PLAYBACK:
                setPlaybackParam(payload.param, payload.value);
                handled = true;
                break;
            case MODULES.CHORDS:
                setChordsParam(payload.param, payload.value);
                handled = true;
                break;
            case MODULES.BASS:
                setBassParam(payload.param, payload.value);
                handled = true;
                break;
            case MODULES.SOLOIST:
                setSoloistParam(payload.param, payload.value);
                handled = true;
                break;
            case MODULES.GROOVE:
            case 'drum':
            case 'drums':
                setGrooveParam(payload.param, payload.value);
                handled = true;
                break;
            case MODULES.HARMONIES:
            case 'harmony':
                setHarmonyParam(payload.param, payload.value);
                handled = true;
                break;
            case MODULES.ARRANGER:
                setArrangerParam(payload.param, payload.value);
                handled = true;
                break;
            case MODULES.VIZ:
                setVizParam(payload.param, payload.value);
                handled = true;
                break;
            case MODULES.MIDI:
                setMidiParam(payload.param, payload.value);
                handled = true;
                break;
            default:
                console.warn(`[State] SET_PARAM failed: Unknown module ${payload.module}`);
                break;
        }
    }

    // 2. Delegate to Reducers
    if (!handled) {
        const pHandled = playbackReducer(action, payload);
        const aHandled = arrangerReducer(action, payload);
        const iHandled = instrumentReducer(action, payload);
        const gHandled = grooveReducer(action, payload, playback);
        const mHandled = midiReducer(action, payload);
        const vHandled = vizReducer(action, payload);
        handled = pHandled || aHandled || iHandled || gHandled || mHandled || vHandled;
    }

    // Always increment version on dispatch to force UI updates for in-place mutations
    playback.stateVersion++;

    // Notify listeners
    listeners.forEach((listener) => listener(action, payload, stateMap));

    // 3. Side Effects (Middleware)
    handleEffects(action, payload, { oldBpm });
}

/**
 * Handle side effects for specific actions.
 */
async function handleEffects(action, payload, context = {}) {
    switch (action) {
        case ACTIONS.TOGGLE_PLAY: {
            const { togglePlay } = await import('./engine/scheduler-core.js');
            togglePlay(payload?.viz, true);
            break;
        }
        case ACTIONS.SET_BPM: {
            const { setBpm } = await import('./app-controller.js');
            setBpm(payload, payload?.viz, true, context.oldBpm);
            break;
        }
        case ACTIONS.SET_GENRE_FEEL: {
            if (payload.drum && !playback.isPlaying) {
                const { loadDrumPreset } = await import('./instrument-controller.js');
                loadDrumPreset(payload.drum);
            }
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
